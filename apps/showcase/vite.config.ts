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
  const studioRecords = [
    { id: 'S-101', title: '整理项目需求', status: 'ready', owner: '产品团队' },
    { id: 'S-102', title: '配置数据接口', status: 'draft', owner: '研发团队' },
    { id: 'S-103', title: '验收交互体验', status: 'archived', owner: '测试团队' }
  ];
  let nextStudioId = 104;
  let demoJobChecks = 0;

  return {
    name: 'foundation-showcase-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url) return next();
        const url = new URL(request.url, 'http://showcase.local');
        // Explicit server pagination and mapped response example for the Studio data-source editor.
        const mappedMatch = /^\/api\/studio-records-mapped\/([^/]+)$/.exec(url.pathname);
        if (mappedMatch) {
          let id: string;
          try { id = decodeURIComponent(mappedMatch[1]!); } catch { return sendJson(response, 400, { error: '主键编码无效' }); }
          if (request.method === 'DELETE') {
            const index = studioRecords.findIndex((item) => item.id === id);
            if (index === -1) return sendJson(response, 404, { error: '记录不存在' });
            studioRecords.splice(index, 1);
            return sendJson(response, 200, { success: true });
          }
          if (request.method !== 'GET') return sendJson(response, 405, { error: '详情只支持 GET 和 DELETE' });
          const row = studioRecords.find((item) => item.id === id);
          return row ? sendJson(response, 200, { data: { entry: { key: row.id, subject: row.title, state: row.status, owner: { name: row.owner } } } }) : sendJson(response, 404, { error: '记录不存在' });
        }
        if (url.pathname === '/api/studio-records-mapped') {
          if (request.method === 'GET') {
            const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
            const size = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get('pageSize') ?? '2', 10) || 2));
            const search = (url.searchParams.get('search') ?? '').trim().toLocaleLowerCase().slice(0, 120);
            const status = url.searchParams.get('status') ?? '';
            const filtered = studioRecords.filter((item) => (!search || item.title.toLocaleLowerCase().includes(search)) && (!status || item.status === status));
            const direction = url.searchParams.get('sortOrder');
            if (url.searchParams.get('sortBy') === 'title' && (direction === 'asc' || direction === 'desc')) filtered.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN') * (direction === 'asc' ? 1 : -1));
            const start = (page - 1) * size;
            return sendJson(response, 200, { data: { entries: filtered.slice(start, start + size).map((item) => ({ key: item.id, subject: item.title, state: item.status })), count: filtered.length } });
          }
          if (request.method === 'POST') {
            try {
              const value = await readJson(request);
              if (!value || typeof value !== 'object' || Array.isArray(value)) return sendJson(response, 400, { error: '提交数据必须是对象' });
              const input = value as Record<string, unknown>;
              if (input.key === undefined) {
                if (typeof input.subject !== 'string' || input.subject.trim().length < 2 || input.subject.length > 120) return sendJson(response, 422, { error: '标题至少两个字符', errors: { subject: ['标题至少两个字符'] } });
                const item = { id: `S-${nextStudioId++}`, title: input.subject.trim(), status: 'draft' as const, owner: '未分配' };
                studioRecords.push(item);
                return sendJson(response, 201, { success: true, data: { key: item.id } });
              }
              const target = studioRecords.find((item) => item.id === input.key);
              if (!target) return sendJson(response, 404, { error: '记录不存在' });
              const errors: Record<string, string[]> = {};
              if (typeof input.subject !== 'string' || input.subject.trim().length < 2 || input.subject.length > 120) errors.subject = ['标题至少需要 2 个字符'];
              if (typeof input.state !== 'string' || !['ready', 'draft', 'archived'].includes(input.state)) errors.state = ['状态不合法'];
              if (Object.keys(errors).length) return sendJson(response, 422, { error: '表单字段验证失败', errors });
              target.title = String(input.subject).trim(); target.status = input.state as 'ready' | 'draft' | 'archived';
              if (typeof input.owner === 'string' && input.owner.length <= 80) target.owner = input.owner.trim();
              return sendJson(response, 200, { success: true, data: { key: target.id } });
            } catch { return sendJson(response, 400, { error: '请求体必须是有效 JSON' }); }
          }
          return sendJson(response, 405, { error: '接口只支持 GET / POST' });
        }
        const detailMatch = /^\/api\/studio-records\/([^/]+)$/.exec(url.pathname);
        if (detailMatch) {
          let targetId: string;
          try { targetId = decodeURIComponent(detailMatch[1]!); }
          catch { return sendJson(response, 400, { error: '记录主键编码无效' }); }
          if (request.method === 'DELETE') {
            const index = studioRecords.findIndex((entry) => entry.id === targetId);
            if (index < 0) return sendJson(response, 404, { error: '记录不存在' });
            studioRecords.splice(index, 1);
            return sendJson(response, 200, { success: true });
          }
          if (request.method !== 'GET') return sendJson(response, 405, { error: '详情接口只支持 GET 和 DELETE' });
          const target = studioRecords.find((entry) => entry.id === targetId);
          return target ? sendJson(response, 200, { data: { item: { ...target } } }) : sendJson(response, 404, { error: '记录不存在' });
        }
        if (url.pathname === '/api/studio-records') {
          if (request.method === 'GET') return sendJson(response, 200, { data: { items: studioRecords.map(({ id, title, status }) => ({ id, title, status })), total: studioRecords.length } });
          if (request.method === 'POST') {
            try {
              const value = await readJson(request);
              if (!value || typeof value !== 'object' || Array.isArray(value)) return sendJson(response, 400, { error: '请求体必须为记录对象' });
              const input = value as Record<string, unknown>;
              if (input.id === undefined) {
                if (typeof input.title !== 'string' || input.title.trim().length < 2 || input.title.length > 120) return sendJson(response, 422, { error: '标题至少两个字符', errors: { title: ['标题至少两个字符'] } });
                const item = { id: `S-${nextStudioId++}`, title: input.title.trim(), status: 'draft' as const, owner: '未分配' };
                studioRecords.push(item);
                return sendJson(response, 201, { success: true, data: item });
              }
              const record = studioRecords.find((item) => item.id === input.id);
              if (!record) return sendJson(response, 404, { error: '请先选择有效记录' });
              if (typeof input.title !== 'string' || input.title.trim().length < 2 || input.title.length > 120 || !['ready', 'draft', 'archived'].includes(String(input.status))) {
                return sendJson(response, 422, { error: '标题至少 2 个字符，且状态必须为就绪、草稿或归档。' });
              }
              record.title = input.title.trim(); record.status = input.status as 'ready' | 'draft' | 'archived';
              if (typeof input.owner === 'string' && input.owner.length <= 80) record.owner = input.owner.trim();
              return sendJson(response, 200, { success: true, data: record });
            } catch { return sendJson(response, 400, { error: '请求体必须是有效 JSON' }); }
          }
          return sendJson(response, 405, { error: '只支持 GET 和 POST' });
        }
        // Local-only capability demos. The exported React project must point to real backend APIs.
        if (url.pathname === '/api/studio-job-demo') {
          if (request.method !== 'GET') return sendJson(response, 405, { error: '仅支持 GET' });
          demoJobChecks = Math.min(5, demoJobChecks + 1);
          return sendJson(response, 200, { data: { status: demoJobChecks >= 5 ? 'completed' : 'processing', progress: demoJobChecks * 20 } });
        }
        if (url.pathname === '/api/studio-upload-demo') {
          if (request.method !== 'POST') return sendJson(response, 405, { error: '仅支持 POST' });
          const maxBytes = 6 * 1024 * 1024;
          let bytes = 0;
          try {
            for await (const chunk of request) {
              bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
              if (bytes > maxBytes) return sendJson(response, 413, { error: '演示上传最大 6MB' });
            }
          } catch { return sendJson(response, 400, { error: '文件流读取失败' }); }
          // The demo intentionally discards the upload; it does not store files.
          return sendJson(response, 200, { success: true, stored: false, bytes });
        }
        if (url.pathname === '/api/studio-demo') {
          if (request.method === 'GET') return sendJson(response, 200, { data: { title: '项目数据示例', count: records.length } });
          if (request.method === 'POST') {
            try {
              const payload = await readJson(request);
              if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return sendJson(response, 400, { error: '请提交 JSON 对象' });
              return sendJson(response, 200, { success: true, received: payload });
            } catch { return sendJson(response, 400, { error: '请求体必须是有效 JSON' }); }
          }
          return sendJson(response, 405, { error: '只支持 GET 或 POST' });
        }
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
  server: { proxy: { '/api/system': { target: 'http://127.0.0.1:8765', changeOrigin: false } } },
  define: { APP_VERSION: JSON.stringify(packageJson.version) }
});
