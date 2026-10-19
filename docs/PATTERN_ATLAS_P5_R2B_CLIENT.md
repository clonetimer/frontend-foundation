# P5-R2b1 · 原生 AAS 合成模型幂等客户端恢复合同（独立客户端模块）

## 当前交付与证据级别

增加浏览器兼容、无外部依赖的 tooling/scripts/aas_p0/p5_client_recovery.mjs，单独对接 **P5-R2a 已准备回执表的隔离原生 AAS synthetic models SQLite 副本**。这是可独立复用的协议模块和 Node 自动化合同，**尚未接入 Studio/独立 ZIP 的 Modal、Drawer、表格、通用工作流真实提交按钮，尚未执行真实 Chromium 端到端联调**；不得作为完成 P5-R2b 或 Stable 发布的证明。

它不会自动修改任何真实 AAS SQLite 文件、修改原有 Python 网关默认行为、修改 Foundation Core 或改变旧项目导出语义。现有数据源和表单不会自动启用 P5。

## 明确支持的请求

- 仅显式调用 beginSyntheticStatusPatch，提供已有原生网关 loopback 地址（如 http://127.0.0.1:8765）、模型整数 recordId、draft|published|evaluated 状态、**仅存于调用内存**的写 Token、浏览器持久 storage（例如 window.localStorage）和 fetch。
- 新写入前请求 GET /api/records/{id}，确认记录 experiment_id 严格为 p0_case_N、返回 ID 一致、响应头为原生强 SHA-256 ETag。非合成模型与非 loopback URL 均拒绝，**没有通用 POST/PATCH/DELETE 适配**。
- 以安全随机 UUID 生成 Idempotency-Key（可在单元测试中注入固定 key），本地存储严格固定的 version/origin/recordId/status/key/etag/body，再发唯一一次 PATCH。写前存储失败直接禁止发送。浏览器将同一个 storage 实例持久化，换页面/重启后可载入待处理操作；不会持久保存 Token、Cookie、任意业务 JSON 或个人资料。
- 发生 HTTP 5xx、超时、断线、412、无法验证响应等情况保留 pending 记录；只有验证 PATCH 200 的目标 ID/状态，或 GET /api/mutations/{originalKey} 证实相同目标已 committed 才清除。**不在背景自动再次发送 PATCH，不自动更换 key**。
- recoverSyntheticStatusPatch 默认只查询原 key 的回执。404 会保持 pending；**仅在操作者明确设定 replayIfMissing: true** 时，向同一隔离网关原样重放 method/path/If-Match/key/body。变更 Token 时，如不属于原身份摘要的作用域，必须保留 pending、人工核查；绝不发新 key。
- 单一 storage 范围内最多允许一条 unresolved 操作；损坏 journal 会拒绝写入而非删除证据。

## 开发使用示例（仅对准备过的合成副本）

手动、明确地调用客户端；不要把写 Token 放到源码、HTML、导出的 ZIP 或本地存储中。调用方应通过隔离本地测试 UI 的瞬态输入读取 Token，并在会话结束时清空。

~~~js
import {
  beginSyntheticStatusPatch, readSyntheticPending,
  recoverSyntheticStatusPatch
} from './p5_client_recovery.mjs';

// Browser page must be authorized loopback Studio origin matching gateway CORS.
const result = await beginSyntheticStatusPatch({
  origin: 'http://127.0.0.1:8765',
  recordId: 1,
  status: 'evaluated',
  writerToken: inMemoryWriterToken,
  storage: window.localStorage
});
// If result.state === 'pending', retain it; do not retry with a new key.
const pending = readSyntheticPending(window.localStorage);
// After returning in a new session, first query ONLY the original receipt.
const recovery = await recoverSyntheticStatusPatch({
  writerToken: inMemoryWriterToken,
  storage: window.localStorage
});
~~~

页面只有在用户明确理解协议并认证后才能提交；直接对生产模型启用本模块仍然不被允许。

## 验收门禁

~~~bash
node --test tooling/scripts/aas_p0/test_p5_client_recovery.mjs
python -m unittest discover -s tooling/scripts/aas_p0 -p 'test_*idempotency.py' -v
python -m unittest discover -s tooling/scripts/aas_p0 -p test_secure_records.py -v
~~~

.github/workflows/ci.yml 中同一 P5 专项 job 在 Linux 和 Windows 都执行新增 Node 客户端测试、P5-R1/R2a HTTP+SQLite 合同和旧 P0 回归。Node 模拟 transport/storage，只能证明请求/恢复逻辑，不能代替真正 Chromium 的本地存储持久化、多标签页和界面验收。

## 后续 P5-R2b2 关键工作（当前明确未完成）

1. 为 Studio 数据源增加**后端能力声明/显式用户选择**。只有声明幂等回执契约且实际后端支持该写入的来源才显示恢复入口；绝不对任意 submitUrl 应用 P5 协议。
2. 设计独立浏览器凭证输入与待办 UI：不能将 bearer token 放入项目配置、ZIP、localStorage 或日志；切换用户/租户必须隔离或拒绝恢复，禁止将以前身份的 pending 当作已完成。
3. Studio 与独立 ZIP 共用确切相同的恢复实现；增加真实 Chromium 中“提交后断网/503 → 刷新或重开 → 查回执 → 重放同 key”的浏览器测试与客户端/原生网关联合 HTTP 证据。
4. 测试存储不可用、并发多标签页、Token 轮换/权限丢失、配额、服务重建导致的 ledger 丢失和状态冲突；当前单一存储 journal 不提供多标签/设备互斥。
5. 生产适配必须由真实业务后端负责人提供租户身份作用域、凭证保护、回执保留/GC、迁移备份、审计、版本检查和恢复策略；当前 P5 合成副本无生产意义。
