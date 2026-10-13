# Pattern Atlas · 第二阶段：视觉特效、设计参数与 Composition 桥接

## 定位

在 Frontend Foundation 0.21.0 的 Showcase **应用层**继续迭代，而非修改冻结的 Designer / Blueprint DSL。复用第一阶段 38 种前端形式和 6 种同数据布局对照，新增 18 种局部视觉特效、6 项设计参数、便携 UI Brief JSON、可编译布局片段的选择性导出。

> 注意：本项目中的「Composition JSON」是可放入现有 `foundation.project.json` 某个页面的 `composition` 字段的**节点树**，不等于完整项目文件或直接进入 Designer 的操作指令。运行前需要结合目标页面完成数据、权限、导航等绑定。

## 入口

依赖安装完整后运行 `pnpm dev`，在 Showcase 浏览器中访问：

- `/patterns`：38 种形式、六种布局对照、场景组合、提示词与两类 Composition 导出。
- `/patterns/effects`：18 种特效、实时参数、方案选择、JSON 导入导出和 AI 提示词。

在 `/patterns/effects` 上点击每张卡片切换左侧实时 React 演示，选择「重播 / 复位」即可重新体验入场和流程类动画。

### 18 种特效

| 分类 | 演示 |
|---|---|
| 入场与叙事（4） | 渐显上移、遮罩揭示、错峰列表、逐字呈现 |
| 悬停与探索（5） | 抬升、倾斜、聚光、扫光、点击翻面 |
| 操作反馈（4） | 点击涟漪、形态切换、完成描边、环形进度 |
| 氛围与装饰（4） | 渐变流动、漂浮光球、骨架呼吸、跑马灯 |
| 滚动（1） | 阅读进度 |

演示全部使用 Showcase 内部 React 状态和局部 CSS；没有外部特效库、外链资源、`dangerouslySetInnerHTML`、`eval`、视频或远程调用。部分示例（尤其涟漪、倾斜、背景变化）不应照搬到每个业务控件。

### 6 项实时可配置参数

| 项 | 候选 | 影响预览 |
|---|---|---|
| Accent | 松绿、靛蓝、陶红、琥珀 | 描边、背景与强调色 |
| Surface | 浅色、深色 | 预览区前景与背景 |
| Density | 舒适、紧凑 | 内边距与元素间距 |
| Radius | 柔和、方正、圆润 | 卡片与演示元素圆角 |
| Motion | 跟随系统、减少动态、关闭装饰动画 | 显式动画策略 |
| Speed | 舒缓、标准、快速 | 已实现的关键帧与过渡时间 |

这 **不是**覆盖 Ant Design / Foundation 全局主题的功能，参数只作用于本实验室预览；输出 JSON 与提示词用于向实际项目**表达配置意图**。后续若要让各业务模块统一应用，需设计公共 Design Tokens 边界并做全面回归。

### 无障碍与性能保护

- 所有特效在 CSS 中处理 `@media (prefers-reduced-motion: reduce)`；关闭/减少动态时保留内容和操作语义。
- 聚光与 3D 指针效果在减少动态模式下停止更新位置；翻面、开关、按钮均有键盘点击替代。
- 跑马灯可通过 hover/focus 暂停；滚动进度明确表达阅读位置，不把模拟值误当后端上传进度。
- 成功反馈同时给出文字。特效应用于少量关键节点；正式项目仍需键盘、读屏、性能以及移动端专项验收。

## 方案导入导出

用户选择的 `patternIds`、`effectIds`、`design`、页面名和备注可以下载为带版本的 `pattern-atlas-ui-brief.json`，再导入还原选择。导入执行版本校验、字段长度限制、已知 ID 白名单与 Design Token 枚举验证，不包含可执行代码。浏览器偏好另外存到 `localStorage`；禁用存储时仍可继续使用当前页。

**导入不等于自动修改项目源代码**。该 JSON 是讨论与迭代的配方，不是业务运行时的数据模型，也不是 Designer 的原生 Blueprint。

