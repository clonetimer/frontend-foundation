import { Card, Typography } from 'antd';
import { Page, PageContent, PageHeader } from '@foundation/ui';

export function Component() {
  return (
    <Page>
      <PageHeader title="首页" description="这是一个刻意保持极简的 Starter。" />
      <PageContent>
        <Card><Typography.Paragraph>请在 src/modules 中开始创建项目领域模块；不要从 Showcase 复制演示业务。</Typography.Paragraph></Card>
      </PageContent>
    </Page>
  );
}
