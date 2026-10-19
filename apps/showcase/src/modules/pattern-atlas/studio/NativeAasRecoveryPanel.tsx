/**
 * P5-R2b2 Studio sandbox operator UI. Never persists a bearer token and NEVER
 * enables idempotency on any existing app/exported-page mutation binding.
 */
import { useEffect, useState } from 'react';
import { Alert, Button, Input, Popconfirm, Select, Space, Switch, Tag } from 'antd';
import {
  beginSyntheticStatusPatch, readSyntheticPending, recoverSyntheticStatusPatch,
  type P5PendingMutation, type P5RecoveryResult
} from '../../../../../../tooling/scripts/aas_p0/p5_client_recovery.mjs';

type ModelStatus = 'draft' | 'published' | 'evaluated';
function pendingFromBrowser(): { pending: P5PendingMutation | null; error: string } {
  try { return { pending: readSyntheticPending(window.localStorage), error: '' }; }
  catch { return { pending: null, error: '本机 P5 待恢复操作记录无法读取或已损坏。已禁止新写入，请先人工排查；不得清除记录后盲目重试。' }; }
}
const reasonText: Record<string, string> = {
  'transport-unknown': '请求传输中断，不能判定是否写入成功',
  'receipt-query-unavailable': '查询回执失败，保留原始请求',
  'receipt-not-found-no-replay': '回执未找到，不代表其他后端未提交；默认禁止重试',
  'unverified-receipt': '回执验证失败，保留原始请求',
  'unverified-patch-response': '响应未通过记录与状态验证，保留原始请求'
};
export function NativeAasRecoveryPanel() {
  const [consent, setConsent] = useState(false);
  const [origin, setOrigin] = useState('http://127.0.0.1:5499');
  const [modelId, setModelId] = useState('1');
  const [status, setStatus] = useState<ModelStatus>('evaluated');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [snapshot, setSnapshot] = useState(pendingFromBrowser);
  const refresh = () => setSnapshot(pendingFromBrowser());
  useEffect(() => {
    // Another tab can write a pending record while this panel is visible.
    // The client checks storage AGAIN before each write; this is not a
    // cross-tab atomic lock and must not be used as a production guarantee.
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);
  const pending = snapshot.pending;
  const disabled = !consent || busy || Boolean(snapshot.error);
  const report = (result: P5RecoveryResult) => {
    if (result.state === 'committed') setNotice('已通过原生协议确认提交；待恢复记录已清理。');
    else if (result.state === 'pending') {
      const reason = result.reason || '';
      setNotice('结果仍不确定，已保留原始 Key 和请求。' + (reasonText[reason] || (reason.startsWith('http-') || reason.startsWith('receipt-http-') ? '服务器返回 ' + reason : reason)));
    } else setNotice('当前没有待恢复操作。');
  };
  const act = async (replay = false, create = false) => {
    if (disabled || !token.trim()) { setNotice('请先确认合成环境，输入只用于本次操作的写角色 Token。'); return; }
    setBusy(true); setNotice('');
    try {
      const result = create
        ? await beginSyntheticStatusPatch({
          origin, recordId: Number(modelId), status, writerToken: token,
          storage: window.localStorage
        })
        : await recoverSyntheticStatusPatch({
          writerToken: token, storage: window.localStorage, replayIfMissing: replay
        });
      report(result);
    } catch (error) {
      // Avoid displaying arbitrary backend response data or credentials.
      const description = error instanceof Error ? error.message : '操作无法完成';
      setNotice('操作未确认：' + description.slice(0, 240) + '。不得更换 Key 盲目重试。');
    } finally {
      setToken('');
      refresh();
      setBusy(false);
    }
  };
  return <section className="pa-studio-aas-recovery" aria-label="AAS P5 合成模型写入恢复" data-testid="p5-aas-recovery">
    <h3>原生 AAS 幂等恢复 <Tag>隔离合成环境</Tag></h3>
    <p className="pa-studio-note">仅限已准备 P5 回执表的 loopback 测试副本与 p0_case_N 模型状态。不会连接项目数据源，不会修改 Studio 导出页面，也不会对普通接口自动重试。</p>
    <label className="pa-studio-switch-row"><span>我正在操作经过隔离的合成测试库</span><Switch aria-label="允许 AAS 合成模型测试" checked={consent} onChange={setConsent}/></label>
    {snapshot.error ? <Alert type="error" showIcon title={snapshot.error}/> : pending ? <Alert type="warning" showIcon title="存在尚未确认的写入"
      description={<span data-testid="p5-pending">原生模型 ID {pending.recordId} · 目标状态 {pending.status} · Key {pending.key.slice(0, 12)}… · {pending.origin}。请使用原身份写 Token 查询回执，不能新建其他 Key。</span>}/> : <div role="status" data-testid="p5-idle">没有待恢复的合成状态写入</div>}
    <label className="pa-studio-setting"><span>本机测试网关（仅 http loopback）</span>
      <Input aria-label="P5 测试网关" value={origin} maxLength={150} disabled={busy || Boolean(pending)} onChange={(event) => setOrigin(event.target.value)}/></label>
    <label className="pa-studio-setting"><span>合成模型 ID</span>
      <Input aria-label="P5 模型 ID" type="number" min={1} max={999999999999999} value={modelId} disabled={busy || Boolean(pending)} onChange={(event) => setModelId(event.target.value)}/></label>
    <label className="pa-studio-setting"><span>目标状态</span>
      <Select aria-label="P5 目标状态" value={status} disabled={busy || Boolean(pending)}
        options={[{value:'draft',label:'draft'},{value:'published',label:'published'},{value:'evaluated',label:'evaluated'}]}
        onChange={(value: ModelStatus) => setStatus(value)}/></label>
    <label className="pa-studio-setting"><span>临时写角色 Token（不写入项目文件或 localStorage）</span>
      <Input.Password aria-label="P5 临时写 Token" value={token} autoComplete="off"
        disabled={busy} onChange={(event) => setToken(event.target.value)}/></label>
    <Space wrap>
      <Popconfirm title="只对隔离合成 AAS 模型执行一次状态 PATCH？" description="原请求和 ETag 将先记录到本机；HTTP 503 时不会自动重试。"
        onConfirm={() => void act(false, true)} okText="确认测试写入" cancelText="取消">
        <Button disabled={disabled || Boolean(pending) || token.length < 32} data-testid="p5-submit">写入一次</Button>
      </Popconfirm>
      <Button onClick={() => void act(false, false)} disabled={disabled || !pending || token.length < 32} data-testid="p5-query">按原 Key 查询回执</Button>
      {pending ? <Popconfirm title="确认在原合成网关重放同一请求？" description="仅当回执 404 时重放；保留原 Key、原 ETag 和原始请求字节。"
        onConfirm={() => void act(true, false)} okText="同键重放" cancelText="取消">
        <Button danger disabled={disabled || token.length < 32} data-testid="p5-replay">显式同键重放</Button>
      </Popconfirm> : null}
    </Space>
    {notice ? <div role="status" className="pa-studio-api-result" data-testid="p5-result">{notice}</div> : null}
    <p className="pa-studio-note">回执查询 404 不表示未提交。当前只提供单一浏览器存储范围内的保守恢复流程；不保证跨标签页锁定、身份轮换或真实业务写入 exactly-once。</p>
  </section>;
}
