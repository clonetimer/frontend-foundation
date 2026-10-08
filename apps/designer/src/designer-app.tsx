import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Collapse,
  Divider,
  Flex,
  Input,
  InputNumber,
  Layout,
  List,
  Modal,
  Segmented,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, Key, MouseEvent, ReactNode } from 'react';
import { createDesignerCatalog } from './catalog';
import { DesignerCanvasNode, NODE_MIME, PALETTE_MIME } from './canvas';
import {
  acceptsChildren,
  cloneBlueprint,
  collectIds,
  createNode,
  emptyComposition,
  findNode,
  findParent,
  insertNode,
  moveNode,
  pageIssues,
  removeNode,
  renameAction,
  renameDataSource,
  renameNode,
  renameOperation,
  renameState,
  reorderNode,
  updateNode,
  walkNodes
} from './model';
import { downloadProjectFile, openProjectFile, parseProjectBlueprintText, readFallbackFile, readRegistryFallbackFile, saveProjectFile, saveProjectFileAs, type ProjectFileHandle } from './file-access';
import { sampleBlueprint } from './sample';
import { commitHistory, createHistoryState, redoHistory, undoHistory, type HistoryState } from './history';
import type { ActionStep, PageAction, PageDataSource, PageOperation, PageState, ProjectBlueprint, ProjectPage, StateType, VisualNode } from './types';
import { diagnoseBlueprintModel } from '@foundation/design-model';
import type { ProjectComponentRegistry, ProjectDiagnostic, RegistryProperty, RegistryWidget } from '@foundation/design-model';

const { Header, Sider, Content } = Layout;

type CenterMode = 'Design' | 'JSON';
type RightTab = 'properties' | 'binding' | 'event' | 'diagnostics' | 'model';
type ViewportMode = 'Desktop' | 'Tablet' | 'Mobile';

const blueprintFingerprint = (value: ProjectBlueprint) => JSON.stringify(value);
const blueprintEqual = (a: ProjectBlueprint, b: ProjectBlueprint) => blueprintFingerprint(a) === blueprintFingerprint(b);
const viewportWidths: Record<ViewportMode, number> = { Desktop: 1320, Tablet: 768, Mobile: 390 };

function nodeTree(node: VisualNode): DataNode {
  return {
    key: node.id,
    title: `${node.id} · ${node.type}`,
    children: (node.children ?? []).map(nodeTree)
  };
}

function countNodes(root: VisualNode | undefined) {
  let count = 0;
  walkNodes(root, () => { count += 1; });
  return count;
}

function hasDescendantForDesigner(node: VisualNode, id: string): boolean {
  return (node.children ?? []).some((child) => child.id === id || hasDescendantForDesigner(child, id));
}

function stateCompatible(expected: string | readonly string[], stateType: StateType) {
  return Array.isArray(expected) ? expected.includes(stateType as 'string' | 'number') : expected === stateType;
}

