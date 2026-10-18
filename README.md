# Frontend Foundation 0.21.0 — Stable-Ready

面向中后台、工作台、工程工具与数据型 Web 应用的通用 React SPA 前端基座，以及可审计、可再生成、可图形化编辑的项目级前端工程生成工具链。

**0.21.0 已完成源码、离线/真实依赖、打包消费者、双 Domain SDK 与制品反向验收的 Stable 收口。功能面继续冻结，不再扩充 Blueprint/Designer DSL。按照仓库既有发布规则，`0.21.0` 的不可变包应先以 `candidate` dist-tag 发布；用户接手的真实浏览器/视觉验收、GitHub exact-commit 与目标 registry smoke 通过后，再把同一批 `0.21.0` 字节提升到 `latest`。在完成外部 promotion 前，本源码交付状态称为 Stable-Ready。**

## AI UI 开发规范（Skill P0 试点）

新增 [DESIGN.md](DESIGN.md)、[组件工程指南](docs/COMPONENT_AUTHORING_GUIDE.md)、[仓库自有 UI Design Skill](.agents/skills/foundation-ui-design/SKILL.md) 与 [/create 源码审查试点](docs/STUDIO_CREATE_UI_REVIEW.md)。这些内容用于约束 AI 和开发者的设计/审查工作，**不是**新增 Studio Runtime、Tailwind/shadcn 依赖或 Stable 通过证明。/create 增强了键盘焦点及辅助说明可读性；真实浏览器验收仍依赖对应 PR 的 Actions 和人工试用。

**UI 设计质量回归（P1/P2）**：在独立 PR 中对 `/create` 和 `/studio` 的移动/平板顶部导航进行局部溢出修复；生产 Chromium 验收新增键盘 Tab/Enter/Space、Inspector 折叠语义、减少动态与 320/375/768/1440px 视口检查，并将截图和机器可读报告保存为 GitHub Actions 工件。参见 [创建页面审查](docs/STUDIO_CREATE_UI_REVIEW.md)、[Inspector P2 审查](docs/STUDIO_INSPECTOR_UI_REVIEW.md) 和 [Studio Stable RC 准入](docs/PATTERN_ATLAS_STABLE_RC.md)。**仅对应精确提交的自动化与运行证据有效**，不构成视觉人工签收、屏幕阅读器验证或正式 Stable 发布。尚未完成人工的 Modal/Drawer 复杂表单与后端事务专项测试。

**Studio 表单质量 P3（候选）**：对模态弹窗 / 侧边抽屉的本地校验及服务端字段级错误增加 `aria-invalid`、`aria-describedby` 与首个错误字段焦点定位；当 POST/PATCH 出现 5xx、超时或网络异常且结果不确定时，同一弹窗会话禁止重复提交，提示用户核查服务器状态。改动已同步到独立 React ZIP 的 `exported-widgets.ts` 源码镜像，完整测试说明见 [P3 Modal/Drawer 审查](docs/STUDIO_OVERLAY_P3_REVIEW.md)。这不是服务端幂等机制，重新打开表单不代表已经核实写入结果；浏览器自动化不能代替真实业务联调与人工签收。

## Showcase · 交互形式图鉴（应用层增量）

Showcase 的 `/patterns` 提供 38 种模式、六种同数据布局、收藏与组合，并可导出两种由现有 Compiler 验证的 Composition 骨架。新增 `/patterns/effects` 提供 18 种局部特效演示、6 项实时预览参数、UI Brief JSON 导入导出及统一 AI 提示词。只扩展应用层，不修改冻结的 Designer / Blueprint / Compiler 核心契约。详见 [`docs/PATTERN_ATLAS_SHOWCASE.md`](docs/PATTERN_ATLAS_SHOWCASE.md) 与 [`docs/PATTERN_ATLAS_EFFECT_STUDIO.md`](docs/PATTERN_ATLAS_EFFECT_STUDIO.md)。


## 统一页面设计器（Phase 7）

从 Showcase 的「创建页面」开始选择项目与起始布局，通过 `/studio` 进入统一拖拽设计器：组件树、画布、**内容 / 形式 / 交互 / 特效 / 风格**配置都在同一应用中。`/create` 右侧展示可视化页面预览，不再默认展示 JSON；旧的 Showcase `/designer` 自动跳转到 `/studio`。

```bash
pnpm install --frozen-lockfile
pnpm dev:studio   # 仅启动新的 Showcase 设计工作台
```

