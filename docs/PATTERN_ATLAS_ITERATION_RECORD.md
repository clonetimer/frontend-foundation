# Pattern Atlas 增量迭代记录

## 本轮决策（Phase 1）

- **基线**：用户上传的 `frontend-foundation-0.21.0-stable-ready.zip`。
- **接入**：选择在原仓库 `apps/showcase` 加独立 `/patterns` 模块，而非建立第二套 Foundation 产品或修改 Designer 核心。
- **目标**：解决不知道有什么前端形式可选、看不出形式差别、无法把喜好准确表达给 AI 的问题。
- **留白**：当前是本地演示工具，不是线上业务功能；使用虚构任务数据，没有服务端读写、账号系统或 Designer 自动应用。

## 已完成的功能

| 编号 | 已实现 | 验收入口 |
|---|---|---|
| A-01 | `/patterns` 路由注册、按路由懒加载，沿用 Showcase shell | 顶部「交互图鉴」 |
| A-02 | 六种布局对照，数据源一致，任务可点击展开详情 | 「布局实验室」 |
| A-03 | 38 个形式的中文解释、场景、移动端策略，按类目/名称/场景搜索 | 「形式图鉴」 |
| A-04 | 38 个 React/TSX 演示分支，支持常见点击、切换、筛选、拖拽等小交互 | 卡片「体验演示」 |
| A-05 | 收藏、加入方案、场景组合，状态本地持久化 | 卡片操作区及底部浮条 |
| A-06 | 提示词生成器：主布局优先、其他布局按备选注明，场景建议、移动端约束，允许编辑/复制/下载 | 「我的方案」 |
| A-07 | 方案草稿的页面名、风格、技术栈和额外要求本地持久化 | 「我的方案」表单 |
| A-08 | 适配桌面和手机宽度，窄屏导航、看板与表格采用横向滚动/折叠形式 | 响应式样式 |

## 仍需确认的产品决策（不阻碍 Phase 1）

1. **Designer 连接形式**：选择后应该插入一个完整页面，还是只插入选定的容器节点？
2. **目标业务组件**：下一阶段最需要哪三种复杂交互？优先考虑已有实际页面，而不是根据视觉效果排序。
3. **方案保存位置**：长期方案是否需要与项目文件一起版本化？当前只能通过提示词 `.txt` 保存文字描述。
4. **交互质量门槛**：是否增加无障碍自动化测试、移动端真机与可视回归基线？

## 下一阶段候选（尚未实施）

- B-01：明确 `pattern -> 已有 Composition Registry` 的映射，不修改冻结 DSL。
- B-02：先为两种最常用、可由当前 DSL 表达的布局增加「复制 Blueprint 片段」并做编译验证。
- B-03：对不可直接编译的复杂组件提供 Domain Component SDK 接入教程，不伪造可导入性。
- B-04：补真实浏览器回归与焦点/键盘测试，再决定是否提升为生产用途。

## 每次新增需求推荐怎么表述

不必写出完整 PRD，只需提供四件事：**在哪个页面**、**期望什么变化**、**一次操作前后应看到什么**、**哪些已有效果不能回退**。例如：“看板拖拽后同步更新右侧详情；在手机端改成分组列表；其他模式不动。”

每次改动应：保留现有稳定 API、限制影响目录、补对应测试、记录验证结论。需求不确定时先在 Showcase 演示，确定后再接入业务系统。

## 本轮本地验证状态

- **已通过**：仓库结构检查、架构约束检查、Designer 模型镜像同步检查、原仓库 126 项 offline verify。
- **已通过**：纯 TS 模块的 TypeScript 静态类型检查和实际编译运行；38 模式/6 布局唯一性、搜索、收藏过滤、输入规范化、提示词内容校验。
- **已通过**：所有新增 TS/TSX 源码的 TypeScript 语法解析/转译，无语法错误。
- **未执行**：依赖安装后的 Showcase `pnpm typecheck`、`pnpm test`、`pnpm build`，以及浏览器真实运行及视觉回归；本环境离线且缺少 pnpm/node_modules。对应风险仍然开放。

---

## Phase 2 增量进展（2026-10-10）

- **基础进度**：保留第一阶段 38 种形式、六种布局对比、38 个 React 模式演示与已有提示词行为。
- **新增视觉特效**：18 种特效按 5 类组织，支持搜索、选型、真实局部 React 演示、复位与减少动态。
- **新增设计参数**：6 项局部实时预览，主题色/底色/密度/圆角/运动策略/速度，输入经过白名单验证。
- **新增方案资产**：`pattern-atlas-ui-brief.json` 支持导入导出，提示词同时描述布局/交互/特效/Token；在两个路由间通过本地存储继承选择。
- **推进 Designer 衔接**：两种已经被现有 Registry 支持的布局可下载 Composition JSON，并已通过原有编译器的规范化与代码生成验证。其余布局暂不导出，避免虚假承诺。
- **扩展设计全景**：新增 12 类配置项说明，明确可实时配置、待规划和依赖业务能力的界限。
- **边界**：不修改 `packages/*`、`apps/designer/*`、版本、pnpm 锁文件或基础 DSL。

