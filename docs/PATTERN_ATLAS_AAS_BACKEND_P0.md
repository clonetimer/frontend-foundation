# Pattern Atlas Studio × AAS 后端 · Phase 22-P0 实际验证

验收日期：2026-10-15。后端来自用户提供的 `20261015_1.zip`，项目目录 `AAS/`。**不把用户后端源码、数据库、模型 pickle 或密钥上传到此公共 GitHub 仓库。** 本仓库仅提供公开的协议验证脚本和脱敏测试结论。

## 真实后端（不是 mock）的实际验证

AAS 是 Python 标准库 `ThreadingHTTPServer` + SQLite，入口 `scripts/visualization_server.py`，业务路由 `scripts/server/handlers.py`，不是 Flask/FastAPI。基于用户上传源文件拷贝到独立测试工作目录：**未复制原有 `datasets/*.db`、`models/model.db` 或模型 pickle**，仅合成 12 条带 `model/subsystem/device/variable` 层级字段的遥测记录及全新 DummyDetector 测试模型。后端明确绑定 `127.0.0.1` 和随机端口，以原生 HTTP 服务实测：

- **18/18 原生 API 探针符合预期**：数据库目录、算法清单、带层级字段的 SQLite 表和行分页、模型列表、真实 POST 模型发布与数据库持久化、GET 详情、PUT 状态更新与读回、无效状态拒绝、真实 DELETE 与 404、无效列表 limit、未知 API 路由 JSON 404。
- 一个 PATCH 负面测试预期得到 **501 + HTML**，确认 AAS **不支持** Studio 通用 `PATCH /api/records/{id}`；这属于互操作性不兼容，**不是** PATCH 功能通过。
- 缺失权限控制的观察：未携带登录凭据的 `GET /api/models` 返回 200。AAS 文档也明确提示 HTTP 鉴权未完整实现；**绝不声称已经完成授权/越权/CSRF 的安全验收**。

## 与 Studio 的协议映射（本地受限适配，不修改 AAS 源码）

| Studio 业务请求 | AAS 原生后端 | 判定 |
|---|---|---|
| `GET /api/records?page=&pageSize=` → `{data:{items,total}}` | `GET /api/models?limit=500` → `{models,total}` | 仅经本地桥接实现分页与字段映射；AAS 原生列表最大 500 行，**不能声称支持任意规模完整分页** |
| `GET /api/records/{id}` | `GET /api/models/{id}` | 支持桥接到真实详情 |
| `POST /api/records` | `POST /api/models` | 仅限已生成、可校验的**合成模型产物**，服务端真实插入模型数据库 |
| `PATCH /api/records/{id}` | `PUT /api/models/{id}/status` | **仅支持 status 枚举**，其他字段必须明确返回 422，不得假装通用编辑 |
| `DELETE /api/records/{id}` | `DELETE /api/models/{id}` | 真实删除模型注册记录及其受管模型目录；必须限制为独立测试数据，禁止对用户真实模型测试 |
| `If-Match` / 412 冲突 | 无强 ETag CAS 更新契约 | **未通过**，不能伪造乐观锁保护 |
| 未授权请求 / 403 | 没有可验收的端到端鉴权策略 | **未通过**，需后端实际实现和用户提供凭据/角色场景 |

本地 bridge 使用**独立进程和隔离数据**，在标准 HTTP 上验证了 8 项映射场景通过（服务端分页、筛选、真实模型 POST、拒绝不安全 fixture、GET、仅 status 的 PATCH→PUT、无效字段 422、实际 DELETE 持久化）。尝试用 Playwright/Chromium 从当前受限运行环境访问 `http://127.0.0.1:5188/studio` 时，浏览器返回 `net::ERR_BLOCKED_BY_ADMINISTRATOR`，所以本轮**真实 AAS + 生产 Studio UI 浏览器联动未通过**；不能把前端假服务测试或 API 桥接通过替代它。此前独立的 Windows/Linux Studio Chromium+模拟 HTTP 测试已通过，属另一证据层。

## 可复测的非破坏性读接口测试

在自己的电脑上运行 AAS，仅监听本地地址：

