# P5-R3a · 生产适配前置协议：服务端写入能力证明与身份作用域

## 阶段结果（仅只读协议门禁，不允许生产写入）

新增 `tooling/scripts/aas_p0/p5_capability_contract.mjs`，提供：
- `discoverP5Capability`：固定地址 `GET /.well-known/foundation-idempotent-write/v1`，仅同源、只允许 HTTPS（明确的 loopback HTTP 开发环境除外）；浏览器请求使用 `credentials: same-origin`、`cache: no-store`、`redirect: error`，不接受其他来源或自定义能力 URL。
- `validateP5Capability`：严格检查协议版本、后端提供者 UUID、回执账本 epoch、经过认证的租户与操作主体、事务性能力声明、最短回执保留期以及精确的操作/回执路径模板。
- `authorizeP5WritePlan`：只返回**不可变的待实现写入计划**，不会发出 POST/PATCH/DELETE；要求能力对象来自一次实际的受认证 HTTP 探测（仅在本进程内 WeakSet 有效，不可由 Studio 导入文件或 JSON 冒充）、后端 ID 与账本 epoch 一致、可信主机会话身份不变、15 秒内新鲜且操作已被白名单授权。

**这是生产适配的必要条件，但并非充分条件；它不能证明远端后端真的持久化了回执，也不能证明任意用户提供的服务器已具备安全身份系统。此阶段没有授权真实业务写入，没有添加凭证字段，也不改变现有合成 AAS UI 或独立 ZIP。**

## 精确协商契约

客户端仅请求部署在应用同源、由真实后端认证的固定路径。约定后端返回 **HTTP 200、Content-Type application/json、Cache-Control 包含 no-store**，最多 8 KB、禁止跳转。

示例仅说明 JSON 格式，**不能把静态文件或已保存 Studio 数据当成认证后的服务端证明**：

```json
{
  "contract": "foundation.idempotent-write/v1",
  "providerId": "22222222-2222-4222-8222-222222222222",
  "receiptEpoch": "33333333-3333-4333-8333-333333333333",
  "scope": { "tenantId": "tenant-42", "subjectId": "operator-7" },
  "guarantees": {
    "atomicMutationAndReceipt": true,
    "sameKeySameIntentReplay": true,
    "authenticatedReceiptLookup": true,
    "principalScopedKeys": true,
    "conditionalMutation": true
  },
  "minReceiptRetentionSeconds": 604800,
  "routes": [
    {
      "method": "PATCH",
      "path": "/api/tasks/{id}",
      "receiptPath": "/api/mutations/{key}"
    }
  ]
}
```

### 身份定义及边界

- `verifiedIdentity = { tenantId, subjectId, sessionEpoch }` **必须从业务应用的可信登录会话/认证中间层得到，不允许来自 Studio 项目文件、页面 URL、用户表单或能力响应本身**。本阶段仅定义校验器，尚未引入正式登录/SSO 适配器，也没有实际可信身份提供者。
- `providerId` 表示被业务服务所有者认可的后端逻辑实例，不能由客户端在运行时任意根据响应生成；`receiptEpoch` 是当前持久回执账本的稳定标识。若服务切换或账本重建导致任一值发生变化，必须暂停原请求的恢复或重放，人工核对，不允许把 404 当作未提交证明。
- Token 轮换不能等价于身份变化：未来后端需让不同访问 Token 在同一认证主体与租户下映射到稳定身份，同时有明确的撤销/重新认证规则；当前 AAS 合成网关仍使用测试 Token 摘要绑定，只供隔离验证。
- `sessionEpoch` 必须来自可信宿主的登录会话标识（不是 JWT 原始内容，不存密码），一旦会话改变即拒绝沿用之前的能力证明。该字段不包含在响应 JSON 中，服务端只给出 tenant/subject。
- `POST`、`PATCH`、`DELETE` 均只是为未来后端的**声明白名单**保留模板类型，**本阶段不支持实际提交任何一个方法**；仍需要各操作事务实现、强 ETag、作用域回执及服务器端访问控制单独验收。

### 具体安全规则

1. 拒绝不可信来源、非 HTTPS 远程服务、URI 内凭据或查询参数、跨域跳转、服务端非 JSON/非 no-store/非 200、超过 8 KB 的响应、异常 JSON。
2. 拒绝未承诺原子更新+回执、同 Key 同意图重放、认证回执查询、身份级键空间、条件写入中的任何一项的后端；回执最短保留期低于 24 小时（86400 秒）直接拒绝。
3. 仅允许 1–16 项明确声明的 `/api/...` 相对路径；操作目标最多一个 `{id}` 参数，回执必须是 `/api/.../mutations/{key}`；拒绝跨域绝对 URL、`%` 编码绕过、通配符、`..`、路径相似前缀和重复方法+路径。
4. 实际允许哪个写入 URL，不取决于 import 的数据源配置，而取决于**短时、受认证的探测证明+精确方法+资源+身份+后端+账本 epoch**。丢失任一条件就必须拒绝。
5. 探测证明只在内存里存在，不进行持久存储；页面重载后必须重新获取可信身份与能力。恢复原请求前同样必须重新验证，而不是沿用旧 Session 的身份。

## 验证

```bash
node --test tooling/scripts/aas_p0/test_p5_capability_contract.mjs
node --test tooling/scripts/aas_p0/test_p5_client_recovery.mjs
```

新增 15 项 Node 合同测试，作为独立 P5 专项 Linux/Windows CI 工作矩阵的一部分。正常场景测试只读 GET 与合法写入计划，负面测试覆盖伪造 JSON 授权、跨租户、跨用户、Session 失效、后端迁移/账本重建、TTL、URI 安全、事务承诺缺失、数据过期与路由白名单绕过。测试中不会向真实服务器写数据。

## P5-R3b/R3c 后续工作（尚未完成）

- **R3b**：真实业务认证宿主接入，后端真正实现固定能力发现端点与身份、providerId、receiptEpoch，建立租户作用域回执表/审计及有保留期的 GC；服务重建时保证账本 epoch 正确迁移。正式网关需要集成测试与业务负责人签收。
- **R3c**：在可信身份适配完成的前提下，设计并实现浏览器跨标签页的原子互斥、身份作用域的待恢复日志以及原 Key 回执流程；必须解决 session 轮换、租户切换和 404 语义。只有端到端验证通过的来源才允许有限 opt-in 普通数据源写入。
- **R3d**：Studio 实时模式与独立 ZIP **共用一个协议模块**，禁止两套不一致写入实现；测试多标签、刷新、超时、提交后 503、GC 边界、角色变化、备份回滚和不同真实业务后端。不得仅凭这份能力声明宣布生产级 exactly-once。

## 当前禁止事项

不自动修改用户 AAS DB、模型工件、业务身份、现有 Studio 普通 POST/PATCH/DELETE、React ZIP 数据源行为，不将 capability JSON 持久写入项目。CI 通过仅能证明协议验证器与合成回归，而不意味着服务端真实声明可信、更不意味着正式 Stable/生产发布。