### 本轮环境与验收

用户补充的 Node `v22.23.2` 和 pnpm `11.7.0` 均可执行。尝试真实安装，但 npm 注册表 DNS 无法解析，项目依赖未下载。原仓库 126 项 offline verify、Repository/Architecture/Design Model 检查均通过；另已检查新模块 TS 类型（离线 shim）、CSS 语法，且实测两种 Composition 可以被现有编译器生成 TSX。**真实 Vite 编译、Vitest 和浏览器运行仍待有依赖环境验证。**

下一阶段优先考虑：用户最需要的真实业务场景、项目级 Design Tokens 如何接入 Foundation 主题、两种可编译 Composition 的 Designer 导入体验、键盘/移动端/性能回归。不要因为需求不断变化而一次性扩充整个 DSL。

---

## Phase 3 增量进展（2026-10-10）

**基线**：用户上传 `frontend-foundation-pattern-atlas-phase2-stable.zip`，与之前 Phase 2 源码相比仅 `PatternDemo.tsx` 含 `?? null` 类型兼容修复。用户报告 Phase 2 实际安装、Showcase typecheck、15 单测、Showcase Vite 构建与两个路由 HTTP 响应成功；这些是用户环境的验证结果。

新增应用层路由 `/patterns/config`：

- 4 种视觉预设，10 项设计 Token（原有 6 项+字体/字号比例/间距/阴影），局部 CSS Token 导出；不更改 Foundation Theme。
- 3 种预览容器、5 种状态，使用同一组本地假数据；容器查询重排不是实机测试。
- 3 个目标组件的白名单动效绑定（效果、触发方式、0/150/300ms 延迟），不允许任意 CSS / JavaScript 注入。
- Portable UI Brief 升级 `version: 2`，接受 v1 导入并迁移；状态、绑定和新 Token 会进入 JSON/提示词。
- 保持原来的 38 种形式、18 种特效、六种布局对照、Composition 导出、原业务 / Designer 核心不变。

本轮新增 `center.test.ts` 并扩充离线结构检查；原 `effects.test.ts` 的描述行数期望按新增 Token 调整。

**本次环境实测**：项目自带 Repository/Architecture/Design Model 检查通过，原仓库 126 项 offline verify 通过；纯逻辑 TypeScript 严格模式编译通过，v1→v2 往返、绑定规则与提示词实际 Node 运行通过；新增 TSX 通过 TypeScript 语法转译与简化类型声明下的检查，CSS 经 PostCSS 解析通过。由于 npm 域名解析失败且没有 394 个 workspace 依赖，**未运行完整 Showcase typecheck/Vitest/Vite、全工作区构建或真实 React 浏览器测试**。简化声明检查不是仓库的真实 typecheck。

下一阶段候选：在完整安装环境中执行 `pnpm -r build` 与 Playwright / 键盘回归，随后再根据实际需要决定 Theme 对接的 API 边界；如需求集中在真实业务，则优先选定业务页面试点并保留可回退机制。

## Phase 4 · Theme Adapter（2026-10-10）

- 以 Phase 3 为基线，不改 Foundation Theme Provider、核心 DSL、编译器与 Designer；Showcase 显式声明 `@foundation/theme` 依赖并同步锁文件。
- 可将 8 项参数导出为真实 `BrandTheme` / `defaultMode` / `defaultDensity`，特效参数 motion/speed 保留 `previewOnly`，不冒充 Provider API。
- `/patterns/config` 新增 Ant Design 隔离试点预览、模拟保存、即时回退、主题 JSON 与 TSX 示例下载。UI Brief 仍为 v2，旧 v1 导入有效。
- 待用户本地真实 pnpm/Vite/浏览器验收；下一步挑选业务页面，以独立 flag 做 A/B 和回退。

## Phase 5 · Records 局部主题业务试点（2026-10-10）

- 基线：上一轮交付的 Phase 4 ZIP。
- 新增 `/records/pilot`：使用已存在的 Records API（Vite dev server 内存种子数据）完成原版/候选版**同源只读**对照。
- 原 `/records` 列表接入可选局部 ConfigProvider；默认禁用，显式保存并激活版本才生效；不改 URL 查询、分页或编辑链路。
- 新增可移植的 v1 试点版本快照模型（最多 12 个）、浏览器本地持久化、版本选择、回退、恢复原版、导入/导出及严格导入白名单。
- 演示运行时开关 `features.patternAtlasPilot` 与原 `records.read` 权限共同保护试点入口和实际页面主题；关闭运行时 flag 后无论本地存储内容如何都继承原版。
- 主题复用 Phase 4 导出规则，真实映射 8/10 设计参数；不改变 Foundation Theme Provider 或冻结 DSL。
- 本轮验证情况与真实构建、浏览器验收限制见交付说明和 `docs/PATTERN_ATLAS_RECORDS_PILOT.md`。

