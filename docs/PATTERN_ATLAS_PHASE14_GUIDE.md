# Pattern Atlas Studio · Phase 14 使用指南

本轮聚焦四件事：解决 Ant Design Divider 类型错误、区分组件数据与接口管理、扩展文件/任务/可视化组件、引入可编辑的顺序工作流。

## 1. 为什么「组件数据」和「接口管理」都存在？

两者不重复：

| 分类 | 负责的问题 | 例子 |
| --- | --- | --- |
| **组件数据** | 当前选中的列表/表单使用哪些字段、怎样展示、如何与某个接口建立绑定 | 列表使用 `title` 作为标题；表单字段映射为 `status` |
| **接口管理** | 项目级共享的后端连接定义，可供多个页面、多个组件复用 | `/api/tasks` 列表 GET、`/api/tasks/{id}` 详情 GET、`/api/tasks` 保存 POST |
| **流程** | 按钮被点击后，各个操作执行的先后顺序 | 确认 → POST → 刷新列表 → 提示完成 |
| **内容** | 组件自身的静态属性或某些特殊控件的 API 参数 | 上传控件的上传 URL、文件类型；任务控件的状态查询 URL |

**推荐顺序**：先在「接口管理」连接和测试共享后端，再在「组件数据」绑定列表/表单，然后在「流程」安排保存、刷新或导航。文件上传和任务状态为独立演示控件，其端点暂在「内容」中单独设置，尚未复用项目数据源目录。

## 2. 7 个新组件

进入 `/studio` 左侧组件库，可以搜索并拖入：

- **文件处理**：文件上传（选择文件、限制大小、显式点击上传）、文件列表（附件清单的静态展示）。
- **异步任务**：任务进度（GET 状态、轮询、停止、自动在终态结束，最多 20 次）、执行日志（静态条目）。
- **更多可视化**：折线趋势、环形占比、热力矩阵（静态数值可视化）。

文件上传：选中组件，在右侧「内容」填写 `uploadUrl`、可选文件类型、最大文件大小；切换到「体验」，手动选择并上传文件。可填入 `/api/studio-upload-demo` 测试 **POST multipart/form-data**，但该演示接口**不持久化文件**。

异步任务：在「内容」配置 `statusUrl`、状态路径（默认 `data.status`）、百分比路径（默认 `data.progress`）、轮询间隔。可以填入 `/api/studio-job-demo` 测试查询；该状态接口由 Showcase 开发服务模拟，不能充当正式后台任务系统。

可视化：在「内容」编辑组件值；这些图表暂使用声明式静态数据，不能误认为已经实现复杂 BI、流式推送或自动 API 图表字段绑定。

## 3. 按钮业务工作流

1. 在画布中添加或选中一个「操作按钮」。
2. 打开右侧 **「流程」** 分类，可选预设「确认 → 保存记录 → 提示」或「确认 → API → 提示」。
3. 根据需要追加或调整步骤，也可通过 ↑/↓ 排序或删除：确认操作、请求后端 GET/POST/DELETE、保存当前记录、刷新列表、显示消息、切换页面。
4. 对 POST/DELETE 和保存记录，必须在执行之前配置 **确认** 步骤；用户取消或任一步执行失败，后续步骤不会继续。
5. 切换到 **「体验」**，点击按钮测试。明确注意：这里可能向真实后台发送修改/删除请求，请先使用测试环境。
6. 「导出页面代码」会将工作流配置与执行器一起输出，输出中的 React 运行时与 Studio 使用同一套声明式规则。

POST 请求体须为有效 JSON（可为空）。记录主键可在 URL 中使用 `{id}`，执行时自动 URL 编码；没有选中记录会阻止发送。工作流不支持任意 JavaScript、分支条件、多任务并行、授权密钥存储和可靠队列调度。

## 4. 项目文件与导出边界

- `atlas.studio.json`：可再次导回 Studio，保存增强控件参数、工作流步骤、页面信息。旧版 Studio 文件可以继续导入。
- `foundation.project.json`：原 Foundation Blueprint，所有高级展示使用其既有 `placeholder` 节点，**没有修改冻结的 Blueprint DSL**。
- `studio-widget-preview.tsx`、`studio-workflows.ts`、`studio-records.tsx`、`pages/*.tsx`、`studio-effects.css`：独立 React 导出的增强运行时代码。
- 只把 `foundation.project.json` 交给旧 Project Compiler **不能自动获得** Studio 新的文件/任务/图表和按钮工作流效果，需要使用一并导出的 React 运行时。

## 5. Windows 构建验收

在项目根目录运行：

```powershell
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
pnpm -r build
pnpm dev:studio
```

本次修复：`WidgetPreview.tsx` 中 `Divider` 不再传入 `orientation`，导出运行时镜像也同步修正。此修改不依赖 Ant Design 6.6.5 对该可选枚举的具体定义。

如要验收实际操作，依次测试上传演示文件、异步任务进度、拖入三个新图表、工作流确认与取消、工作流错误阻断、导出再导入。Showcase demo API 随 `pnpm dev:studio` 启动，不代表导出工程含有真实后端。

**验收状态**：在本次 Linux 离线环境执行了仓库原有 126 项离线检查、隔离严格 TypeScript、生成 TSX 类型和语法检查、Foundation 原编译器校验与可执行工作流断言。未运行包含全部 React/Ant Design 依赖的 Showcase Vite/Vitest 构建，也没有在 Windows 真机验收；请以你本机报告为准。
