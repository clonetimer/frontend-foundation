# Frontend Foundation · 功能冻结与交付接管（2026-10-20）

**决策：停止主动功能扩张，转入「维护优先 + 实际应用试用 + 交付验收」。** 此决策不等于已发布正式 Stable，不代表可以跳过人工作业、安全审批或目标 Registry 的验证。

## 1. 两种产品、两条独立发布线

| 交付对象 | 当前准确状态 | 已有工程能力 | 正式发布剩余条件 |
|---|---|---|---|
| Foundation npm packages `0.21.0` | **源码 Stable-Ready，尚未验证 target Registry 正式晋升** | 冻结 Blueprint/Compiler/Registry/Runtime Kernel，CI、打包消费者、双 Domain SDK、发布预检 | 指定候选不可变包；外部本机/浏览器实际验收；目标 Registry `candidate` 一次发布与干净消费者测试；批准后将同一字节版本 dist-tag 晋升至 `latest` |
| Pattern Atlas Studio 编辑器 `1.0.0-rc.1` | **仅候选/草稿预发布，不是 Studio Stable** | `/create` → `/studio`、设计 JSON 往返、独立 React ZIP、合成后端和浏览器门禁 | Issue #29 的真实使用者、真实业务后端的单链路及认证/授权/审计测试、手工无障碍/视觉回归、不可变正式制品/校验/回滚审批 |

**不要混用 Foundation npm 版本与 Studio 编辑器版本，也不要把 P5 合成 SQLite/SSO 适配测试写成生产业务验收。** Studio 可用于受控试用；普通业务写入和幂等恢复不能以参考适配器冒充生产服务端保证。

## 2. 代码冻结边界

冻结常态：不新增组件类别、Pattern Atlas 特效/交互模式、Blueprint/Designer/Action DSL、Compiler/Registry/Kernel 公共协议、P5 生产接入层；不再以“技术可能有用”推动新框架、Skill、重构或依赖替换。保留已有功能。

允许进入维护分支的变更（按优先级）：

1. **安全 P0**：未授权写入、数据/凭据泄露、供应链高危等；即使影响功能也要立刻隔离风险。
2. **缺陷 P0/P1**：已有能力的回归、丢数据、构建/导出损坏、真实用户主要流程失效。
3. **兼容/可用性修复**：支持矩阵 Node 22/24、pnpm 11.7.0、稳定发布/安装失败；有真实重现或明确上游弃用日期。
4. **文档/回归维护**：准确的验收证据、可复现故障的最小负面测试、错误/安全边界修正。
5. **明确需求驱动的例外**：实际业务项目提供可复现需求、现有功能无法满足的证据、使用方、验收用例和回滚办法，经单独评审后方可开启功能 PR；不得顺带修改冻结 Kernel。

拒绝：无业务用例的组件堆叠、将合成测试拔高为正式生产、与本次问题无关的大范围整理、静默改公开 API 或锁文件、通过关闭测试制造 PASS。

每次维护遵循 **独立 feature/fix 分支 → 最小 PR → 精确 HEAD Linux/Windows 相关测试/安全门禁 → 合并 → 精确 main 复验**。影响 Studio 编辑器/导出镜像时必须运行适用的 Studio RC、独立 ZIP 和 Stable 浏览器门禁，路径过滤未触发不得被写成 PASS。发布权限与人工签收继续保留。

## 3. 当前证据快照（不是未来版本的自动通行证）

**记录于 2026-10-20，变更前 main：** `5dfc86dedd06aae45b90811c57a54da45f0e5403`。

