import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

type RecordStatus = 'ready' | 'draft' | 'archived';
interface DemoRecord { id: string; title: string; status: RecordStatus; updatedAt: string; }

const seedRecords: DemoRecord[] = [
  { id: 'REC-001', title: 'Runtime configuration', status: 'ready', updatedAt: '2026-10-01 09:20' },
  { id: 'REC-002', title: 'Permission metadata', status: 'ready', updatedAt: '2026-10-01 10:10' },
  { id: 'REC-003', title: 'API transport boundary', status: 'ready', updatedAt: '2026-10-02 14:35' },
  { id: 'REC-004', title: 'Controlled data table', status: 'draft', updatedAt: '2026-10-03 11:05' },
  { id: 'REC-005', title: 'Form error mapping', status: 'draft', updatedAt: '2026-10-03 16:40' },
  { id: 'REC-006', title: 'Consumer package validation', status: 'archived', updatedAt: '2026-09-28 08:30' },
  { id: 'REC-007', title: 'Route access boundary', status: 'ready', updatedAt: '2026-10-04 09:00' },
  { id: 'REC-008', title: 'Theme persistence', status: 'ready', updatedAt: '2026-10-04 10:10' },
  { id: 'REC-009', title: 'Bootstrap error surface', status: 'draft', updatedAt: '2026-10-04 12:25' },
  { id: 'REC-010', title: 'Repository integrity checks', status: 'ready', updatedAt: '2026-10-04 13:45' },
  { id: 'REC-011', title: 'Capability promotion rule', status: 'draft', updatedAt: '2026-10-04 15:20' },
  { id: 'REC-012', title: 'Stable public API review', status: 'archived', updatedAt: '2026-09-25 17:00' }
];

function sendJson(response: ServerResponse, status: number, body: unknown, contentType = 'application/json'): void {
  response.statusCode = status;
  response.setHeader('content-type', `${contentType}; charset=utf-8`);
  response.setHeader('x-trace-id', `showcase-${Date.now()}`);
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function showcaseApiPlugin(): Plugin {
  const records = seedRecords.map((record) => ({ ...record }));

  return {
    name: 'foundation-showcase-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url) return next();
        const url = new URL(request.url, 'http://showcase.local');
        if (!url.pathname.startsWith('/api/records')) return next();

        const segments = url.pathname.split('/').filter(Boolean);
        const id = segments[2];

        if (request.method === 'GET' && !id) {
          const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
          const status = url.searchParams.get('status');
          const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
          const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') ?? 10) || 10));
          const filtered = records.filter((record) =>
            (!search || record.title.toLowerCase().includes(search)) && (!status || record.status === status)
          );
          const start = (page - 1) * pageSize;
          return sendJson(response, 200, { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize });
        }

        if (request.method === 'GET' && id) {
          const record = records.find((item) => item.id === id);
          return record
            ? sendJson(response, 200, record)
            : sendJson(response, 404, { title: 'Record not found', detail: `No record exists for ${id}` }, 'application/problem+json');
        }

        if (request.method === 'PUT' && id) {
          const record = records.find((item) => item.id === id);
          if (!record) return sendJson(response, 404, { title: 'Record not found' }, 'application/problem+json');

          let payload: unknown;
          try { payload = await readJson(request); }
          catch { return sendJson(response, 400, { title: 'Invalid JSON' }, 'application/problem+json'); }

          const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
          const title = typeof value.title === 'string' ? value.title.trim() : '';
          const status = typeof value.status === 'string' ? value.status : '';
          const errors: Record<string, string[]> = {};
          if (title.length < 3) errors.title = ['标题至少 3 个字符'];
          if (!['ready', 'draft', 'archived'].includes(status)) errors.status = ['状态值无效'];
          if (Object.keys(errors).length) {
            return sendJson(response, 422, {
              title: 'Validation failed',
              detail: '请求包含无效字段',
              code: 'VALIDATION_FAILED',
              errors
            }, 'application/problem+json');
          }

          record.title = title;
          record.status = status as RecordStatus;
          record.updatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
          return sendJson(response, 200, record);
        }

        return sendJson(response, 405, { title: 'Method not allowed' }, 'application/problem+json');
      });
    }
  };
}

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

export default defineConfig({
  plugins: [react(), showcaseApiPlugin()],
  define: { APP_VERSION: JSON.stringify(packageJson.version) }
});
