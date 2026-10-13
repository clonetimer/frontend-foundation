# Pattern Atlas · Phase 11 — 项目数据源与三接口联动

## 适用基线

`frontend-foundation-pattern-atlas-phase10`。新版继续使用原 Foundation 0.21.0 的 Blueprint 和 Project Compiler；没有修改 `packages/*` 或冻结的 DSL。

## 使用路径

1. 启动 Showcase，打开 `http://localhost:5173/studio`。
2. 在右侧「页面」中选择「创建列表／详情／保存联动示例」，然后切换「体验」。
3. 示例会使用三个开发服务器接口：`GET /api/studio-records`、`GET /api/studio-records/{id}`、`POST /api/studio-records`。
4. 点击左侧任意记录，详情接口按选中的主键请求，`负责人`字段来自详情接口而不是列表接口。修改表单后点击「保存修改」，确认后提交并自动刷新列表。
5. 在右侧「数据源」中添加或编辑项目级数据源，并通过「将本页记录组件绑定到此数据源」连接现有记录列表和保存按钮。组件自己的「数据」分类也可切换到独立接口配置。
6. 「测试 GET 列表与详情」只会读取 API，不发送写请求。删除已被组件引用的数据源会被阻止；先在组件「数据」中解除关联。
7. 「导出页面代码」包含可重新导入的 `atlas.studio.json`、兼容的 `foundation.project.json`、独立的 `studio-records.tsx` 和多页面 React 入口。

## 数据模型

- `StudioDocument.dataSources`：项目级数据源数组，每条包含 `id/name/listUrl/detailUrl/saveUrl/itemsPath/detailPath/idField/labelField/pageSize`。
- `recordList.sourceId` / `recordSubmit.sourceId`：组件与共享数据源的引用，可不配置；旧的组件内 URL 配置仍然有效。
- `detailUrl` 最多包含一个 `{id}` 占位符；运行时以 `encodeURIComponent` 转义选中记录的主键，并在切换记录时取消旧详情请求。
- `detailPath` 定义详情接口中对象的位置，例如 `data.item`；加载失败不会提交未完成的表单。
- Studio 文件格式仍为 `version: 1` 的增量兼容字段。旧 Phase 10 文件导入时自动获得空数据源目录；Blueprint **不含**这些扩展字段。
- 导出 React TSX 时解析数据源引用，确保生成代码不需要再访问设计器内的数据源注册表。修改后需重新导出代码。

## 边界与安全

- 本阶段仅覆盖记录列表、详情和保存这三类接口，客户端分页最多显示 500 条记录，不是服务端分页管理器；暂不支持任意接口依赖图、PUT/PATCH、鉴权管理、上传或复杂字段映射。
- 浏览器请求使用 `credentials: 'same-origin'`；跨域配置和认证由真实后端负责。**切勿在 API URL 或 Studio JSON 中放 Token、密钥和密码**。
- Showcase 内置演示 API 使用开发服务器内存数据，重启可能恢复初始状态；不是生产后端。
- 真实浏览器交互与完整 Vite/Vitest 构建须在有依赖的环境执行；离线模拟/隔离类型检查不能替代它们。

## Windows 完整验收命令

```powershell
pnpm install --frozen-lockfile
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
pnpm -r build
pnpm dev:studio
```

重点验收：旧设计文件导入、多页面正常切换、三接口联动体验、改动后刷新列表、导出/重新导入、取消请求的错误状态、数据源删除防误操作、移动端右侧设置栏与浏览器控制台。
