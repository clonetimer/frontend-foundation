import { Card, Space, Typography } from 'antd';
import { useState } from 'react';
import type { AsyncOperation } from '@foundation/async';
import { AsyncOperationPanel } from '@foundation/async';
import { FileDropZone, FileTransferList, type FileTransferItem } from '@foundation/file';
import { Page, PageContent, PageHeader } from '@foundation/ui';
import { ChartPanel, TimeSeriesChart } from '@foundation/visualization';

const series = [{ name: '示例序列', data: [[0, 12], [1000, 18], [2000, 15], [3000, 24]] as const }];

export function Component() {
  const [files, setFiles] = useState<readonly FileTransferItem[]>([]);
  const operation: AsyncOperation = { id: 'pilot-operation', status: 'running', progress: 62, message: '正在处理示例任务' };
  return (
    <Page>
      <PageHeader title="数据工作台 Pilot" description="验证 File、Async、Visualization 三种外围 Capability 可组合且不侵入 Kernel。" />
      <PageContent>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card title="文件输入">
            <FileDropZone
              constraints={{ maxFiles: 3, maxSizeBytes: 5 * 1024 * 1024 }}
              onSelection={(result) => setFiles(result.accepted.map((file, index) => ({ id: `${file.name}-${index}`, name: file.name, sizeBytes: file.size, status: 'pending' })))}
            />
            <div style={{ marginTop: 16 }}><FileTransferList items={files} /></div>
          </Card>
          <AsyncOperationPanel operation={operation} />
          <ChartPanel title="时间序列">
            <TimeSeriesChart height={260} series={series} />
          </ChartPanel>
          <Typography.Text type="secondary">大体量可视化依赖保持在该路由的 lazy chunk 中。</Typography.Text>
        </Space>
      </PageContent>
    </Page>
  );
}
