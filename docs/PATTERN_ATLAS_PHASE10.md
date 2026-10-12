# Pattern Atlas · Phase 10 迭代记录

基线：`frontend-foundation-pattern-atlas-phase9.zip`。本轮只扩展 `apps/showcase` 的 Studio 及一个源码同步脚本；没有修改 Foundation 的设计 DSL、原 Designer、Project Compiler 或 `packages/*`。

## 新功能

1. **组件与页面删除**：左侧「页面图层」每个非根节点有 ×，右侧任意「组件设置」分类顶部也可「删除组件」；顶部可删除当前页面，右侧「页面」的页面列表也可删除。均需确认，可撤销。不能删除项目最后一页、页面根布局，也不能单独删除分栏固定槽位或最后一个标签页，应先删除父布局。
2. **组件库搜索 + 组件扩展**：从 12 个入口扩展到 38 个。新增 26 种内容、数据、表单、反馈类组件，例如面包屑、图片、步骤、时间轴、表格、柱状图、描述列表、复选框、日期、评分、骨架屏等。点击或拖入画布；在「内容」「形式」「特效」「位置」等面板修改。静态数据表支持客户端分页。
3. **表单验证**：选中已绑定记录字段的输入框或选择器，在「数据」中设置必填；输入框还可设置最小/最大长度、邮箱或数字格式。体验模式和导出的 React 表单会在 POST 前阻止不合法的提交并显示字段错误。
4. **记录列表分页**：在数据绑定处设置每页条数（1–50），目前只对最多 500 条已加载数据做客户端分页，非服务器端分页。新增数据表组件也支持客户端分页。
5. **数据连接概览**：在右侧「页面」面板查看本页的 GET 列表、独立 API 和 POST 保存绑定，点击跳转至对应组件的「数据」设置。此处是**已有连接的概览**，不是完整的数据源注册表。

## 保存与导出的真实边界

新增的 26 种组件使用 Foundation 已支持的 `placeholder` 节点作为结构占位；具体种类与内容属于 Studio 的 `decorations.widgetKind/widgetProps`，以保证 Blueprint v1 可以继续被原 Compiler 验证及编译。单独编译 `foundation.project.json` **只得到占位组件**。需要复杂组件、动效及表单行为时，请使用导出的 `StudioApp.tsx`、`pages/*.tsx`、`studio-widget-preview.tsx`、`widgets.ts`、`studio-records.tsx` 和 CSS。

这是一套扩展性较强的常用组件库，不代表覆盖所有前端领域组件，更不代表每种组件都已经完成业务 API、无障碍和生产级交互集成。

## 验证记录（本轮执行）

- 原项目 `node tooling/scripts/offline-verify.mjs`：126/126 通过；仓库、架构检查通过。
- 新模块纯 TS 逻辑，开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`：通过。
- Studio TS/TSX 源码解析：通过；自定义 9 组 Node 可执行测试全部通过。
- 含全部 26 种增强组件的 Blueprint：成功通过原 Foundation 的 `validate` 和 `compile`，生成正常项目文件。
- 导出的 React TSX/TS 源码解析、ZIP CRC 完整性检查：通过；导出的增强组件预览源码与本仓库一致。
- 新增 `studio-v10.test.ts`：10 个 Vitest 测试已编写，**当前环境没有完整 npm 依赖，尚未在真实 Vitest 中执行**。
- 完整 Showcase TypeScript/Vite/Vitest 构建以及浏览器拖拽验收：**待用户有依赖的环境运行**。

## Windows 验收

```powershell
pnpm install --frozen-lockfile
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
pnpm -r build
pnpm dev:studio
```

打开 `http://localhost:5173/studio`。分别检查删除后撤销、搜索组件、添加表格分页、配置表单必填、体验后保存、导出源码再打开 `atlas.studio.json`。

## 下一阶段（尚未实现）

- 服务器端分页、排序、过滤及分页返回值映射；多接口并行/依赖关系、重试与加载状态。
- 共享数据源注册表（命名、环境 URL、类型映射、接口测试、组件复用），不在设计文件保存 Token/密钥。
- 更丰富的动态表单（跨字段条件校验、错误焦点定位、字段依赖可视化）；权限、认证、缓存及生产端观测。