`/studio` 编辑时在浏览器本机自动保存，可以导入原 Foundation Blueprint 或 `atlas.studio.json`，导出的 ZIP 同时包含原生 `foundation.project.json`、可再次编辑的 `atlas.studio.json` 以及 React TSX/CSS 页面代码。**原 Foundation Project Compiler 只消费原生 Blueprint，不会自动携带 Studio 专有的交互/特效标记；需要特效时请集成导出的 TSX/CSS。** Studio 还支持部分真实 GET/PATCH/DELETE 的业务组件和独立 React ZIP 导出；并非全部 38 种交互模式的生产级实现，详见下方接口约定及限制。

原有 `apps/designer` 未删除。为了现有 Blueprint / Registry / Designer 工具链兼容，仍可使用 `pnpm designer` 单独启动原设计器；`pnpm dev:studio:legacy` 保留旧双应用启动命令。正常新建页面不再依赖原设计器或双应用端口切换。

详见 [`docs/PATTERN_ATLAS_PHASE7_UNIFIED_STUDIO.md`](docs/PATTERN_ATLAS_PHASE7_UNIFIED_STUDIO.md) 和 [`docs/PATTERN_ATLAS_AUTHORING_FLOW.md`](docs/PATTERN_ATLAS_AUTHORING_FLOW.md)。

**Windows 自动化试用验收**：Studio RC 候选包同时由 Ubuntu 和 Windows GitHub Runner 从源码构建并分别验收；Windows 真实执行 `start-studio.cmd` 并在 Chrome 验证 `/create`、`/studio`。GitHub Actions 分别提供对应 OS 的候选制品。验收通过不等于用户本机人工验收或 Stable 发布。

**Studio 编辑器候选包**：在 GitHub Actions 的 `Pattern Atlas Studio RC Artifact` 工作流，可获得带 SHA-256 清单、本地服务器和 Windows 启动脚本的生产构建试用包。生产 Chromium 测试覆盖 `/create` 与 `/studio`；这与 Studio 导出的业务 React ZIP 不同。当前仅为 Candidate，不包含后端或正式 Stable Release。详见 [Studio RC 规范](docs/PATTERN_ATLAS_STABLE_RC.md)。

**AAS 原生 SQLite 安全协议试验**：提供 Python 标准库本地 P0 网关（secure_records.py）和跨平台合成数据库测试（test_secure_records.py），验证真实 COUNT/OFFSET 分页、Bearer 读写角色、合成模型强 If-Match/412 与 SQLite 并发条件更新。该工具默认只读且仅供隔离测试；不会为未经授权的 AAS 原生 HTTP API 提供生产级保护。具体限制参见 [AAS P0 验收](docs/PATTERN_ATLAS_AAS_BACKEND_P0.md)。

**AAS 原生 HTTP 只读保护试用入口**：新增 `tooling/scripts/aas_p0/native_guard.py`，可从本地 AAS 目录导入原生 HTTP Handler，对 `/api/**` 强制 Bearer 读取鉴权、Origin/loopback 限制，并拦截所有原生写入口（防止绕过独立 CAS 网关）。这是会影响原有管理界面的**实验性只读入口**，不包含正式 Studio 登录、安全会话或审计，不可作为生产认证代用品。测试说明见 [AAS P0 验收记录](docs/PATTERN_ATLAS_AAS_BACKEND_P0.md)。

**AAS 本地合成模型受限适配器**：`tooling/scripts/aas_p0/bridge.py` 和 `test_bridge.py` 将 Studio 的 `/api/records` 规范转为 AAS 模型注册 HTTP API，Python 标准库跨平台测试。默认只读，写入仅供隔离合成模型；达到 AAS 500 行上限会拒绝伪造完整分页。仅用于 P0 验证，**无生产级身份权限及 ETag/CAS**。参见 [AAS 后端 P0 验收](docs/PATTERN_ATLAS_AAS_BACKEND_P0.md)。

**真实 AAS 后端互操作性验证**：新增 [AAS 原生后端 P0 证据及限制](docs/PATTERN_ATLAS_AAS_BACKEND_P0.md)，基于隔离、合成数据运行用户提供的 Python HTTP+SQLite 后端；提供严格只读、仅本地环回地址的探针 `node tooling/scripts/pattern-atlas-aas-readonly-probe.mjs --base http://127.0.0.1:8765/`。原生 POST/GET/PUT/DELETE 已有实测，但 Studio 通用 PATCH、强 ETag、真实鉴权和浏览器端到端集成尚未验收，因此不应宣称正式 Stable。

