import { Button } from 'antd';
import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { normalizeError } from '@foundation/core';
import { ErrorState } from './states';

interface Props extends PropsWithChildren {
  onError?: (error: unknown, info: ErrorInfo) => void;
  fallback?: ReactNode;
}
interface State { error: unknown | null; }

export class FatalErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: unknown): State { return { error }; }
  override componentDidCatch(error: unknown, info: ErrorInfo): void { this.props.onError?.(error, info); }
  override render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback ?? (
        <ErrorState
          error={normalizeError(this.state.error)}
          title="应用运行异常"
          extra={<Button onClick={() => globalThis.location?.reload()}>重新加载</Button>}
        />
      );
    }
    return this.props.children;
  }
}
