import { Button, Space } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { AsyncOperationLog, AsyncOperationPanel } from '@foundation/async';
import type { AsyncOperation } from '@foundation/async';
import { Page, PageContent, PageHeader } from '@foundation/ui';

const initialOperation: AsyncOperation = { id: 'demo-operation', status: 'pending', progress: 0, message: '等待启动' };

export function Component() {
  const [operation, setOperation] = useState<AsyncOperation>(initialOperation);
  const [logs, setLogs] = useState<readonly string[]>([]);
  const timerRef = useRef<ReturnType<typeof globalThis.setInterval> | undefined>(undefined);

  const stop = () => {
    if (timerRef.current !== undefined) globalThis.clearInterval(timerRef.current);
    timerRef.current = undefined;
  };

  useEffect(() => stop, []);

  const start = () => {
    stop();
    let progress = 0;
    const startedAt = new Date().toISOString();
    setLogs(['operation started']);
    setOperation({ id: 'demo-operation', status: 'running', progress, message: '处理中', startedAt });
    timerRef.current = globalThis.setInterval(() => {
      progress = Math.min(100, progress + 10);
      setLogs((current) => [...current, `progress=${progress}`]);
      if (progress >= 100) {
        stop();
        setOperation({ id: 'demo-operation', status: 'succeeded', progress: 100, message: '处理完成', startedAt, completedAt: new Date().toISOString() });
      } else {
        setOperation({ id: 'demo-operation', status: 'running', progress, message: '处理中', startedAt });
      }
    }, 250);
  };

  const cancel = () => {
    stop();
    setLogs((current) => [...current, 'operation cancelled']);
    setOperation((current) => ({ ...current, status: 'cancelled', message: '用户取消', completedAt: new Date().toISOString() }));
  };

  return (
    <Page>
      <PageHeader title="Async Capability" description="长时间异步操作的状态、进度、日志和轮询原语。" extra={<Button type="primary" onClick={start}>启动演示</Button>} />
      <PageContent>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <AsyncOperationPanel operation={operation} onCancel={cancel} onRetry={start} />
          <AsyncOperationLog lines={logs} />
        </Space>
      </PageContent>
    </Page>
  );
}