**Studio 1.0.0 RC 候选发布**：增加 `Pattern Atlas Studio RC Draft Release` 工作流，在完整主干门禁通过后，可把 Windows/Linux 独立试用包连同 SHA-256 校验清单归档为永久的**草稿预发布**；不得把它与正式 Stable 混同。Windows/Linux 的 P0 自动化证据包含真实 ZIP 导出/恢复与三视口截图，Linux CI 安装系统中文字体以便复核。正式发布还需 Issue #29 的人工使用与真实业务联调验收。详见 [RC 发布说明](docs/PATTERN_ATLAS_STUDIO_RC_RELEASE_NOTES.md)。

**Studio Stable RC 路线**：Pattern Atlas Studio 是后续唯一主要开发的可视化产品；Foundation 0.21.0 核心契约冻结维护，原 Designer 仅提供历史兼容。Studio 的 Stable 准入独立于 Foundation npm Registry 发布：PR 与合并后的 `main` 都必须运行跨平台 Studio 全门禁；正式发布仍需独立编辑器试用、可重导入工程、独立 ZIP 交互验收、固定源码与制品哈希。当前状态不是已发布 Stable。详见 [`docs/PATTERN_ATLAS_STABLE_RC.md`](docs/PATTERN_ATLAS_STABLE_RC.md)。

## Pattern Atlas Studio · 真实业务表格与独立 React ZIP（Phase 21–22）

**适用范围**：以下是 Showcase `/studio` 的应用层能力，不修改冻结的 Foundation 0.21.0 Blueprint / Compiler / Designer 契约。独立 ZIP 可以在 Foundation monorepo 之外直接构建；它不会自带后端、数据库、业务权限或部署环境。

### 使用步骤

1. 使用 Node.js 22.13+ 或 Node.js 24、pnpm 11.7.0，在仓库根目录运行 `pnpm install --frozen-lockfile`、`pnpm dev:studio`。
2. 按 Vite 输出的地址打开 Showcase，从 `/create` 创建页面，进入 `/studio`；增加「数据表格」及需要的「模态弹窗」或「侧边抽屉」。
3. 选中表格，在右侧配置 `dataUrl`（列表 GET）、`itemsPath`（默认 `data.items`）、`totalPath`（默认 `data.total`）、`idField`（默认 `id`），以及 `tableColumns`，每行格式为 `name|名称`。`pageSize` 范围 1–20，搜索、筛选、排序、分页参数发送给服务端，不在客户端伪造结果。
4. 点击远程表格的「查看」，可在只读详情抽屉中直接检查当前记录；配置 `detailUrl`（例如 `/api/records/{id}`）、`detailPath`（默认 `data`）时，抽屉通过真实 GET 加载详情，失败可关闭后重试，且不会替换编辑选中状态。「选择」则为编辑弹窗提供当前记录，必要时也先 GET 详情。编辑弹窗选择「编辑当前选中记录」、`PATCH`，使用含 `{id}` 的保存 URL。配置 `deleteUrl`（例如 `/api/records/{id}`）后，远程表格才显示带二次确认的「删除」按钮。
5. 切换「体验」模式验证真实 HTTP 交互，再点击 Studio 导出 ZIP。解压后在**独立目录**运行：

   ```bash
   npm install
   npm run build
   npm run dev
   ```

   按 Vite 提示地址打开导出的 React 19 / Ant Design 6 页面。导出 ZIP 包含可再次编辑的 `atlas.studio.json` 和原始 `foundation.project.json`，还包含 `StudioApp.tsx`、`pages/*.tsx`、`studio-records.tsx`、`widgets.ts` 等独立运行文件。

### 后端接口约定

列表 GET 示例请求为 `GET /api/records?page=1&pageSize=5&search=foo&filterField=status&filter=active&sort=name&order=asc`。后端应按查询条件和分页实际返回有效总数，响应示例如下：

```json
{"data":{"items":[{"id":"A-1","name":"Example","status":"active"}],"total":1}}
```

可选详情 GET `/api/records/A-1` 返回 `{"data":{"id":"A-1","name":"Example","status":"active"}}`。编辑通过 `PATCH /api/records/A-1` 提交经过表单字段校验的数据；删除通过 `DELETE /api/records/A-1` 提交**无请求体**的确认操作，成功后重新 GET 并自动修正失效页码。URL 模板仅允许一个 `{id}`，主键在替换时进行 URL 编码；删除失败（包括 HTTP 403）不会在页面上乐观移除记录。未配置删除地址时不显示远程删除能力。

### Phase 22-B3 · 当前页多选与批量删除

