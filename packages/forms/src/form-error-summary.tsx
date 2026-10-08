import { Alert } from 'antd';
import type { AppError } from '@foundation/core';
import type { FieldErrors, FieldValues } from 'react-hook-form';

function collectMessages(value: unknown, output: string[]): void {
  if (!value || typeof value !== 'object') return;
  if ('message' in value && typeof value.message === 'string' && value.message.trim()) {
    output.push(value.message);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'message' || key === 'type' || key === 'ref') continue;
    collectMessages(child, output);
  }
}

export function FormErrorSummary<TFieldValues extends FieldValues>({
  errors,
  error
}: {
  errors?: FieldErrors<TFieldValues>;
  error?: AppError | null;
}) {
  const messages: string[] = [];
  if (errors) collectMessages(errors, messages);
  if (error && !error.fieldErrors && error.detail) messages.unshift(error.detail);
  else if (error && !error.fieldErrors) messages.unshift(error.message);

  const uniqueMessages = [...new Set(messages)];
  if (!uniqueMessages.length) return null;

  return (
    <Alert
      type="error"
      showIcon
      message="请检查表单"
      description={<ul style={{ margin: 0, paddingInlineStart: 20 }}>{uniqueMessages.map((message) => <li key={message}>{message}</li>)}</ul>}
      style={{ marginBottom: 16 }}
    />
  );
}