`generatePatternPrompt` 保持旧参数兼容，新增可选 `effectIds` / `design` 字段。在两处提示词入口都能生成包含主布局、特效触发规则、设计参数、移动端和减少动态策略的需求描述。

## Composer / Designer 渐进式桥接

当前仅支持下列两个布局，均只使用既有 0.21.0 Registry 里的 `stack / grid / split / panel / text / metric / placeholder`，不引入新节点类型：

1. `bento`：`stack + grid`，通过 `placement.span` 表达重点区域。
2. `master-detail`：`stack + split`，通过 `panel + placeholder` 给列表与详情预留结构。

从 `/patterns` 的六布局对照右侧或模式详情抽屉下载 `foundation-composition-*.json`，将 JSON 节点树写入目标 Blueprint 的 `pages[n].composition`，再用项目既有编译器验证/编译。其他布局（看板、日历、瀑布流等）**没有**冒充已经映射，后续需要具体业务组件或 Domain Component SDK。

本次已经调用原仓库完整 `compileProjectBlueprint` 分别生成两份独立临时工程（均产生 19 个文件），验证这两个结构能够进入原编译器并生成包含 `GridLayout` / `SplitLayout` 的 TSX；这仍不构成生产项目或 Designer UI 的端到端验收。

## 核心文件

```text
apps/showcase/src/modules/pattern-atlas/
  routes.ts                            # 两条 Showcase 路由，均懒加载
  pages/pattern-atlas.route.tsx         # 图鉴加特效入口及导出 Composition
  components/ComparisonWorkbench.tsx   # 六布局对照加安全导出入口
  bridge.ts                             # 两个有边界的 Composition 映射
  prompt.ts                             # 原提示词生成器的向后兼容扩展
  effects/
    catalog.ts                          # 18 种特效的元数据、场景、边界与筛选
    config.ts                           # 6 组设计参数与持久化
    brief.ts                            # 可移植方案 JSON 的安全校验
    dimensions.ts                       # 12 类更广义的前端配置维度
    EffectDemo.tsx                      # React 特效演示
    styles.css                          # 独立 pa-fx-* CSS、响应式、减少动态
    pages/effects.route.tsx             # 特效实验室页面
  tests/effects.test.ts                 # Vitest 回归（需安装依赖）
tooling/scripts/pattern-atlas-sanity.mjs # 无外部依赖的结构烟测
tooling/scripts/pattern-atlas-composition-check.mjs # 全量 Compiler 临时工程回归
```

## 验证现状（重要）

用户提供的 Node.js `v22.23.2`、pnpm `11.7.0` 已实际运行且版本匹配。`pnpm install --frozen-lockfile` 验证 lockfile 一致，但本环境 npm 注册表 DNS 失败，缺少包括 React/Vite 在内的约 394 个待安装的 package，因此：

- **通过**：仓库结构、架构、设计模型镜像与原仓库 126 项离线检查。
- **通过**：新模块 TS/TSX 的离线 shim 类型检查；TypeScript 编译后执行纯逻辑测试（18 效果、ID/JSON 校验、提示词、兼容性）；CSS 语法解析。
- **通过**：两个 Composition Node 经现有编译器的规范化及 TSX 代码生成验证。
- **未通过完整验证（环境不足）**：Showcase 真实 `tsc --noEmit` 报缺少 `vite/client`，`pnpm --filter @foundation/showcase test/build` 和浏览器真正运行尚未执行。不能宣称成品已完成真实应用构建。

依赖可用时请在**仓库根目录**执行：

```bash
pnpm install --frozen-lockfile
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
node tooling/scripts/pattern-atlas-composition-check.mjs
pnpm dev
```

页面接入还应补键盘、移动端、减少动态开关、滚动、导入导出及焦点恢复的浏览器级回归。

## 后续建议

优先级不是继续堆动画，而是：**信息架构与导航 → 主题/排版/密度 → 响应式和状态策略 → 数据/权限/表单 → 无障碍与性能 → 局部特效**。在实际业务实例中确定优先级后，逐步将预览中的设计参数映射到项目级 Design Tokens、领域组件或 Designer 可编辑属性，而不修改 0.21.0 冻结模型。