配置有效的 `deleteUrl` 后，远程表格显示当前页复选框与「批量删除」按钮：勾选当前页最多 20 条记录，明确二次确认后，按记录 ID **逐条发送 DELETE**（复用行级删除 URL 及编码规则），不通过浏览器本地列表模拟成功。不同分页、搜索、筛选和排序之间**不保留选中项**，防止对用户当前看不到的记录执行删除。批次会逐项报告成功数量、失败的记录 ID 和 HTTP 错误；成功删除无法自动回滚，失败记录会保留供用户再次确认后重试。每批操作会重新 GET 服务端列表和总数。

### Phase 22-B4 · 并发版本保护与不确定结果处理

如业务后端返回每条记录的**强 ETag**（例如 `{"id":"A-1","name":"Example","etag":"\"rev-2\""}`），在远程表格配置 `deleteEtagField=etag`（该字段不必出现在展示列中）。此时单行及批量 DELETE 都发送 `If-Match: "rev-2"`，由**后端**原子判断当前版本：匹配才允许删除；版本已改变请返回 HTTP 412 或 409。启用此配置后，缺失、格式错误或弱 ETag（`W/"rev-2"`）会**阻止请求发送**，不降级为无版本条件的删除。跨域后端 CORS 需要允许 `If-Match` 请求头；如果没有服务端版本接口，不填写 `deleteEtagField` 仍可使用旧的无条件删除模式，但它不提供并发版本保护。

对于 HTTP 401/403，保留服务端拒绝提示；HTTP 404/409/412/428 归为冲突，刷新列表后由用户查看新记录再决定是否操作。对于 HTTP 5xx、网络中断或超时，**无法保证 DELETE 没有在服务端执行**：显示“结果不确定”，触发服务端 GET 核对，批次立即停止后续请求，不将不确定记录加入“失败项重试”。已成功的记录不回滚；未执行的记录需要用户重新确认。建议生产后端实现幂等 DELETE、鉴权、操作审计以及原子 ETag 比较；前端不能替代这些服务端措施。

**安全与限制**：组件仅使用浏览器同源凭据策略（`credentials: same-origin`）；跨域接口需按部署环境配置 CORS/认证。**真正的权限验证、授权、并发版本冲突处理与数据完整性必须由后端承担**，不能把按钮隐藏当作权限控制。不要把 Token/密码放入 Studio 文档或 URL。B3 **不是**服务端事务性批量 API，不支持跨页选择、原子回滚或失败后自动重试；网络中断或超时存在结果不确定性，应从后端核对状态后再重试，生产接口应具有幂等语义。部分业务工作流和 API 能力仍需接入实际后端验收，独立 ZIP 构建 PASS 不等同于生产可用。

### Phase 22-C1 · 项目级共享表格数据源

表格现可复用与记录列表、编辑表单共用的**项目级接口数据源**：在 Studio「接口管理」中创建并配置来源，设置 `paginationMode=server` 和有效的列表 GET 地址，然后在表格右侧「共享表格数据源」中选择该来源。此模式会统一接管表格的 `listUrl`、`detailUrl`、`deleteUrl`、路径、主键、每页记录数以及安全字段映射；`tableColumns` 仍由表格单独决定显示哪些字段。`sourceId` 保留在可再次编辑的 `atlas.studio.json` 中，独立 React ZIP 则将来源解析为运行时接口配置，**不要求导出项目访问原设计工作台**。

共享查询遵循数据源中设置的 `pageParam`、`sizeParam`、`searchParam`、`filterParam`、`sortParam` 和 `sortDirectionParam`（默认 `page/pageSize/search/status/sortBy/sortOrder`），与原独立表格的 `filterField/filter/sort/order` 兼容模式不同。字段映射使用经过验证的 `fieldMappings`，将服务端嵌套字段同时映射到**表格展示列和详情 GET 的只读/编辑记录**；详情响应原始或映射后的记录 ID 与当前选择不符时均会拒绝继续编辑。**缺失、非法或不支持服务端分页的共享数据源会拒绝回退旧 URL**，避免误访问旧服务器。旧的直接 `dataUrl` 配置不受影响；初版暂不将图表、文件或异步任务直接迁移到同一数据契约。

### Phase 22-C2 · 统一共享写入契约（POST / PATCH）

Studio 弹窗/抽屉选择「复用共享数据源（保存地址）」后，**新增模式**优先使用项目数据源的 `createUrl`（POST；旧项目未配置时可沿用 `saveUrl`），**编辑选中记录模式**使用含单个 `{id}` 的 `saveUrl`（PATCH）；请求主键仍进行 URL 编码。共享源的 `fieldMappings[].saveField` 用于转换表单字段到服务端 JSON 字段名。比如表单 `name` 对应 `saveField=subject`，发送的请求体就是 `{"subject":"示例"}`。字段名不合法或映射重名时，禁止发送请求。

