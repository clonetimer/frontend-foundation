# P5-R3b1 · 作用域幂等回执的独立后端参考实现

## 本阶段实现

新增 tooling/scripts/aas_p0/p5_r3b_scoped_reference.py，提供**本地新建合成 SQLite + HTTP** 服务端协议参考，实现租户/用户作用域、Token 轮换后同一主体恢复、CAS 与回执事务、审计、回执清理及重复键墓碑。

这是合成参考服务端，**不是生产业务后端，也没有接入真实 AAS 模型库或 Studio/独立 ZIP 的普通写入**。create_fixture(new_path) 只创建全新数据库，已存在路径、非本专项标记的库或缺失表结构都拒绝；服务没有自动迁移、没有对外 GC 管理 HTTP 端点。

## 能力和身份

- 经测试 Bearer 认证的 GET /.well-known/foundation-idempotent-write/v1 返回符合 P5-R3a JSON 模式的 providerId、持久 receiptEpoch、由服务端认证映射确定的 tenantId、subjectId、原子回执等五项保障、7 天回执保留期及明确的 PATCH /api/tasks/{id} 与 GET /api/mutations/{key} 路径。
- GET /api/tasks/{id} 使用 tenantId 隔离相同数字 ID，返回强 ETag。
- PATCH /api/tasks/{id} 只允许合成 draft/approved/archived 状态；writer、可信 Origin、Idempotency-Key、强 If-Match、X-P5-Provider-Id 和 X-P5-Receipt-Epoch 都是强制条件。
- GET /api/mutations/{key} 仅当前 writer 且完全匹配 tenant+subject 可访问。未知键 404，已消费但完整回执过期返回 410，provider/epoch 不匹配返回 409。三种结果都不是安全重发新 Key 的依据。
- 其他 POST/DELETE 不支持并返回 405。不能当成普通业务任务 API。

**身份边界：** 当前 Token→用户/租户/角色是测试代码传入的可变内存映射，用于模拟外部认证服务；尚未接入 OIDC/SSO、HttpOnly 会话、正式权限系统、TLS 或真实业务用户数据。旧 Token 被撤销后 401，新 Token 被后端映射到相同 tenant+subject 时可读取原回执。不同用户及租户无法读取同一个 Key 的其他作用域收据。

注意 P5-R3a 浏览器能力发现默认使用 same-origin credentials，不会自行发送此合成 Bearer。未来浏览器集成必须接入可信同源认证中间件，并进行实际会话测试，不能直接拿演示 Token 实现当成登录系统。

## SQLite 数据与事务规则

- tasks: (tenant_id, id) 联合主键，状态和版本租户隔离。
- receipts: (tenant_id, subject_id, request_key_hash) 联合主键，并保存完整响应、指纹、强 ETag 和创建时间；指纹绑定 method/path/If-Match/ledger epoch/请求体原始字节。
- spent_keys: 与合法提交同事务写入的键 SHA-256 摘要墓碑，**GC 永不删除**。原响应过期后，已使用的 Key 不会变成新写入。
- ledger_meta: 独立持久 providerId + receiptEpoch，不能通过每次 HTTP 请求或项目 JSON 重新生成。
- audit_events: 仅保存 committed 和 epoch-rotated-gc 事件及租户/用户与 Key 摘要，不存 Token、原始 Key 或请求体。**不是生产所需的完整访问/拒绝审计。**

PATCH 先 BEGIN IMMEDIATE，验证身份、版本、同一 Key 与请求指纹，再一次性提交 task 状态、receipt、spent_key、提交审计。COMMIT 后故障钩子可注入 HTTP 503。完全相同 Key/指纹重复请求直接返回原响应并附 Idempotency-Replayed 标志；冲突意图 409、ETag 冲突 412、角色不足 403。

## GC 的保守设计

rotate_epoch_and_gc(path, expected_epoch, now) **仅限显式的本机运维调用**。只有完整回执已存在严格超过 604800 秒时，才删除过期回执并在同事务里旋转整个库的 receiptEpoch、记录 GC 审计；spent_keys 永不删除。所有旧 epoch 的未完成请求停止恢复且不得原样重放到新 epoch，需要人工确认。这是安全优先、可用性较低的参考策略；生产环境仍要设计 GC 容量、多副本同步、备份回滚、误删和灾难恢复。

## 自动化验收

运行命令：

~~~bash
python -m unittest discover -s tooling/scripts/aas_p0 -p 'test_p5_r3b_scoped_reference.py' -v
python -m unittest discover -s tooling/scripts/aas_p0 -p 'test_*idempotency.py' -v
python -m unittest discover -s tooling/scripts/aas_p0 -p test_secure_records.py -v
node --test tooling/scripts/aas_p0/test_p5_capability_contract.mjs
~~~

10 项真实 HTTP + 原生 SQLite 事务测试加入 Linux/Windows P5 CI：不迁移真实库、租户隔离、提交后 503 + Token 轮换与服务重启查询、并发同键只一次更新、不同键 CAS 冲突、最短保留与 tombstone GC、Token 撤销/降权、错误提供者/epoch、凭据不落库与危险方法拒绝。

## 未完成的 P5-R3b2/R3c

真正的可信身份提供者和 HTTP-only 会话、服务端身份稳定性/令牌轮换语义、业务后端事务适配、完整审计、生产保留期与备份、跨标签页互斥、真实浏览器+认证后端联调都仍待实现。项目现在**不能发布通用业务 exactly-once，也不能启用任意 Studio/ZIP 业务写入重放**。生产接入需单独进行后端 owner、安全与迁移验收。
