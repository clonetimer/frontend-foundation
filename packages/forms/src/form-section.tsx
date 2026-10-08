import { Divider, Typography } from 'antd';
import type { PropsWithChildren, ReactNode } from 'react';

export function FormSection({ title, description, children }: PropsWithChildren<{ title?: ReactNode; description?: ReactNode }>) {
  return (
    <section style={{ marginBottom: 24 }}>
      {title ? <Typography.Title level={4} style={{ marginBottom: description ? 4 : 16 }}>{title}</Typography.Title> : null}
      {description ? <Typography.Paragraph type="secondary">{description}</Typography.Paragraph> : null}
      {(title || description) ? <Divider style={{ marginTop: 12 }} /> : null}
      {children}
    </section>
  );
}