Studio 体验模式与导出 ZIP 调用同一个纯配置解析器；共享源不存在、写入 URL 不适用于当前操作或模板不合法时，**不会使用曾经填写的旧 `submitUrl`**。未关联数据源的旧弹窗继续使用直接地址。对于 POST/PATCH 的 HTTP 409/412/428，提示并发冲突并刷新记录；HTTP 5xx、网络中断与超时为**结果不确定**，不自动再次提交，也不触发可能带来第二次写入的失败工作流。生产系统必须由后端实现鉴权、幂等性、版本原子校验和审计；前端无法证明某次超时请求是否已经落库。

### Phase 22-C3 · 统一写入失败分类与字段级错误

远程表格 DELETE 与弹窗/抽屉 POST/PATCH 统一将 HTTP 响应归为**权限拒绝（401/403）**、**记录/版本冲突（404/409/412/428）**、**输入校验失败（400/422）**、**结果不确定（5xx/断网/超时）**及其他明确失败。只有请求成功才展示保存/删除成功；冲突与不确定状态会通知已显示的记录组件重新 GET 服务端数据。**不确定写入不会自动重试，且不会触发可能引发第二次写入的失败工作流**；权限错误不被误称作已执行。

对 HTTP 400/422，支持服务端返回 `{"errors":{"subject":["服务器要求更正姓名"]}}`。绑定共享数据源的弹窗会利用 `fieldMappings[].saveField` 将服务端字段 `subject` 反向映射回表单字段 `name`，按字段显示最多 16 项、每项不超过 240 字的校验提示。未知字段、原型污染字段、不明确的重复映射及超过 16 KB 的错误响应不会渲染到表单。此阶段统一了 Studio 增强表格与弹窗组件的写入失败契约；旧 Record Provider 的协议全面迁移仍列为后续工作，不把客户端错误提示等同于真实后端事务。

### Phase 22-C4 · 旧 Record Provider 与独立 ZIP 的写入错误统一

原有记录列表（Record Provider）的保存 POST、新增 POST、删除 DELETE 已接入 C3 的共享错误分类：400/422 为字段校验，401/403 为权限拒绝，404/409/412/428 为冲突，5xx/网络中断为**结果不确定**。Studio 与独立 React ZIP 使用同一分类规则，错误不会被错误地报告为“已删除/已保存成功”。对需要核对服务端状态的冲突或不确定结果，会重新 GET 记录；保存时尽量保留正在编辑的草稿。不会自动重复写入。

旧 Record Provider 的 400/422 后端字段提示使用安全的 `fieldMappings[].saveField` 反向映射，受相同的 16 项字段/每项 240 字限制；Studio 和 ZIP 请求错误体只解析不超过 16 KB 的 JSON。独立 ZIP 的 Chromium 真实测试另外覆盖了旧记录保存时的 422 字段错误、服务端可能已保存但网关返回 503、以及 HTTP 403 权限拒绝。此阶段不声明后端事务、认证或幂等能力，也不将没有实现原子版本校验的旧 Record Provider 视为具备 `If-Match` 保护。

### Phase 22-C5 · 跨组件刷新与写入互斥

旧 Record Provider 的保存、创建、删除采用**共享的单次在途写入锁**：同一 Record Provider 下，即使两个不同按钮被连续快速触发，也只能同时执行一个后端写操作；加载期间禁用相应提交/删除入口，避免同一记录重复写入。Studio 体验模式与独立 React ZIP 采用等效实现；该锁只保护浏览器内一个 Provider 实例，**不能替代服务端并发控制或幂等键**。

写入成功、数据冲突或结果不确定时，统一广播现有的 `atlas:records-refresh` 事件。旧记录列表、增强表格及其他订阅该事件的数据组件会重新 GET 服务端数据，而不是只刷新写入者自身的本地列表。遇到 5xx/网络不确定状态时继续遵循 C3/C4：不得自动再写入，尝试保留编辑草稿。重复点击的第二次请求会被同步锁拒绝，避免 React 重新渲染前产生竞态。**刷新广播是同一浏览器页面内的消息，不意味着跨终端实时同步或数据库事务完成。**

### Phase 22-C6 · 刷新后选中记录的安全一致性

