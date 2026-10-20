# P5-R3c2b2 · 独立 React ZIP 中的恢复协议运行时验收

## 原因与验收定位

P5-R3c2b1 证明导出 ZIP 的 `public/p5-reference/` 经过 Vite 构建后可以在实际 Chromium 页面中动态加载，并验证模块默认关闭、未授权无写入。此前尚未在**导出 ZIP 本身**调用 `begin/check` 证明写前日志和原 Key 恢复的运行时行为。

## 本次实现

- 沿用 `tooling/scripts/pattern-atlas-export-browser-check.mjs` 的真实 ZIP 解包、构建、Vite preview 及 Chromium CDP 流程，直接导入 `/p5-reference/p5_r3c2_runtime_adapter.mjs`。
- 测试代码通过不可序列化的临时 `getSession/getApproval` 宿主回调**显式授权合成场景**。网络层是此测试中注入的内存 `fetchImpl`：只接受当前浏览器 origin、`credentials:same-origin`、`redirect:error`、`cache:no-store`，并返回模拟 JSON/ETag/会话/能力声明。
- 在 Web Locks 排他作用域内，记录原始合成任务 `PATCH /api/tasks/1` 的 Key、强 ETag 和请求体**先于 PATCH**写入真实 Chromium localStorage；模拟服务器提交一次后返回 503。浏览器适配器仍报告 `pending/response-uncertain`。
- 当 Pending 未决时，再次 `begin` 返回 `blocked/pending-exists`；将可信会话作用域更改为另一租户时，`check` 返回 `blocked/scope-or-ledger-changed`，原 Journal 未被改写。
- 恢复同一可信会话并**重新实例化适配器**后，`check` 只查询原 Key 已提交回执，验证状态和版本，清空 Pending；整个过程恰有一次合成 PATCH，且 Journal 不存储 CSRF。
- 验证源有业务 POST/PATCH/DELETE 计数前后完全一致，既有图表、表单、表格、异常删除测试和浏览器截图不断言放松。

## 明确没有证明的范围

这次的模拟服务只存在于浏览器端测试代码内。它**不是**真实同源 HTTP Cookie/CSRF 或 SQLite 后端的再次验证；实际 HTTP + 持久回执、跨页面刷新、双标签页锁和会话吊销仍由 `tooling/scripts/p5-r3b2-chromium-e2e.mjs` 独立实现并验证。本阶段也没有生产 SSO/OIDC、正式业务数据源 opt-in、跨设备回执协调或者通用变更请求拦截。

## 重现与准入

```bash
node tooling/scripts/sync-studio-widget-export.mjs --check
node --test tooling/scripts/test-p5-r3c2-export-parity.mjs
node tooling/scripts/pattern-atlas-export-build-smoke.mjs --browser
```

PR 的精确 HEAD 必须通过 Linux/Windows Stable、Studio RC、CI、Security、Standalone Export 等实际触发的必要检查；合并后再次复核 main 上的工作流，不能把测试源代码已提交误认为验收已通过。
