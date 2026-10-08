export interface NormalizedPagination {
  page: number;
  pageSize: number;
  total: number;
}

export function normalizePagination(page: number, pageSize: number, total: number): NormalizedPagination {
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 10;
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const pageCount = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const safePage = Number.isFinite(page) ? Math.min(pageCount, Math.max(1, Math.floor(page))) : 1;
  return { page: safePage, pageSize: safePageSize, total: safeTotal };
}
