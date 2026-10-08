import { Card, Flex, Statistic, Typography, type CardProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { resolveDefaultText, type UiText } from '@foundation/core';

export function PanelBlock({ title, extra, children, ...cardProps }: Omit<CardProps, 'title' | 'extra'> & { title?: UiText; extra?: ReactNode }) {
  return (
    <Card {...cardProps} title={title ? resolveDefaultText(title) : undefined} extra={extra}>
      {children}
    </Card>
  );
}

export function MetricBlock({
  label,
  value,
  suffix,
  precision,
  description
}: {
  label: UiText;
  value: string | number;
  suffix?: ReactNode;
  precision?: number;
  description?: UiText;
}) {
  return (
    <Card size="small">
      <Statistic title={resolveDefaultText(label)} value={value} {...(suffix !== undefined ? { suffix } : {})} {...(precision !== undefined ? { precision } : {})} />
      {description ? <Typography.Text type="secondary">{resolveDefaultText(description)}</Typography.Text> : null}
    </Card>
  );
}

export function MetricGrid({
  children,
  minColumnWidth = 180,
  gap = 16
}: {
  children: ReactNode;
  minColumnWidth?: number;
  gap?: number;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`, gap }}>
      {children}
    </div>
  );
}

export function DashboardPattern({
  children,
  columns = 12,
  gap = 16
}: {
  children: ReactNode;
  columns?: number;
  gap?: number;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap, alignItems: 'start' }}>
      {children}
    </div>
  );
}

export function DashboardBlock({
  children,
  span = 12,
  style
}: {
  children: ReactNode;
  span?: number;
  style?: CSSProperties;
}) {
  return <div style={{ minWidth: 0, gridColumn: `span ${span}`, ...style }}>{children}</div>;
}

export function MasterDetailPattern({
  master,
  detail,
  masterWidth = 320,
  gap = 16,
  minHeight = 480
}: {
  master: ReactNode;
  detail: ReactNode;
  masterWidth?: number;
  gap?: number;
  minHeight?: number;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${masterWidth}px minmax(0, 1fr)`, gap, minHeight }}>
      <div style={{ minWidth: 0 }}>{master}</div>
      <div style={{ minWidth: 0 }}>{detail}</div>
    </div>
  );
}

export function SplitPanePattern({
  primary,
  secondary,
  secondaryWidth = 360,
  gap = 16,
  minHeight = 480
}: {
  primary: ReactNode;
  secondary: ReactNode;
  secondaryWidth?: number;
  gap?: number;
  minHeight?: number;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${secondaryWidth}px`, gap, minHeight }}>
      <div style={{ minWidth: 0 }}>{primary}</div>
      <div style={{ minWidth: 0 }}>{secondary}</div>
    </div>
  );
}

export function WorkspacePattern({
  toolbar,
  main,
  side,
  bottom,
  sideWidth = 360,
  gap = 12,
  minHeight = 560
}: {
  toolbar?: ReactNode;
  main: ReactNode;
  side?: ReactNode;
  bottom?: ReactNode;
  sideWidth?: number;
  gap?: number;
  minHeight?: number;
}) {
  return (
    <Flex vertical gap={gap} style={{ minHeight }}>
      {toolbar}
      <div style={{
        display: 'grid',
        gridTemplateColumns: side ? `minmax(0, 1fr) ${sideWidth}px` : 'minmax(0, 1fr)',
        gap,
        flex: 1,
        minHeight: 0
      }}>
        <div style={{ minWidth: 0, minHeight: 0 }}>{main}</div>
        {side ? <div style={{ minWidth: 0, minHeight: 0 }}>{side}</div> : null}
      </div>
      {bottom}
    </Flex>
  );
}
