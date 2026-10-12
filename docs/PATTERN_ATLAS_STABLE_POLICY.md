# Pattern Atlas 独立稳定版门槛（自 Phase 16 起）

> 这是 Showcase / Pattern Atlas Studio 的**产品稳定性门槛**，不是 Foundation 核心 npm 包的 Stable 发布声明。Foundation 的包发布仍以 `docs/STABLE_GATES.md` 和 `docs/STABLE_PROMOTION.md` 为准。

## 一、状态定义：任何阶段不得跳级

| 状态 | 准入标准 | 允许对外称谓 |
|---|---|---|
| Developing | 开发中，可能尚未运行回归 | 开发版 |
| Candidate | 增量功能完成；离线检查通过；没有伪造构建证据 | 候选版 |
| Local gates passed | 相同源码在完整依赖环境通过 frozen install、全工作区类型检查/测试/构建/lint、编译与两项浏览器测试；机器报告留存 | 本机验收通过，**还不是 Stable** |
| Stable-ready | 同一版本在 Windows 11（Node 24）及 Linux CI（Node 22）通过完整门禁，配合下述人工验收与代码冻结，报告可复核 | 待发布稳定候选版 |
| Stable | 固定源码提交 / ZIP SHA-256，双环境及人工证据齐全，已正式批准并归档，具备可用的回滚包 | **Stable** |

**自动化运行不得自己改成 Stable。** 脚本只生成 `candidate-offline-only`、`blocked`、`incomplete` 或 `local-gates-passed`，不负责审批。

## 二、必须全绿的自动化门禁（P0）

1. Node 22.23.2 与 24.12.0、pnpm 11.x；实际 Node/pnpm 版本须写入验收报告。CI 参考 pnpm 11.7.0 的 packageManager 版本。依赖必须通过 `pnpm install --frozen-lockfile`，禁止修改锁文件偷过关。
2. `pnpm verify:offline`（Foundation 原 126 项基线及架构检查）；`pattern-atlas-sanity.mjs`。
3. **导出代码与编辑器镜像一致**：`sync-studio-widget-export.mjs --check` 和 `sync-studio-workflow-export.mjs --check`。不得仅修编辑器而漏掉导出文件。
4. 运行工作流离线行为测试（当前 5 项）和 Stable 判定自测；完整工作区 `pnpm build:packages`、`pnpm typecheck`、`pnpm test`、`pnpm -r build`、`pnpm lint`。`tsc` 错误、测试失败、构建失败任何一个都阻断晋升；`pnpm dev:studio` 启动成功不能代替构建。
5. 原 Foundation Compiler 的两种布局编译验证 `pattern-atlas-composition-check.mjs`。项目设计文件必须可导出、重新导入，并且独立 React 运行时镜像不变。新增配置字段需有兼容回归测试。
6. Chromium 隔离配置浏览器测试：`pattern-atlas-workflow-browser-smoke.mjs`（GET → 条件 → 跨组件效果 → 执行记录）、`pattern-atlas-pilot-browser-smoke.mjs`（默认原版 → 受控启用 → 恢复）。浏览器异常即阻断，不能只验 HTTP 200。

一次性执行：

```powershell
pnpm patterns:stable:check --full
```

会自动启动隔离端口 `127.0.0.1:5197` 的 Showcase，并运行上述两项浏览器测试，然后停止该服务；**不会**打开你的常用浏览器配置或操作生产 API。请确保 Chrome/Chromium 可运行，并设置 `CHROMIUM_BIN` 指向浏览器执行文件。报告保存到 `artifacts/pattern-atlas/stable-gate-report.json`。不应手工编辑该报告。若本机需要使用完整依赖，可先执行 `pnpm install --frozen-lockfile`。

没有 npm 依赖时可执行 `pnpm patterns:stable:offline`；它最多只能得到 `candidate-offline-only`。离线检查不可替代真实类型检查、构建、Vitest 和浏览器验收。

## 三、人工验收（Stable-ready 必需证据）

| 门类 | 可重复场景与验收标准 |
|---|---|
| 页面构建 | `/create` 新建项目 → `/studio` 编辑、创建第二页面、导航切换；不能丢失第一页或导航 |
| 拖拽及撤销 | 添加、移动、删除组件，撤销/重做与保存/重新导入后节点树保持一致 |
| 属性 | X/Y 绝对坐标、宽高、动效在桌面、平板、375px 移动端表现合理；不应有无法关闭的遮挡 |
| 流程 | GET/POST/DELETE、条件真/假、确认取消、HTTP 错误中止、变量传递、跨组件高亮与焦点都按预期；未获确认不能产生写操作 |
| 数据 | 列表/详情/保存、分页/筛选、400/422/500、超时/断网错误提示，失败不会误显示成功 |
| 导出 | 用同一份设计导出 React 工程，在**独立安装环境** typecheck + build + 浏览器验收，并与 Studio 预览核对关键场景 |
| 无障碍 | 仅用键盘能进入流程节点、编辑、操作确认；减少动态偏好能生效；所有重要操作有可理解名称 |
| 安全与隐私 | 不保存生产 Token/密码；设计文件、日志、错误报告不能包含敏感请求体与响应内容；跨站请求受后端 CORS/CSRF/权限保护 |
| 回退 | 保存原始 Phase 15 / 已验收 Stable ZIP 和设计文件；升级失败时恢复上一 ZIP 后仍能打开旧设计、继续工作 |

**P0/P1 未解决缺陷数量均需为 0。** P0：无法构建、项目文件损坏或丢失、越权/未确认写操作、凭据泄漏。P1：主要编辑/导出流程失效、已保存特效/API 配置丢失、主流屏幕下重要控件无法操作。P2 可延期，但必须记录影响及规避步骤。

## 四、版本冻结与证据

Stable 的最终确认须同时拥有：

- 与完整验收结果一致的不可变版本号、Git commit（或原始工程 ZIP SHA-256）及 lockfile SHA-256。
- Windows + Node 24 的本地全门禁报告；Linux + Node 22 CI 全门禁报告（GitHub 的 `Pattern Atlas Stable` 手动工作流）。
- 独立导出 React 工程的构建记录和人工验收表（审查人员、日期、各场景 PASS/FAIL）。
- 影响范围、剩余 P2、依赖版本、回滚步骤与上一个 Stable 包链接。
- 对报告、归档代码及发布物的 SHA-256 核对；发布后不得以相同版本号覆盖不同字节文件。

## 五、发布决策表

| 发现的情况 | 决策 |
|---|---|
| `pnpm dev:studio` 能启动，但 `typecheck` 报错 | Blocked，不得发布 Stable |
| 126 项离线验证通过，但无 Vitest/Chromium | Candidate |
| Windows 全绿，CI 未执行 | Local gates passed |
| CI 全绿，独立导出项目尚未验证 | 未达到 Stable-ready |
| 两种环境全绿、手工验收通过、无 P0/P1、已归档 SHA/回滚包 | 可人工批准 Stable |

当前 Phase 16 仅证明**离线基线已通过**，完整项目依赖、浏览器与跨系统门禁尚未执行，因此不会标记 Stable。
