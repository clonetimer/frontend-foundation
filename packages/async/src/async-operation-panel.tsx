import { Alert, Button, Card, Descriptions, Flex, Progress, Space, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { AsyncOperation, AsyncOperationStatus } from './async-operation';
import { normalizeOperationProgress } from './async-operation';

const statusMeta: Record<AsyncOperationStatus, { label: string; color: string }> = {
  pending: { label: '等待中', color: 'default' },
  running: { label: '进行中', color: 'processing' },
  succeeded: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'default' }
};

export function AsyncOperationPanel({
  operation,
  title = '异步操作',
  extra,
  onCancel,
  onRetry
}: {
  operation: AsyncOperation;
  title?: ReactNode;
  extra?: ReactNode;
  onCancel?: () => void;
  onRetry?: () => void;
}) {
  const status = statusMeta[operation.status];
  const progress = normalizeOperationProgress(operation.progress);

  return (
    <Card
      title={title}
      extra={<Space>{extra}<Tag color={status.color}>{status.label}</Tag></Space>}
    >
      <Flex vertical gap={16}>
        {operation.status === 'running' || operation.status === 'pending'
          ? <Progress percent={progress} status="active" />
          : operation.status === 'succeeded'
            ? <Progress percent={100} status="success" />
            : null}
        {operation.status === 'failed' ? <Alert type="error" showIcon message={operation.message ?? '操作失败'} /> : null}
        {operation.status !== 'failed' && operation.message ? <Typography.Text type="secondary">{operation.message}</Typography.Text> : null}
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="操作 ID">{operation.id}</Descriptions.Item>
          {operation.startedAt ? <Descriptions.Item label="开始时间">{operation.startedAt}</Descriptions.Item> : null}
          {operation.completedAt ? <Descriptions.Item label="完成时间">{operation.completedAt}</Descriptions.Item> : null}
        </Descriptions>
        <Space>
          {(operation.status === 'pending' || operation.status === 'running') && onCancel ? <Button onClick={onCancel}>取消</Button> : null}
          {operation.status === 'failed' && onRetry ? <Button type="primary" onClick={onRetry}>重试</Button> : null}
        </Space>
      </Flex>
    </Card>
  );
}
