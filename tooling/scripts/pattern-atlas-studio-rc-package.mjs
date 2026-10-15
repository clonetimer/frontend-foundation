#!/usr/bin/env node
/** Package the built Studio editor, not the independently exported user-app ZIP. */
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const dist = join(root, 'apps/showcase/dist');
const output = join(root, 'artifacts/pattern-atlas/studio-rc');
const site = join(output, 'site');
assert(existsSync(join(dist, 'index.html')), 'Run pnpm --filter @foundation/showcase build first');
const compiled = readFileSync(join(dist, 'index.html'), 'utf8');
assert(compiled.includes('assets/') && !compiled.includes('/src/main.tsx'), 'Expected production Vite HTML');
assert(existsSync(join(dist, 'runtime-config.json')), 'Missing production runtime-config.json');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(dist, site, { recursive: true });
copyFileSync(join(root, 'tooling/scripts/pattern-atlas-studio-rc-server.mjs'), join(output, 'serve.mjs'));
writeFileSync(join(output, 'start-studio.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nnode serve.mjs\r\npause\r\n');
writeFileSync(join(output, 'start-studio.sh'), '#!/usr/bin/env bash\ncd "$(dirname "$0")"\nnode serve.mjs\n');
writeFileSync(join(output, 'README-CANDIDATE.md'), "# Pattern Atlas Studio · 候选试用包\n\n这是 Studio 编辑器的生产构建试用包（包含原 Showcase 的其他页面），不是正式 Stable、不是用户导出的 React 业务 ZIP，也不包含后端。\n\n## 使用步骤\n1. 安装 Node.js 22.13+ 或 Node.js 24。\n2. Windows：双击 start-studio.cmd；或在本目录执行 node serve.mjs。其他系统：bash start-studio.sh。\n3. 打开 http://127.0.0.1:5188/studio，创建新页面请访问 /create。\n4. 保存重要项目时主动导出 atlas.studio.json，浏览器本地缓存不是完整备份。\n\n此服务器仅绑定 127.0.0.1，默认不公开访问。端口可通过 ATLAS_STUDIO_PORT 更改（1024–65535）。\n候选包不包含 Vite 开发模拟 API、鉴权、数据库或服务端业务能力；连接真实接口需自行提供后端、CORS 与审计。\nmanifest.json 记录源代码提交、每个打包文件的 SHA-256 与状态；请不要将 candidate-unpromoted 理解为正式发布。\n");
const listed = [];
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.isFile()) {
      const bytes = readFileSync(path);
      listed.push({ path: relative(output, path).replaceAll(String.fromCharCode(92), '/'),
        size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } else throw new Error('Unsupported candidate file: ' + path);
  }
}
visit(output);
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const manifest = { schemaVersion: 1, releaseTrack: 'pattern-atlas-studio',
  status: 'candidate-unpromoted', foundationContract: '0.21.0-frozen',
  sourceCommit, node: process.version, platform: process.platform, files: listed };
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output, sourceCommit, files: listed.length, status: manifest.status }));
