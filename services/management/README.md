# FF 内置系统管理服务（第一阶段）

> 当前目标：提供**真实管理后端**，不再让所有七页的数据操作依赖用户自建 API。本模块与冻结的 Foundation Kernel 独立。**本阶段尚未宣称完整应用一键部署。**

## 环境

Python 3.11+（无需额外 pip 依赖），单实例 SQLite。默认只监听回环地址，不直接暴露公网。没有预置登录密码，没有演示管理员。

从项目根目录运行：

```powershell
python services/management/server.py init-admin
python services/management/server.py serve --host 127.0.0.1 --port 8765
```

初始化阶段从终端安全读取两次密码（不少于 12 字符），不会写入源代码、文档或日志。数据库默认位于 `services/management/instance/management.sqlite3`。开发环境使用同源反向代理，建议把前端的 `/api/system/*` 转到本服务端口；`/healthz` 为本机健康探针。

## API 契约

- `POST /api/system/auth/login`，JSON `{"username":"admin","password":"..."}`，设置 HttpOnly SameSite=Strict 会话 Cookie
- `GET /api/system/auth/me`：当前用户以及授权权限标识
- `POST /api/system/auth/logout`：撤销当前会话
- `POST /api/system/auth/change-password`：已登录用户提交 `currentPassword` 与 `newPassword`，验证旧密码、撤销旧会话并旋转 Cookie
- `POST /api/system/users/{id}/reset-password`：管理员使用 `newPassword` 重置其他用户密码，撤销目标账号全部会话并审计；不允许重置自己的密码
- `GET /api/system/users` / `POST /api/system/users` / `GET|PATCH|DELETE /api/system/users/{id}`
- 角色、菜单、字典、参数使用对应 `roles`、`menus`、`dictionaries`、`parameters` 名称，格式相同
- `GET /api/system/users/options`，`GET /api/system/menus/tree`
- `GET|PUT /api/system/roles/{id}/users`：关联人员，PUT body `{"userIds":["..."]}`
- `GET|PUT /api/system/roles/{id}/permissions`：分配菜单权限，PUT body `{"menuIds":["..."]}`
- `GET /api/system/logs/operations` 和 `GET /api/system/logs/logins`：只读日志

分页：`?page=1&pageSize=10&search=...`；列表 `{"data":{"items":[...],"total":N}}`，详情 `{"data":{"item":{...},"id":"...","status":"enabled","etag":"\"rev-1\""}}`。关联集合结果 `{"data":{"ids":[...],"etag":"\"rev-1\""}}`。关联集合更改须带 HTTP `If-Match` 强 ETag，状态 PATCH 同样要求强 ETag，409/412/428 不允许客户端自动重试。

管理端权限默认仅超级管理员具有写权限；普通用户可以通过角色与菜单分配读取权限。业务端必须按同源规则部署，不应把隐藏菜单视为权限控制。日志不可经 API 删除，内置超级管理员角色不可修改或删除，账号登录错误受持久化速率限制。

## 安全边界

- 非本机监听必须设置 **FF_MANAGEMENT_ALLOWED_ORIGIN** 为准确的 `https://...` 域名，并使用受信任反向代理；生产 HTTPS 还须设置 `FF_MANAGEMENT_SECURE_COOKIE=1`。
- 对所有管理写请求校验 Origin、JSON 类型和大小；跨域 CORS 未开放。
- 身份会话在 SQLite 中只保存 SHA-256 散列，会话时间为 8 小时；密码通过 PBKDF2-HMAC-SHA256 每用户随机盐哈希保存。
- 不在参数管理中存储密码、令牌、密钥；不返回密码哈希；日志中不保存密码或会话令牌。
- 本服务是**单实例基础版**，不包含 OAuth/OIDC、分布式部署、备份恢复调度、登录验证码及密码重置 UI；这些需在正式产品版本继续验收。

## 测试

```sh
python -m unittest discover -s services/management/tests -v
```

