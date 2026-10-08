import { Form } from 'antd';
import type { ReactNode } from 'react';
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues
} from 'react-hook-form';

export interface FormFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>
> {
  control: Control<TFieldValues>;
  name: TName;
  label?: ReactNode;
  required?: boolean;
  extra?: ReactNode;
  render: (field: ControllerRenderProps<TFieldValues, TName>) => ReactNode;
}

export function FormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>
>({ control, name, label, required = false, extra, render }: FormFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item
          label={label}
          required={required}
          extra={extra}
          {...(fieldState.error?.message
            ? { validateStatus: 'error' as const, help: fieldState.error.message }
            : {})}
        >
          {render(field)}
        </Form.Item>
      )}
    />
  );
}
