import { ProForm, ProFormSelect, ProFormText, ProLayout, ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, ConfigProvider, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';

type RecordItem = { id: string; name: string; status: 'active' | 'paused' };
const seed: RecordItem[] = [
  { id: 'REC-001', name: 'Alpha', status: 'active' },
  { id: 'REC-002', name: 'Beta', status: 'paused' }
];

export function App() {
  const [records, setRecords] = useState(seed);
  const columns = useMemo<ProColumns<RecordItem>[]>(() => [
    { title: 'ID', dataIndex: 'id', search: false },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Status', dataIndex: 'status', valueType: 'select', valueEnum: { active: 'Active', paused: 'Paused' } }
  ], []);

  return (
    <ConfigProvider>
      <ProLayout title="OSS Convergence PoC" layout="mix" menu={{ request: async () => [] }}>
        <Space direction="vertical" size="large" style={{ width: '100%', padding: 24 }}>
          <Typography.Title level={2}>Management Pilot — ProComponents</Typography.Title>
          <ProTable<RecordItem>
            rowKey="id"
            columns={columns}
            dataSource={records}
            search={{ labelWidth: 'auto' }}
            pagination={{ pageSize: 10 }}
            toolBarRender={() => [<Button key="refresh">Refresh</Button>]}
          />
          <ProForm<RecordItem>
            onFinish={async (values) => {
              setRecords((current) => current.map((item) => item.id === values.id ? { ...item, ...values } : item));
              return true;
            }}
            initialValues={records[0]}
          >
            <ProFormText name="id" label="ID" disabled />
            <ProFormText name="name" label="Name" rules={[{ required: true }]} />
            <ProFormSelect name="status" label="Status" options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }]} />
          </ProForm>
        </Space>
      </ProLayout>
    </ConfigProvider>
  );
}