Record Provider 在收到 `atlas:records-refresh` 后会重新 GET，但**不再把正常的数据刷新当成切换分页**：当前编辑的是第二条或后续记录时，只要其 ID 仍存在于服务端当前页，就保持选中同一 ID，不会自动跳到首条。服务端删除、过滤或并发变更导致原 ID 不再存在时，取消原选中且在连续刷新时保持取消状态，直到用户重新选择或切换查询，**绝不静默改写另一条记录**。真正的切页、改变过滤条件或切换来源仍会按原有交互规则清除上下文；首次载入可以继续默认选择首条。

此修复同时覆盖 Studio 体验模式与独立 React ZIP 的旧 Record Provider，并在独立 ZIP Chromium 验收中使用两条真实服务端记录，检查非首行保存后选中保持、服务端删除后取消选中，以及未发生额外写入。它仅保护当前浏览器组件的编辑定位，不声明跨终端实时同步。

### 验证入口

```bash
pnpm check
pnpm patterns:stable:check
node tooling/scripts/pattern-atlas-export-build-smoke.mjs --browser
```

最后一项会将真正生成的 Studio ZIP 解包为独立 React 项目、安装公开依赖、构建并通过 Chromium 执行交互验收；它需要相应浏览器/执行环境，并非单纯检查 TSX 字符串。跨平台和安全完整证据请以对应 GitHub PR **最新 HEAD** 的 Actions 为准。Stable Gate 的 `local-gates-passed` 不代表 0.21.0 已完成 registry promotion。进一步细节见 [页面创建流程](docs/PATTERN_ATLAS_AUTHORING_FLOW.md)。

## 当前状态

0.21.0 Stable-Ready 延续私有 workspace 应用 `@foundation/designer`，仍直接编辑现有 `foundation.project.json`，没有 `designer.json`、没有运行时 JSON Renderer，也没有第二套页面模型。项目可以额外声明 `foundation.registry.json`，把领域 Widget/Block 作为一等设计模块加入同一 Palette / Property / Binding / Event / Compiler 链路。

设计器当前包含：

- `@foundation/design-model` 浏览器安全共享契约与统一 Composition Registry；
- Registry 驱动的 Layout / Widget Palette 与 Properties / Binding / Event 元数据；
- Object Tree、Canvas 实时预览、拖放与显式 Parent Container 重挂；
- Blueprint 级 Undo / Redo 与保存状态 dirty 追踪；
- Node / State / Action / Data Source / Operation 引用安全重命名；
- Properties / Bindings / Events Inspector；
- 结构化 Action step 编辑器；
- 结构化 HTTP Data Source / Operation 编辑器；
- Desktop / Tablet / Mobile 响应式视口预览；
- 键盘删除、重排、Undo / Redo 快捷键；
- 精确 JSON Source 模式；
- 浏览器 File System Access 直接打开/保存 `foundation.project.json`，不支持时退化为导入/下载。
- 项目级 `foundation.registry.json`：命名空间 Custom Widget/Block、属性、Binding、事件、默认值与容器能力；
- Designer 安全占位预览 Custom Registry，不执行任意项目组件代码；
- 实时 Diagnostics 面板与 `foundation-project diagnose --json` 统一诊断类别。

运行：

```bash
pnpm designer
```

生产构建门禁入口：

```bash
pnpm designer:build
```

完整设计见 `docs/VISUAL_DESIGNER.md`。

## Domain Component SDK 快速开始

0.20 引入、0.21.0 冻结验证的 `foundation-domain`，把 `foundation.registry.json` 从“单个项目配置”推进为领域组件包的工程契约：

```bash
foundation-domain init ./domain-widgets --package @example/domain-widgets --namespace example
cd domain-widgets
npm install
npm run typecheck
npm run build
foundation-domain verify . --built --pack
```

仓库保留真实 `@example/domain-widgets` 回归包，包含 `InteractiveViewer`、`TimeSeriesChart`、`AnalysisSection`。Storybook 会执行真实 React 组件；Designer 只读取 Registry 元数据并渲染安全占位/容器，因此领域代码不会在设计器中被任意执行。多个领域包可以通过：

```bash
foundation-domain merge pkg-a/foundation.registry.json pkg-b/foundation.registry.json --out foundation.registry.json
```

确定性合并为项目 Registry。完整契约与 admission 规则见 `docs/DOMAIN_COMPONENT_SDK.md`。

```text
Palette / Object Tree / Canvas / Inspector
                ↓
      foundation.project.json
                ↓
         Project Compiler
                ↓
       ordinary React / TSX
```

Pattern、Visual Composition、Action/Binding 和 Data/Operation 仍保持原有构建期编译边界。0.20 的重点转向领域组件包工程化：Foundation 管理 Registry/Designer/Compiler 契约，项目包负责真实 React 实现、预览、测试与版本发布。

