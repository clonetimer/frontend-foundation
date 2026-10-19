# P5-R2a · 原生 AAS 模型注册表状态写入幂等适配（受限集成）

## 本阶段实现位置与边界

实际接入 `tooling/scripts/aas_p0/secure_records.py`，即 AAS 原生 SQLite `models` 注册表读写网关，而不是替换成 P5-R1 合成状态表。**当前只允许 P0 的 `experiment_id=p0_case_N` 合成模型状态 PATCH**，原有真实模型不可写，模型工件 POST / DELETE 仍返回 405；没有接入一般业务写入或部署生产网关。这是原生数据库表结构上的隔离测试及可选适配代码，并非生产环境授权。

默认 `make_handler(...)` 和 CLI 都不启用幂等迁移；原有 P0 受限合成状态 PATCH 保持原行为。启用时必须同时具备写权限、`--allow-synthetic-status-writes`、`--enable-native-idempotency`、已准备的收据表。

## 单事务合同

启用后，`PATCH /api/records/{id}` 强制要求 `Authorization: Bearer <writer>`、`Idempotency-Key`（16–128 位受限字符）、强 `If-Match`、JSON `{"status":"draft|published|evaluated"}`。网关执行 `BEGIN IMMEDIATE`：

1. 在同一 `models` 数据库内按 key 读取持久回执，并检查写角色的身份摘要与 method/path/If-Match/精确 JSON 字节指纹。完全相同请求直接重放原响应和原 ETag，附 `Idempotency-Replayed: true`；同 key 不同请求返回 409。
2. 新请求验证目标是 P0 测试模型、强 ETag 与当前原生模型完整行一致。前置条件不符返回 412，无回执、无写入。
3. 更新原生 `models.status`（`evaluated` 同时更新 `last_evaluated_at` 并使 `evaluation_count+1`），**在同一 SQLite 事务中写入 `native_mutation_receipts` 再 COMMIT**。
4. `GET /api/mutations/{key}` 仅写角色可查询该身份摘要作用域的 `committed` 回执和原响应。找不到返回 404；这不能作为异构外部后端未提交的证明。

写入结果不确定时，客户端不得更换幂等键发起新写入。需要使用**原 key + 原完整请求**重放，或使用受认证的回执接口检查状态。只有经过服务端持久收据查询证实后，才可以在 UI 中表示结果已提交。临时 503 的注入仅出现在测试 handler 的内部 fault hook。

## 显式迁移，绝不自动修改真实库

只有已隔离、备份且包含**全部 P0 synthetic**模型的 native SQLite 测试副本，才可以执行：

```bash
python tooling/scripts/aas_p0/native_idempotency.py --db /absolute/path/native-synthetic-copy.sqlite --prepare-synthetic-copy
```

准备函数会验证原生表结构，逐条确认 `experiment_id` 严格匹配 `p0_case_N`；如果出现任何真实或其他非测试模型，直接拒绝建表并回滚。启用运行参数但未准备 ledger 时，网关拒绝启动。不会对用户原有 AAS 数据库进行自动迁移，也不改变现有 `models` 表结构，仅对授权副本显式创建 `native_mutation_receipts` 新表。

`--enable-native-idempotency` 目前只用于**loopback、本地授权测试**；真实用户 DB 或模型目录绝不可用这些脚本试验。连接真实后端需要新的授权、正式迁移/备份/回滚、安全审计及验证方案，不能直接使用该选项。

## 回归命令与证据

```bash
python -m unittest discover -s tooling/scripts/aas_p0 -p 'test_*idempotency.py' -v
python -m unittest discover -s tooling/scripts/aas_p0 -p test_secure_records.py -v
```

新增 `test_native_idempotency.py` 8 组真实 loopback HTTP + 原生 AAS SQLite 表结构测试：未迁移拒绝启动、混入真实模型拒绝迁移、无 key/弱 ETag/无权限拒写、**原生 models 已提交却返回 503**、查询回执及服务重启、同 key 不同意图 409、8 并发同 key 只更新一次、不同 key CAS 仅一赢家、旧 P0 模式不假装支持幂等。

CI：独立 `P5 synthetic idempotency` Linux/Windows 作业同时执行原 P5-R1 与 P5-R2a 合同，并额外执行 `test_secure_records.py` 确保旧网关兼容；已有 Studio production Chromium、Stable、独立 ZIP 检查继续保留。

## 留待 P5-R2b

- Studio/独立导出页面的实际提交尚未附加 `Idempotency-Key`，也没有提供持久待处理操作查询/恢复 UI。本阶段不能宣称浏览器或真实业务具备跨会话 exactly-once。
- 实际业务可能混用模型工件、数据集、人员/租户作用域；正式启用前必须确认角色认证、Token 轮换、回执保留/清理、HTTP 网关身份、备份与事务隔离、读写审计和运行部署边界。
- 未来客户端适配必须**显式声明支持本协议**，不能向未声明的业务 API 自动添加幂等语义。浏览器网络异常不可通过重新生成 key 绕过前次不确定写入。
- 当前只验收本地受限原生模型数据，不构成 Studio Stable 正式发布或需求方真实数据库安全验收。
