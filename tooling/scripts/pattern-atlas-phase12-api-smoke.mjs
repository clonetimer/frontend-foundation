/** Read-only smoke test for Phase 12 demo API. Run while Showcase dev server is active. */
const origin = process.env.ATLAS_STUDIO_URL || 'http://127.0.0.1:5173';
async function get(path) {
  const response = await fetch(new URL(path, origin));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return await response.json();
}
function check(condition, message) { if (!condition) throw new Error(message); console.log('PASS', message); }
try {
  const first = await get('/api/studio-records-mapped?page=1&pageSize=2');
  const second = await get('/api/studio-records-mapped?page=2&pageSize=2');
  check(Array.isArray(first.data?.entries) && first.data.entries.length === 2 && first.data.count >= 3, '服务端第一页与总数');
  check(Array.isArray(second.data?.entries) && second.data.entries.length >= 1, '服务端第二页');
  const id = String(first.data.entries[0].key);
  const detail = await get(`/api/studio-records-mapped/${encodeURIComponent(id)}`);
  check(detail.data?.entry?.key === id && typeof detail.data.entry.owner?.name === 'string', '详情嵌套字段映射');
  const filtered = await get('/api/studio-records-mapped?page=1&pageSize=2&search=%E6%8E%A5%E5%8F%A3');
  check(filtered.data?.count >= 1 && filtered.data.entries.every((row) => row.subject.includes('接口')), '服务端搜索参数');
  console.log('Phase 12 read-only API smoke passed.');
} catch (error) {
  console.error('Phase 12 API smoke failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
