import { Alert, Flex, Tabs } from 'antd';
import type { DragEvent, MouseEvent, ReactNode } from 'react';
import { ButtonWidget, GridLayout, InputWidget, MetricWidget, PanelWidget, PlaceholderWidget, SelectWidget, StackLayout, TextWidget } from '@foundation/ui';
import type { VisualNode } from './types';
import { acceptsChildren } from './model';

export const PALETTE_MIME = 'application/x-foundation-palette';
export const NODE_MIME = 'application/x-foundation-node';

function SelectionFrame({ node, selected, onSelect, onDrop, canAcceptChildren, children }: {
  node: VisualNode;
  selected: boolean;
  onSelect(id: string): void;
  onDrop(targetId: string, event: DragEvent<HTMLDivElement>): void;
  canAcceptChildren: boolean;
  children: ReactNode;
}) {
  return (
    <div
      draggable={node.id !== 'overviewRoot' && node.id !== 'pageRoot'}
      onDragStart={(event: DragEvent<HTMLDivElement>) => {
        event.stopPropagation();
        event.dataTransfer.setData(NODE_MIME, node.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event: DragEvent<HTMLDivElement>) => {
        if (!canAcceptChildren) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = event.dataTransfer.types.includes(NODE_MIME) ? 'move' : 'copy';
      }}
      onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); onDrop(node.id, event); }}
      onClick={(event: MouseEvent<HTMLDivElement>) => { event.stopPropagation(); onSelect(node.id); }}
      style={{
        position: 'relative',
        minWidth: 0,
        outline: selected ? '2px solid #1677ff' : '1px dashed transparent',
        outlineOffset: 3,
        borderRadius: 6,
        cursor: 'default'
      }}
      data-foundation-node={node.id}
    >
      {selected ? (
        <span style={{ position: 'absolute', zIndex: 5, top: -17, left: 0, padding: '0 5px', borderRadius: '4px 4px 0 0', background: '#1677ff', color: '#fff', fontSize: 10, lineHeight: '16px' }}>
          {node.id} · {node.type}
        </span>
      ) : null}
      {children}
    </div>
  );
}

export function DesignerCanvasNode({ node, selectedId, onSelect, onDrop, containerWidgetTypes }: {
  node: VisualNode;
  selectedId: string | undefined;
  onSelect(id: string): void;
  onDrop(targetId: string, event: DragEvent<HTMLDivElement>): void;
  containerWidgetTypes: ReadonlySet<string>;
}) {
  const children = (node.children ?? []).map((child) => (
    <DesignerCanvasNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} onDrop={onDrop} containerWidgetTypes={containerWidgetTypes} />
  ));
  let content: ReactNode;
  const props = node.props ?? {};

  if (node.kind === 'layout') {
    if (node.type === 'stack') {
      content = <StackLayout direction={props.direction === 'horizontal' ? 'horizontal' : 'vertical'} gap={typeof props.gap === 'number' ? props.gap : 12}>{children}</StackLayout>;
    } else if (node.type === 'grid') {
      content = <GridLayout columns={typeof props.columns === 'number' ? props.columns : 2} {...(typeof props.minColumnWidth === 'number' ? { minColumnWidth: props.minColumnWidth } : {})} gap={typeof props.gap === 'number' ? props.gap : 12}>{children}</GridLayout>;
    } else if (node.type === 'split') {
      const direction = props.direction === 'vertical' ? 'vertical' : 'horizontal';
      const style = direction === 'horizontal'
        ? { display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${typeof props.secondarySize === 'number' ? props.secondarySize : 320}px`, gap: typeof props.gap === 'number' ? props.gap : 12 }
        : { display: 'grid', gridTemplateRows: `minmax(0, 1fr) ${typeof props.secondarySize === 'number' ? props.secondarySize : 320}px`, gap: typeof props.gap === 'number' ? props.gap : 12 };
      content = <div style={style}>{children.length ? children : <EmptyDropZone />}</div>;
    } else {
      content = <Tabs items={(node.children ?? []).map((child, index) => ({ key: child.id, label: child.label ?? `Tab ${index + 1}`, children: <DesignerCanvasNode node={child} selectedId={selectedId} onSelect={onSelect} onDrop={onDrop} containerWidgetTypes={containerWidgetTypes} /> }))} />;
    }
  } else if (node.type === 'panel') {
    content = <PanelWidget title={String(props.title ?? 'Panel')} {...(typeof props.description === 'string' ? { description: props.description } : {})}>{children.length ? <Flex vertical gap={12}>{children}</Flex> : <EmptyDropZone />}</PanelWidget>;
  } else if (node.type === 'text') {
    content = <TextWidget text={String(props.text ?? 'Text')} variant={props.variant === 'title' || props.variant === 'subtitle' || props.variant === 'secondary' ? props.variant : 'body'} />;
  } else if (node.type === 'button') {
    content = <ButtonWidget type={props.type === 'primary' || props.type === 'dashed' || props.type === 'link' || props.type === 'text' ? props.type : 'default'} disabled={Boolean(props.disabled)} label={String(props.label ?? 'Button')} />;
  } else if (node.type === 'input') {
    content = <InputWidget label={String(props.label ?? 'Input')} {...(typeof props.placeholder === 'string' ? { placeholder: props.placeholder } : {})} {...(typeof props.defaultValue === 'string' ? { defaultValue: props.defaultValue } : {})} disabled />;
  } else if (node.type === 'select') {
    const options = Array.isArray(props.options) ? props.options.filter((entry): entry is { label: string; value: string } => Boolean(entry) && typeof entry === 'object' && typeof (entry as { label?: unknown }).label === 'string' && typeof (entry as { value?: unknown }).value === 'string') : [];
    const defaultValue = typeof props.defaultValue === 'string' ? props.defaultValue : options[0]?.value;
    content = <SelectWidget label={String(props.label ?? 'Select')} options={options} {...(defaultValue !== undefined ? { defaultValue } : {})} disabled />;
  } else if (node.type === 'metric') {
    content = <MetricWidget label={String(props.label ?? 'Metric')} value={typeof props.value === 'number' || typeof props.value === 'string' ? props.value : 0} {...(typeof props.suffix === 'string' ? { suffix: props.suffix } : {})} />;
  } else if (acceptsChildren(node, containerWidgetTypes)) {
    content = <PanelWidget title={String(props.title ?? node.label ?? node.type)} {...(typeof props.description === 'string' ? { description: props.description } : {})}>{children.length ? <Flex vertical gap={12}>{children}</Flex> : <EmptyDropZone />}</PanelWidget>;
  } else {
    content = <PlaceholderWidget title={String(props.title ?? node.label ?? node.type)} {...(typeof props.description === 'string' ? { description: props.description } : {})} />;
  }

  return <SelectionFrame node={node} selected={node.id === selectedId} onSelect={onSelect} onDrop={onDrop} canAcceptChildren={acceptsChildren(node, containerWidgetTypes)}>{content}</SelectionFrame>;
}

function EmptyDropZone() {
  return <Alert type="info" showIcon={false} message="Drop a layout or widget here" style={{ borderStyle: 'dashed', textAlign: 'center' }} />;
}
