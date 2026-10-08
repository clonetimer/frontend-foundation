import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnalysisSection, InteractiveViewer, TimeSeriesChart } from '@example/domain-widgets';

const meta = { title: 'Domain SDK/Example domain widgets', component: InteractiveViewer, args: { itemId: 'ITEM-001' } } satisfies Meta<typeof InteractiveViewer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: { itemId: 'ITEM-001', mode: 'overview', interactive: true }
};

export const TimeSeries: Story = {
  render: () => <TimeSeriesChart seriesKey="system.metric" sampleCount={64} showLegend />
};

export const ComposedAnalysisBlock: Story = {
  render: () => (
    <AnalysisSection title="Analysis section">
      <InteractiveViewer itemId="ITEM-042" mode="detail" />
      <TimeSeriesChart seriesKey="system.load" />
    </AnalysisSection>
  )
};