export function DesignerApp() {
  const { message } = App.useApp();
  const [history, setHistory] = useState<HistoryState<ProjectBlueprint>>(() => createHistoryState(cloneBlueprint(sampleBlueprint)));
  const blueprint = history.present;
  const [savedFingerprint, setSavedFingerprint] = useState(() => blueprintFingerprint(sampleBlueprint));
  const dirty = blueprintFingerprint(blueprint) !== savedFingerprint;
  const [selectedPageId, setSelectedPageId] = useState(sampleBlueprint.pages[0]?.id ?? '');
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(sampleBlueprint.pages[0]?.composition?.id);
  const [rightTab, setRightTab] = useState<RightTab>('properties');
  const [centerMode, setCenterMode] = useState<CenterMode>('Design');
  const [viewportMode, setViewportMode] = useState<ViewportMode>('Desktop');
  const [jsonText, setJsonText] = useState(() => JSON.stringify(sampleBlueprint, null, 2));
  const [fileHandle, setFileHandle] = useState<ProjectFileHandle | undefined>(undefined);
  const [fileName, setFileName] = useState('foundation.project.json');
  const [paletteFilter, setPaletteFilter] = useState('');
  const [customRegistry, setCustomRegistry] = useState<ProjectComponentRegistry | undefined>(undefined);
  const [registryName, setRegistryName] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const registryInputRef = useRef<HTMLInputElement | null>(null);
  const designerCatalog = useMemo(() => createDesignerCatalog(customRegistry), [customRegistry]);
  const { layoutEntries, widgetEntries, bindingProperties, widgetEvents, propertySchema, widgetById } = designerCatalog;

  const selectedPage = blueprint.pages.find((page) => page.id === selectedPageId) ?? blueprint.pages[0];
  const selectedNode = selectedPage?.composition && selectedNodeId ? findNode(selectedPage.composition, selectedNodeId) : undefined;
  const selectedParent = selectedPage?.composition && selectedNodeId ? findParent(selectedPage.composition, selectedNodeId) : undefined;
  const knownWidgetIds = useMemo(() => new Set(widgetEntries.map((entry) => entry.id)), [widgetEntries]);
  const containerWidgetTypes = useMemo(() => new Set(widgetEntries.filter((entry) => entry.acceptsChildren).map((entry) => entry.id)), [widgetEntries]);
  const issues = selectedPage ? pageIssues(selectedPage, knownWidgetIds) : ['Project has no page.'];
  const diagnostics = useMemo(() => diagnoseBlueprintModel(blueprint, customRegistry), [blueprint, customRegistry]);
  const moveTargets = useMemo(() => {
    if (!selectedPage?.composition || !selectedNodeId) return [];
    const source = findNode(selectedPage.composition, selectedNodeId);
    const targets: Array<{ label: string; value: string }> = [];
    walkNodes(selectedPage.composition, (node) => {
      if (!acceptsChildren(node, containerWidgetTypes) || node.id === selectedNodeId) return;
      if (source && hasDescendantForDesigner(source, node.id)) return;
      if (node.type === 'split' && (node.children?.length ?? 0) >= 2 && findParent(selectedPage.composition, selectedNodeId)?.id !== node.id) return;
      targets.push({ label: `${node.id} · ${node.type}`, value: node.id });
    });
    return targets;
  }, [selectedPage, selectedNodeId]);

  function commit(mutator: (draft: ProjectBlueprint) => void) {
    const draft = cloneBlueprint(blueprint);
    mutator(draft);
    setHistory((current) => commitHistory(current, draft, blueprintEqual));
    setJsonText(JSON.stringify(draft, null, 2));
  }

  function replaceDocument(next: ProjectBlueprint, markSaved: boolean) {
    setHistory(createHistoryState(cloneBlueprint(next)));
    setJsonText(JSON.stringify(next, null, 2));
    if (markSaved) setSavedFingerprint(blueprintFingerprint(next));
    resetSelectionFor(next);
  }

  function applyHistory(next: HistoryState<ProjectBlueprint>) {
    setHistory(next);
    setJsonText(JSON.stringify(next.present, null, 2));
    const page = next.present.pages.find((entry) => entry.id === selectedPageId) ?? next.present.pages[0];
    if (!page) { setSelectedPageId(''); setSelectedNodeId(undefined); return; }
    setSelectedPageId(page.id);
    if (!selectedNodeId || !findNode(page.composition, selectedNodeId)) setSelectedNodeId(page.composition?.id);
  }

  function handleUndo() { applyHistory(undoHistory(history)); }
  function handleRedo() { applyHistory(redoHistory(history)); }

  function mutateSelectedPage(mutator: (page: ProjectPage) => void) {
    commit((draft) => {
      const page = draft.pages.find((entry) => entry.id === selectedPage?.id);
      if (page) mutator(page);
    });
  }

  function mutateSelectedNode(mutator: (node: VisualNode) => void) {
    if (!selectedNodeId) return;
    mutateSelectedPage((page) => {
      if (page.composition) updateNode(page.composition, selectedNodeId, mutator);
    });
  }

  function resetSelectionFor(next: ProjectBlueprint) {
    const page = next.pages[0];
    setSelectedPageId(page?.id ?? '');
    setSelectedNodeId(page?.composition?.id);
  }


  function renameSelectedNodeId(nextId: string) {
    if (!selectedPage || !selectedNodeId) return;
    let changed = false;
    mutateSelectedPage((page) => { changed = renameNode(page, selectedNodeId, nextId); });
    if (changed) setSelectedNodeId(nextId);
    else message.warning('Node ID must be unique and match the Foundation identifier rules.');
  }

  function moveSelectedNodeTo(targetId: string) {
    if (!selectedPage?.composition || !selectedNodeId) return;
    let moved = false;
    mutateSelectedPage((page) => { if (page.composition) moved = moveNode(page.composition, selectedNodeId, targetId, containerWidgetTypes); });
    if (!moved) message.warning('Cannot move this node to the selected container.');
  }

  function renamePageState(oldId: string, nextId: string) {
    let changed = false;
    mutateSelectedPage((page) => { changed = renameState(page, oldId, nextId); });
    if (!changed) message.warning('State ID must be unique lowerCamelCase.');
  }

  function renamePageAction(oldId: string, nextId: string) {
    let changed = false;
    mutateSelectedPage((page) => { changed = renameAction(page, oldId, nextId); });
    if (!changed) message.warning('Action ID must be unique and valid.');
  }

  function renamePageDataSource(oldId: string, nextId: string) {
    let changed = false;
    mutateSelectedPage((page) => { changed = renameDataSource(page, oldId, nextId); });
    if (!changed) message.warning('Data Source ID must be unique and valid.');
  }

  function renamePageOperation(oldId: string, nextId: string) {
    let changed = false;
    mutateSelectedPage((page) => { changed = renameOperation(page, oldId, nextId); });
    if (!changed) message.warning('Operation ID must be unique and valid.');
  }

  async function handleOpen() {
    try {
      const opened = await openProjectFile();
      if (!opened) {
        fileInputRef.current?.click();
        return;
      }
      replaceDocument(opened.blueprint, true);
      setFileHandle(opened.handle);
      setFileName(opened.name);

      message.success(`Opened ${opened.name}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleFallbackFile(file?: File) {
    if (!file) return;
    try {
      const next = await readFallbackFile(file);
      replaceDocument(next, true);
      setFileHandle(undefined);
      setFileName(file.name);

      message.success(`Imported ${file.name}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRegistryFile(file?: File) {
    if (!file) return;
    try {
      const registry = await readRegistryFallbackFile(file);
      createDesignerCatalog(registry);
      setCustomRegistry(registry);
      setRegistryName(file.name);
      message.success(`Loaded ${file.name}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSave() {
    try {
      if (fileHandle) {
        await saveProjectFile(blueprint, fileHandle);
        setSavedFingerprint(blueprintFingerprint(blueprint));
        message.success(`Saved ${fileName}`);
        return;
      }
      const handle = await saveProjectFileAs(blueprint);
      if (handle) {
        setFileHandle(handle);
        setFileName(handle.name ?? 'foundation.project.json');
        setSavedFingerprint(blueprintFingerprint(blueprint));
        message.success('Project Blueprint saved');
        return;
      }
      downloadProjectFile(blueprint, fileName);
      setSavedFingerprint(blueprintFingerprint(blueprint));
      message.info('Browser file access is unavailable; downloaded JSON instead.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSaveAs() {
    try {
      const handle = await saveProjectFileAs(blueprint);
      if (handle) {
        setFileHandle(handle);
        setFileName(handle.name ?? 'foundation.project.json');
        setSavedFingerprint(blueprintFingerprint(blueprint));
        message.success('Saved as new Project Blueprint');
      } else {
        downloadProjectFile(blueprint, 'foundation.project.json');
        setSavedFingerprint(blueprintFingerprint(blueprint));
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  function applyJson() {
    try {
      const parsed = parseProjectBlueprintText(jsonText);
      setHistory((current) => commitHistory(current, parsed, blueprintEqual));
      resetSelectionFor(parsed);
      message.success('JSON applied to designer');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  function handleCanvasDrop(targetId: string, event: DragEvent<HTMLDivElement>) {
    if (!selectedPage?.composition) return;
    const paletteRaw = event.dataTransfer.getData(PALETTE_MIME);
    const sourceNodeId = event.dataTransfer.getData(NODE_MIME);
    if (paletteRaw) {
      try {
        const source = JSON.parse(paletteRaw) as { kind: 'layout' | 'widget'; type: string };
        const ids = collectIds(selectedPage.composition);
        const node = createNode(source.kind, source.type, ids);
        let inserted = false;
        mutateSelectedPage((page) => {
          if (page.composition) inserted = insertNode(page.composition, targetId, node, containerWidgetTypes);
        });
        if (inserted) setSelectedNodeId(node.id);
        else message.warning('Target cannot accept this node. Split layouts accept at most two children.');
      } catch {
        message.error('Invalid palette drag payload.');
      }
      return;
    }
    if (sourceNodeId) {
      let moved = false;
      mutateSelectedPage((page) => {
        if (page.composition) moved = moveNode(page.composition, sourceNodeId, targetId, containerWidgetTypes);
      });
      if (!moved) message.warning('Cannot move that node to this target.');
    }
  }

  function defaultPropsForCustomWidget(definition: RegistryWidget | undefined): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    for (const property of definition?.properties ?? []) {
      if (property.default !== undefined) props[property.key] = structuredClone(property.default);
      else if (property.required) {
        if (property.kind === 'number') props[property.key] = 0;
        else if (property.kind === 'boolean') props[property.key] = false;
        else if (property.kind === 'select') props[property.key] = property.options?.[0] ?? '';
        else if (property.kind === 'json') props[property.key] = {};
        else props[property.key] = '';
      }
    }
    return props;
  }

  function addPaletteNode(kind: 'layout' | 'widget', type: string) {
    if (!selectedPage) return;
    if (!selectedPage.composition) {
      const root = emptyComposition();
      const node = createNode(kind, type, collectIds(root));
      if (kind === 'widget') {
        const definition = widgetById.get(type);
        if (definition?.package) node.props = defaultPropsForCustomWidget(definition);
      }
      insertNode(root, root.id, node, containerWidgetTypes);
      mutateSelectedPage((page) => { page.composition = root; });
      setSelectedNodeId(node.id);
      return;
    }
    const target = selectedNode && acceptsChildren(selectedNode, containerWidgetTypes) ? selectedNode : selectedPage.composition;
    const node = createNode(kind, type, collectIds(selectedPage.composition));
    if (kind === 'widget') {
      const definition = widgetById.get(type);
      if (definition?.package) node.props = defaultPropsForCustomWidget(definition);
    }
    let inserted = false;
    mutateSelectedPage((page) => { if (page.composition) inserted = insertNode(page.composition, target.id, node, containerWidgetTypes); });
    if (inserted) setSelectedNodeId(node.id);
    else message.warning('Selected container cannot accept more children.');
  }

  function deleteSelectedNode() {
    if (!selectedPage?.composition || !selectedNodeId || selectedNodeId === selectedPage.composition.id) return;
    Modal.confirm({
      title: `Delete ${selectedNodeId}?`,
      content: 'The node and all of its children will be removed from the Blueprint.',
      okButtonProps: { danger: true },
      onOk: () => {
        let parentId = selectedPage.composition?.id;
        walkNodes(selectedPage.composition, (node) => { if ((node.children ?? []).some((child) => child.id === selectedNodeId)) parentId = node.id; });
        mutateSelectedPage((page) => { if (page.composition) removeNode(page.composition, selectedNodeId); });
        setSelectedNodeId(parentId);
      }
    });
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (editable) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) handleRedo(); else handleUndo();
        return;
      }
      if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); handleRedo(); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeId && selectedNodeId !== selectedPage?.composition?.id) { event.preventDefault(); deleteSelectedNode(); return; }
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && selectedPage?.composition && selectedNodeId) {
        event.preventDefault();
        mutateSelectedPage((page) => { if (page.composition) reorderNode(page.composition, selectedNodeId, event.key === 'ArrowUp' ? -1 : 1); });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [history, selectedNodeId, selectedPage?.id]);

  const treeData = useMemo(() => selectedPage?.composition ? [nodeTree(selectedPage.composition)] : [], [selectedPage]);
  const filteredLayouts = layoutEntries.filter((entry) => `${entry.id} ${entry.description}`.toLowerCase().includes(paletteFilter.toLowerCase()));
  const filteredWidgets = widgetEntries.filter((entry) => `${entry.id} ${entry.description}`.toLowerCase().includes(paletteFilter.toLowerCase()));

  return (
    <Layout style={{ height: '100vh', minWidth: 1100, overflow: 'hidden' }}>
      <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFallbackFile(event.target.files?.[0])} />
      <input ref={registryInputRef} type="file" accept="application/json,.json" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => void handleRegistryFile(event.target.files?.[0])} />
      <Header style={{ height: 52, lineHeight: '52px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Typography.Text strong style={{ color: '#fff', whiteSpace: 'nowrap' }}>Foundation Visual Designer</Typography.Text>
        <Tag color="blue">RC tooling</Tag>
        {registryName ? <Tag color="purple">Registry: {registryName}</Tag> : null}
        <Divider type="vertical" style={{ borderColor: '#555' }} />
        <Typography.Text style={{ color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{fileName}{dirty ? ' *' : ''}</Typography.Text>
        <div style={{ flex: 1 }} />
        <Space>
          <Tooltip title="Undo · Ctrl/Cmd+Z"><Button size="small" disabled={!history.past.length} onClick={handleUndo}>Undo</Button></Tooltip>
          <Tooltip title="Redo · Ctrl/Cmd+Shift+Z or Ctrl+Y"><Button size="small" disabled={!history.future.length} onClick={handleRedo}>Redo</Button></Tooltip>
          <Divider type="vertical" style={{ borderColor: '#555' }} />
          <Button size="small" onClick={() => void handleOpen()}>Open</Button>
          <Button size="small" onClick={() => registryInputRef.current?.click()}>Registry</Button>
          <Button size="small" type="primary" onClick={() => void handleSave()}>Save</Button>
          <Button size="small" onClick={() => void handleSaveAs()}>Save As</Button>
          <Button size="small" onClick={() => { const next = cloneBlueprint(sampleBlueprint); setHistory((current) => commitHistory(current, next, blueprintEqual)); setJsonText(JSON.stringify(next, null, 2)); resetSelectionFor(next); setFileHandle(undefined); setFileName('foundation.project.json'); }}>Sample</Button>
        </Space>
      </Header>

      <Layout style={{ minHeight: 0 }}>
        <Sider width={260} theme="light" style={{ borderRight: '1px solid #e5e7eb', overflow: 'auto' }}>
          <div style={{ padding: 12 }}>
            <Typography.Title level={5} style={{ margin: '0 0 8px' }}>Components</Typography.Title>
            <Input.Search size="small" placeholder="Filter widgets" value={paletteFilter} onChange={(event: ChangeEvent<HTMLInputElement>) => setPaletteFilter(event.target.value)} />
          </div>
          <Collapse ghost defaultActiveKey={['layouts', 'widgets']} items={[
            { key: 'layouts', label: `Layouts (${filteredLayouts.length})`, children: <PaletteList entries={filteredLayouts} kind="layout" onAdd={addPaletteNode} /> },
            { key: 'widgets', label: `Widgets (${filteredWidgets.length})`, children: <PaletteList entries={filteredWidgets} kind="widget" onAdd={addPaletteNode} /> }
          ]} />
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ padding: '0 12px 12px' }}>
            <Flex justify="space-between" align="center">
              <Typography.Title level={5} style={{ margin: 0 }}>Object Tree</Typography.Title>
              <Badge count={countNodes(selectedPage?.composition)} showZero color="#1677ff" />
            </Flex>
            {treeData.length ? (
              <Tree
                blockNode
                defaultExpandAll
                selectedKeys={selectedNodeId ? [selectedNodeId] : []}
                treeData={treeData}
                onSelect={(keys: Key[]) => { const key = keys[0]; if (typeof key === 'string') setSelectedNodeId(key); }}
                titleRender={(data: DataNode) => <Tooltip title="Drag on canvas to reparent"><span>{String(data.title)}</span></Tooltip>}
              />
            ) : <Alert type="info" message="No composition" />}
            <Space size={4} wrap>
              <Button size="small" disabled={!selectedNodeId || selectedNodeId === selectedPage?.composition?.id} onClick={() => { if (!selectedPage?.composition || !selectedNodeId) return; mutateSelectedPage((page) => { if (page.composition) reorderNode(page.composition, selectedNodeId, -1); }); }}>↑</Button>
              <Button size="small" disabled={!selectedNodeId || selectedNodeId === selectedPage?.composition?.id} onClick={() => { if (!selectedPage?.composition || !selectedNodeId) return; mutateSelectedPage((page) => { if (page.composition) reorderNode(page.composition, selectedNodeId, 1); }); }}>↓</Button>
              <Button danger size="small" disabled={!selectedNodeId || selectedNodeId === selectedPage?.composition?.id} onClick={deleteSelectedNode}>Delete</Button>
            </Space>
          </div>
        </Sider>

        <Content style={{ minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Flex align="center" gap={8} style={{ padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
            <Select
              size="small"
              value={selectedPage?.id ?? null}
              style={{ width: 220 }}
              options={blueprint.pages.map((page) => ({ label: page.title, value: page.id }))}
              onChange={(pageId: string) => {
                const page = blueprint.pages.find((entry) => entry.id === pageId);
                setSelectedPageId(pageId);
                setSelectedNodeId(page?.composition?.id);
              }}
            />
            <Segmented size="small" value={centerMode} options={['Design', 'JSON']} onChange={(value: string | number) => setCenterMode(value as CenterMode)} />
            {centerMode === 'Design' ? <Segmented size="small" value={viewportMode} options={['Desktop', 'Tablet', 'Mobile']} onChange={(value: string | number) => setViewportMode(value as ViewportMode)} /> : null}
            <div style={{ flex: 1 }} />
            {diagnostics.length ? <Tag color="error">{diagnostics.length} diagnostic{diagnostics.length === 1 ? '' : 's'}</Tag> : <Tag color="success">Compiler preflight OK</Tag>}
          </Flex>

          {centerMode === 'Design' ? (
            <div style={{ flex: 1, overflow: 'auto', padding: 28, background: '#f5f6f8' }} onClick={() => setSelectedNodeId(undefined)}>
              <div style={{ width: viewportWidths[viewportMode], maxWidth: '100%', minHeight: '100%', margin: '0 auto', padding: 22, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,.04)', transition: 'width .18s ease' }}>
                {selectedPage?.composition ? (
                  <DesignerCanvasNode node={selectedPage.composition} selectedId={selectedNodeId} onSelect={setSelectedNodeId} onDrop={handleCanvasDrop} containerWidgetTypes={containerWidgetTypes} />
                ) : (
                  <Card><Button type="primary" onClick={(event: MouseEvent<HTMLElement>) => { event.stopPropagation(); mutateSelectedPage((page) => { page.composition = emptyComposition(); }); setSelectedNodeId('pageRoot'); }}>Create composition root</Button></Card>
                )}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <Input.TextArea value={jsonText} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setJsonText(event.target.value)} spellCheck={false} style={{ flex: 1, resize: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }} />
              <Flex justify="space-between" align="center" style={{ paddingTop: 8 }}>
                <Typography.Text type="secondary">Exact Project Blueprint source. Apply is explicit.</Typography.Text>
                <Button type="primary" onClick={applyJson}>Apply JSON</Button>
              </Flex>
            </div>
          )}
        </Content>

        <Sider width={340} theme="light" style={{ borderLeft: '1px solid #e5e7eb', overflow: 'auto' }}>
          <Tabs
            size="small"
            activeKey={rightTab}
            onChange={(key: string) => setRightTab(key as RightTab)}
            tabBarStyle={{ padding: '0 10px', marginBottom: 0 }}
            items={[
              { key: 'properties', label: 'Properties', children: <PropertyInspector node={selectedNode} propertySchema={propertySchema} isTabChild={selectedParent?.type === 'tabs'} parentId={selectedParent?.id} moveTargets={moveTargets} onChange={mutateSelectedNode} onRename={renameSelectedNodeId} onMove={moveSelectedNodeTo} /> },
              { key: 'binding', label: 'Bindings', children: <BindingInspector page={selectedPage} node={selectedNode} bindingProperties={bindingProperties} onChange={mutateSelectedNode} /> },
              { key: 'event', label: 'Events', children: <EventInspector page={selectedPage} node={selectedNode} widgetEvents={widgetEvents} onChange={mutateSelectedNode} /> },
              { key: 'diagnostics', label: diagnostics.length ? `Diagnostics (${diagnostics.length})` : 'Diagnostics', children: <DiagnosticsInspector diagnostics={diagnostics} selectedPageId={selectedPage?.id} onSelectNode={(pageId, nodeId) => { setSelectedPageId(pageId); if (nodeId) setSelectedNodeId(nodeId); setCenterMode('Design'); }} /> },
              { key: 'model', label: 'Page Model', children: <PageModelInspector page={selectedPage} issues={issues} onChange={mutateSelectedPage} onRenameState={renamePageState} onRenameAction={renamePageAction} onRenameDataSource={renamePageDataSource} onRenameOperation={renamePageOperation} /> }
            ]}
          />
        </Sider>
      </Layout>
    </Layout>
  );
}

function PaletteList({ entries, kind, onAdd }: { entries: readonly { id: string; description: string }[]; kind: 'layout' | 'widget'; onAdd(kind: 'layout' | 'widget', type: string): void }) {
  return (
    <List
      size="small"
      dataSource={[...entries]}
      renderItem={(entry: { id: string; description: string }) => (
        <List.Item
          draggable
          onDragStart={(event: DragEvent<HTMLDivElement>) => {
            event.dataTransfer.setData(PALETTE_MIME, JSON.stringify({ kind, type: entry.id }));
            event.dataTransfer.effectAllowed = 'copy';
          }}
          actions={[<Button key="add" type="link" size="small" onClick={() => onAdd(kind, entry.id)}>Add</Button>]}
          style={{ cursor: 'grab', paddingInline: 12 }}
        >
          <List.Item.Meta title={<code>{entry.id}</code>} description={<Typography.Text type="secondary" style={{ fontSize: 11 }}>{entry.description}</Typography.Text>} />
        </List.Item>
      )}
    />
  );
}

function PropertyInspector({ node, propertySchema, isTabChild, parentId, moveTargets, onChange, onRename, onMove }: { node: VisualNode | undefined; propertySchema(node: VisualNode): readonly RegistryProperty[]; isTabChild: boolean; parentId: string | undefined; moveTargets: Array<{ label: string; value: string }>; onChange(update: (node: VisualNode) => void): void; onRename(nextId: string): void; onMove(targetId: string): void }) {
  if (!node) return <PanelHelp text="Select a node in the canvas or Object Tree." />;
  const schema = propertySchema(node);
  return (
    <div style={{ padding: 12 }}>
      <Typography.Text type="secondary">Node</Typography.Text>
      <SafeIdField value={node.id} onCommit={onRename} ariaLabel="Node ID" />
      {parentId ? <Field label="Parent container"><Select size="small" value={parentId} options={moveTargets} onChange={onMove} style={{ width: '100%' }} /></Field> : null}
      {isTabChild ? (
        <Field label="Tab label"><Input size="small" value={node.label ?? ''} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange((current) => { current.label = event.target.value; })} /></Field>
      ) : null}
      {schema.map((property) => (
        <PropertyField key={`${node.id}:${property.key}`} property={property} value={node.props?.[property.key]} onValue={(value) => onChange((current) => { current.props = { ...(current.props ?? {}), [property.key]: value }; })} />
      ))}
      <Divider />
      <Field label="Grid span"><InputNumber size="small" min={1} max={12} value={node.placement?.span ?? null} onChange={(value: number | null) => onChange((current) => { if (typeof value === 'number') current.placement = { ...(current.placement ?? {}), span: value }; else delete current.placement; })} style={{ width: '100%' }} /></Field>
    </div>
  );
}

function PropertyField({ property, value, onValue }: { property: RegistryProperty; value: unknown; onValue(value: unknown): void }) {
  if (property.kind === 'number') return <Field label={property.label}><InputNumber size="small" value={typeof value === 'number' ? value : null} onChange={(next: number | null) => onValue(typeof next === 'number' ? next : undefined)} style={{ width: '100%' }} /></Field>;
  if (property.kind === 'boolean') return <Field label={property.label}><Switch size="small" checked={Boolean(value)} onChange={onValue} /></Field>;
  if (property.kind === 'select') return <Field label={property.label}><Select size="small" allowClear value={typeof value === 'string' ? value : undefined} options={(property.options ?? []).map((entry) => ({ label: entry, value: entry }))} onChange={onValue} style={{ width: '100%' }} /></Field>;
  if (property.kind === 'json') return <JsonValueField label={property.label} value={value} onValue={onValue} />;
  return <Field label={property.label}><Input size="small" value={value === undefined ? '' : String(value)} onChange={(event: ChangeEvent<HTMLInputElement>) => onValue(event.target.value)} /></Field>;
}

function JsonValueField({ label, value, onValue }: { label: string; value: unknown; onValue(value: unknown): void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? [], null, 2));
  const [error, setError] = useState('');
  return (
    <Field label={label}>
      <Input.TextArea rows={5} value={text} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value)} onBlur={() => {
        try { onValue(JSON.parse(text)); setError(''); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
      }} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }} />
      {error ? <Typography.Text type="danger" style={{ fontSize: 11 }}>{error}</Typography.Text> : null}
    </Field>
  );
}

function BindingInspector({ page, node, bindingProperties, onChange }: { page: ProjectPage | undefined; node: VisualNode | undefined; bindingProperties: Record<string, Record<string, string | readonly string[]>>; onChange(update: (node: VisualNode) => void): void }) {
  if (!page || !node || node.kind !== 'widget') return <PanelHelp text="Select a widget to edit state bindings." />;
  const definitions = bindingProperties[node.type] ?? {};
  const states = page.state ?? [];
  if (!Object.keys(definitions).length) return <PanelHelp text="This widget exposes no bindable properties." />;
  return (
    <div style={{ padding: 12 }}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>Bindings connect governed widget properties to typed page state.</Typography.Paragraph>
      {Object.entries(definitions).map(([property, expected]) => {
        const compatible = states.filter((state) => stateCompatible(expected, state.type));
        return (
          <Field key={property} label={property}>
            <Select
              size="small"
              allowClear
              value={node.bindings?.[property]?.state}
              options={compatible.map((state) => ({ label: `${state.id} · ${state.type}`, value: state.id }))}
              onChange={(state: string | undefined) => onChange((current) => {
                const next = { ...(current.bindings ?? {}) };
                if (state) next[property] = { state }; else delete next[property];
                if (Object.keys(next).length) current.bindings = next; else delete current.bindings;
              })}
              style={{ width: '100%' }}
            />
          </Field>
        );
      })}
    </div>
  );
}

function EventInspector({ page, node, widgetEvents, onChange }: { page: ProjectPage | undefined; node: VisualNode | undefined; widgetEvents: Record<string, readonly string[]>; onChange(update: (node: VisualNode) => void): void }) {
  if (!page || !node || node.kind !== 'widget') return <PanelHelp text="Select an interactive widget to connect events." />;
  const events = widgetEvents[node.type] ?? [];
  if (!events.length) return <PanelHelp text="This widget exposes no governed events." />;
  return (
    <div style={{ padding: 12 }}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>Widget signals connect to named page actions. No JavaScript strings are stored in the Blueprint.</Typography.Paragraph>
      {events.map((eventName) => (
        <Field key={eventName} label={eventName}>
          <Select
            mode="multiple"
            size="small"
            value={node.events?.[eventName] ?? []}
            options={(page.actions ?? []).map((action) => ({ label: action.id, value: action.id }))}
            onChange={(actions: string[]) => onChange((current) => {
              const next = { ...(current.events ?? {}) };
              if (actions.length) next[eventName] = actions; else delete next[eventName];
              if (Object.keys(next).length) current.events = next; else delete current.events;
            })}
            style={{ width: '100%' }}
          />
        </Field>
      ))}
    </div>
  );
}

function DiagnosticsInspector({ diagnostics, selectedPageId, onSelectNode }: {
  diagnostics: readonly ProjectDiagnostic[];
  selectedPageId: string | undefined;
  onSelectNode(pageId: string, nodeId?: string): void;
}) {
  const visible = diagnostics.filter((entry) => !entry.pageId || entry.pageId === 'project' || entry.pageId === selectedPageId);
  if (!diagnostics.length) return <div style={{ padding: 12 }}><Alert type="success" showIcon message="Compiler preflight diagnostics pass" description="The browser-safe authoring model found no structural, interaction, or data-operation errors. The Project Compiler remains the release authority." /></div>;
  return (
    <div style={{ padding: 12 }}>
      <Alert type="warning" showIcon message={`${diagnostics.length} project diagnostic${diagnostics.length === 1 ? '' : 's'}`} description="These diagnostics use the shared browser-safe model. Run foundation-project diagnose for final compiler authority." style={{ marginBottom: 12 }} />
      <List
        size="small"
        dataSource={[...(visible.length ? visible : diagnostics)]}
        renderItem={(entry) => (
          <List.Item
            style={{ alignItems: 'flex-start', cursor: entry.pageId && entry.pageId !== 'project' ? 'pointer' : 'default' }}
            onClick={() => { if (entry.pageId && entry.pageId !== 'project') onSelectNode(entry.pageId, entry.nodeId); }}
          >
            <List.Item.Meta
              title={<Space size={6}><Tag color="error">{entry.code}</Tag>{entry.nodeId ? <code>{entry.nodeId}</code> : null}</Space>}
              description={<><Typography.Text>{entry.message}</Typography.Text>{entry.path ? <div><Typography.Text type="secondary" style={{ fontSize: 11 }}>{entry.path}</Typography.Text></div> : null}</>}
            />
          </List.Item>
        )}
      />
    </div>
  );
}

function PageModelInspector({
  page,
  issues,
  onChange,
  onRenameState,
  onRenameAction,
  onRenameDataSource,
  onRenameOperation
}: {
  page: ProjectPage | undefined;
  issues: string[];
  onChange(update: (page: ProjectPage) => void): void;
  onRenameState(oldId: string, nextId: string): void;
  onRenameAction(oldId: string, nextId: string): void;
  onRenameDataSource(oldId: string, nextId: string): void;
  onRenameOperation(oldId: string, nextId: string): void;
}) {
  if (!page) return <PanelHelp text="No page is selected." />;
  return (
    <div style={{ padding: 12 }}>
      {issues.length ? <Alert type="warning" showIcon message={`${issues.length} designer model issue${issues.length === 1 ? '' : 's'}`} description={<ul style={{ paddingLeft: 18, margin: 0 }}>{issues.slice(0, 8).map((issue) => <li key={issue}>{issue}</li>)}</ul>} /> : <Alert type="success" showIcon message="Designer model checks pass" />}
      <Divider />
      <ModelSection title="State" count={page.state?.length ?? 0} onAdd={() => onChange((current) => { current.state = [...(current.state ?? []), nextState(current.state ?? [])]; })}>
        {(page.state ?? []).map((state, index) => <StateEditor key={`${state.id}-${index}`} state={state} onRename={(nextId) => onRenameState(state.id, nextId)} onChange={(next) => onChange((current) => { current.state = replaceAt(current.state ?? [], index, next); })} onDelete={() => onChange((current) => { current.state = removeAt(current.state ?? [], index); })} />)}
      </ModelSection>
      <ModelSection title="Actions" count={page.actions?.length ?? 0} onAdd={() => onChange((current) => { current.actions = [...(current.actions ?? []), nextAction(current.actions ?? [], current.state ?? [])]; })}>
        {(page.actions ?? []).map((action, index) => <ActionEditor key={`${action.id}-${index}`} action={action} states={page.state ?? []} operations={page.operations ?? []} onRename={(nextId) => onRenameAction(action.id, nextId)} onChange={(next) => onChange((current) => { current.actions = replaceAt(current.actions ?? [], index, next); })} onDelete={() => onChange((current) => { current.actions = removeAt(current.actions ?? [], index); })} />)}
      </ModelSection>
      <ModelSection title="Data Sources" count={page.dataSources?.length ?? 0} onAdd={() => onChange((current) => { current.dataSources = [...(current.dataSources ?? []), nextDataSource(current.dataSources ?? [])]; })}>
        {(page.dataSources ?? []).map((source, index) => <DataSourceEditor key={`${source.id}-${index}`} source={source} onRename={(nextId) => onRenameDataSource(source.id, nextId)} onChange={(next) => onChange((current) => { current.dataSources = replaceAt(current.dataSources ?? [], index, next); })} onDelete={() => onChange((current) => { current.dataSources = removeAt(current.dataSources ?? [], index); })} />)}
      </ModelSection>
      <ModelSection title="Operations" count={page.operations?.length ?? 0} onAdd={() => onChange((current) => { current.operations = [...(current.operations ?? []), nextOperation(current.operations ?? [], current.dataSources ?? [])]; })}>
        {(page.operations ?? []).map((operation, index) => <OperationEditor key={`${operation.id}-${index}`} operation={operation} states={page.state ?? []} sources={page.dataSources ?? []} onRename={(nextId) => onRenameOperation(operation.id, nextId)} onChange={(next) => onChange((current) => { current.operations = replaceAt(current.operations ?? [], index, next); })} onDelete={() => onChange((current) => { current.operations = removeAt(current.operations ?? [], index); })} />)}
      </ModelSection>
    </div>
  );
}

function ModelSection({ title, count, onAdd, children }: { title: string; count: number; onAdd(): void; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}><Typography.Text strong>{title} <Tag>{count}</Tag></Typography.Text><Button size="small" onClick={onAdd}>Add</Button></Flex>
      <Space direction="vertical" size={6} style={{ width: '100%' }}>{children}</Space>
    </section>
  );
}

function StateEditor({ state, onRename, onChange, onDelete }: { state: PageState; onRename(nextId: string): void; onChange(next: PageState): void; onDelete(): void }) {
  const initialEditor = state.type === 'string'
    ? <Input size="small" value={String(state.initial)} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...state, initial: event.target.value })} />
    : state.type === 'number'
      ? <InputNumber size="small" value={typeof state.initial === 'number' ? state.initial : 0} onChange={(value: number | null) => onChange({ ...state, initial: typeof value === 'number' ? value : 0 })} style={{ width: '100%' }} />
      : <Switch size="small" checked={Boolean(state.initial)} onChange={(value: boolean) => onChange({ ...state, initial: value })} />;
  return (
    <Card size="small" styles={{ body: { padding: 8 } }}>
      <Flex gap={6} align="center">
        <div style={{ flex: 1 }}><SafeIdField value={state.id} onCommit={onRename} ariaLabel="State ID" /></div>
        <Select size="small" value={state.type} options={['string', 'number', 'boolean'].map((entry) => ({ label: entry, value: entry }))} onChange={(type: StateType) => onChange({ id: state.id, type, initial: defaultValueForStateType(type) })} style={{ width: 105 }} />
        <Button size="small" danger onClick={onDelete}>×</Button>
      </Flex>
      <div style={{ marginTop: 6 }}><Typography.Text type="secondary" style={{ fontSize: 11 }}>Initial value</Typography.Text>{initialEditor}</div>
    </Card>
  );
}

function ActionEditor({ action, states, operations, onRename, onChange, onDelete }: {
  action: PageAction;
  states: PageState[];
  operations: PageOperation[];
  onRename(nextId: string): void;
  onChange(next: PageAction): void;
  onDelete(): void;
}) {
  const updateStep = (index: number, step: ActionStep) => onChange({ ...action, steps: replaceAt(action.steps, index, step) });
  const moveStep = (index: number, delta: -1 | 1) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= action.steps.length) return;
    const steps = [...action.steps];
    const a = steps[index]; const b = steps[nextIndex];
    if (!a || !b) return;
    steps[index] = b; steps[nextIndex] = a;
    onChange({ ...action, steps });
  };
  return (
    <Card size="small" styles={{ body: { padding: 8 } }}>
      <Flex gap={6} align="center"><div style={{ flex: 1 }}><SafeIdField value={action.id} onCommit={onRename} ariaLabel="Action ID" /></div><Button size="small" danger onClick={onDelete}>×</Button></Flex>
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>Signal → ordered governed steps</Typography.Text>
      <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 8 }}>
        {action.steps.map((step, index) => <ActionStepEditor key={`${action.id}:${index}`} step={step} states={states} operations={operations} onChange={(next) => updateStep(index, next)} onMove={(delta) => moveStep(index, delta)} onDelete={() => onChange({ ...action, steps: removeAt(action.steps, index) })} />)}
        <Button size="small" block onClick={() => onChange({ ...action, steps: [...action.steps, defaultActionStep(states)] })}>Add step</Button>
      </Space>
    </Card>
  );
}

function ActionStepEditor({ step, states, operations, onChange, onMove, onDelete }: {
  step: ActionStep;
  states: PageState[];
  operations: PageOperation[];
  onChange(next: ActionStep): void;
  onMove(delta: -1 | 1): void;
  onDelete(): void;
}) {
  const typeOptions = ['set', 'toggle', 'increment', 'reset', 'invoke', 'navigate'].map((entry) => ({ label: entry, value: entry }));
  const selectedState = states.find((entry) => entry.id === step.state);
  return (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: 6 }}>
      <Flex gap={4} align="center">
        <Select size="small" value={step.type} options={typeOptions} onChange={(type: ActionStep['type']) => onChange(defaultStepForType(type, states, operations))} style={{ flex: 1 }} />
        <Button size="small" onClick={() => onMove(-1)}>↑</Button><Button size="small" onClick={() => onMove(1)}>↓</Button><Button size="small" danger onClick={onDelete}>×</Button>
      </Flex>
      <div style={{ marginTop: 6 }}>
        {step.type === 'set' ? <SetStepFields step={step} states={states} onChange={onChange} /> : null}
        {step.type === 'toggle' ? <StateSelect states={states.filter((entry) => entry.type === 'boolean')} value={step.state ?? null} onChange={(state) => onChange({ type: 'toggle', state })} /> : null}
        {step.type === 'increment' ? <Flex gap={6}><div style={{ flex: 1 }}><StateSelect states={states.filter((entry) => entry.type === 'number')} value={step.state ?? null} onChange={(state) => onChange({ ...step, state })} /></div><InputNumber size="small" value={step.by ?? 1} onChange={(by: number | null) => onChange({ ...step, by: typeof by === 'number' ? by : 1 })} /></Flex> : null}
        {step.type === 'reset' ? <StateSelect states={states} value={step.state ?? null} onChange={(state) => onChange({ type: 'reset', state })} /> : null}
        {step.type === 'invoke' ? <Select size="small" value={step.operation ?? null} options={operations.map((entry) => ({ label: entry.id, value: entry.id }))} onChange={(operation: string) => onChange({ type: 'invoke', operation })} style={{ width: '100%' }} placeholder="Operation" /> : null}
        {step.type === 'navigate' ? <Flex gap={6} align="center"><Input size="small" value={step.to ?? '/'} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...step, to: event.target.value })} /><Tooltip title="Replace history"><Switch size="small" checked={Boolean(step.replace)} onChange={(replace: boolean) => onChange({ ...step, replace })} /></Tooltip></Flex> : null}
      </div>
      {step.state && !selectedState && ['set', 'toggle', 'increment', 'reset'].includes(step.type) ? <Typography.Text type="danger" style={{ fontSize: 10 }}>Unknown state: {step.state}</Typography.Text> : null}
    </div>
  );
}

function SetStepFields({ step, states, onChange }: { step: ActionStep; states: PageState[]; onChange(next: ActionStep): void }) {
  const target = states.find((entry) => entry.id === step.state);
  const value = step.value;
  const mode = isRecordValue(value) && typeof value.state === 'string' ? 'state' : isRecordValue(value) && value.event === 'value' ? 'event' : 'literal';
  const compatibleSources = states.filter((entry) => entry.type === target?.type);
  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      <StateSelect states={states} value={step.state ?? null} onChange={(state) => { const nextTarget = states.find((entry) => entry.id === state); onChange({ type: 'set', state, value: defaultValueForStateType(nextTarget?.type ?? 'string') }); }} />
      <Segmented size="small" value={mode} options={[{ label: 'Literal', value: 'literal' }, { label: 'State', value: 'state' }, { label: 'Event', value: 'event' }]} onChange={(nextMode: string | number) => {
        if (nextMode === 'state') onChange({ ...step, value: { state: compatibleSources[0]?.id ?? step.state } });
        else if (nextMode === 'event') onChange({ ...step, value: { event: 'value' } });
        else onChange({ ...step, value: defaultValueForStateType(target?.type ?? 'string') });
      }} />
      {mode === 'state' ? <Select size="small" value={isRecordValue(value) && typeof value.state === 'string' ? value.state : null} options={compatibleSources.map((entry) => ({ label: entry.id, value: entry.id }))} onChange={(state: string) => onChange({ ...step, value: { state } })} style={{ width: '100%' }} /> : null}
      {mode === 'literal' ? <LiteralValueEditor type={target?.type ?? 'string'} value={value} onChange={(next) => onChange({ ...step, value: next })} /> : null}
      {mode === 'event' ? <Typography.Text type="secondary" style={{ fontSize: 11 }}>Uses the connected widget event value.</Typography.Text> : null}
    </Space>
  );
}

function StateSelect({ states, value, onChange }: { states: PageState[]; value: string | null | undefined; onChange(state: string): void }) {
  return <Select size="small" value={value ?? null} options={states.map((entry) => ({ label: `${entry.id} · ${entry.type}`, value: entry.id }))} onChange={onChange} style={{ width: '100%' }} placeholder="State" />;
}

function LiteralValueEditor({ type, value, onChange }: { type: StateType; value: unknown; onChange(value: string | number | boolean): void }) {
  if (type === 'boolean') return <Switch size="small" checked={Boolean(value)} onChange={onChange} />;
  if (type === 'number') return <InputNumber size="small" value={typeof value === 'number' ? value : 0} onChange={(next: number | null) => onChange(typeof next === 'number' ? next : 0)} style={{ width: '100%' }} />;
  return <Input size="small" value={typeof value === 'string' ? value : ''} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)} />;
}

function DataSourceEditor({ source, onRename, onChange, onDelete }: { source: PageDataSource; onRename(nextId: string): void; onChange(next: PageDataSource): void; onDelete(): void }) {
  return (
    <Card size="small" styles={{ body: { padding: 8 } }}>
      <Flex gap={6} align="center"><div style={{ flex: 1 }}><SafeIdField value={source.id} onCommit={onRename} ariaLabel="Data Source ID" /></div><Button size="small" danger onClick={onDelete}>×</Button></Flex>
      <Flex gap={6} style={{ marginTop: 6 }}>
        <Select size="small" value={source.method ?? 'GET'} options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((entry) => ({ label: entry, value: entry }))} onChange={(method: string) => onChange({ ...source, method })} style={{ width: 92 }} />
        <Input size="small" value={source.path} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...source, path: event.target.value })} placeholder="/api/path" />
      </Flex>
      <Select size="small" value={source.response ?? 'json'} options={['json', 'text', 'none'].map((entry) => ({ label: `response: ${entry}`, value: entry }))} onChange={(response: 'json' | 'text' | 'none') => onChange({ ...source, response })} style={{ width: '100%', marginTop: 6 }} />
    </Card>
  );
}

function OperationEditor({ operation, states, sources, onRename, onChange, onDelete }: { operation: PageOperation; states: PageState[]; sources: PageDataSource[]; onRename(nextId: string): void; onChange(next: PageOperation): void; onDelete(): void }) {
  const pendingStates = states.filter((entry) => entry.type === 'boolean');
  const errorStates = states.filter((entry) => entry.type === 'string');
  return (
    <Card size="small" styles={{ body: { padding: 8 } }}>
      <Flex gap={6} align="center"><div style={{ flex: 1 }}><SafeIdField value={operation.id} onCommit={onRename} ariaLabel="Operation ID" /></div><Button size="small" danger onClick={onDelete}>×</Button></Flex>
      <Field label="Data source"><Select size="small" value={operation.source} options={sources.map((entry) => ({ label: entry.id, value: entry.id }))} onChange={(source: string) => onChange({ ...operation, source })} style={{ width: '100%' }} /></Field>
      <Flex gap={6}>
        <div style={{ flex: 1 }}><Field label="Pending state"><Select size="small" allowClear value={operation.lifecycle?.pendingState} options={pendingStates.map((entry) => ({ label: entry.id, value: entry.id }))} onChange={(pendingState: string | undefined) => onChange(withLifecycle(operation, 'pendingState', pendingState))} style={{ width: '100%' }} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Error state"><Select size="small" allowClear value={operation.lifecycle?.errorState} options={errorStates.map((entry) => ({ label: entry.id, value: entry.id }))} onChange={(errorState: string | undefined) => onChange(withLifecycle(operation, 'errorState', errorState))} style={{ width: '100%' }} /></Field></div>
      </Flex>
      <JsonValueField label="Query" value={operation.query ?? {}} onValue={(query) => { const next = { ...operation }; if (isRecordValue(query) && Object.keys(query).length) next.query = query as Record<string, unknown>; else delete next.query; onChange(next); }} />
      <JsonValueField label="Body" value={operation.body ?? {}} onValue={(body) => onChange({ ...operation, body })} />
      <Typography.Text strong style={{ fontSize: 12 }}>Result mappings</Typography.Text>
      <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 4 }}>
        {(operation.result ?? []).map((result, index) => <Flex key={`${result.state}:${index}`} gap={4}><Select size="small" value={result.state} options={states.map((entry) => ({ label: entry.id, value: entry.id }))} onChange={(state: string) => onChange({ ...operation, result: replaceAt(operation.result ?? [], index, { ...result, state }) })} style={{ width: 120 }} /><Input size="small" value={result.path ?? ''} placeholder="response.path" onChange={(event: ChangeEvent<HTMLInputElement>) => { const nextResult = { ...result }; if (event.target.value) nextResult.path = event.target.value; else delete nextResult.path; onChange({ ...operation, result: replaceAt(operation.result ?? [], index, nextResult) }); }} /><Button size="small" danger onClick={() => onChange({ ...operation, result: removeAt(operation.result ?? [], index) })}>×</Button></Flex>)}
        <Button size="small" block disabled={!states.length} onClick={() => onChange({ ...operation, result: [...(operation.result ?? []), { state: states[0]?.id ?? 'state1' }] })}>Add result mapping</Button>
      </Space>
    </Card>
  );
}

function SafeIdField({ value, onCommit, ariaLabel }: { value: string; onCommit(next: string): void; ariaLabel: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { const next = draft.trim(); if (!next || next === value) { setDraft(value); return; } onCommit(next); };
  return <Input size="small" aria-label={ariaLabel} value={draft} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)} onBlur={commit} onPressEnter={commit} />;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function defaultValueForStateType(type: StateType): string | number | boolean {
  return type === 'string' ? '' : type === 'number' ? 0 : false;
}

function defaultActionStep(states: PageState[]): ActionStep {
  const first = states[0];
  return first ? { type: 'reset', state: first.id } : { type: 'navigate', to: '/' };
}

function defaultStepForType(type: ActionStep['type'], states: PageState[], operations: PageOperation[]): ActionStep {
  if (type === 'navigate') return { type, to: '/' };
  if (type === 'invoke') return { type, operation: operations[0]?.id ?? 'operation1' };
  const candidates = type === 'toggle' ? states.filter((entry) => entry.type === 'boolean') : type === 'increment' ? states.filter((entry) => entry.type === 'number') : states;
  const state = candidates[0] ?? states[0];
  if (!state) return { type: 'navigate', to: '/' };
  if (type === 'set') return { type, state: state.id, value: defaultValueForStateType(state.type) };
  if (type === 'increment') return { type, state: state.id, by: 1 };
  return { type, state: state.id };
}

function withLifecycle(operation: PageOperation, key: 'pendingState' | 'errorState', value: string | undefined): PageOperation {
  const lifecycle = { ...(operation.lifecycle ?? {}) };
  if (value) lifecycle[key] = value; else delete lifecycle[key];
  const next = { ...operation };
  if (Object.keys(lifecycle).length) next.lifecycle = lifecycle; else delete next.lifecycle;
  return next;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div style={{ marginBottom: 10 }}><Typography.Text style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{label}</Typography.Text>{children}</div>;
}

function PanelHelp({ text }: { text: string }) {
  return <div style={{ padding: 12 }}><Alert type="info" showIcon={false} message={text} /></div>;
}

function nextState(items: PageState[]): PageState {
  let index = items.length + 1;
  while (items.some((entry) => entry.id === `state${index}`)) index += 1;
  return { id: `state${index}`, type: 'string', initial: '' };
}

function nextAction(items: PageAction[], states: PageState[]): PageAction {
  let index = items.length + 1;
  while (items.some((entry) => entry.id === `action${index}`)) index += 1;
  const first = states[0];
  if (!first) return { id: `action${index}`, steps: [{ type: 'navigate', to: '/' }] };
  return { id: `action${index}`, steps: [{ type: 'reset', state: first.id }] };
}

function nextDataSource(items: PageDataSource[]): PageDataSource {
  let index = items.length + 1;
  while (items.some((entry) => entry.id === `api${index}`)) index += 1;
  return { id: `api${index}`, type: 'http', method: 'GET', path: '/api/example', response: 'json' };
}

function nextOperation(items: PageOperation[], sources: PageDataSource[]): PageOperation {
  let index = items.length + 1;
  while (items.some((entry) => entry.id === `operation${index}`)) index += 1;
  return { id: `operation${index}`, source: sources[0]?.id ?? 'api1' };
}

function replaceAt<T>(items: T[], index: number, next: T) {
  return items.map((item, current) => current === index ? next : item);
}

function removeAt<T>(items: T[], index: number) {
  return items.filter((_, current) => current !== index);
}
