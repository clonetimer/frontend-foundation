import { Button, Card, Flex, Input, Select, Tabs, Typography, type ButtonProps } from 'antd';
import type { ReactNode } from 'react';
import { resolveDefaultText, type UiText } from '@foundation/core';
import { MetricBlock } from './composition';

export type StackDirection = 'vertical' | 'horizontal';
export type SplitDirection = 'horizontal' | 'vertical';
export type TextWidgetVariant = 'body' | 'secondary' | 'title' | 'subtitle';

/**
 * Low-level layout primitives used by generated visual compositions. These are
 * deliberately small and deterministic: the Project Compiler owns the tree,
 * while runtime components remain ordinary React components.
 */
export function StackLayout({
  direction = 'vertical',
  gap = 12,
  align = 'stretch',
  wrap = false,
  children
}: {
  direction?: StackDirection;
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
  wrap?: boolean;
  children: ReactNode;
}) {
  return (
    <Flex
      vertical={direction === 'vertical'}
      gap={gap}
      align={align === 'stretch' ? undefined : align}
      wrap={wrap}
      style={align === 'stretch' ? { alignItems: 'stretch' } : undefined}
    >
      {children}
    </Flex>
  );
}

export function GridLayout({
  columns = 12,
  minColumnWidth,
  gap = 16,
  children
}: {
  columns?: number;
  minColumnWidth?: number;
  gap?: number;
  children: ReactNode;
}) {
  const gridTemplateColumns = minColumnWidth
    ? `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`
    : `repeat(${columns}, minmax(0, 1fr))`;
  return <div style={{ display: 'grid', gridTemplateColumns, gap, alignItems: 'start' }}>{children}</div>;
}

export function SplitLayout({
  direction = 'horizontal',
  primary,
  secondary,
  secondarySize = 360,
  gap = 16,
  minSize = 0
}: {
  direction?: SplitDirection;
  primary: ReactNode;
  secondary: ReactNode;
  secondarySize?: number;
  gap?: number;
  minSize?: number;
}) {
  const style = direction === 'horizontal'
    ? { display: 'grid', gridTemplateColumns: `minmax(${minSize}px, 1fr) ${secondarySize}px`, gap }
    : { display: 'grid', gridTemplateRows: `minmax(${minSize}px, 1fr) ${secondarySize}px`, gap };
  return (
    <div style={style}>
      <div style={{ minWidth: 0, minHeight: 0 }}>{primary}</div>
      <div style={{ minWidth: 0, minHeight: 0 }}>{secondary}</div>
    </div>
  );
}

export interface TabsLayoutItem {
  key: string;
  label: UiText;
  children: ReactNode;
}

export function TabsLayout({
  items,
  tabPosition = 'top'
}: {
  items: readonly TabsLayoutItem[];
  tabPosition?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <Tabs
      tabPosition={tabPosition}
      items={items.map((item) => ({
        key: item.key,
        label: resolveDefaultText(item.label),
        children: item.children
      }))}
    />
  );
}

export function PanelWidget({
  title,
  description,
  children
}: {
  title?: UiText;
  description?: UiText;
  children?: ReactNode;
}) {
  return (
    <Card title={title ? resolveDefaultText(title) : undefined}>
      {description ? <Typography.Paragraph type="secondary">{resolveDefaultText(description)}</Typography.Paragraph> : null}
      {children}
    </Card>
  );
}

export function TextWidget({
  text,
  variant = 'body'
}: {
  text: UiText;
  variant?: TextWidgetVariant;
}) {
  const value = resolveDefaultText(text);
  if (variant === 'title') return <Typography.Title level={3}>{value}</Typography.Title>;
  if (variant === 'subtitle') return <Typography.Title level={5}>{value}</Typography.Title>;
  if (variant === 'secondary') return <Typography.Text type="secondary">{value}</Typography.Text>;
  return <Typography.Text>{value}</Typography.Text>;
}

export function ButtonWidget({
  label,
  type = 'default',
  disabled = false,
  onPress
}: {
  label: UiText;
  type?: ButtonProps['type'];
  disabled?: boolean;
  onPress?: () => void;
}) {
  return <Button type={type} disabled={disabled} onClick={onPress}>{resolveDefaultText(label)}</Button>;
}

function FieldShell({ label, children }: { label?: UiText; children: ReactNode }) {
  if (!label) return <>{children}</>;
  return (
    <Flex vertical gap={6}>
      <Typography.Text>{resolveDefaultText(label)}</Typography.Text>
      {children}
    </Flex>
  );
}

export function InputWidget({
  label,
  placeholder,
  defaultValue,
  value,
  disabled = false,
  onValueChange
}: {
  label?: UiText;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}) {
  return (
    <FieldShell {...(label !== undefined ? { label } : {})}>
      <Input
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(value === undefined && defaultValue !== undefined ? { defaultValue } : {})}
        {...(value !== undefined ? { value } : {})}
        disabled={disabled}
        {...(onValueChange ? { onChange: (event) => onValueChange(event.target.value) } : {})}
      />
    </FieldShell>
  );
}

export interface SelectWidgetOption {
  label: string;
  value: string;
}

export function SelectWidget({
  label,
  placeholder,
  defaultValue,
  value,
  options,
  disabled = false,
  onValueChange
}: {
  label?: UiText;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  options: readonly SelectWidgetOption[];
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}) {
  return (
    <FieldShell {...(label !== undefined ? { label } : {})}>
      <Select
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(value === undefined && defaultValue !== undefined ? { defaultValue } : {})}
        {...(value !== undefined ? { value } : {})}
        options={[...options]}
        disabled={disabled}
        {...(onValueChange ? { onChange: onValueChange } : {})}
        style={{ width: '100%' }}
      />
    </FieldShell>
  );
}

export function MetricWidget({
  label,
  value,
  suffix,
  description
}: {
  label: UiText;
  value: string | number;
  suffix?: string;
  description?: UiText;
}) {
  return <MetricBlock label={label} value={value} {...(suffix !== undefined ? { suffix } : {})} {...(description !== undefined ? { description } : {})} />;
}

export function PlaceholderWidget({
  title,
  description = 'Replace this placeholder with a domain-specific block.'
}: {
  title: UiText;
  description?: UiText;
}) {
  return (
    <Card styles={{ body: { minHeight: 120, display: 'grid', placeItems: 'center', textAlign: 'center' } }}>
      <div>
        <Typography.Title level={5} style={{ marginBottom: 4 }}>{resolveDefaultText(title)}</Typography.Title>
        <Typography.Text type="secondary">{resolveDefaultText(description)}</Typography.Text>
      </div>
    </Card>
  );
}
