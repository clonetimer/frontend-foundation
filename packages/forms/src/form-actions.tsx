import { Button, Space } from 'antd';

export function FormActions({
  submitting = false,
  disabled = false,
  submitText = '保存',
  cancelText = '取消',
  onCancel
}: {
  submitting?: boolean;
  disabled?: boolean;
  submitText?: string;
  cancelText?: string;
  onCancel?: () => void;
}) {
  return (
    <Space>
      <Button type="primary" htmlType="submit" loading={submitting} disabled={disabled}>{submitText}</Button>
      {onCancel ? <Button onClick={onCancel} disabled={submitting}>{cancelText}</Button> : null}
    </Space>
  );
}
