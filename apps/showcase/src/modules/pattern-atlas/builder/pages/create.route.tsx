import { useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Alert, Button, Card, Input, Radio, Tag, message } from 'antd';
import { Link, useNavigate } from 'react-router';
import { Page, PageContent } from '@foundation/ui';
import { readDesignConfig, designCssVariables } from '../../effects/config';
import { readStoredPatternIds } from '../../storage';
import { toFoundationThemeExport } from '../../center/theme-adapter';
import { StudioCanvas } from '../../studio/StudioCanvas';
import { handoffToStudio } from '../../studio/model';
import { buildProjectBlueprint, parseExistingBlueprint, serializeBlueprint, type PageTemplate, type ProjectBlueprintDocument, type ProjectMode } from '../project-blueprint';
import '../../studio/studio.css';
import './create.css';

const templates: Array<{ id: PageTemplate; title: string; subtitle: string; marker: string }> = [
  { id: 'blank', title: '空白页面', subtitle: '自由添加内容与组件', marker: '▢' },
  { id: 'bento', title: 'Bento 工作台', subtitle: '重点指标与业务模块', marker: '▦' },
  { id: 'master-detail', title: '主从分栏', subtitle: '列表与详情协同', marker: '◫' }
];

function downloadBlueprint(content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'foundation.project.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Component() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ProjectMode>('new');
  const [projectId, setProjectId] = useState('my-workspace');
  const [projectTitle, setProjectTitle] = useState('我的项目工作台');
  const [pageId, setPageId] = useState('overview');
  const [pageTitle, setPageTitle] = useState('项目概览');
  const [template, setTemplate] = useState<PageTemplate>(() => {
    const recent = readStoredPatternIds('selected').filter((id) => id === 'bento' || id === 'master-detail').at(-1);
    return recent === 'master-detail' ? 'master-detail' : 'bento';
  });
  const [existing, setExisting] = useState<ProjectBlueprintDocument | undefined>();
  const [filename, setFilename] = useState('');
  const [notice, contextHolder] = message.useMessage();
  const fileInput = useRef<HTMLInputElement>(null);
  const theme = useMemo(() => toFoundationThemeExport(readDesignConfig()), []);
  const previewStyle = useMemo(() => designCssVariables(readDesignConfig()) as CSSProperties, []);
  const result = useMemo(() => {
    try {
      const blueprint = buildProjectBlueprint({
        mode, projectId, projectTitle, pageId, pageTitle, template,
        ...(theme.providerProps.brand.primaryColor ? { primaryColor: theme.providerProps.brand.primaryColor } : {}),
        ...(existing ? { existingBlueprint: existing } : {})
      });
      return { blueprint, text: serializeBlueprint(blueprint), error: '' };
    } catch (error) {
      return { blueprint: undefined, text: '', error: error instanceof Error ? error.message : String(error) };
    }
  }, [mode, projectId, projectTitle, pageId, pageTitle, template, existing, theme]);
  const needsImport = mode === 'existing' && !existing;
  const ready = Boolean(result.blueprint) && !needsImport;
  const previewPage = result.blueprint?.pages.find((entry) => entry.id === pageId);

  const readProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 250_000) { void notice.error('项目文件过大，无法导入。'); return; }
    try {
      const parsed = parseExistingBlueprint(await file.text());
      setExisting(parsed);
      setFilename(file.name);
      setProjectId(parsed.project.id);
      setProjectTitle(parsed.project.title);
      setPageId('new-page');
      setPageTitle('新业务页面');
      void notice.success(`已读取 ${parsed.pages.length} 个页面。`);
    } catch (error) {
      setExisting(undefined);
      setFilename('');
      void notice.error(error instanceof Error ? error.message : '无法打开项目文件');
    }
  };
  const openStudio = () => {
    if (!result.blueprint || !ready) return;
    try {
      handoffToStudio(result.blueprint);
      navigate('/studio');
    } catch (error) {
      void notice.error(error instanceof Error ? error.message : '无法打开设计器');
    }
  };

  return <Page><PageContent><div className="pa-create">
    {contextHolder}
    <div className="pa-create-hero pa-create-hero-compact">
      <span className="pa-create-kicker">创建页面</span>
      <h1>为你的项目创建第一个界面</h1>
      <p>选择一个起始布局，然后进入设计器，拖入组件、调整展示形式与特效。</p>
    </div>
    <div className="pa-create-grid">
      <div className="pa-create-editor">
        <Card title="项目" className="pa-create-card">
          <Radio.Group value={mode} onChange={(event) => setMode(event.target.value as ProjectMode)} optionType="button" buttonStyle="solid" options={[{ value: 'new', label: '创建新项目' }, { value: 'existing', label: '添加到已有项目' }]}/>
          {mode === 'new' ? <div className="pa-create-fields">
            <label htmlFor="pa-builder-project-title">项目名称</label><Input id="pa-builder-project-title" maxLength={100} value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)}/>
            <details className="pa-create-advanced"><summary>高级设置</summary><label htmlFor="pa-builder-project-id">项目标识</label><Input id="pa-builder-project-id" value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="my-workspace"/></details>
          </div> : <div className="pa-create-import">
            <input hidden ref={fileInput} aria-label="导入已有项目" type="file" accept=".json,application/json" onChange={(event) => void readProject(event)}/>
            <Button onClick={() => fileInput.current?.click()}>选择项目文件</Button>
            {existing ? <Alert type="success" showIcon message={existing.project.title} description={`已包含 ${existing.pages.length} 个页面 · ${filename}`}/> : <span className="pa-create-import-empty">选择一个之前导出的项目文件</span>}
          </div>}
        </Card>
        <Card title="页面信息" className="pa-create-card">
          <div className="pa-create-fields">
            <label htmlFor="pa-builder-page-title">页面名称</label><Input id="pa-builder-page-title" maxLength={100} value={pageTitle} onChange={(event) => setPageTitle(event.target.value)}/>
            <details className="pa-create-advanced"><summary>高级设置</summary><label htmlFor="pa-builder-page-id">页面路径标识</label><Input id="pa-builder-page-id" value={pageId} onChange={(event) => setPageId(event.target.value)} placeholder="overview"/></details>
          </div>
        </Card>
        <Card title="选择初始布局" className="pa-create-card">
          <div role="group" aria-label="初始布局" className="pa-create-templates">
            {templates.map((item) => <button key={item.id} type="button" className={template === item.id ? 'pa-create-template active' : 'pa-create-template'} aria-pressed={template === item.id} onClick={() => setTemplate(item.id)}><span aria-hidden="true">{item.marker}</span><strong>{item.title}</strong><small>{item.subtitle}</small></button>)}
          </div>
          <div className="pa-create-discover"><Link to="/patterns">查看更多布局灵感 ↗</Link></div>
        </Card>
      </div>
      <div className="pa-create-output">
        <Card className="pa-create-card pa-create-preview-card" title="页面预览" extra={<Tag color="green">实时更新</Tag>}>
          {result.error && !needsImport ? <Alert type="error" showIcon message={result.error}/> : null}
          <div className="pa-create-summary">
            <div><span>项目</span><strong>{result.blueprint?.project.title ?? (existing?.project.title || projectTitle)}</strong></div>
            <div><span>新页面</span><strong>{pageTitle || '未命名页面'}</strong></div>
            <div><span>布局</span><strong>{templates.find((item) => item.id === template)?.title}</strong></div>
            <div><span>项目页面总数</span><strong>{result.blueprint?.pages.length ?? (existing?.pages.length ?? 0)}</strong></div>
          </div>
          <div className="pa-create-mini-preview" style={previewStyle} aria-label="所选页面布局的静态预览">
            <div className="pa-studio-screen">
              {ready && previewPage?.composition ? <StudioCanvas node={previewPage.composition} decorations={{}} readOnly/> : <div className="pa-create-mini-empty">{needsImport ? '选择已有项目后预览新增页面' : '调整左侧信息后即可预览'}</div>}
            </div>
          </div>
          <div className="pa-create-actions">
            <Button type="primary" block size="large" disabled={!ready} onClick={openStudio}>进入拖拽设计器 →</Button>
            <Button block disabled={!ready} onClick={() => { downloadBlueprint(result.text); void notice.success('项目文件已保存。'); }}>保存项目文件</Button>
          </div>
          <div className="pa-create-preview-foot">你的内容和样式可以在设计器中继续修改。</div>
        </Card>
      </div>
    </div>
  </div></PageContent></Page>;
}