## Project Blueprint 快速开始

```bash
create-foundation-app my-app --profile management --shell top-nav --deployment nginx
cd my-app

# 为现有项目生成可审查的 Project Blueprint 计划
pnpm foundation:project -- init .
pnpm foundation:project -- init . --write

# 验证 / 编译 / 检查漂移
pnpm foundation:project -- validate foundation.project.json
pnpm foundation:project -- compile foundation.project.json
pnpm foundation:project -- status .
```

新项目也可以直接从 `foundation.project.json` 编译。Project Blueprint v1 要求目标 Foundation 与 Compiler 位于同一 major/minor；较早 minor 项目执行 `init` 时会明确规划升级到当前 0.21 minor，而不是生成 Runtime / Tooling 混线项目。完整模型、ownership 语义和迁移流程见 `docs/PROJECT_BLUEPRINT.md`。

### 安全再生成

Compiler 将文件分为：

- `generated-owned`：机器拥有；人工漂移默认阻断，只有显式 `--force-generated` 才接管；
- `scaffold-once`：首次生成后允许人工编辑；生成输入未变化时保留人工修改，生成输入变化且与人工修改冲突时阻断；
- `human-owned`：迁移已有项目时保守识别，Compiler 不覆盖。

编译前先在 staging 生成全部输出并计算完整同步计划，因此发现冲突时不会出现“写了一半再失败”。状态和输入哈希记录在 `foundation.project.state.json`，`foundation-doctor` 同时检查 Blueprint/Resource 输入及 machine-owned 漂移。


## Visual Composition 快速示例

Project Blueprint 页面可选地声明：

```json
{
  "id": "overview",
  "title": "Overview",
  "pattern": "dashboard",
  "index": true,
  "composition": {
    "id": "root",
    "kind": "layout",
    "type": "split",
    "props": { "secondarySize": 320 },
    "children": [
      { "id": "main", "kind": "widget", "type": "placeholder", "props": { "title": "Main view" } },
      { "id": "inspector", "kind": "widget", "type": "panel", "props": { "title": "Inspector" } }
    ]
  }
}
```

`foundation-project compile` 会生成 `<SplitLayout>`、`<PlaceholderWidget>`、`<PanelWidget>` 等普通 TSX。`foundation-generate --list-composition --json` 可输出机器可读 Registry，供未来图形化设计器/Planner 构建工具箱。完整节点模型见 `docs/VISUAL_COMPOSITION.md`。

## Action / Binding 快速示例

0.15 在同一页面 Blueprint 中增加结构化交互图：

```json
{
  "state": [
    { "id": "mode", "type": "string", "initial": "nominal" },
    { "id": "running", "type": "boolean", "initial": false }
  ],
  "actions": [
    { "id": "updateMode", "steps": [{ "type": "set", "state": "mode", "value": { "event": "value" } }] },
    { "id": "start", "steps": [{ "type": "set", "state": "running", "value": true }] }
  ]
}
```

Widget 通过 `bindings` 读取状态，通过 `events` 连接 Action：

```json
{
  "id": "modeSelect",
  "kind": "widget",
  "type": "select",
  "props": { "options": [{ "label": "Nominal", "value": "nominal" }] },
  "bindings": { "value": { "state": "mode" } },
  "events": { "change": ["updateMode"] }
}
```

Compiler 会生成受控 `<SelectWidget value={mode} onValueChange={...} />`，而不是执行 JSON 中的代码字符串。完整模型与安全边界见 `docs/ACTION_BINDING.md`。

## 传统快速开始

```bash
create-foundation-app my-app --profile management --shell sidebar --deployment nginx
cd my-app
pnpm foundation:generate -- module overview --pattern dashboard --title "Overview" --index
```

Profiles：

- `minimal` — Application Shell + UI Patterns；
- `management` — DataTable + Forms + Permission；
- `data-workbench` — File + Async + Visualization。

项目携带 `foundation.config.json`，`foundation-doctor --strict` 持续检查版本、Profile/Deployment、模块能力、Contract 和 Project Blueprint 漂移。

## 产品结构

### Runtime Kernel

- `@foundation/core`
- `@foundation/observability`
- `@foundation/security`
- `@foundation/api`
- `@foundation/theme`
- `@foundation/ui`
- `@foundation/app`
- `@foundation/testing`

### Reusable Capabilities

- `@foundation/data`
- `@foundation/forms`
- `@foundation/file`
- `@foundation/async`
- `@foundation/visualization`

