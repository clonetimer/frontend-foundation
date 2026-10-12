# Pattern Atlas · Phase 3 可视化配置中心

> 基线：用户提供的 `frontend-foundation-pattern-atlas-phase2-stable.zip`（已包含 antd 6 Select null 修复）。新增功能限定在 `apps/showcase/src/modules/pattern-atlas/` 和对应测试/文档，没有改 `packages/*`、`apps/designer/*`、Blueprint DSL 或锁文件。

## 入口与设计目的

在 Showcase 的 `/patterns/config` 打开「可视化配置中心」。在 `/patterns`、`/patterns/effects` 都有链接可以进入。

它解决三个问题：

1. 不必先想清全部视觉需求，可以先切换四套起点预设，再精调十项设计参数，实时观察同一组虚构业务数据的变化。
2. 不要只看「效果名称」：给已审核的三个组件位置设置具体动效，说明它们的触发条件与延迟。
3. 设计不只是正常态的桌面截图：一键切换模拟桌面 / 平板 / 手机宽度，以及正常 / 加载 / 空数据 / 错误 / 成功状态。

**本页是交互选型实验室，不是完整的视觉 Designer，也不会自动更新真实业务的 Foundation Theme。**

## 十项参数

| 分类 | 参数 | 用途 |
|---|---|---|
| 配色 | `accent` | 强调色白名单：松绿、靛蓝、陶红、琥珀 |
| 表面 | `surface` | 明亮 / 深色预览 |
| 空间 | `density` | 紧凑 / 舒适的信息密度 |
| 形态 | `radius` | 方正 / 柔和 / 圆润 |
| 动效 | `motion` | 跟随系统 / 减少动态 / 关闭装饰动画 |
| 动效 | `speed` | 缓慢 / 标准 / 快速 |
| 排版 | `font` | 无衬线 / 衬线 / 等宽系统字体组 |
| 排版 | `typeScale` | 小 / 标准 / 大的类型比例 |
| 空间 | `spacing` | 紧密 / 均衡 / 宽松的模块间距 |
| 层次 | `elevation` | 平面 / 轻阴影 / 强阴影 |

四套预设：清晰工作台、内容阅读、数据终端、品牌展示。点击预设不会改变 Foundation 全局主题。CSS 导出生成局部 `.pattern-atlas-theme` 类，可以供手动移植。所有 CSS 变量由枚举映射生成，不能直接注入任意 CSS。

## 动效绑定（有限子集）

| 目标 | 支持的效果与触发方式 | 延迟 |
|---|---|---|
| 主操作按钮 | 点击涟漪（click）、扫光高亮（hover / focus） | 0/150/300ms |
| 内容卡片 | 悬浮抬升（hover / focus）、扫光高亮（hover / focus） | 0/150/300ms |
| 状态提示区 | 渐显上移（状态入场）、成功描边（成功态入场） | 0/150/300ms |

仅上述组合有预览实现，不支持任意脚本、任意 DOM 选择器或自动生成真实业务行为。手机没有 hover，点击/焦点交互不能被悬浮效果取代。`prefers-reduced-motion` 和主动减少动态策略会关闭装饰性动画，但仍显示文本和语义化结果。

## v2 UI Brief JSON 与 v1 迁移

本次导出结构升级为 `format: 'foundation-pattern-atlas-brief', version: 2`，包含先前的 `projectName / patternIds / effectIds / design / notes`，增加 `viewport / previewState / bindings`。

- `parseUiBrief` 可读取 v1 和 v2；v1 自动补齐新 Token 与默认预览配置，**导出时总是输出 v2**。
- 导入进行版本白名单、文件体积上限、已知 ID、字段枚举和动效目标-触发组合验证。
- v3 或未知格式将拒绝，不会被误当成旧版本。
- 浏览器本地保存配置，手动导出的 JSON 可做版本化资产；不执行其中的任意代码。
- 本地 UI Brief **不等于** Designer Blueprint，也不会自动改源代码。

## 验收步骤

依赖已可用时在仓库根目录：

```bash
pnpm install --frozen-lockfile
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
pnpm -r build
pnpm dev
```

浏览器打开 `/patterns/config`，逐项进行：

1. 切换四种预设与十项 Token，确认可见变化；CSS 下载中的变量不含未经允许的用户字符串。
2. 模拟手机/平板/桌面，确认同一预览容器的网格在小容器下变为单列；另在实际手机浏览器验收页面本身的布局。
3. 切换五种状态；错误态「模拟恢复」可重新展示正常态，点击主操作进入成功态；不触发真实请求。
4. 绑定按钮、卡片、状态区效果，分别检查点击、悬停/焦点与状态入场；开启系统减少动态后应无装饰动画。
5. 导出 v2 JSON，刷新页面后重新导入，检查参数、状态与绑定恢复；导入旧版 Phase 2 的 v1 JSON 确认迁移成功。
6. 重新访问 `/patterns` 和 `/patterns/effects`，确认原有演示和选择保留；浏览器控制台无错误。

### 已知未完成

- 尚未绑定全局 Foundation Theme / Ant Design Token 系统，预设只控制本地模拟组件与部分特效样例。
- 模拟视口使用容器查询，不能代替真实断点、设备像素密度与触屏测试。
- 配置中心只演示 3 个已审定的目标组件绑定，不是任意特效的完整执行引擎。
- 状态来自本地假数据；没有接入真实 API、权限、路由守卫、网络重试、撤销和错误埋点。
- Designer 导入没有扩展；仍仅能在 `/patterns` 导出 Bento、主从分栏两个有编译验证的 Composition JSON。
- 当前交付环境没有 workspace 依赖，完整 Vitest/Vite 及实际 React 浏览器端验证仍需在有依赖的环境重跑。

## Phase 4 追加：Foundation Theme Bridge

`/patterns/config` 新增隔离的 Ant Design 主题预览和对应 JSON/TSX 导出：8 项映射到 ThemeProvider 公开合同，motion/speed 保留为 previewOnly，原 v2 UI Brief 未变更。详见 [`PATTERN_ATLAS_THEME_BRIDGE.md`](./PATTERN_ATLAS_THEME_BRIDGE.md)。
