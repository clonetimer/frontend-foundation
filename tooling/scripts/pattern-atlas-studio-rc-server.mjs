#!/usr/bin/env node
/** Local-only, dependency-free SPA server for the built Studio RC candidate. */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, 'site');
const port = Number(process.env.ATLAS_STUDIO_PORT || 5188);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('ATLAS_STUDIO_PORT must be in 1024..65535');
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Missing built site/index.html');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff'
};
createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let name;
  try { name = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (name.includes(String.fromCharCode(0)) || name.includes(String.fromCharCode(92))) { res.writeHead(400); res.end(); return; }
  const target = resolve(root, '.' + name);
  if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  const file = existsSync(target) && statSync(target).isFile()
    ? target : (extname(name) ? null : resolve(root, 'index.html'));
  if (!file || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {
    'content-type': mime[extname(file)] || 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log('Pattern Atlas Studio RC: http://127.0.0.1:' + port + '/studio');
  console.log('Local trial only; no backend/API server is included.');
});
