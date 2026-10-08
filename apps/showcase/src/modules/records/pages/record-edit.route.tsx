import { Card, Input, Select } from 'antd';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { useApiTransport } from '@foundation/api';
import { AppError, normalizeError } from '@foundation/core';
import { applyAppErrorToForm, FormActions, FormErrorSummary, FormField, FormLayout, FormSection } from '@foundation/forms';
import { ErrorState, LoadingState, Page, PageContent, PageHeader } from '@foundation/ui';
import { getRecord, updateRecord, type RecordStatus } from '../api/records-api';

const recordSchema = z.object({
  title: z.string().trim().min(3, '标题至少 3 个字符').max(80, '标题最多 80 个字符'),
  status: z.enum(['ready', 'draft', 'archived'])
});

type RecordFormValues = z.infer<typeof recordSchema>;

export function Component() {
  const { id } = useParams();
  const transport = useApiTransport();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<AppError | null>(null);

  const form = useForm<RecordFormValues>({
    resolver: zodResolver(recordSchema),
    defaultValues: { title: '', status: 'draft' }
  });

  const query = useQuery({
    queryKey: ['records', 'detail', id],
    queryFn: () => {
      if (!id) throw new AppError({ kind: 'not-found', message: 'Record id is missing' });
      return getRecord(transport, id);
    },
    enabled: Boolean(id)
  });

  useEffect(() => {
    if (query.data) form.reset({ title: query.data.title, status: query.data.status });
  }, [form, query.data]);

  const mutation = useMutation({
    mutationFn: async (values: RecordFormValues) => {
      if (!id) throw new AppError({ kind: 'not-found', message: 'Record id is missing' });
      return updateRecord(transport, id, values);
    }
  });

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    form.clearErrors();
    try {
      await mutation.mutateAsync(values);
      await queryClient.invalidateQueries({ queryKey: ['records'] });
      navigate('/records');
    } catch (error) {
      const appError = normalizeError(error);
      const applied = applyAppErrorToForm<RecordFormValues>(appError, form.setError);
      if (!applied) setSubmitError(appError);
    }
  });

  if (query.isPending) return <Page><PageHeader title="编辑 Record" /><PageContent><LoadingState /></PageContent></Page>;
  if (query.isError) return <Page><PageHeader title="编辑 Record" /><PageContent><ErrorState error={normalizeError(query.error)} retry={() => void query.refetch()} /></PageContent></Page>;

  return (
    <Page>
      <PageHeader title={`编辑 ${query.data.id}`} description="0.2 Forms Capability：RHF + Zod + AppError 字段错误映射。" />
      <PageContent>
        <Card style={{ maxWidth: 720 }}>
          <FormLayout onSubmit={submit}>
            <FormErrorSummary errors={form.formState.errors} error={submitError} />
            <FormSection title="基本信息" description="基础输入控件仍直接使用 Ant Design；Foundation 只处理表单结构和错误契约。">
              <FormField
                control={form.control}
                name="title"
                label="标题"
                required
                render={(field) => <Input name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...(field.disabled !== undefined ? { disabled: field.disabled } : {})} placeholder="输入至少 3 个字符" />}
              />
              <FormField
                control={form.control}
                name="status"
                label="状态"
                required
                render={(field) => (
                  <Select<RecordStatus>
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    {...(field.disabled !== undefined ? { disabled: field.disabled } : {})}
                    options={[
                      { value: 'ready', label: 'ready' },
                      { value: 'draft', label: 'draft' },
                      { value: 'archived', label: 'archived' }
                    ]}
                  />
                )}
              />
            </FormSection>
            <FormActions
              submitting={mutation.isPending}
              disabled={!form.formState.isDirty}
              onCancel={() => navigate('/records')}
            />
          </FormLayout>
        </Card>
      </PageContent>
    </Page>
  );
}