GitHub PR 工作流 `FF Management Service` 在 Linux/Windows × Python 3.11/3.13 执行真正的内存 WSGI 请求和临时 SQLite 测试，验证登录、权限、变更、版本冲突、审计及账户保护。另需在完整 FF React ZIP 中做最终集成验收，不能仅凭后端测试标记成开箱即用。


## R3 密码维护（无二次开发）

导出的 React 项目中，登录后右上角可选择「修改我的密码」。人员管理页面选择一条人员记录后，可以使用「重置选中人员密码」，由服务端负责管理员权限判定。输入的密码只存在于当前表单内存中，不会保存到设计 JSON、URL、工作流或操作审计中。成功变更密码后，旧会话立即失效。

### Windows Stable 临时文件清理

独立 React ZIP 验收启动临时 Python 服务。Windows 下应等待进程退出后清理 SQLite 数据库及 WAL，避免文件句柄引起的 EPERM。以最新提交的 GitHub Linux/Windows Stable 流水线作为最终验收依据。

## R4 — 一键部署、SQLite 备份恢复、业务页面权限

### 从导出 ZIP 本地启动（推荐）

需要 **Python 3.11+、Node.js/npm**，首次构建需要访问依赖仓库。导出项目解压后：

- Windows：双击 `start.bat`，或从终端运行 `python management/launch.py`。
- Linux/macOS：在项目目录运行 `python3 management/launch.py`。
- 首次运行自动执行 npm install（如果没有 node_modules）、npm run build，提示创建管理员账号，然后同步页面权限到 SQLite，并以 `http://127.0.0.1:8765` 提供前端与后端。后续启动复用数据库和编译产物，不会自动覆盖现有管理员密码。
- 仅校验部署文件：`python management/launch.py --check-only --skip-build`（需要先有 dist/index.html）。默认**仅支持本机回环访问**；公网生产应使用独立的 HTTPS 反向代理、正式应用服务器及安全运维评审。

### 在线备份 / 离线恢复（导出 ZIP 内）

```powershell
python management/maintenance.py backup --db management/instance/management.sqlite3 --file backups/ff-20261022.sqlite3
# 请先退出正在运行的 FF 应用，再执行：
python management/maintenance.py restore --db management/instance/management.sqlite3 --file backups/ff-20261022.sqlite3 --yes-restore
```

备份使用 SQLite Backup API 获取一致性快照，目标文件必须尚不存在，写入后执行 integrity_check。恢复首先校验备份，再锁定服务进程、创建带纳秒时间戳的原数据库快照，使用 SQLite Backup API 恢复，并清空所有会话和登录失败计数；失败时尽量使用恢复前快照回滚。拒绝有服务正在运行时恢复。**备份可能包含账号密码哈希及其他敏感数据，应做访问控制和离线加密存储。** 自动远程备份、数据库迁移升级、定时留存策略不在此阶段实现。

### 自定义业务页面权限

自动从导出的 `management/page-permissions.json` 读取页面 ID 和名称，将新页面注册为 `page:<页面ID>:view` 权限；重复启动不会覆盖角色菜单授权、已有菜单名称或启停状态。管理员在系统管理「角色管理 → 分配菜单权限」中为角色勾选这些业务页面对应的菜单，再为人员分配角色。只有登录且授权后，生成前端才挂载相应页面，并在导航中显示。新增页面下次重新导出后同步即可。

- `GET /api/system/pages/access`：返回当前登录人可以访问的业务页面。
- `GET /api/system/pages/{pageId}/authorize`：服务端检查具体页面权限；无授权为 403，页面未注册或停用为 404。
- `GET /api/system/auth/me`：在 `data.permissions` 中返回角色合并后的授权集合；管理员为 `["*"]`。
- 页面隐藏和前端保护**不会自动保护外部业务数据接口**。业务后端必须通过可信会话和授权验证执行每次数据读写；不允许把“菜单能否显示”作为服务端授权条件。
- 若不安装七个系统管理页面，导出项目仍以独立无认证前端运行；要启用 RBAC，先在 Studio 添加系统管理模板。生产场景建议将登录与授权集成到可信同源服务端。
