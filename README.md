# Frontend Foundation 0.21.0 — Stable-Ready

面向中后台、工作台、工程工具与数据型 Web 应用的通用 React SPA 前端基座，以及可审计、可再生成、可图形化编辑的项目级前端工程生成工具链。

**0.21.0 已完成源码、离线/真实依赖、打包消费者、双 Domain SDK 与制品反向验收的 Stable 收口。功能面继续冻结，不再扩充 Blueprint/Designer DSL。按照仓库既有发布规则，`0.21.0` 的不可变包应先以 `candidate` dist-tag 发布；用户接手的真实浏览器/视觉验收、GitHub exact-commit 与目标 registry smoke 通过后，再把同一批 `0.21.0` 字节提升到 `latest`。在完成外部 promotion 前，本源码交付状态称为 Stable-Ready。**

## 当前状态

0.21.0 Stable-Ready 延续私有 workspace 应用 `@foundation/designer`，仍直接编辑现有 `foundation.project.json`，没有 `designer.json`、没有运行时 JSON Renderer，也没有第二套页面模型。项目可以额外声明 `foundation.registry.json`，把领域 Widget/Block 作为一等设计模块加入同一 Palette / Property / Binding / Event / Compiler 链路。

设计器当前包含：

- `@foundation/design-model` 浏览器安全共享契约与统一 Composition Registry；
- Registry 驱动的 Layout / Widget Palette 与 Properties / Binding / Event 元数据；
- Object Tree、Canvas 实时预览、拖放与显式 Parent Container 重挂；
- Blueprint 级 Undo / Redo 与保存状态 dirty 追踪；
- Node / State / Action / Data Source / Operation 引用安全重命名；
- Properties / Bindings / Events Inspector；
- 结构化 Action step 编辑器；
- 结构化 HTTP Data Source / Operation 编辑器；
- Desktop / Tablet / Mobile 响应式视口预览；
- 键盘删除、重排、Undo / Redo 快捷键；
- 精确 JSON Source 模式；
- 浏览器 File System Access 直接打开/保存 `foundation.project.json`，不支持时退化为导入/下载。
- 项目级 `foundation.registry.json`：命名空间 Custom Widget/Block、属性、Binding、事件、默认值与容器能力；
- Designer 安全占位预览 Custom Registry，不执行任意项目组件代码；
- 实时 Diagnostics 面板与 `foundation-project diagnose --json` 统一诊断类别。

运行：

```bash
pnpm designer
```

生产构建门禁入口：

```bash
pnpm designer:build
```

完整设计见 `docs/VISUAL_DESIGNER.md`。

## Domain Component SDK 快速开始

0.20 引入、0.21.0 冻结验证的 `foundation-domain`，把 `foundation.registry.json` 从“单个项目配置”推进为领域组件包的工程契约：

```bash
foundation-domain init ./domain-widgets --package @example/domain-widgets --namespace example
cd domain-widgets
npm install
npm run typecheck
npm run build
foundation-domain verify . --built --pack
```

仓库保留真实 `@example/domain-widgets` 回归包，包含 `InteractiveViewer`、`TimeSeriesChart`、`AnalysisSection`。Storybook 会执行真实 React 组件；Designer 只读取 Registry 元数据并渲染安全占位/容器，因此领域代码不会在设计器中被任意执行。多个领域包可以通过：

```bash
foundation-domain merge pkg-a/foundation.registry.json pkg-b/foundation.registry.json --out foundation.registry.json
```

确定性合并为项目 Registry。完整契约与 admission 规则见 `docs/DOMAIN_COMPONENT_SDK.md`。

```text
Palette / Object Tree / Canvas / Inspector
                ↓
      foundation.project.json
                ↓
         Project Compiler
                ↓
       ordinary React / TSX
```

Pattern、Visual Composition、Action/Binding 和 Data/Operation 仍保持原有构建期编译边界。0.20 的重点转向领域组件包工程化：Foundation 管理 Registry/Designer/Compiler 契约，项目包负责真实 React 实现、预览、测试与版本发布。

## Project Blueprint 快速开始

