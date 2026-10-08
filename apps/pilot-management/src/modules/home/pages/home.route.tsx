import { Button, Card, Input, Space, Typography } from 'antd';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { DataTable } from '@foundation/data';
import { FormActions, FormField, FormLayout, FormSection } from '@foundation/forms';
import { PermissionGate } from '@foundation/security';
import { Page, PageContent, PageHeader } from '@foundation/ui';

interface Row { id: string; name: string; status: string }
interface FormValues { name: string }
const seed: Row[] = [
  { id: 'R-001', name: '示例记录 A', status: 'active' },
  { id: 'R-002', name: '示例记录 B', status: 'paused' }
];

export function Component() {
  const [rows, setRows] = useState(seed);
  const form = useForm<FormValues>({ defaultValues: { name: '' } });
  const submit = form.handleSubmit((value) => {
    const name = value.name.trim();
    if (!name) {
      form.setError('name', { message: '请输入名称' });
      return;
    }
    setRows((current) => [...current, { id: `R-${String(current.length + 1).padStart(3, '0')}`, name, status: 'active' }]);
    form.reset();
  });

  return (
    <Page>
      <PageHeader title="管理型 Pilot" description="验证 Table、Form、Permission 组合，不包含任何领域业务语义。" />
      <PageContent>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card title="记录列表">
            <DataTable<Row>
              rowKey="id"
              data={rows}
              pagination={false}
              columns={[
                { title: 'ID', dataIndex: 'id' },
                { title: '名称', dataIndex: 'name' },
                { title: '状态', dataIndex: 'status' },
                { title: '操作', render: (_, row) => <PermissionGate permission="pilot.management.update"><Button size="small" onClick={() => setRows((items) => items.filter((item) => item.id !== row.id))}>移除</Button></PermissionGate> }
              ]}
            />
          </Card>
          <Card title="新增记录">
            <FormLayout onSubmit={submit}>
              <FormSection title="基础信息">
                <FormField control={form.control} name="name" label="名称" required render={(field) => <Input {...field} {...(field.disabled !== undefined ? { disabled: field.disabled } : {})} placeholder="输入名称" />} />
              </FormSection>
              <FormActions submitText="新增" disabled={form.formState.isSubmitting} />
            </FormLayout>
          </Card>
          <Typography.Text type="secondary">此 Pilot 只测试 Foundation 组合边界，不代表业务页面模板。</Typography.Text>
        </Space>
      </PageContent>
    </Page>
  );
}
