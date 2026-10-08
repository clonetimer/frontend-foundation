import type { ApiTransport } from '@foundation/api';

export type RecordStatus = 'ready' | 'draft' | 'archived';

export interface RecordItem {
  id: string;
  title: string;
  status: RecordStatus;
  updatedAt: string;
}

export interface RecordPage {
  items: RecordItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RecordQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: RecordStatus;
}

export interface UpdateRecordInput {
  title: string;
  status: RecordStatus;
}

function recordUrl(id: string): string {
  return `records/${encodeURIComponent(id)}`;
}

export async function getRecords(transport: ApiTransport, query: RecordQuery): Promise<RecordPage> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  const response = await transport.fetch(`records?${params.toString()}`);
  return response.json() as Promise<RecordPage>;
}

export async function getRecord(transport: ApiTransport, id: string): Promise<RecordItem> {
  const response = await transport.fetch(recordUrl(id));
  return response.json() as Promise<RecordItem>;
}

export async function updateRecord(transport: ApiTransport, id: string, input: UpdateRecordInput): Promise<RecordItem> {
  const response = await transport.fetch(recordUrl(id), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  return response.json() as Promise<RecordItem>;
}
