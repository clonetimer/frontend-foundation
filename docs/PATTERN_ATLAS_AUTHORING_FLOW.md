# Pattern Atlas · 创建与设计页面

本文记录 Phase 7 起的**主流程**。历史的 Phase 6 双应用交接模式保留在原 Designer 中供兼容使用，但不再是默认设计流程。

## 在一个工作台完成新建与编辑

1. 在仓库根目录运行 `pnpm install --frozen-lockfile`、`pnpm dev:studio`，按 Vite 输出的地址打开 Showcase。
2. 进入 **创建页面** `/create`，选择“创建新项目”或者导入已有的 `foundation.project.json` 以追加页面。
3. 配置项目名称、页面名称，选择“空白 / Bento / 主从分栏”。右侧是实时视觉预览，页面 ID 等非必要字段收在“高级设置”内。
4. 选择 **进入拖拽设计器**。页面在 Showcase 的 `/studio` 打开，不需要另外启动或跳转到端口 5174。
5. 左侧选择或拖放组件，在画布中定位，在右侧修改**内容、形式、交互、特效、风格**，可切换设备与编辑/体验模式。顶部可直接增加更多项目页面。
6. 点击 **导出页面代码**，获得可单独运行的 React 19 + Ant Design 6 + Vite ZIP：包含 Blueprint、可再次编辑的 Studio 文件、React 页面 TSX、特效样式 CSS 和独立 `package.json`。解压后在其目录执行 `npm install`、`npm run build`、`npm run dev`，不需要 Foundation 工作区。

**重要**：设计器有本地自动保存，但浏览器本地存储不等于项目文件。要长期存档、分享或迁移，请使用 ZIP 内 `atlas.studio.json`；下次在 `/studio` 点击“打开项目”导入该文件以恢复配置。

## 导出两条独立路径

| 文件 | 用途 | 已包含的能力 |
|---|---|---|
| `foundation.project.json` | 交给 Foundation 0.21.x Project Compiler | Blueprint 标准布局、组件、原有资源及操作约束 |
| `atlas.studio.json` | 回到 Showcase `/studio` 继续设计 | Blueprint + 页面视觉形式、组件动效/交互、设计 Token |
| `pages/*.tsx` 与 `studio-effects.css` | 拷贝到 React 19 + Ant Design 6 业务项目集成 | Studio 支持的展示形式、CSS 动效和本地按钮反馈/跳转示例 |

Foundation Compiler 不读取 `atlas.studio.json` 中的私有动效配置。**仅编译 `foundation.project.json` 不会得到完整的 Studio 动效。** 带动效的页面应集成导出的 TSX/CSS，并根据实际项目调整路由、数据接口、权限和可访问性。

可在仓库根目录对导出的 Blueprint 执行：

```bash
node tooling/create-app/project.mjs validate ./my-app/foundation.project.json
node tooling/create-app/project.mjs compile ./my-app/foundation.project.json
```

项目编译和将 TSX/CSS 集成到业务工程是两种流程，不能把它们当作同一个命令的两个等价结果。

## 兼容和保留

- 原 `apps/designer` 仍保留，可通过 `pnpm designer` 单独使用，也有 `pnpm dev:studio:legacy` 双应用旧命令。
- 访问 Showcase `/designer` 会重定向到新的 `/studio`。
- 新设计器是**新增的应用层编辑体验**，不是原 Designer / Domain Registry / Action DSL 所有高级功能的完全替代。目前主要覆盖标准布局和基础组件、几类视觉编排、按钮反馈及 18 种可选 CSS 特效。
- AI 开发说明仍是可选的沟通材料，不是生成页面代码的前置步骤。
- Studio 支持可配置的远程 GET 表格（服务端分页/筛选/搜索/排序）、GET 只读行详情、PATCH 编辑以及二次确认的 DELETE 行操作；部分弹窗和工作流也能请求实际 API。详见仓库根目录 README 的 HTTP 契约与独立 ZIP 启动说明。
- 当前项目草稿主要存储于本地浏览器；跨用户、多端协同及托管部署尚未实现。虽然已支持部分真实业务数据接口，但后端鉴权、CORS、版本冲突和审计仍需实际应用提供；Phase 22-B3 支持**当前服务端页面内**最多 20 项的多选批量 DELETE、部分失败提示及失败项人工确认重试，暂不支持跨页选择、事务性原子提交、服务端回滚。

- Phase 22-B4 增加可选 `deleteEtagField`，从列表数据提取带引号的强 ETag，并在 DELETE 时发送 `If-Match`；HTTP 409/412 按并发冲突处理，HTTP 5xx/超时按结果不确定处理并禁止盲目重试。真正的版本原子校验、幂等和审计须由后端实现。

- Phase 22-C1：可以在「接口管理」设置一个服务端分页的项目数据源，并在表格「共享表格数据源」选择其 ID，使表格复用同一套列表/详情/删除地址、查询参数及字段映射。Studio 导出 ZIP 会解析共享引用；删除了数据源时不会偷用旧的单独 URL。直接配置 `dataUrl` 的表格仍保持兼容。

- Phase 22-C2：共享写入契约统一弹窗/抽屉。新增模式读取项目数据源 `createUrl`（兼容旧 `saveUrl`），编辑模式读取带 `{id}` 的 `saveUrl`；服务端字段由 `fieldMappings[].saveField` 指定。源缺失或 URL 无效时禁止回退旧地址；5xx/超时按写入结果不确定处理，不启动可能再次写入的失败后续工作流。

- Phase 22-C3：增强表格与弹窗的 HTTP 写入失败统一识别：401/403 为权限拒绝，404/409/412/428 为冲突，400/422 为字段校验，5xx/网络错误/超时为执行结果不确定。共享弹窗支持将后端 `errors` 内的 `saveField` 反向映射回表单字段，拒绝未知或不安全字段，并限制错误体大小。对不确定写入不会自动重试或执行失败后续写入。旧 Record Provider 尚未迁移到此契约。

- Phase 22-C4：旧 Record Provider 的保存、新增、删除采用 C3 相同的错误分类与字段提示约束；冲突/不确定结果需从服务端重新校对，尝试保留当前编辑草稿。Studio 与独立 ZIP 均覆盖，且未给旧记录列表伪造尚未实现的原子 ETag 校验。POST/DELETE 的幂等与审计仍必须由后端负责。

- Phase 22-C5：旧 Record Provider 的保存、新增、删除加入单 Provider 实例内的同步在途锁，防止跨按钮快速双击重复提交；成功、冲突或结果不确定时，通过 `atlas:records-refresh` 通知同页旧记录列表与增强表格重新 GET。该事件不会同步其他浏览器/终端，也不替代后端幂等与原子版本检查。

详见 [Phase 7 统一设计器技术说明](PATTERN_ATLAS_PHASE7_UNIFIED_STUDIO.md)。