### Published Tooling (`@foundation/create-app`)

- `create-foundation-app`
- `foundation-generate`
- `foundation-project`
- `foundation-doctor`
- `foundation-upgrade`
- `foundation-contract`

## Goal-first / OSS policy

项目目标和稳定 Capability Contract 优先。成熟 OSS 必须评估，但只有在兼容性、维护成本、Bundle、迁移与可逆性等指标上实际优于当前实现时才晋级。Refine / ProComponents 等实验保持在 Shadow PoC，不能反向污染 Runtime Kernel。

## Delivery

Deployment 与 Profile 正交：

- `none` — hosting-neutral；
- `nginx` — SPA fallback、runtime config、health check、cache policy、gzip、security headers、可选 `/api` proxy。

Redis 仍不是 Frontend Foundation 默认依赖；只有真实 BFF/后端共享状态、缓存、限流、队列等需求出现时才由服务端架构单独引入。

## API Contract

OpenAPI Contract Pipeline 是 opt-in Candidate 能力。默认 `contract=none` 为零 generator 成本。Foundation 不自研 OpenAPI parser，也不把 generator runtime client 带入应用；HTTP、AppError、Trace、Abort/Timeout 继续由 `@foundation/api` 控制。

Hey API adapter 仍处于独立 Candidate admission 状态，不阻塞 Foundation 主线的 Stable 收口。

## GitHub CI/CD

仓库已包含：

- `.github/workflows/ci.yml`
- `.github/workflows/security.yml`
- `.github/workflows/pages.yml`
- `.github/workflows/release.yml`
- `.github/workflows/registry-smoke.yml`
- `.github/workflows/promote.yml`
- `.github/dependabot.yml`

本地检查：

```bash
pnpm github:verify
```

配置说明见 `docs/GITHUB_CICD.md`。

## Release lifecycle

```text
CI green
  ↓
pack immutable tarballs
  ↓
publish --tag candidate
  ↓
clean registry smoke
  ↓
dist-tag add ... latest
  ↓
Stable
```

稳定版不是重复 publish 同一个版本，而是将经过验证的不可变 Candidate 包移动 dist-tag。详见 `docs/RELEASE.md`、`docs/REGISTRY.md` 和 `docs/STABLE_PROMOTION.md`。

## Validation

详细实际结果见：

- `VALIDATION.md`
- `docs/releases/0.21.0.md`
- `docs/STABLE_ACCEPTANCE_0_21.md`
- `docs/RC_READINESS_0_21.md`
- `docs/releases/0.21.0-rc.1.md`
- `docs/releases/0.20.0.md`
- `docs/CUSTOM_REGISTRY.md`
- `docs/COMPILER_DIAGNOSTICS.md`
- `docs/VISUAL_DESIGNER.md`
- `docs/KERNEL_COMPATIBILITY_0_19.md`
- `docs/releases/0.18.0.md`
- `docs/KERNEL_COMPATIBILITY_0_18.md`
- `docs/releases/0.17.0.md`
- `docs/KERNEL_COMPATIBILITY_0_17.md`
- `docs/releases/0.16.0.md`
- `docs/DATA_OPERATION.md`
- `docs/KERNEL_COMPATIBILITY_0_16.md`
- `docs/releases/0.15.0.md`
- `docs/ACTION_BINDING.md`
- `docs/KERNEL_COMPATIBILITY_0_15.md`
- `docs/releases/0.14.0.md`
- `docs/VISUAL_COMPOSITION.md`
- `docs/KERNEL_COMPATIBILITY_0_14.md`
- `docs/releases/0.13.0.md`
- `docs/PROJECT_BLUEPRINT.md`
- `docs/KERNEL_COMPATIBILITY_0_13.md`
- `docs/releases/0.12.0.md`
- `docs/KERNEL_COMPATIBILITY_0_12.md`
- `docs/releases/0.10.1.md`
- `docs/KERNEL_COMPATIBILITY_0_10_1.md`
- `docs/STABLE_GATES.md`


### Pattern Atlas Phase 3 · 可视化配置中心（Showcase 扩展）

在 `/patterns/config` 试用四套设计预设、十项局部 Token、三类组件动效绑定、三个模拟视口与五种业务状态。导出的方案 JSON 已升级为 v2，并可导入 Phase 2 的 v1 文件。该功能为实验选型，不会自动修改 Foundation 全局 Theme 或 Designer。详见 [`docs/PATTERN_ATLAS_CONFIG_CENTER.md`](docs/PATTERN_ATLAS_CONFIG_CENTER.md)。
