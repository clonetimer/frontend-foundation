# P5-R3b2a · 同源浏览器 Cookie 与 CSRF 身份适配参考

## 本轮实现

新增 tooling/scripts/aas_p0/p5_r3b_session_adapter.py；它继承既有的 P5-R3b1 合成 SQLite 事务/回执处理器，不改变原有事务代码。提供严格同源 Cookie 会话认证和只读 GET /api/session，返回由受信任测试宿主管理的 tenantId、subjectId、sessionEpoch、role 与当前 CSRF Token。

**不是生产级认证**：身份来自受信任 Python 测试程序调用 SyntheticSessionStore.issue() 创建的测试内存表。HTTP 没有任何登录/注册/身份授予或 Cookie 换发端点；尚未实现 OIDC、SSO、企业 IAM、长期 session 数据库、TLS 反向代理或密钥轮换。

## 同源与写入安全

- 会话 Cookie 为服务端生成的不可预测随机值，客户端不能自己构造身份。正式 HTTPS 宿主应发放 HttpOnly; SameSite=Strict; Path=/; Secure 的 Cookie，本地 HTTP loopback 测试可省略 Secure。浏览器不持有原参考网关的合成 Bearer Token。
- 实际 Host 必须等于应用自身 host:port，跨源 Origin 被拒绝；Sec-Fetch-Site 若存在只接受 same-origin/none。同源 GET 通常无 Origin，因此 GET 不强制包含该请求头。
- GET /api/session 返回服务器端会话身份与本次 CSRF Token；固定路径 GET /.well-known/foundation-idempotent-write/v1 返回已有 R3b1 能力协商信息，二者均要求有效会话。
- PATCH /api/tasks/{id} 必须同时通过 Origin 精确匹配、当前会话 CSRF Token、writer 权限，以及 R3b1 的强 If-Match、Idempotency-Key、providerId、receiptEpoch 和租户事务校验。
- Cookie 轮换会撤销旧 Cookie 且更换 CSRF Token，但 tenant/subject 不变；查询原 Key 持久回执或使用相同 Key 原样重放不会产生第二次 SQLite 变更。
- 会话撤销/过期或角色降级立即失去写入和回执查询权限；来自其他 tenant/subject 的相同 Key 不能跨域取得收据。没有回退到 Bearer 认证路径，没有 CORS 跨源授权。

## 自动验收

    python -m unittest discover -s tooling/scripts/aas_p0 -p test_p5_r3b_session_adapter.py -v
    python -m unittest discover -s tooling/scripts/aas_p0 -p test_p5_r3b_scoped_reference.py -v
    node --test tooling/scripts/aas_p0/test_p5_capability_contract.mjs

9 项 stdlib HTTP/SQLite 合成测试加入 Linux/Windows P5 CI：身份 Cookie 与服务端角色、无 Origin 同源 GET、Host/Origin/Sec-Fetch-Site 拒绝、缺失/伪造 CSRF 拒写、提交后 503 与 Session+CSRF 轮换恢复、权限撤销/降级、租户隔离、Cookie 篡改/重复/过期、8 并发相同 Key 只写入一次、凭据/CSRF 不落库。

## 后续限制

当前没有生产 Chromium 的 R3b2 同源 Cookie 登录/回执联调，Studio 和独立 ZIP 的普通 POST/PATCH/DELETE 仍完全保持原有机制。真正的前端需使用可信宿主会话获取身份，重新验证 R3a capability，恢复时校验 sessionEpoch/provider/receiptEpoch，并实施多标签页原子互斥。不能把本测试 fixture 或其凭据发行流程直接部署生产。

后续 P5-R3b2b：真实 Chromium 同源会话 + 能力发现 + SQLite 回执 E2E；P5-R3c：身份绑定的待恢复 journal 与跨标签页安全协调。
