import { Flex, Space } from 'antd';
import type { ReactNode } from 'react';

export function DataToolbar({ primary, actions }: { primary?: ReactNode; actions?: ReactNode }) {
  return (
    <Flex justify="space-between" align="center" gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
      <div>{primary}</div>
      <Space wrap>{actions}</Space>
    </Flex>
  );
}
