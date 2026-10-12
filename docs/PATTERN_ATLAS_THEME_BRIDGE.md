# Pattern Atlas · Phase 4 · Foundation Theme Bridge

## 目标与交付范围

基于 Phase 3 完整源码，新增一个**只在 Showcase 运行的主题适配器**，把配置中心十项 Design Choices 中可映射的八项转换为 `FoundationThemeProvider` 已公开的属性（`defaultMode`、`defaultDensity` 和 `brand`），并嵌入 Ant Design 真正组件组成的局部预览。**不修改 `packages/theme`、Foundation Core、Designer DSL，也不改变 UI Brief v2 的格式。**

入口仍为 `/patterns/config`，在原有设计参数后增加「Foundation Theme Adapter」一节。

### 对照表（8 项映射、2 项暂不映射）

| 图鉴参数 | 输出字段 | 注意 |
|---|---|---|
| `accent` | `brand.primaryColor`、`brand.token.colorPrimary` | 映射为四种固定色值之一 |
| `surface` | `defaultMode` | 这是**默认值**，若用户曾保存偏好，ThemeProvider 读取本地设置会优先采用其偏好 |
| `density` | `defaultDensity` | `comfortable → default`、`compact → compact`；Ant Design ConfigProvider 同步改变组件尺寸 |
| `radius` | `brand.borderRadius`、`brand.token.borderRadius` | 映射为 4 / 16 / 28 px |
| `font` | `brand.fontFamily`、`brand.token.fontFamily` | 使用系统字体栈，未下载字体文件 |
| `typeScale` | `brand.token.fontSize` | 12 / 14 / 16 px；具体组件的字号仍由 AntD token 派生或组件自身样式决定 |
| `spacing` | `brand.layout.contentPadding` | 12 / 20 / 28 px；**Shell 显式传入的 contentPadding 会覆盖该值**。其中 WorkspaceShell 默认 16px，无法仅靠 Theme 设置改变 |
| `elevation` | `brand.token.boxShadow` 与 `boxShadowSecondary` | 用于采用这两个全局 Token 的 AntD 组件；业务 CSS 自定义阴影不自动同步 |
| `motion` | `previewOnly.motion` | **未映射到 FoundationThemeProvider**，业务方需要自己的减少动态策略 |
| `speed` | `previewOnly.speed` | **未映射到 FoundationThemeProvider**，需通过局部 CSS/组件设计实现 |

映射函数：`center/theme-adapter.ts` 的 `toFoundationThemeExport()`。使用预先定义的枚举和固定值表，不允许方案 JSON 注入任意 CSS 字符串、JS 或 Token 属性名。

## 实际使用

1. 在配置中心选择风格预设并调整 10 项参数；滚动到「Foundation Theme Adapter」。
2. 默认开启**局部主题预览**。其中真正的 Ant Design Input / Button / Card / Tag / Alert 通过**嵌套 `ConfigProvider`** 接收转换后的 Token 与算法。点击「模拟保存」「重置表单」验证交互。
3. 点击「局部主题已开启 · 点击撤回」，预览区会立即恢复继承 Showcase 的外层主题。这个开关**不会**修改主应用的 ThemeContext 或本地存储偏好。
4. 下载 `foundation-theme-preset-v1.json`，或下载 `foundation-theme-usage.tsx`。后者给出示例包装器和 `defaultMode`/`defaultDensity` 注意事项。已有 FoundationProvider 的项目，应把配置应用到**现有**根 Provider，不要重复嵌套新的全局 Provider。
5. `previewOnly` 只说明未映射项，**不能**作为 `FoundationThemeProvider` Props 直接传入。

### 方案与版本

Phase 4 的导出是**新增的独立 Theme Preset 格式**：`format: "foundation-pattern-atlas-theme", version: 1`；原 UI Brief 继续保持 `format: "foundation-pattern-atlas-brief", version: 2`，仍支持 Phase 2 v1 导入。不改变 Blueprint Composition 协议；两个 JSON 用途不同。

## 验证与下一步

所有新增 Ant Design API 和 ThemeProvider 合约的类型约束均在 `Theme Adapter` 源文件明确标注。新增 `theme-adapter.test.ts`（7 项回归）；原三个 Vitest 文件共 24 项，本轮合计 31 项**需在已安装依赖的开发环境真正运行**。

在项目根目录：

```bash
pnpm install --frozen-lockfile
pnpm --filter @foundation/theme build
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
pnpm -r build
pnpm dev
```

人工验收：切换四套预设 → 开启/关闭局部主题 → 对照按钮、Card、字体与模式变化 → 完成模拟保存/清空 → 查看主题 JSON 和 TSX → 导入 Phase 2 旧方案并确认主题重算 → 确认 `/patterns`、`/patterns/effects` 不受影响 → 运行对比页面在窄屏下无横向溢出。

下一阶段建议：真实业务页面**有限试点**；在不改冻结 DSL 的条件下，验证 Shell 配置优先级、已有用户偏好、主题兼容性和回滚，再考虑提供可选的全局发布/同步功能。此阶段尚未修改任一真实业务应用。
