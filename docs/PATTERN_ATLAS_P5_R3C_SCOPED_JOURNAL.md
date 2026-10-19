# P5-R3c · 身份绑定 Pending Journal 与跨标签页 Web Locks（合成协议）

## 交付范围

本阶段新增 tooling/scripts/aas_p0/p5_r3c_scoped_journal.mjs，可在同源浏览器不同标签页共享一个保守的待恢复操作状态机。模块不是通用 Studio/React ZIP 写入层；目前只接受合成 /api/tasks/{id} 状态 PATCH，draft/approved/archived 三种状态，并复用 P5-R3a 的受认证能力证明和 R3b1 的事务性幂等回执。

客户端每次调用都必须提供来自可信宿主的 tenantId、subjectId、sessionEpoch、后端 providerId、账本 receiptEpoch，以及通过 R3a 真实发现得到的短期能力对象。journal 只保存原始方法、严格路径、原 Key、强 ETag、精确请求体和身份/账本作用域，不保存 Cookie、Bearer、CSRF、任何其他凭据。页面重载后须重新建立可信会话并重新取得能力证明。

## 状态机和危险边界

- begin：必须持有**同源浏览器 Web Locks 排他锁**，通过 writer/会话和短期能力验证，在发送首次 PATCH 之前同步持久写入 journal。传输错误或 HTTP 503 返回 pending；即使响应 200 也必须后续 GET 原 Key 可信回执才清 journal。
- check：取得 Web Lock，重新验证当前登录身份、权限和账本 epoch，**只 GET 原始 Key 回执**。仅当回执 recordId、tenant、状态及合理版本都匹配时删除未变化的 journal。回执 404 是 UNKNOWN，不代表服务器未提交；410 已过期、409 epoch 冲突、401/403 权限失效均拒绝自动恢复。
- replay：必须显式 confirmReplay=true；重新查询回执，仅精确 404 时仍需短期有效能力+当前 writer 身份，才可以使用原 Key、原 ETag、原方法/路径和原请求体进行**一次**重放；绝不生成新 Key。服务端原子账本、CAS 和 spent_keys 永久墓碑仍为安全前提。再次发生网络问题必须保留 journal。
- busy：同源其他合作标签持有锁时，通过 navigator.locks.request(..., {mode:exclusive, ifAvailable:true}) 立即返回 busy；不存在 localStorage 自制 mutex 或无限排队。
- blocked：存在其他操作的 pending、身份/租户/sessionEpoch 更改、provider/receiptEpoch 变化、未知回执、损坏 journal、缺失 Web Locks、存储异常时一律不提交其他请求。不同主体不能覆盖或清理原 journal。实际身份的可信来源必须由宿主提供，**不能由项目文件或待恢复 journal 自行宣称**。

Web Locks 只在**同一浏览器存储分区中合作的同源上下文**之间互斥，并不提供跨设备锁、服务端 fencing token，也不防范恶意同源脚本。崩溃时浏览器自动释放锁，但存储 journal 保留，后续必须先查询服务端回执；服务端事务和原 Key 账本仍是最终权威。

## 验证

运行：

    node --test tooling/scripts/aas_p0/test_p5_r3c_scoped_journal.mjs
    node tooling/scripts/p5-r3b2-chromium-e2e.mjs

15 项 Node 合同测试纳入 Linux/Windows P5 CI，验证先记账再网络、HTTP 200 不盲清、404 不自动重试、显式同 Key 重放、410/409/401/403 阻断、损坏存储、无 Web Locks、过期能力、会话权限变化、作用域变化、锁忙和 journal 被改写等。

现有 Linux/Windows Studio RC 的真实 Chromium 同源验收，在原 R3b2b Cookie + CSRF + R3a discovery + SQLite 503/回执链路基础上额外打开**第二个同源标签页**，先由标签 A 实际持有 Web Lock 验证标签 B 无法提交，再解除锁由 B 保存 journal 和提交状态变更；标签 A 看到 pending 阻止新写入，并按原 Key 查询回执清理。最后发起新的待恢复操作并切换到 tenant-b，检验跨租户 recovery 阻断和 journal 保留，全部使用临时合成 SQLite。

## 未完成（禁止据此发布通用 exactly-once）

- 未接入正式 SSO/OIDC、真实业务数据库、全量身份与权限审计、生产密钥管理或多设备分布式互斥。
- 模块尚未接入 Studio 普通 Modal/Drawer/Workflow 或导出 React ZIP；没有自动修改真实 AAS 模型。
- 缺少多设备协作、浏览器存储被人为清空、配额/隐私模式限制下的用户迁移策略及生产 GC/备份恢复签收。
- 同源 Web Locks 的不支持浏览器直接 fail-closed，需产品判断是否用其他服务端协调替代，而不能把非原子 localStorage 写入当成等价锁。

本轮是 P5-R3c1 的合成级实现和 Chromium 门禁，不自动提升 Stable 产品发布状态。