```bash
create-foundation-app my-app --profile management --shell top-nav --deployment nginx
cd my-app

# 为现有项目生成可审查的 Project Blueprint 计划
pnpm foundation:project -- init .
pnpm foundation:project -- init . --write

# 验证 / 编译 / 检查漂移
pnpm foundation:project -- validate foundation.project.json
pnpm foundation:project -- compile foundation.project.json
pnpm foundation:project -- status .
```

新项目也可以直接从 `foundation.project.json` 编译。Project Blueprint v1 要求目标 Foundation 与 Compiler 位于同一 major/minor；较早 minor 项目执行 `init` 时会明确规划升级到当前 0.21 minor，而不是生成 Runtime / Tooling 混线项目。完整模型、ownership 语义和迁移流程见 `docs/PROJECT_BLUEPRINT.md`。

### 安全再生成

Compiler 将文件分为：

- `generated-owned`：机器拥有；人工漂移默认阻断，只有显式 `--force-generated` 才接管；
- `scaffold-once`：首次生成后允许人工编辑；生成输入未变化时保留人工修改，生成输入变化且与人工修改冲突时阻断；
- `human-owned`：迁移已有项目时保守识别，Compiler 不覆盖。

编译前先在 staging 生成全部输出并计算完整同步计划，因此发现冲突时不会出现“写了一半再失败”。状态和输入哈希记录在 `foundation.project.state.json`，`foundation-doctor` 同时检查 Blueprint/Resource 输入及 machine-owned 漂移。


## Visual Composition 快速示例

Project Blueprint 页面可选地声明：

```json
{
  "id": "overview",
  "title": "Overview",
  "pattern": "dashboard",
  "index": true,
  "composition": {
    "id": "root",
    "kind": "layout",
    "type": "split",
    "props": { "secondarySize": 320 },
    "children": [
      { "id": "main", "kind": "widget", "type": "placeholder", "props": { "title": "Main view" } },
      { "id": "inspector", "kind": "widget", "type": "panel", "props": { "title": "Inspector" } }
    ]
  }
}
```

`foundation-project compile` 会生成 `<SplitLayout>`、`<PlaceholderWidget>`、`<PanelWidget>` 等普通 TSX。`foundation-generate --list-composition --json` 可输出机器可读 Registry，供未来图形化设计器/Planner 构建工具箱。完整节点模型见 `docs/VISUAL_COMPOSITION.md`。

## Action / Binding 快速示例

0.15 在同一页面 Blueprint 中增加结构化交互图：

```json
{
  "state": [
    { "id": "mode", "type": "string", "initial": "nominal" },
    { "id": "running", "type": "boolean", "initial": false }
  ],
  "actions": [
    { "id": "updateMode", "steps": [{ "type": "set", "state": "mode", "value": { "event": "value" } }] },
    { "id": "start", "steps": [{ "type": "set", "state": "running", "value": true }] }
  ]
}
```

Widget 通过 `bindings` 读取状态，通过 `events` 连接 Action：

```json
{
  "id": "modeSelect",
  "kind": "widget",
  "type": "select",
  "props": { "options": [{ "label": "Nominal", "value": "nominal" }] },
  "bindings": { "value": { "state": "mode" } },
  "events": { "change": ["updateMode"] }
}
```

Compiler 会生成受控 `<SelectWidget value={mode} onValueChange={...} />`，而不是执行 JSON 中的代码字符串。完整模型与安全边界见 `docs/ACTION_BINDING.md`。

## 传统快速开始

```bash
create-foundation-app my-app --profile management --shell sidebar --deployment nginx
cd my-app
pnpm foundation:generate -- module overview --pattern dashboard --title "Overview" --index
```

Profiles：

- `minimal` — Application Shell + UI Patterns；
- `management` — DataTable + Forms + Permission；
- `data-workbench` — File + Async + Visualization。

项目携带 `foundation.config.json`，`foundation-doctor --strict` 持续检查版本、Profile/Deployment、模块能力、Contract 和 Project Blueprint 漂移。

## 产品结构

### Runtime Kernel

- `@foundation/core`
- `@foundation/observability`
- `@foundation/security`
- `@foundation/api`
- `@foundation/theme`
- `@foundation/ui`
- `@foundation/app`
- `@foundation/testing`