```bash
cd AAS
python scripts/visualization_server.py --host 127.0.0.1 --port 8765
```

在另一个终端，从 `frontend-foundation` 根目录执行：

```bash
node tooling/scripts/pattern-atlas-aas-readonly-probe.mjs --base http://127.0.0.1:8765/
node tooling/scripts/pattern-atlas-aas-readonly-probe.mjs --selftest
```

脚本**仅读** `/api/databases`、`/api/available-algorithms`、`/api/models?limit=5` 和两个无损错误场景，不修改数据库、安装插件或删除模型；拒绝访问非 localhost/127.0.0.1 的目标。绝不可将 AAS 默认 `0.0.0.0` 未鉴权管理 API 暴露在公共网络。

## Stable 发布决策

- 此次收到**真实全栈源工程，确实运行了真实 Python 后端**。不再归为“仅有模拟后端”。
- 但 AAS 与 Studio 的互操作仍需限定桥接，且**权限、CAS 并发、超过 500 条分页、大规模数据、真正浏览器到 AAS 的端到端互操作**仍未经过正式 P0 签收。
- 继续使用独立 Studio 1.0.0 RC1 Release 草稿；不要修改 Foundation 0.21.0，不发布未经验收的正式 Studio Stable。

## Phase 22-P0-B · 受限协议桥接与第二轮真实后端验证

- 在 **AAS 代码的独立拷贝**（不包含用户原始数据库或模型文件）上，使用合成 `p0_measurements` SQLite 表和 DummyDetector 模型，运行真正的 AAS Python HTTP 服务；新适配器按 Studio `/api/records` 协议转发，取得 **14/14 实际 HTTP 检查 PASS**。测试包含无效分页、非 fixture 写入拒绝、只允许进程创建的模型更改、真实 POST 模型发布、筛选、详情 GET、对非 status 字段返回 422、`PATCH status`→原生 `PUT`、原生 SQLite 状态回读及实际 DELETE 后再查询得到 404。
- 新公共测试工具：`tooling/scripts/aas_p0/bridge.py`（**仅用于本机合成模型联调**）和 `test_bridge.py`（只使用 Python 标准库创建独立 AAS 形状的 HTTP fixture 服务，无需依赖或上传真实 AAS 源码）。Windows/Linux 候选工作流均执行 `python -m unittest discover -s tooling/scripts/aas_p0 -p 'test_*.py' -v`；修改桥接器同时触发两平台完整 Stable Gate。
- **硬性边界**：默认不接受任何写请求；显式 `--allow-synthetic-writes` 只能修改桥接器当前进程登记的 fixture 模型 ID；仅允许连接和监听 loopback。不是生产权限模型。AAS Native `GET /api/models?limit=500` 的 `total` 只等于已截断列表行数；当返回 500 行或行数不一致时，桥接器返回 **409**，不伪造完整分页。
- 真实 AAS 与独立桥接层的 14/14 是**后端 HTTP 层**验收；公共仓库中可重复执行的 Python 单元集成测试属于**合成 AAS 上游**；不能把任何一项写作“Studio 真实浏览器↔原生 AAS 全链路成功”。容器的浏览器导航被管理员策略阻止，证据边界维持不变。
- 后续 P0 阻塞：可信用户身份与授权、审计和 CSRF、真实分页不截断、强 ETag 原子冲突检测、生产浏览器与真实后端联调、操作人员正式试用签收。**不得用本地测试桥接器作为权限层，也不得把本轮结果提升为正式 Studio Stable。**

只在**确认不是原始用户数据的独立合成 AAS 环境**使用下列危险开关：

```bash
python tooling/scripts/aas_p0/bridge.py --upstream http://127.0.0.1:8765/ --origin http://127.0.0.1:5188/ --port 8791
# 开启合成模型写测试（不得连接生产 DB）：
python tooling/scripts/aas_p0/bridge.py --upstream http://127.0.0.1:8765/ --origin http://127.0.0.1:5188/ --port 8791 --allow-synthetic-writes
python -m unittest discover -s tooling/scripts/aas_p0 -p 'test_*.py' -v
```
