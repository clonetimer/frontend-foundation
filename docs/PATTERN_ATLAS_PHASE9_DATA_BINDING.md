# Pattern Atlas Phase 9 · 记录表单联动

## 建议的操作路径

1. 启动 `pnpm dev:studio`，打开 `/studio`。
2. 右侧窄栏选择「页面」，点击 **创建记录列表与表单联动页**。新页面会加入当前项目的页面导航，不替换原页面。
3. 点击右上角「体验」，列表自动 GET `/api/studio-records`。选择记录后，右侧标题、状态被填入；编辑标题或状态，标题摘要同步更新。
4. 点击「保存修改」，确认后由浏览器 POST 当前绑定的字段和主键；响应成功后重新 GET 列表，保留当前选中记录。
5. 右侧「数据」可分别设置：记录列表的 URL／数组路径／主键／显示字段、输入框和选择器的字段、保存按钮的 POST URL／是否携带主键。
6. 「导出页面代码」生成可再次导入的 `atlas.studio.json` 和可集成进业务工程的 React 文件。

## 数据格式（本地接口）

GET `/api/studio-records` 的示例响应：

```json
{"data":{"items":[{"id":"S-101","title":"整理项目需求","status":"ready"}]}}
```

对应列表设置为：数组路径 `data.items`，主键字段 `id`，显示字段 `title`。输入框绑定 `title`，选择器绑定 `status`。示例保存按钮向 `/api/studio-records` 发送：

```json
{"title":"修改后的标题","status":"draft","id":"S-101"}
```

本地演示数据仅驻留在 Vite 开发服务器的内存中，重新启动服务将重置。不要把这个演示 API 视为已经可部署的业务后端。

## 保存格式与导出

- **旧设计兼容**：继续使用 `pattern-atlas-studio` v1，新增 `decorations[页面ID:组件ID].recordList` / `recordField` / `recordSubmit`，已存在的设计和装饰字段保持不变。导入会拒绝危险字段和不支持的 URL。
- **独立 React 包**：新增 `studio-records.tsx`，在页面 `StudioRecordProvider` 内保持选中记录、草稿状态、列表加载状态和保存/刷新操作；`StudioApp.tsx` 保持多页面导航能力。
- **Foundation Blueprint**：只存放原本支持的布局与组件，仍能通过原 Compiler；不包含 Studio 专有 API/动效/表单元数据，因此不能仅编译 `foundation.project.json` 就期待动态行为存在。
- **单页面一个记录源**：本轮支持一个主记录列表驱动多个输入／选择器以及一个或多个保存按钮。允许 GET 返回最多 500 条记录，暂不提供虚拟列表与分页。

## 安全和生产接入边界

- POST 在编辑器体验模式和导出的独立页面中均有确认步骤；`credentials: same-origin`，浏览器跨域需要后端允许 CORS。
- 不保存 API 密钥、密码、Cookie、Token；不要在设计文件中填写任何敏感凭据。
- 生产项目需自行实现身份认证、权限校验、CSRF 防护、服务端字段校验、异常恢复、分段分页和请求去重。
- 请求 URL 为同源相对路径或 http/https URL。仅能映射平铺字段，如 `title`、`status`；嵌套编辑字段、多主从数据源关联、动态查询参数和批量编辑留待后续迭代。
- POST 请求体仅由用户绑定的表单字段与可选主键组成，不会自动提交整条服务器记录。

## 代码修复与验证

`builder/pages/create.route.tsx` 的 `primaryColor` 改为有值时才传入，修复 `exactOptionalPropertyTypes` 下的 TS2379。

本轮在当前工具环境运行：Foundation 离线检查 126/126，隔离严格类型检查（模型和 UI 简化 React 声明）、生成文件 TSX 语法检查、生成文件的隔离 TypeScript 检查、原 Compiler 双页面 Blueprint 验证和编译。**未实际运行安装完整依赖后的 Showcase/Vitest/Vite 构建和浏览器交互**，需由使用完整依赖的开发环境复验。

## Windows 回归命令

```powershell
pnpm install --frozen-lockfile
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
pnpm -r build
pnpm dev:studio
```

然后打开 `/create` 和 `/studio`，重点检查新增页、GET、记录切换、编辑、POST、刷新、导出与重新导入。
