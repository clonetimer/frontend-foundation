import type { Meta, StoryObj } from '@storybook/react-vite';
import { AsyncOperationLog, AsyncOperationPanel } from '@foundation/async';
import { FileDropZone, FileTransferList } from '@foundation/file';
import { ChartPanel, TimeSeriesChart } from '@foundation/visualization';

const meta = { title: 'Capabilities/0.3' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const FileStory: Story = {
  name: 'File transfer primitives',
  render: () => (
    <div style={{ maxWidth: 760 }}>
      <FileDropZone constraints={{ accept: ['.csv', 'image/*'], maxFiles: 3 }} onSelection={() => undefined} />
      <div style={{ marginTop: 16 }}>
        <FileTransferList items={[
          { id: '1', name: 'example.csv', sizeBytes: 12_400, status: 'transferring', progress: 56 },
          { id: '2', name: 'preview.png', sizeBytes: 85_000, status: 'success' }
        ]} />
      </div>
    </div>
  )
};

export const AsyncStory: Story = {
  name: 'Async operation',
  render: () => (
    <div style={{ maxWidth: 760 }}>
      <AsyncOperationPanel operation={{ id: 'operation-1', status: 'running', progress: 64, message: 'Processing...' }} />
      <div style={{ marginTop: 16 }}><AsyncOperationLog lines={['started', 'progress=32', 'progress=64']} /></div>
    </div>
  )
};

export const VisualizationStory: Story = {
  name: 'Time series',
  render: () => (
    <ChartPanel title="Time Series">
      <TimeSeriesChart
        height={300}
        series={[{
          name: 'Series A',
          data: Array.from({ length: 24 }, (_, index) => [Date.now() - (23 - index) * 60_000, 30 + Math.sin(index / 4) * 8] as const)
        }]}
      />
    </ChartPanel>
  )
};
