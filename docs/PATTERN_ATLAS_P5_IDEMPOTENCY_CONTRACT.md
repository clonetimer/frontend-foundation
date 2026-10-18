# P5-R1 · 写入幂等与不确定状态服务端协议（独立合成基准）

## 定位

这是一套**真实 HTTP + SQLite 事务的参考后端及合同测试**，不是已接入的 Studio 生产后端，也不改动原生 AAS 模型数据库。它只操作新创建的、带 `p5_marker` 的临时合成 DB，并拒绝将已有 DB 当作测试库初始化。现有 `tooling/scripts/aas_p0/secure_records.py` 保持独立，仍然只允许显式启用的合成 `p0_case_` 状态更新，不能把本参考 API 当作原生 AAS 的通用写入能力。

## 写入约束

- PATCH /api/records/{id} 必须携带写权限 Bearer、可信 loopback Origin、`Idempotency-Key`（16–128 位受限字符集）和强 `If-Match`；请求体仅允许 `{"status":"draft|published|evaluated"}`。
- 服务端在**同一个 SQLite BEGIN IMMEDIATE 事务**中，核验当前强 ETag、更新合成记录版本、插入对应幂等回执，再一起 COMMIT。并发相同 key 只能更新一次，其余请求读取持久回执。
- 相同 key、相同 method/path/If-Match/body 重放，返回原成功内容与 ETag，附 `Idempotency-Replayed: true`；同一 key 绑定不同请求则 409；不同 key、过时 ETag 返回 412。
- GET /api/mutations/{key} 需写权限认证，返回回执中 `committed` 状态或 404。**404 不能推断异构真实业务系统从未完成写入**，禁止仅凭这一结果盲目重试。
- 支持注入“SQLite 已提交但网关返回 503”模拟故障；客户端必须按原 key 读取或重放，不能生成新 key 来绕过前次请求。
- 无自动撤销，无 DELETE、POST；不传播业务日志、Token 或真实模型信息。

## 自动化验收

`python -m unittest discover -s tooling/scripts/aas_p0 -p test_p5_idempotency.py -v`

CI：`.github/workflows/ci.yml` 新增独立 Linux + Windows Python 3.11 工作矩阵（只依赖标准库）。测试包括权限/来源隔离、拒绝原生 DB、缺少 key/ETag 拒写、确定性重放、commit-then-503、重启后回执持久、key 意图冲突 409、8 并发同 key 仅一次写入、8 并发不同 key 的 CAS 只有一个赢家，以及未知回执语义。

## P5-R1 不覆盖的生产边界

- **没有**改动 Studio 前端表单、RemoteTable 的写入接口，也未在现有原生 AAS 网关附加迁移表；生产后端尚未支持 `Idempotency-Key`。
- 在部署为真实后端前必须设计租户/操作人作用域、回执保留与清理策略、配额/大小限制、审计、加密/备份、跨地域重放窗口、崩溃一致性，以及与服务端事务引擎对接；需要真实后端负责人确认。
- 单页临时锁与原有 ETag/CAS 仍然有效，但不能等价为跨会话/跨设备 exactly-once。独立合成网关的通过只说明本协议的一条可行实现路径，**不是 Stable 发布许可**。

下一阶段 P5-R2：在可控的真实后端沙箱中提供持久幂等回执查询协议，再为明确声明支持该协议的数据源增加可选客户端适配和跨会话恢复测试。禁止把合成 DB 直接替换成用户 AAS 数据库。
