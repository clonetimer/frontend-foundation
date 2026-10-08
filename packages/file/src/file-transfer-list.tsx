import { Button, Flex, List, Progress, Space, Tag, Typography } from 'antd';
import type { FileTransferItem, FileTransferStatus } from './file-types';
import { formatFileSize } from './format-file-size';

const statusMeta: Record<FileTransferStatus, { label: string; color: string }> = {
  pending: { label: '等待中', color: 'default' },
  transferring: { label: '传输中', color: 'processing' },
  success: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'default' }
};

export function FileTransferList({
  items,
  onCancel,
  onRetry
}: {
  items: readonly FileTransferItem[];
  onCancel?: (item: FileTransferItem) => void;
  onRetry?: (item: FileTransferItem) => void;
}) {
  return (
    <List
      dataSource={[...items]}
      locale={{ emptyText: '暂无文件' }}
      renderItem={(item) => {
        const meta = statusMeta[item.status];
        const progress = Math.max(0, Math.min(100, item.progress ?? 0));
        return (
          <List.Item
            actions={[
              ...(item.status === 'transferring' && onCancel ? [<Button key="cancel" size="small" onClick={() => onCancel(item)}>取消</Button>] : []),
              ...(item.status === 'failed' && onRetry ? [<Button key="retry" size="small" onClick={() => onRetry(item)}>重试</Button>] : [])
            ]}
          >
            <Flex vertical gap={6} style={{ width: '100%' }}>
              <Flex justify="space-between" gap={12} wrap="wrap">
                <Space>
                  <Typography.Text>{item.name}</Typography.Text>
                  {item.sizeBytes !== undefined ? <Typography.Text type="secondary">{formatFileSize(item.sizeBytes)}</Typography.Text> : null}
                </Space>
                <Tag color={meta.color}>{meta.label}</Tag>
              </Flex>
              {item.status === 'transferring' ? <Progress percent={progress} size="small" /> : null}
              {item.message ? <Typography.Text type={item.status === 'failed' ? 'danger' : 'secondary'}>{item.message}</Typography.Text> : null}
            </Flex>
          </List.Item>
        );
      }}
    />
  );
}
