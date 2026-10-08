import { Alert, Card, List, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useApiTransport } from '@foundation/api';
import { normalizeError } from '@foundation/core';
import { ErrorState, LoadingState, Page, PageContent, PageHeader } from '@foundation/ui';

interface ExampleRecord { id: string; title: string; status: string; }

export function Component() {
  const transport = useApiTransport();
  const query = useQuery({
    queryKey: ['examples'],
    queryFn: async (): Promise<ExampleRecord[]> => {
      const response = await transport.fetch('examples');
      return response.json() as Promise<ExampleRecord[]>;
    }
  });

  return (
    <Page>
      <PageHeader title="Examples" description="领域无关的 Kernel vertical slice。" />
      <PageContent>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert type="success" showIcon message="Permission passed" description="当前 NoAuthAdapter 通过 wildcard 权限进入此路由。" />
          <Card>
            {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={normalizeError(query.error)} retry={() => void query.refetch()} /> : (
              <List dataSource={query.data} renderItem={(item) => <List.Item><List.Item.Meta title={item.title} description={`ID: ${item.id}`} /><Typography.Text type="secondary">{item.status}</Typography.Text></List.Item>} />
            )}
          </Card>
        </Space>
      </PageContent>
    </Page>
  );
}
