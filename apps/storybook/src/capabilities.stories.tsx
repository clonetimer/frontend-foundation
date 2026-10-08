import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from 'antd';
import { useForm } from 'react-hook-form';
import { DataTable, DataToolbar } from '@foundation/data';
import { FormActions, FormField, FormLayout, FormSection } from '@foundation/forms';

const meta = { title: 'Capabilities/0.2' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

interface DemoRow { id: string; title: string; status: string; }

export const DataTableStory: Story = {
  name: 'DataTable',
  render: () => (
    <>
      <DataToolbar primary={<Input placeholder="Search" style={{ width: 240 }} />} />
      <DataTable<DemoRow>
        rowKey="id"
        columns={[
          { title: 'ID', dataIndex: 'id' },
          { title: 'Title', dataIndex: 'title' },
          { title: 'Status', dataIndex: 'status' }
        ]}
        data={[
          { id: '1', title: 'First row', status: 'ready' },
          { id: '2', title: 'Second row', status: 'draft' }
        ]}
        pagination={{ page: 1, pageSize: 10, total: 2 }}
      />
    </>
  )
};

function FormDemo() {
  const form = useForm<{ title: string }>({ defaultValues: { title: 'Example' } });
  return (
    <FormLayout onSubmit={form.handleSubmit(() => undefined)}>
      <FormSection title="Basic form">
        <FormField
          control={form.control}
          name="title"
          label="Title"
          required
          render={(field) => (
            <Input
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              {...(field.disabled !== undefined ? { disabled: field.disabled } : {})}
            />
          )}
        />
      </FormSection>
      <FormActions disabled={!form.formState.isDirty} />
    </FormLayout>
  );
}

export const FormStory: Story = { name: 'Form primitives', render: () => <FormDemo /> };
