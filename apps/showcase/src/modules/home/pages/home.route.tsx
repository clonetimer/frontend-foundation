import { Alert, Card, Space, Typography } from 'antd';
import { Page, PageContent, PageHeader } from '@foundation/ui';

export function Component() {
  return (
    <Page>
      <PageHeader title="Foundation Showcase" description="Kernel + 可独立演进的通用 Capability 验证应用。" />
      <PageContent>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert type="success" showIcon message="Kernel contract unchanged" description="0.3 新增 File / Async / Visualization，不修改 ApplicationDefinition、Module、Route、Auth 或 AppError 公共契约。" />
          <Card title="当前验证范围">
            <Typography.Paragraph>Records 验证 Data / Forms：查询列表、URL state、字段校验与后端错误映射。</Typography.Paragraph>
            <Typography.Paragraph>Capabilities 验证 File / Async / Visualization：文件边界、长任务生命周期和图表生命周期。</Typography.Paragraph>
            <Typography.Paragraph>Starter 仍保持极简，不携带 Showcase 示例业务。</Typography.Paragraph>
          </Card>
        </Space>
      </PageContent>
    </Page>
  );
}
