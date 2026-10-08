import { Button, Result, Skeleton, Typography } from 'antd';
import type { ReactNode } from 'react';
import { resolveDefaultText } from '@foundation/core';
import type { AppError, UiText } from '@foundation/core';

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return <Skeleton active paragraph={{ rows }} />;
}

export function EmptyState({ title = '暂无数据', description }: { title?: UiText; description?: UiText }) {
  return <Result status="info" title={resolveDefaultText(title)} subTitle={description ? resolveDefaultText(description) : undefined} />;
}

export function ForbiddenState() {
  return <Result status="403" title="403" subTitle="当前用户无权访问此页面" />;
}

export function NotFoundState() {
  return <Result status="404" title="404" subTitle="页面不存在" />;
}

function errorDescription(error: AppError): string {
  const messages: Record<AppError['kind'], string> = {
    configuration: '应用配置无效', network: '无法连接到服务', timeout: '请求超时', validation: '请求参数无效',
    authentication: '登录状态无效', authorization: '没有操作权限', 'not-found': '资源不存在', conflict: '资源状态发生冲突',
    server: '服务暂时不可用', cancelled: '操作已取消', unknown: '发生未知错误'
  };
  return error.detail ?? messages[error.kind];
}

export function ErrorState({ error, title = '加载失败', retry, extra }: { error: AppError; title?: UiText; retry?: () => void; extra?: ReactNode }) {
  return (
    <Result
      status={error.kind === 'authorization' ? '403' : 'error'}
      title={resolveDefaultText(title)}
      subTitle={<div>{errorDescription(error)}{error.traceId ? <Typography.Paragraph type="secondary">错误编号：{error.traceId}</Typography.Paragraph> : null}</div>}
      extra={<>{retry && error.retryable ? <Button type="primary" onClick={retry}>重试</Button> : null}{extra}</>}
    />
  );
}

export function BootstrapErrorPage({ error }: { error: AppError }) {
  return <ErrorState error={error} title="应用启动失败" extra={<Button onClick={() => globalThis.location?.reload()}>重新加载</Button>} />;
}
