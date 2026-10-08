import { Alert, Space, Typography } from 'antd';
import { useState } from 'react';
import { FileDropZone, FileTransferList } from '@foundation/file';
import type { FileSelectionResult, FileTransferItem } from '@foundation/file';
import { Page, PageContent, PageHeader, PageSection } from '@foundation/ui';

export function Component() {
  const [items, setItems] = useState<readonly FileTransferItem[]>([]);

  const handleSelection = (result: FileSelectionResult<File>) => {
    setItems(result.accepted.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      name: file.name,
      sizeBytes: file.size,
      status: index === 0 ? 'transferring' : 'pending',
      ...(index === 0 ? { progress: 42, message: '演示传输状态；实际上传协议由项目层实现。' } : {})
    })));
  };

  return (
    <Page>
      <PageHeader title="File Capability" description="文件选择、约束校验与传输状态展示；不绑定后端上传协议。" />
      <PageContent>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert type="info" showIcon message="允许 CSV 和图片，单文件最大 2 MB，最多 3 个文件。" />
          <PageSection>
            <FileDropZone
              constraints={{ accept: ['.csv', 'image/*'], maxFiles: 3, maxSizeBytes: 2 * 1024 * 1024 }}
              onSelection={handleSelection}
            />
          </PageSection>
          <PageSection>
            <Typography.Title level={4}>传输状态</Typography.Title>
            <FileTransferList items={items} />
          </PageSection>
        </Space>
      </PageContent>
    </Page>
  );
}