- [CI · 39373799386](https://github.com/clonetimer/frontend-foundation/actions/runs/39373799386)：成功，包含静态门禁、Node22、Node24 release gates、Windows offline、P5 Linux/Windows。
- [Security · 39373799207](https://github.com/clonetimer/frontend-foundation/actions/runs/39373799207)：成功。
- [Storybook Pages · 39373799338](https://github.com/clonetimer/frontend-foundation/actions/runs/39373799338)：成功。
- [最近一次不同提交的 Pattern Atlas Stable · 39369062155](https://github.com/clonetimer/frontend-foundation/actions/runs/39369062155)：成功，提交是 `71a2abdc1f0c550e090537ef1c6173fc2a68958d`，**不能算作当前 main SHA 已执行的 Stable 测试**。
- Studio RC1：GitHub Release 仍是草稿预发布，参见 [Issue #29](https://github.com/clonetimer/frontend-foundation/issues/29) 的早期不可变候选工件与限制；不是当前 main 字节，也不是 Stable。
- [Issue #68](https://github.com/clonetimer/frontend-foundation/issues/68)：pnpm catalog 普通常规 Dependabot 更新暂缓；版本真实性门禁已经合入，自动更新器尚未证明恢复。其余正常安全维护不能因此跳过。

此快照只用于记录冻结决策的依据。**每次候选交付必须重新记录实际候选 SHA、构建产物 SHA-256 和本次有效的工作流链接**，不能拿旧通过次数补缺失的门禁。

## 4. 最小化外部验收：用真实业务应用验证现有功能

试用人员选一个**小型、非生产数据**的真实业务工作台（例如列表 + 表单 + 图表 + 文件视图），不以额外框架功能为前置条件，记录：

- [ ] 用现有 `/create` / `/studio` 新建项目，创建至少两页，拖拽、属性修改、撤销/重做；桌面/平板/375px 手机与仅键盘审查。
- [ ] 导出 `atlas.studio.json` 与独立 React ZIP；清理浏览器存储后重导入，对比页面、数据源映射、交互配置及布局；独立 ZIP 使用**受支持的环境**完成全新安装、类型检查、构建及浏览器交互。
- [ ] 真实代表性后端采用**已获授权的隔离测试账号及数据**，验证 GET/POST/PATCH/DELETE、分页、403/404/409/412/422、超时/503 的不确定提交提示；确认后端身份、CSRF、权限和审计，而不是依靠前端按钮隐藏。无法完成则明确记录“阻塞”，不替换成合成绿灯。
- [ ] 记录 Studio 预览与独立 ZIP 的相同操作、结果及差异；确保无意外写入、无丢失、无浏览器机密写入工程文件。
- [ ] Windows/Linux 真实操作员以人名或团队身份、日期、环境、步骤、截图/日志路径、缺陷编号与复验结果签署；**签收文件只保存脱敏证据，绝不提交 Token/数据库/私有遥测数据**。
- [ ] 列出剩余 P0/P1（必须为 0）、可延后 P2、明确负责人和回滚包，提交人工 Go/No-Go 结论。

验收记录模板：

```text
candidate/product: Foundation npm 0.21.0 | Studio editor 1.0.0-rc.1
source SHA / artifact SHA256:
Windows environment / Linux environment:
operator / date / test backend scope:
workflow evidence URLs (same SHA):
create-edit-import-export / responsive-keyboard:
actual backend identity-CRUD-error scenarios:
Studio vs ZIP comparison:
P0/P1 unresolved:    P2 accepted:
rollback package + SHA256:
decision: GO | HOLD        approver:
```

**现在的结论为 HOLD（正式对外 Stable 发布），可以继续内部候选试用。** 没有外部真实账号、业务服务和用户人工证据时不要自动填 PASS；真实后端如不属于本产品发布范围，必须明确拆分产品宣称范围并重新经过负责人的正式评审，不能悄悄省略承诺过的验收标准。

## 5. 发布与停止线

- **Foundation npm**：按 [0.21.0 验收交接](STABLE_ACCEPTANCE_0_21.md) 和 [Stable 晋升流程](STABLE_PROMOTION.md) 完成外部浏览器、精确 SHA、目标 Registry `candidate` smoke；只移动相同字节的 dist-tag，不能重发 `0.21.0` 替换旧字节。没有这些证据，维持 Stable-Ready。
- **Studio editor**：按 [Issue #29](https://github.com/clonetimer/frontend-foundation/issues/29) 和 [Studio Stable RC 规范](PATTERN_ATLAS_STABLE_RC.md) 完成人工 P0、真实后端认证、产物校验与回退方案；草稿 RC1 不应被直接改写成 Stable。后续新候选如有变更，重新跑其自身完整门禁。
- **失败止损**：只修复使本次验收失败的根因，补最小回归，不借机加新功能；变更后重新选择候选 SHA/制品并重跑受影响门禁。
- **维护模式**：没有 P0/P1 或明确业务输入时不再创建纯粹“继续丰富功能”的 PR；保持 Issue #29（手工签收）与 #68（Dependabot）为待办而非强行关闭。

下一个有效里程碑是**实际业务试用与不可变候选交付证据**，不是 Phase 新功能编号。
