import { Form } from 'antd';
import type { FormEventHandler, PropsWithChildren } from 'react';

export function FormLayout({ children, onSubmit }: PropsWithChildren<{ onSubmit: FormEventHandler<HTMLFormElement> }>) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <Form component={false} layout="vertical">{children}</Form>
    </form>
  );
}
