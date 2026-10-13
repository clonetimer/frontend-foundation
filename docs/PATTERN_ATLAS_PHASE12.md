# Pattern Atlas Phase 12：服务端分页、字段映射与请求状态

## 用途

Phase 12 在 Showcase 的 `/studio` 扩展项目级数据源配置，不修改 Foundation 0.21.0 的 Blueprint DSL 或核心包。

### 可视化操作

1. 在右侧「页面」创建「列表／详情／保存联动示例」；然后进入「数据源」。
2. 在新建的演示数据源上点击「分页与映射示例」，生成对应接口、分页参数和映射字段配置。
3. 选择「服务端分页」后可配置页码参数、每页条数参数、搜索参数以及返回总数路径。切换「客户端分页」会继续按旧版方式一次读取并本地分页。
4. 在字段映射中分别填写「画布字段」「响应路径」「保存字段」。嵌套响应路径支持 `owner.name`，保存字段仅支持安全的顶层属性名。
5. 切换到「体验」模式，查询记录、切换页面、选中记录、修改表单、保存并刷新列表。
6. 导出项目时，完整 Studio 设计文件保留数据源引用，独立 React TSX 将引用解析成 URL 和映射规则；仅用 Foundation Project Compiler 编译 Blueprint 不会自动带上 Studio 专有 API 逻辑。

### 演示 API（仅 Showcase 开发服务器）

- `GET /api/studio-records-mapped?page=1&pageSize=2&search=...` → `data.entries` / `data.count`
- `GET /api/studio-records-mapped/{id}` → `data.entry`
- `POST /api/studio-records-mapped` → 提交 `{key,subject,state,owner}`，可返回 422 字段错误

示例的字段映射：`id ← key`、`title ← subject`、`status ← state`、`owner ← owner.name`；保存时对应 `key`、`subject`、`state`、`owner`。

### 兼容与限制

- 原 Phase 11 和更旧的 Studio 文件仍可导入；不配置 `paginationMode` 时默认为客户端分页。
- 服务端分页需要返回总记录数的非负整数。服务端必须按配置参数正确分页、筛选；不支持游标分页、排序表达式、复杂组合条件或服务端聚合。
- GET 详情与 POST 保存仍是单记录工作流；服务端返回的字段级错误可显示在对应表单字段旁。
- API 使用浏览器同源凭据策略，不存储口令、Token 或任意可执行表达式。生产环境须自行配置后端、权限、跨域、安全校验和敏感数据保护。
- 单页上限 50 条，单次接收最多 500 条（客户端模式兼容旧上限）；项目级数据源上限 25 个。
- 导出的独立 React 文件与 Studio 预览共享行为目标，但不自动继承 Foundation 主题与业务容器之外的全部外部依赖。

### 验证

```powershell
pnpm install --frozen-lockfile
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
pnpm -r build
pnpm dev:studio
```

在另一个终端可以执行只读演示 API 验证：

```powershell
node tooling/scripts/pattern-atlas-phase12-api-smoke.mjs
```

当前构建环境缺少完整 npm 依赖，上述完整 typecheck / Vitest / Vite 命令需要在有依赖的 Windows 环境验收；本地已完成全仓离线检查、独立类型检查、模拟请求、独立导出文件类型检查，以及 Foundation 原编译器实际编译。
