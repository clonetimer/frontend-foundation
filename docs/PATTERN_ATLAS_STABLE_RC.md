# Pattern Atlas Studio · Stable RC 准入规范

状态：**候选收口规范；不代表已发布 Stable**。开发范围是 `apps/showcase/src/modules/pattern-atlas/**` 和其应用层交互/导出工具。Foundation 0.21.0 的 Blueprint、Compiler、Registry、Action DSL 和 Runtime 不新增功能；旧 Designer 仅兼容维护。

## 1. 产品定义及产物边界

- **可视化产品**：Showcase 的 `/create` → `/studio`。新项目与既有项目编辑始终走一个界面。
- **可再次编辑的工程源**：`atlas.studio.json`。浏览器自动保存不是可交付项目文件。
- **兼容交换格式**：`foundation.project.json`，只覆盖 Foundation Compiler 理解的原生 Blueprint。不得声称单独编译它可以还原 Studio 专有动效、几何、扩展 Widget、HTTP 交互。
- **独立业务运行产物**：Studio 生成的 React 19 + Ant Design 6 + Vite ZIP，必须脱离 monorepo 完成 npm install、build 和真实 Chromium 交互测试；不自带后端、凭据或数据库。
- **Stable Studio 编辑器交付物**：尚需冻结并产出一个可在指定环境安装或部署的工作台包及其启动入口、完整源码版本、SHA-256 和复现步骤。Storybook Pages 或导出业务 ZIP 不能替代编辑器自身。

## 2. 自动化硬门禁（同一精确 HEAD）

| 门禁 | 必须验证 | 状态来源 |
|---|---|---|
| Static Gates + offline | 源码一致性、架构、离线契约 | CI |
| Node 22/24 | 构建、类型、单元测试、安全审查 | CI / Security |
| Studio Stable Linux + Windows | 真实依赖全门禁、视觉交互/业务流程烟测 | `pattern-atlas-stable.yml` |
| Independent React ZIP | ZIP 解包、外部安装、独立构建、Chromium 模拟真实 HTTP | `pattern-atlas-standalone-export.yml` |
| Main 回归 | PR merge commit 的 CI/Studio/Pages 状态 | GitHub Actions |

对 `apps/showcase/src/modules/pattern-atlas/**`、相关脚本、依赖图和 Studio 契约的变更必须触发 Stable Gate；不能只过滤少数 Widget/Workflow 文件。所有报告必须包含 commit、Node、pnpm、锁文件哈希、测试项及完整结论。Linux/Windows 均通过才能批准候选。

自动化 `local-gates-passed` **不等于**产品已完成 Stable：人工试用和产品交付物仍必须验收。

## 3. 用户验收场景（P0）

1. 新建项目并从空白/Bento/主从分栏模板进入同一 Studio。
2. 完成组件拖放、重排、属性/交互编辑、体验/编辑模式切换和响应式视口检查。
3. 保存 `atlas.studio.json`，重新导入并验证页面结构、组件属性、数据源、交互与外观保真；用户删除本地缓存后依然可恢复。
4. 真实接口创建、读取、编辑、删除，覆盖查询、服务端分页/排序/筛选、404/409/412/422/403、网络不确定及确认对话框。
5. 已选记录消失时，连续 GET 刷新不得自动切换修改目标；所有写操作须有准确 ID/后端确认，失败不得静默自动重试。
6. 导出独立 React ZIP，在干净目录 `npm install && npm run build && npm run dev`，对比页面行为与 Studio 体验。
7. 验证历史 Blueprint 兼容入口；对高级字段无法保真的输入必须明确告警或拒绝，不允许静默丢弃。
8. 检查主流程可发现性、异常提示、键盘操作和 Desktop/Tablet/Mobile 截图基线。

人工试用需要保留：操作步骤、测试工程、运行日志、关键截图、阻塞问题清单及整改状态。未覆盖的事项不得标记为 PASS。

## 4. Stable 判定与回滚

1. 功能冻结，选定单一 Studio RC Git SHA，锁定依赖与产物哈希。
2. 对该 SHA 的 PR 和合并后的主干完成全门禁；提交的测试不能靠自动跳过或删断言“变绿”。
3. 完成 P0 人工试用与缺陷修复，重新选择最终候选 SHA。
4. 生成实际 Studio 编辑器交付包、README、版本号、变更记录、哈希及复核证据；验证干净启动、工程重导入和独立 ZIP 运行。
5. 只有上述条件满足才发布 Studio Stable tag / GitHub Release。回滚使用前一个验收通过的 Studio 版本，不能以替换已发布制品的方式改写历史。

Foundation `0.21.0` 的 npm `candidate → latest` 属于 **另一个发布轨道**。Studio Stable 不以其 registry promotion 为先决条件；但不得破坏已冻结的 Foundation 兼容契约。

## 5. 后续功能不纳入本次 RC

- **Blueprint**：必须保障兼容交换和基础结构，但不复制原 Designer 的高级 DSL 编辑器。
- **Registry**：后续优先提供受信任领域组件元数据的 Palette / 属性 / 导出闭环；不在 Studio 中执行未受信任源码。
- **Action DSL**：沿用现有 Studio 工作流的请求、条件、确认、通知、导航、联动子集；按真实业务缺口增强可视化配置。
- 多用户协作、后端权限与审计、跨浏览器实时一致性、托管服务均不属于现阶段已交付能力。

## Phase 22-D2 · Studio 编辑器可下载试用包

新增 `Pattern Atlas Studio RC Artifact` GitHub Actions：对 `apps/showcase` 的**生产构建**单独打包，校验候选包每个文件的 SHA-256，并用 Chromium 真正加载 `/create` 和 `/studio`。下载 Actions artifact 后执行 `node serve.mjs`（Windows 可双击 `start-studio.cmd`），浏览器访问 `http://127.0.0.1:5188/studio`。

这与已有的**Studio 导出 React ZIP**是两条独立验证线：后者验证生成的用户业务应用；本条验证编辑器自身。候选包保留了 Showcase 其他页面，尚未构造成 Studio 专用桌面安装包，也不含 Vite 开发模拟 API、后端或数据库。此阶段的 Actions artifact 只是试用材料，未通过人工端到端试用、版本冻结与正式发布门禁前不可称为 Stable。
