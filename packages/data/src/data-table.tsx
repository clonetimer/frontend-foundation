import { Empty, Table } from 'antd';
import type { TablePaginationConfig, TableProps } from 'antd';
import type { ReactNode } from 'react';
import type { AppError } from '@foundation/core';
import { ErrorState } from '@foundation/ui';
import { normalizePagination } from './internal/normalize-pagination';

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: readonly number[];
  onChange?: (page: number, pageSize: number) => void;
}

export type DataTableProps<T extends object> = Omit<
  TableProps<T>,
  'dataSource' | 'loading' | 'pagination' | 'locale'
> & {
  data: readonly T[];
  loading?: boolean;
  error?: AppError;
  retry?: () => void;
  emptyText?: ReactNode;
  pagination?: false | DataTablePagination;
};

function toPagination(value: DataTablePagination | false | undefined): false | TablePaginationConfig | undefined {
  if (value === false || value === undefined) return value;
  const normalized = normalizePagination(value.page, value.pageSize, value.total);
  return {
    current: normalized.page,
    pageSize: normalized.pageSize,
    total: normalized.total,
    showSizeChanger: Boolean(value.pageSizeOptions?.length),
    ...(value.pageSizeOptions ? { pageSizeOptions: [...value.pageSizeOptions] } : {}),
    ...(value.onChange ? { onChange: value.onChange } : {})
  };
}

export function DataTable<T extends object>({
  data,
  loading = false,
  error,
  retry,
  emptyText,
  pagination,
  ...tableProps
}: DataTableProps<T>) {
  if (error) return <ErrorState error={error} {...(retry ? { retry } : {})} />;

  const tablePagination = toPagination(pagination);

  return (
    <Table<T>
      {...tableProps}
      dataSource={data}
      loading={loading}
      {...(tablePagination !== undefined ? { pagination: tablePagination } : {})}
      locale={{ emptyText: emptyText ?? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" /> }}
    />
  );
}
