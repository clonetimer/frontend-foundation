import { Card, Empty, Spin } from 'antd';
import type { ReactNode } from 'react';
import type { AppError, UiText } from '@foundation/core';
import { resolveDefaultText } from '@foundation/core';
import { ErrorState } from '@foundation/ui';

export function ChartPanel({
  title,
  actions,
  loading = false,
  error,
  retry,
  empty = false,
  children
}: {
  title?: UiText;
  actions?: ReactNode;
  loading?: boolean;
  error?: AppError;
  retry?: () => void;
  empty?: boolean;
  children: ReactNode;
}) {
  return (
    <Card title={title ? resolveDefaultText(title) : undefined} extra={actions}>
      {error ? <ErrorState error={error} {...(retry ? { retry } : {})} />
        : loading ? <div style={{ display: 'grid', minHeight: 240, placeItems: 'center' }}><Spin /></div>
          : empty ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可视化数据" />
            : children}
    </Card>
  );
}
