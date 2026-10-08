import { Card, Empty } from 'antd';

export function AsyncOperationLog({ lines, title = '运行日志', maxHeight = 280 }: { lines: readonly string[]; title?: string; maxHeight?: number }) {
  return (
    <Card size="small" title={title}>
      {lines.length ? (
        <pre style={{ margin: 0, maxHeight, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>
          {lines.join('\n')}
        </pre>
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无日志" />}
    </Card>
  );
}
