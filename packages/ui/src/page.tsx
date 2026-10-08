import { Flex, Typography } from 'antd';
import type { PropsWithChildren, ReactNode } from 'react';
import { resolveDefaultText, type UiText } from '@foundation/core';

export function Page({ children }: PropsWithChildren) {
  return <div style={{ minWidth: 0 }}>{children}</div>;
}

export function PageHeader({ title, description, extra }: { title: UiText; description?: UiText; extra?: ReactNode }) {
  return (
    <Flex justify="space-between" align="flex-start" gap={16} style={{ marginBottom: 20 }}>
      <div>
        <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>{resolveDefaultText(title)}</Typography.Title>
        {description ? <Typography.Text type="secondary">{resolveDefaultText(description)}</Typography.Text> : null}
      </div>
      {extra}
    </Flex>
  );
}

export function PageContent({ children }: PropsWithChildren) {
  return <div>{children}</div>;
}

export function PageSection({ children }: PropsWithChildren) {
  return <section style={{ marginBottom: 24 }}>{children}</section>;
}
