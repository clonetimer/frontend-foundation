# Pattern Atlas：Showcase 模块化集成（第一阶段）

> 交付类型：**基于 Frontend Foundation 0.21.0 Stable-Ready 的源码扩展**，不是 Foundation 0.21.0 本体发版，也不是 Designer DSL 升级。原始压缩包保持不变。

## 启动与访问

在可联网且已配置 Node `^22.13.0 || ^24.0.0`、pnpm `11.7.0` 的环境里，在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

浏览器访问 Vite 输出的本地地址，打开顶栏「交互图鉴」，或者直接访问 `/patterns`。

可独立验证：

```bash
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
pnpm verify:offline
pnpm lint:architecture
pnpm lint:repository
```

## 集成边界与结构

改动仅限：

- `apps/showcase/src/app/application.ts`：注册一个新的 route module。
- `apps/showcase/src/modules/pattern-atlas/`：独立模块（route、元数据、演示、对照、方案、提示词、CSS、测试）。
- 本文档；根 README 内增加入口说明。

**未修改**：`packages/*`、`apps/designer/*`、`tooling/create-app/*`、Project Blueprint、Compiler、域组件 Registry 契约、锁文件及包依赖。

模块组织：

```text
apps/showcase/src/modules/pattern-atlas/
├── routes.ts                # 新路由 /patterns，lazy import
├── patterns.json            # 从原型项目复用的 38 种形式元数据
├── catalog.ts               # 数据类型、索引、筛选、6 种布局的共享任务数据
├── storage.ts               # 收藏和已选模式的本地持久化（异常降级）
├── prompt.ts                # 独立、可测试的需求描述生成器
├── styles.css               # pa-* 局部命名空间 + 移动端响应式
├── pages/pattern-atlas.route.tsx
├── components/ComparisonWorkbench.tsx
├── demos/PatternDemo.tsx
└── tests/catalog.test.ts
```

## 使用流程

1. 进入「布局实验室」，让同一组 6 条虚构任务切换为 Bento、Kanban、时间轴、主从分栏、数据表格和日历；任务点击展示详情。
2. 浏览图鉴，按分类、文字、使用场景筛选 38 个模式，进入右侧抽屉直接体验 React 演示。
3. 收藏用于以后参考；把符合业务目标的形式加入方案。也可从四种典型场景批量添加，之后随时移除。
4. 从「我的方案」生成提示词；指定页面、技术栈、视觉方向和需求备注，查看结果并继续编辑、复制或下载 `.txt`。
5. 收藏、已选形式和方案草稿（页面名、风格、技术栈、额外要求）仅使用浏览器 `localStorage`，没有后端接口或自动上传。隐私模式/禁用存储时只影响跨刷新持久化。

## 第一阶段验收边界

- 38 种形式及其对应的 React 原生示例**不是生产级控件库**。图形/拖拽/步骤/空状态演示使用假数据和局部状态；真实业务需补 API、权限、错误态、验收测试。
- 看板与排序支持 HTML5 原生拖拽；提供点击、选择框/移动按钮作为键盘和触屏备用手段。未实现复杂跨容器碰撞、拖拽动画或服务端保存。
- 六布局对比通过共享数据模型实现；Bento 强调聚合信息，因此只展示部分任务，表格、看板等模式按需展示全部。
- 不执行原型的独立 `app.js`，没有 iframe、`dangerouslySetInnerHTML` 或新增第三方运行时库；预览均由 TypeScript/React 编写。
- 模块目前仅供 Showcase 选型；**「直接应用到 Designer」没有实现**，计划放在第二阶段，需先确认既有 Composition Registry 对可编译布局的支持。

## 未来版本如何持续迭代

每次改动保留以下三层独立性：

1. **素材层**：只改 `patterns.json` 与 `catalog.ts` 的元数据，不触及路由与底层 DSL。
2. **原型层**：各模式的演示在 `demos/` 扩展；公共样例数据与分析组件独立维护。
3. **编译/产品层**：仅当明确确认某种模式属于 Project Blueprint 既有能力，并通过现有编译契约检验后，才将它加入「应用到 Designer」。复杂项目特有交互优先走 Domain Component SDK。

如果业务需求变更，先记下「改变了什么」「影响哪些数据/交互」「移动端是否不同」；先更新 Showcase 原型、再编写业务实现。不要为满足单个页面修改稳定基础包。

## 验证说明

本次执行：`node tooling/scripts/repository-check.mjs`、`node tooling/scripts/architecture-check.mjs`、`node tooling/scripts/design-model-sync.mjs`、`node tooling/scripts/offline-verify.mjs`，以及 TypeScript 源码语法转译检查。当前交付环境没有 pnpm/项目依赖且无法访问 npm Registry，因此 `pnpm install`、真实 `tsc`/Vite 构建、Vitest 与浏览器运行测试**尚未执行**，必须在用户自己的开发环境补做；这不等价于宣称完整构建通过。

迭代决策和待确认事项另见 [`PATTERN_ATLAS_ITERATION_RECORD.md`](PATTERN_ATLAS_ITERATION_RECORD.md)。


## Phase 2 后续扩展

已增加独立 `/patterns/effects` 路由、18 种特效、6 项设计参数、便携 JSON 与两种已有编译器支持的 Composition 布局映射。用户已上传并验证 Node 22.23.2 / pnpm 11.7.0 可用，但 npm Registry DNS 仍不可用，真实依赖安装与 Vite 构建仍待验证；详见 [`PATTERN_ATLAS_EFFECT_STUDIO.md`](PATTERN_ATLAS_EFFECT_STUDIO.md)。