### Reusable Capabilities

- `@foundation/data`
- `@foundation/forms`
- `@foundation/file`
- `@foundation/async`
- `@foundation/visualization`

### Published Tooling (`@foundation/create-app`)

- `create-foundation-app`
- `foundation-generate`
- `foundation-project`
- `foundation-doctor`
- `foundation-upgrade`
- `foundation-contract`

## Goal-first / OSS policy

项目目标和稳定 Capability Contract 优先。成熟 OSS 必须评估，但只有在兼容性、维护成本、Bundle、迁移与可逆性等指标上实际优于当前实现时才晋级。Refine / ProComponents 等实验保持在 Shadow PoC，不能反向污染 Runtime Kernel。

## Delivery

Deployment 与 Profile 正交：

- `none` — hosting-neutral；
- `nginx` — SPA fallback、runtime config、health check、cache policy、gzip、security headers、可选 `/api` proxy。

Redis 仍不是 Frontend Foundation 默认依赖；只有真实 BFF/后端共享状态、缓存、限流、队列等需求出现时才由服务端架构单独引入。

## API Contract

OpenAPI Contract Pipeline 是 opt-in Candidate 能力。默认 `contract=none` 为零 generator 成本。Foundation 不自研 OpenAPI parser，也不把 generator runtime client 带入应用；HTTP、AppError、Trace、Abort/Timeout 继续由 `@foundation/api` 控制。

Hey API adapter 仍处于独立 Candidate admission 状态，不阻塞 Foundation 主线的 Stable 收口。

## GitHub CI/CD

仓库已包含：

- `.github/workflows/ci.yml`
- `.github/workflows/security.yml`
- `.github/workflows/pages.yml`
- `.github/workflows/release.yml`
- `.github/workflows/registry-smoke.yml`
- `.github/workflows/promote.yml`
- `.github/dependabot.yml`

本地检查：

```bash
pnpm github:verify
```

配置说明见 `docs/GITHUB_CICD.md`。

## Release lifecycle

```text
CI green
  ↓
pack immutable tarballs
  ↓
publish --tag candidate
  ↓
clean registry smoke
  ↓
dist-tag add ... latest
  ↓
Stable
```

稳定版不是重复 publish 同一个版本，而是将经过验证的不可变 Candidate 包移动 dist-tag。详见 `docs/RELEASE.md`、`docs/REGISTRY.md` 和 `docs/STABLE_PROMOTION.md`。

## Validation

详细实际结果见：

- `VALIDATION.md`
- `docs/releases/0.21.0.md`
- `docs/STABLE_ACCEPTANCE_0_21.md`
- `docs/RC_READINESS_0_21.md`
- `docs/releases/0.21.0-rc.1.md`
- `docs/releases/0.20.0.md`
- `docs/CUSTOM_REGISTRY.md`
- `docs/COMPILER_DIAGNOSTICS.md`
- `docs/VISUAL_DESIGNER.md`
- `docs/KERNEL_COMPATIBILITY_0_19.md`
- `docs/releases/0.18.0.md`
- `docs/KERNEL_COMPATIBILITY_0_18.md`
- `docs/releases/0.17.0.md`
- `docs/KERNEL_COMPATIBILITY_0_17.md`
- `docs/releases/0.16.0.md`
- `docs/DATA_OPERATION.md`
- `docs/KERNEL_COMPATIBILITY_0_16.md`
- `docs/releases/0.15.0.md`
- `docs/ACTION_BINDING.md`
- `docs/KERNEL_COMPATIBILITY_0_15.md`
- `docs/releases/0.14.0.md`
- `docs/VISUAL_COMPOSITION.md`
- `docs/KERNEL_COMPATIBILITY_0_14.md`
- `docs/releases/0.13.0.md`
- `docs/PROJECT_BLUEPRINT.md`
- `docs/KERNEL_COMPATIBILITY_0_13.md`
- `docs/releases/0.12.0.md`
- `docs/KERNEL_COMPATIBILITY_0_12.md`
- `docs/releases/0.10.1.md`
- `docs/KERNEL_COMPATIBILITY_0_10_1.md`
- `docs/STABLE_GATES.md`
