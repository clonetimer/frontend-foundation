import { useMemo } from 'react';
import { ChartPanel, TimeSeriesChart } from '@foundation/visualization';
import { Page, PageContent, PageHeader } from '@foundation/ui';

export function Component() {
  const series = useMemo(() => {
    const start = Date.now() - 59 * 60_000;
    return [
      {
        name: 'Series A',
        data: Array.from({ length: 60 }, (_, index) => [start + index * 60_000, 40 + Math.sin(index / 6) * 12] as const)
      },
      {
        name: 'Series B',
        data: Array.from({ length: 60 }, (_, index) => [start + index * 60_000, 28 + Math.cos(index / 8) * 8] as const)
      }
    ];
  }, []);

  return (
    <Page>
      <PageHeader title="Visualization Capability" description="ECharts 生命周期、主题、Resize 和领域无关时间序列封装。" />
      <PageContent>
        <ChartPanel title="Time Series">
          <TimeSeriesChart series={series} yAxisName="Value" />
        </ChartPanel>
      </PageContent>
    </Page>
  );
}
