import { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Breadcrumb, Checkbox, Collapse, DatePicker, Descriptions, Divider, Empty, Input, InputNumber, Progress, Radio, Rate, Modal, Skeleton, Slider, Space, Spin, Statistic, Steps, Switch, Table, Tag, Timeline, Button, Drawer, Popconfirm, message } from 'antd';
import { safeWidgetImageUrl, widgetItems, widgetValues, parseChartSeries, type ChartSeries, type StudioWidgetKind } from './widgets';

const label = (value: unknown, defaultValue = ''): string => typeof value === 'string' || typeof value === 'number' ? String(value) : defaultValue;
const rows = (value: unknown) => widgetItems(value).map((item, index) => { const [name, status = '—'] = item.split('|'); return { key: index, name, status }; });
function apiUrl(value: unknown): string | undefined { const url = safeWidgetImageUrl(value); return url && url !== '/' ? url : undefined; }
function pathValue(data: unknown, path: string): unknown {
  if (!path || !path.split('.').every((part) => /^(?:[a-zA-Z_$][\w$]*|\d+)$/.test(part) && !['__proto__', 'constructor', 'prototype'].includes(part))) return undefined;
  return path.split('.').reduce<unknown>((obj, key) => obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key) ? (obj as Record<string, unknown>)[key] : undefined, data);
}
function confirmUpload(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({ title: '确认上传', content: `向配置的后端上传「${name}」？`, onOk: () => { resolve(true); }, onCancel: () => { resolve(false); } });
  });
}
function FileUploadWidget({ props, live }: { props: Record<string, unknown>; live: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const limit = Math.max(1, Math.min(30, Number(props.maxSizeMb) || 5));
  const url = apiUrl(props.uploadUrl);
  const accept = label(props.accept, '.pdf,.png,.jpg');
  const send = async () => {
    if (!file || !url || !live) return;
    if (!(await confirmUpload(file.name))) return;
    const body = new FormData(); body.append('file', file);
    setBusy(true); setStatus('上传中…');
    try {
      const result = await fetch(url, { method: 'POST', body, credentials: 'same-origin' });
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      setStatus(url === '/api/studio-upload-demo' ? '演示接口已接收（不保存文件）' : '上传成功');
    } catch (error) { setStatus(error instanceof Error ? `上传失败：${error.message}` : '上传失败'); }
    finally { setBusy(false); }
  };
  return <div className="pa-studio-rich pa-studio-file"><strong>{label(props.title, '上传附件')}</strong>
    <input type="file" disabled={!live || busy} accept={accept} aria-label="选择文件" onChange={(event) => {
      const next = event.target.files?.[0] ?? null;
      if (next && next.size > limit * 1024 * 1024) { setFile(null); setStatus(`文件大小不能超过 ${limit} MB`); }
      else { setFile(next); setStatus(next ? `已选：${next.name}（${Math.ceil(next.size / 1024)} KB）` : ''); }
    }}/>
    <div className="pa-studio-widget-actions"><small>允许 {accept} · ≤{limit}MB</small>{url ? <Button size="small" type="primary" disabled={!live || !file} loading={busy} onClick={() => void send()}>上传</Button> : <small>未连接上传接口，仅本地选取</small>}</div>
    {status ? <small role="status">{status}</small> : null}
  </div>;
}
function AsyncTaskWidget({ props, live }: { props: Record<string, unknown>; live: boolean }) {
  const [status, setStatus] = useState('等待查询');
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const session = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = apiUrl(props.statusUrl);
  const pause = () => { session.current?.abort(); session.current = null; if (timer.current) clearTimeout(timer.current); timer.current = null; setRunning(false); };
  useEffect(() => { if (!live) pause(); return () => { session.current?.abort(); if (timer.current) clearTimeout(timer.current); }; }, [live, url]);
  const begin = () => {
    if (!live || !url) return;
    pause(); setStatus('查询中…'); setProgress(0); setRunning(true);
    const controller = new AbortController(); session.current = controller;
    const interval = Math.max(1500, Math.min(30000, Number(props.pollMs) || 3000));
    const step = async (count: number): Promise<void> => {
      try {
        const res = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        if (controller.signal.aborted) return;
        const value = label(pathValue(data, label(props.statusPath, 'data.status')), 'unknown').toLowerCase();
        const percent = Number(pathValue(data, label(props.percentPath, 'data.progress')));
        setProgress(Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0);
        setStatus(value);
        if (['success', 'completed', 'done', 'failed', 'error', 'cancelled'].includes(value)) { setRunning(false); return; }
        if (count >= 19) { setRunning(false); setStatus('已达到 20 次查询上限'); return; }
        timer.current = setTimeout(() => { void step(count + 1); }, interval);
      } catch (error) { if (!controller.signal.aborted) { setStatus(error instanceof Error ? error.message : '查询失败'); setRunning(false); } }
    };
    void step(0);
  };
  return <div className="pa-studio-rich pa-studio-task"><strong>{label(props.title, '任务进度')}</strong>
    <div className="pa-studio-widget-actions"><Tag>{status}</Tag><span>{progress}%</span></div>
    <Progress percent={progress} size="small"/>
    {url ? <Button size="small" disabled={!live} onClick={() => running ? pause() : begin()}>{running ? '停止查询' : '查询任务状态'}</Button> : <small>设置状态 GET 地址后，可在体验模式查询后台任务</small>}
  </div>;
}

/** Signed number axis, multiple series, legend and native SVG point tooltips. */
function LineWidget({ items, series, title, unit }: { items: string[]; series: ChartSeries[]; title: string; unit: string }) {
  const colors = ['#168765', '#5277d2', '#d4773d', '#a261b5', '#be5365', '#4d9fa0'];
  const all = series.flatMap((entry) => entry.values);
  if (!all.length) return <div className="pa-studio-rich"><strong>{title}</strong><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无曲线数据"/></div>;
  const low = Math.min(...all), high = Math.max(...all);
  const margin = (high - low || Math.max(1, Math.abs(high) * .2)) * .1;
  const minimum = low - margin, maximum = high + margin;
  const count = Math.max(...series.map((entry) => entry.values.length));
  const x = (index: number) => 52 + 316 * index / Math.max(1, count - 1);
  const y = (value: number) => 18 + (maximum - value) / (maximum - minimum) * 144;
  const ticks = Array.from({ length: 5 }, (_, index) => minimum + (maximum - minimum) * index / 4);
  const fmt = (value: number) => Number(value.toPrecision(5)).toLocaleString();
  const xIndices = Array.from({ length: Math.min(count, 7) }, (_, i) => Math.round(i * (count - 1) / Math.max(1, Math.min(count, 7) - 1)));
  return <div className="pa-studio-rich pa-studio-plot"><strong>{title}</strong>
    <svg role="img" aria-label={title + '：' + series.length + ' 组曲线，数值 ' + fmt(low) + ' 至 ' + fmt(high) + unit} viewBox="0 0 396 200" className="pa-studio-line-visual">
      {ticks.map((tick, i) => <g key={i}><line x1="52" x2="368" y1={y(tick)} y2={y(tick)} stroke="currentColor" strokeOpacity=".12"/><text x="45" y={y(tick)+4} textAnchor="end" fontSize="10" fill="currentColor">{fmt(tick)}</text></g>)}
      {series.map((entry, i) => <g key={i}>
        <polyline points={entry.values.map((value, j) => String(x(j)) + ',' + String(y(value))).join(' ')} fill="none" stroke={colors[i % colors.length]} strokeWidth="2.5" strokeLinecap="round"/>
        {entry.values.map((value, j) => <circle key={j} cx={x(j)} cy={y(value)} r="3.5" fill={colors[i % colors.length]}><title>{entry.name + ' · ' + (items[j] ?? String(j+1)) + ': ' + fmt(value) + unit}</title></circle>)}
      </g>)}
      <line x1="52" x2="368" y1="162" y2="162" stroke="currentColor" strokeOpacity=".5"/>
      {xIndices.map((index) => <text key={index} x={x(index)} y="183" textAnchor="middle" fontSize="10" fill="currentColor">{(items[index] ?? String(index+1)).slice(0,8)}</text>)}
    </svg>
    <div className="pa-studio-plot-legend">{series.map((entry,i) => <span key={i}><i style={{backgroundColor:colors[i%colors.length]}}/>{entry.name}</span>)}</div>
  </div>;
}
function OverlayWidget({ kind, props, live }: { kind: 'modal' | 'drawer' | 'popconfirm'; props: Record<string, unknown>; live: boolean }) {
  const [open, setOpen] = useState(false);
  const [notify, context] = message.useMessage();
  const title = label(props.title, '操作确认');
  const description = label(props.description);
  const ok = label(props.okText, '确认'), cancel = label(props.cancelText, '取消');
  const trigger = <Button size="small" disabled={!live} onClick={() => setOpen(true)}>{label(props.triggerText, '打开')}</Button>;
  const confirmed = () => { setOpen(false); void notify.success('操作已确认（未关联后端）'); };
  return <div className="pa-studio-rich pa-studio-overlay"><strong>{title}</strong>{context}
    {kind === 'popconfirm' ? <Popconfirm title={title} description={description} open={open} onConfirm={confirmed} onCancel={() => setOpen(false)} okText={ok} cancelText={cancel}>{trigger}</Popconfirm> : trigger}
    {kind === 'modal' ? <Modal title={title} open={open} onOk={confirmed} onCancel={() => setOpen(false)} okText={ok} cancelText={cancel} destroyOnHidden>{description}</Modal> : null}
    {kind === 'drawer' ? <Drawer title={title} open={open} onClose={() => setOpen(false)} placement={props.placement === 'left' ? 'left' : 'right'} width={Math.max(280, Math.min(800, Number(props.width) || 420))} destroyOnHidden>{description}</Drawer> : null}
    <small>{live ? '可在体验模式操作；确认不会提交后端' : '切换到体验模式后可操作'}</small>
  </div>;
}
/** Live Studio widgets are backed by the same source code as the standalone React export. */
export function WidgetPreview({ kind, props, live }: { kind: StudioWidgetKind; props: Record<string, unknown>; live: boolean }) {
  const title = label(props.title, '组件');
  const items = widgetItems(props.items);
  const values = widgetValues(props.values);
  const percent = Math.max(0, Math.min(100, Number(props.percent) || 0));
  switch (kind) {
    // Ant Design 6 orientation enum is version-specific; omit optional orientation.
    case 'divider': return <Divider>{title}</Divider>;
    case 'tag': return <Tag color="processing">{label(props.text, title)}</Tag>;
    case 'alert': return <Alert type="info" showIcon message={title} description={label(props.description)}/>;
    case 'progress': return <div className="pa-studio-rich"><strong>{title}</strong><Progress percent={percent}/></div>;
    case 'breadcrumb': return <Breadcrumb items={items.map((item) => ({ title: item }))}/>;
    case 'avatar': return <Space><Avatar>{label(props.text, '张').slice(0, 2)}</Avatar><span>{title}</span></Space>;
    case 'image': { const url = safeWidgetImageUrl(props.src); return url ? <img className="pa-studio-rich-image" src={url} alt={title}/> : <div className="pa-studio-rich-image-placeholder">▧ {title}<small>{label(props.description)}</small></div>; }
    case 'steps': return <Steps responsive size="small" current={Math.max(0, Math.min(items.length, Math.floor(percent)))} items={items.map((item) => ({ title: item }))}/>;
    case 'timeline': return <Timeline items={items.map((item) => ({ children: item }))}/>;
    case 'table': return <Table size="small" rowKey="key" columns={[{ title: '事项', dataIndex: 'name' }, { title: '状态', dataIndex: 'status' }]} dataSource={rows(props.items)} pagination={{ pageSize: Math.max(1, Math.min(20, Number(props.pageSize) || 5)), showSizeChanger: false }}/>;
    case 'chart': return <div className="pa-studio-rich"><strong>{title}</strong><div className="pa-studio-mini-chart">{values.map((value, index) => <div key={index} title={`${items[index] ?? `数据${index+1}`}：${value}`}><i style={{ height: `${Math.max(2,value)}%` }}/><small>{items[index] ?? index + 1}</small></div>)}</div></div>;
    case 'descriptions': return <Descriptions size="small" title={title} column={1} items={rows(props.items).map((row) => ({ key: row.key, label: row.name, children: row.status }))}/>;
    case 'list': return <div className="pa-studio-rich"><strong>{title}</strong><ul className="pa-studio-rich-list">{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>;
    case 'statistic': return <Statistic title={title} value={label(props.value, '0')} suffix={label(props.suffix)}/>;
    case 'textarea': return <label className="pa-studio-field"><small>{title}</small><Input.TextArea rows={3} placeholder={label(props.placeholder)} disabled={!live}/></label>;
    case 'number': return <label className="pa-studio-field"><small>{title}</small><InputNumber style={{ width: '100%' }} defaultValue={Number(props.value) || 0} disabled={!live}/></label>;
    case 'checkbox': return <div className="pa-studio-rich"><strong>{title}</strong><Checkbox.Group disabled={!live} options={items.map((item) => ({ label: item, value: item }))}/></div>;
    case 'radio': return <div className="pa-studio-rich"><strong>{title}</strong><Radio.Group disabled={!live} options={items.map((item) => ({ label: item, value: item }))}/></div>;
    case 'toggle': return <Space><span>{title}</span><Switch disabled={!live}/></Space>;
    case 'date': return <label className="pa-studio-field"><small>{title}</small><DatePicker style={{ width: '100%' }} disabled={!live}/></label>;
    case 'slider': return <div className="pa-studio-rich"><strong>{title}</strong><Slider defaultValue={percent} disabled={!live}/></div>;
    case 'rate': return <Space><span>{title}</span><Rate disabled={!live}/></Space>;
    case 'modal': return <OverlayWidget kind="modal" props={props} live={live}/>;
    case 'drawer': return <OverlayWidget kind="drawer" props={props} live={live}/>;
    case 'popconfirm': return <OverlayWidget kind="popconfirm" props={props} live={live}/>;
    case 'skeleton': return <div className="pa-studio-rich"><strong>{title}</strong><Skeleton active paragraph={{ rows: 2 }} title={{ width: '60%' }}/></div>;
    case 'empty': return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={label(props.description, title)}/>;
    case 'collapse': return <Collapse items={[{ key: 'one', label: title, children: <p>{label(props.text, '展开内容')}</p> }]}/>;
    case 'spinner': return <Space><Spin/><span>{title}</span></Space>;
    case 'file-upload': return <FileUploadWidget props={props} live={live}/>;
    case 'file-list': return <div className="pa-studio-rich"><strong>{title}</strong><div className="pa-studio-file-list">{rows(props.items).map((item) => <div key={item.key}><span>▤ {item.name}</span><small>{item.status}</small></div>)}</div></div>;
    case 'async-task': return <AsyncTaskWidget props={props} live={live}/>;
    case 'async-log': return <div className="pa-studio-rich"><strong>{title}</strong><ol className="pa-studio-async-log">{rows(props.items).map((item) => <li key={item.key}><span>{item.name}</span><Tag>{item.status}</Tag></li>)}</ol></div>;
    case 'line-chart': return <LineWidget items={items} series={parseChartSeries(props.series, props.values)} title={title} unit={label(props.unit)}/>;
    case 'donut-chart': { const share = Math.min(100, Math.max(0, Number(props.value) || 0)); return <div className="pa-studio-rich"><strong>{title}</strong><div className="pa-studio-donut" role="img" aria-label={`${title} ${share}%`} style={{ background: `conic-gradient(#16936f ${share}%, #e4eee8 ${share}% 100%)` }}><div><strong>{share}{label(props.suffix, '%')}</strong><small>当前占比</small></div></div></div>; }
    case 'heatmap': return <div className="pa-studio-rich"><strong>{title}</strong><div className="pa-studio-heatmap" role="img" aria-label={`${title}，${values.length} 个值`}>{values.map((value, index) => <span key={index} title={`第 ${index+1} 格：${value}`} style={{ background: `rgba(18,133,94,${(.12 + value * .008).toFixed(2)})` }}/>)}</div></div>;
  }
}