---

## Phase 7 · 5173 统一视觉设计器（2026-10-11）

- 基线：Phase 6 Windows 修复版完整工程；保留核心 Blueprint / Compiler / 5174 Designer，不再作为用户默认入口。
- `/create` 从 JSON 改为页面视觉预览，增加进入 `/studio` 的单应用交接。
- `/studio` 新建真实应用层编辑器，支持拖放、组件树、桌面/平板/手机、内容/形式/交互/特效/风格配置、保存/恢复、追加项目页面及导出 TSX/CSS 和 Blueprint。
- `/designer` 重定向 `/studio`；`pnpm dev:studio` 简化为 `pnpm dev`，保留兼容命令 `pnpm dev:studio:legacy`。
- 所有特效/交互元数据保存在独立 `atlas.studio.json`；不冒充冻结 Blueprint 的一等属性。原 Compiler 输出只保证基础结构，动效需由 Studio 输出的 React TSX/CSS 集成。
- 验证边界：原仓库离线 126 项、27 条新增运行断言、严格静态类型及原编译器真实编译均通过；完整 React/Vitest/Vite 与浏览器验收待完整依赖环境运行。

## Phase 8 · 属性侧栏 / 数值布局 / API / 多页面（2026-10-11）

- 已将 Studio 右侧的横向 Tabs 改为固定分类工具栏和可折叠属性面板，覆盖页面、内容、位置、形式、交互、特效、数据和风格。
- 新增 X/Y 偏移与宽高数值配置，保存到 Studio 装饰元数据并同步导出 React 页面，不修改 Blueprint DSL。
- 新增 GET 指标/文字绑定与 POST 按钮请求，支持数据路径与 JSON 请求体；仅浏览器请求，不含后端服务与密钥管理。
- 新增可视化左侧/顶部项目导航、页面顺序以及独立多页面 React 入口 `StudioApp.tsx`。
- 旧 Phase 7 Studio v1 JSON 向后兼容，Foundation 核心/原 Designer 不改；在完成完整依赖构建和实际浏览器验收前保留候选版本状态。
- 技术细节见 [Phase 8 说明](PATTERN_ATLAS_PHASE8_STUDIO.md)。

## Phase 9 · 类型修复与可视化记录表单联动（2026-10-11）

- 修复 Create 页面可选 `primaryColor` 显式传入 `undefined` 的 TypeScript TS2379。
- Studio 在右侧「数据」新增记录列表、字段绑定和 POST 提交；增加一键创建「记录编辑」联动页面及 Vite 内存演示接口。
- `atlas.studio.json` 仍为 v1，可恢复旧设计，装饰元数据新增 `recordList` / `recordField` / `recordSubmit`；保持 Foundation 原 DSL 不变。
- 独立 React 代码新增 `studio-records.tsx` 共享页面级数据状态，支持 GET、选择、表单修改、POST 保存后刷新；独立字段和旧 GET/POST 继续保留。
- 首期限制：单页面一个主记录源、最多 500 条、字段为单层安全标识符、无登录授权与持久化后端。
- 详细说明见 [Phase 9 数据联动](PATTERN_ATLAS_PHASE9_DATA_BINDING.md)。

## Phase 16 · 工作流节点概览与 Stable 门禁（2026-10-12）

- 基线：Phase 15 完整工程；不改 Foundation DSL / Compiler / packages/ / 5174 兼容设计器。
- 「流程」内新增由现有声明式 Workflow 推导的节点视图：开始、动作、条件成立/不成立、结束；节点可定位到编辑设置，不增加第二份流程文件。
- 每次运行增加 `workflow:start`；不执行的条件分支按 `skipped` 标记。仅记录执行状态元数据，仍不持久化原始请求/响应数据。
- 同步工作流及组件镜像到 React 导出源，并新增 `--check` 防止版本漂移。旧的 v1 Studio 设计文件不改结构。
- 新增 `patterns:stable:check --full` / `patterns:stable:offline`、JSON 门禁报告、5 项 Node 原生工作流测试和 Stable 判定自测、独立 GitHub 手动跨平台 admission workflow。
- **当前结论**：离线检查通过，真实 npm 依赖缺失，完整 Workspace 类型检查、Vitest、Vite、Windows/CI 浏览器运行尚待验收；只能标记 Candidate。
- 对 Stable 的严格定义与人工验收项目见 `docs/PATTERN_ATLAS_STABLE_POLICY.md`。
