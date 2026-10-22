# Pattern Atlas Studio：系统管理固定页面组

## 用户入口

在 /studio 的右侧「页面」面板点击 **＋ 添加系统管理（7 个固定页面）**。一次加入以下七页：

1. 人员管理（system-users）
2. 角色管理（system-roles）
3. 菜单管理（system-menus）
4. 操作日志（system-operation-logs）
5. 登录日志（system-login-logs）
6. 字典管理（system-dictionaries）
7. 参数设置（system-parameters）

Studio 左侧预览导航与生成的独立 React ZIP 使用「系统管理」折叠菜单展示这七页（仅侧边栏模式）。顶部菜单模式保持已有的平铺行为。实现依赖已保留的稳定页面 ID，不修改 Foundation 0.21.0 Blueprint/Registry/Compiler 的公共数据契约。原有页面、导航项、组件和数据源一律保留，重复点击只补齐缺失页；整批模板可以通过 Studio「撤销」回退。

## 默认模板和截图差异

- 每个页面包含标题、使用说明、可配置的远程数据表格（查询、筛选/排序/分页能力需要后端配合）。
- 五个可编辑页面包含「新增」和「修改选中记录」模态表单。表格的删除仅在后端 DELETE 地址配置有效后可用，必须二次确认。
- 「操作日志」和「登录日志」默认 **只读**，没有保存/删除按钮。
- 本批交付的是固定前端页面 **骨架及现有 CRUD 组件接线能力**，不是后端管理系统。权限、菜单树持久化、关联角色/人员授权、操作审计、登录审计和日志写入均不自动创建。
- 为避免模拟数据被误认为真实数据，项目数据源初始端点全部留空，页面提示未接入；不存储账号密码、Token、数据库密钥。配置后端后才真正请求数据。请通过「接口管理」填各页的 list/detail/create/save/delete 地址和 JSON 字段路径，并验证字段/权限。
- 各页面与截图相似的“筛选 + 表格 + 操作”结构被复用，但截图的角色关联人员、状态开关、树形菜单等高级业务控件尚不是此次模板的真实功能。没有真实业务 API 时不伪造成功。
- 当前页只能按现有组件能力操作；涉及权限管理的写入必须在后端强制认证/授权/审计/CSRF 防护，不能依靠菜单隐藏实现权限。

## 与后台连接

在「接口管理」中逐一选择七个已经生成的数据源。比如角色数据源：GET 列表可设 `/api/roles`，详情 `/api/roles/{id}`，新增 POST `/api/roles`，编辑 PATCH `/api/roles/{id}`，删除 DELETE `/api/roles/{id}`。填对 `itemsPath`、`totalPath`、字段映射和服务端分页参数后，点击「测试 GET」。角色修改弹窗和表格引用同一数据源。

页面导出后，在独立 React ZIP 的 `StudioApp.tsx` 中可看到「系统管理」分组；对应 `pages/system-*.tsx` 页面不需要 Studio 才能运行。注意，只有完整独立 ZIP 使用 Studio 装饰的业务能力；单独用原 Foundation Compiler 编译 `foundation.project.json` 不会自动获得 Studio 专用组件/交互。真实后端需同源反向代理或配置好 CORS、认证、权限及操作审计。

## 验收

- 添加前后已有页面不变，七页存在且按截图顺序排列
- 第二次操作不重复添加；已有页面和数据源配置不可覆盖
- 导出 ZIP 含七个 React 页面及折叠导航；JSON 往返配置不丢
- 日志页不存在写按钮；未配置 URL 的页面不得发生真实写请求
- 有效后端下按当前 Studio 表格/表单的接口协议执行 CRUD；失败和不确定状态遵循现有门禁
- Linux/Windows Studio、独立 React ZIP、Stable、Security CI 均按 PR HEAD 检查

实现位置：`apps/showcase/src/modules/pattern-atlas/studio/system-management-template.ts`；没有改动冻结内核。
