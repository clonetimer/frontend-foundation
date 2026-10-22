# 系统管理 R2：角色关联、权限树及状态管理

适用范围：用户在 FF Studio 生成的管理页面。前端只负责界面、合同和真实 HTTP 请求，不生成后端，也不自行决定角色权限。

## 用户操作

- 新建项目：Studio 右侧「页面」→「添加系统管理（7 个固定页面）」；新生成的角色、菜单、人员、字典页含高级操作。
- 旧项目：Studio 右侧「页面」→「补齐系统管理高级操作」，只新增缺失组件，不覆盖已有配置和页面。
- 角色页表格先「选择」角色，再点击「关联人员」或「分配菜单权限」。
- 选中操作控件，在右侧「内容」填写候选、已关联、提交地址。无接口则禁用操作。编辑后在「体验」测试。
- 菜单页「菜单权限树」为后端树形数据只读展示；状态开关提供人员、角色、菜单和字典条目启停。

## 数据与 HTTP 合同

| 功能 | GET 地址示例 | 请求结果 / 写入 |
| --- | --- | --- |
| 角色关联人员 | /api/users/options、/api/roles/{id}/users | 候选 data.items，已关联 data.ids + data.etag；PUT /api/roles/{id}/users，JSON userIds |
| 角色菜单权限 | /api/menus/tree、/api/roles/{id}/permissions | 树候选 data.items (children)，已关联 data.ids + data.etag；PUT /api/roles/{id}/permissions，JSON menuIds |
| 菜单树只读 | /api/menus/tree | data.items 数组，每项 id、name、children |
| 状态开关 | /api/roles/{id} 或 /api/users/{id} 等 | 详情 data.id、data.status、data.etag；PATCH /api/.../{id}，JSON status |

候选示例：{"data":{"items":[{"id":"m-system","name":"系统管理","children":[{"id":"m-roles","name":"角色管理"}]}]}}
关联示例：{"data":{"ids":["u1"],"etag":"\"rev-3\""}}
状态详情示例：{"data":{"id":"r1","status":"enabled","etag":"\"rev-4\""}}

以上地址仅为接入示例，**初始地址全部留空**。真实写入需要受信任的同源网关、Cookie/session、CSRF 防护、后端 RBAC 及审计。后端必须在事务中原子验证 HTTP If-Match（强 ETag）。角色关联 PUT 是替换整个集合，必须提供完整授权范围内的候选清单和快照；候选超过 200 项时当前功能将拒绝，不可用分页结果盲目覆盖。

## 交互与错误边界

- 写入前有明确操作确认；状态 PATCH 先 GET 最新状态及强 ETag，再带 If-Match 提交。界面不会乐观修改状态。
- 关联 PUT 使用 GET 快照中的强 ETag。用户需勾选“确认覆盖关联配置”。
- 401/403 权限拒绝；400/422 参数拒绝；409/412/428 并发或版本冲突；网络/5xx 结果不确定且禁止自动重复提交。
- 操作日志、登录日志只读。没有假造操作日志或模拟的授权通过。
- 所有项目数据源不保存 Token、账号密码、密钥；状态字段与启停值可在内容设置中调整。

## 维护与验收

- 实现：studio/system-management-actions.tsx、studio/system-management-template.ts。
- 完整独立 React ZIP 带 system-management-actions.tsx，与 Studio 运行时逐字节对应；仅 Foundation Blueprint Compiler 编译不能保留这些 Studio 专用交互。
- 测试：tests/system-management-actions.test.ts；GitHub Actions 的 CI、Stable、Studio RC、Standalone Export、Security。
