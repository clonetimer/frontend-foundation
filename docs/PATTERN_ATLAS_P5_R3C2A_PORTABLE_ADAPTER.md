# P5-R3c2a · Studio 与独立 React ZIP 的同源恢复适配隔离

## 范围与安全边界

本阶段在原生 R3a 能力发现、R3c 身份绑定 Web Locks 状态机上建立 **同一份合成协议适配器**：`tooling/scripts/aas_p0/p5_r3c2_runtime_adapter.mjs`。

只允许受信任同源宿主显式启用，且仅执行 `/api/tasks/{id}` 的合成状态 PATCH（draft/approved/archived）。**不接管 Studio WidgetPreview、StudioRecords、按钮 Workflow、ZIP 业务 POST/PATCH/DELETE。** 普通项目数据源、导入 JSON、URL、`idempotent:true` 等字段均不得激活协议；Studio「接口管理」直接显示当前数据源可自动接入数量为零。

## 单一源码 / 打包

`sync-studio-widget-export.mjs` 同步三份原始 `.mjs`：能力声明、Web Locks journal、可选宿主适配器，生成 `exported-p5-reference.ts` 的逐字节快照。原有 `--check` 机制同步验证两类镜像，没有手写第二份协议。ZIP 在 `p5-reference/` 保留这三个文件和相同的相对导入路径，但主应用/表单/工作流均**不会导入或调用**它们。导出的 README 提醒开发者这些仅是禁用状态的合成测试参考源码。生产使用需独立签收身份、后端和数据迁移，不能只在 Studio 文件中设置开关。

## 启用前置条件

1. **真实浏览器当前 origin** 必须精确匹配宿主明确提供的 origin，仅允许 HTTPS 或显式 localhost loopback 开发环境；不接收任意跨源请求。
2. 宿主必须注入不可序列化的 `getSession` 与 `getApproval` 函数，身份由受信任的同源 `/api/session` 解析，仅 writer 可以执行；每项操作都重新要求明确的宿主审批。
3. 必须有浏览器 Web Locks 和 localStorage，禁止用非原子的 localStorage mutex 代替；必须从固定同源路径动态读取短期能力声明。
4. begin 前从同源原生任务 GET 验证 ID、tenant 和强 ETag，保存原 Key/请求体后再执行一次 PATCH；HTTP 503 视为未决。
5. check/replay 必须使用新取得的当前会话和 R3a 能力证明，先校验 Journal 中原 tenant/subject/sessionEpoch/providerId/receiptEpoch 的作用域，再查询原回执。未知 404 不等于未提交；重放仍须显式用户意图且只使用原 Key，绝不新造 Key。
6. 除了固定的合成任务状态 PATCH，没有其它通用写入路径；本阶段不批准真实业务数据库或 SSO 自动接入。

## 真实浏览器验收

已有 P5-R3b2b Linux/Windows Chromium 严格同源双标签测试现调用**新的共享宿主适配器**，而不是复制一份 transport / receipt / journal 调度代码。继续验证 Cookie+CSRF、R3a 短期能力声明、SQLite commit-then-503、跨标签页 Web Locks 忙等、刷新后原 Key 回执、跨租户隔离。Fixture 从相同 origin 提供适配器三个文件。

新增 Node 运行时合同与源码镜像一致性测试，并加入 Linux/Windows P5 CI：

```bash
node --test tooling/scripts/aas_p0/test_p5_r3c2_runtime_adapter.mjs
node --test tooling/scripts/test-p5-r3c2-export-parity.mjs
node tooling/scripts/sync-studio-widget-export.mjs --check
```

## 尚未完成

本阶段是 P5-R3c2a 的**产品适配前置工程**，不是交付生产 exactly-once。尚没有企业 OIDC/SSO、实际主业务库和分布式回执、跨设备协调、正式身份撤销/恢复、业务组件 opt-in 列表及回滚路径。尤其不能根据声明在项目文件里的所谓后端 capability 自动解锁写入。

后续 P5-R3c2b 才可在可信宿主与实际后端 owner/接口合同明确后，逐个受控业务数据源进行更广义适配及差异/回归验收。当前保持 Stable 发布策略不变。
