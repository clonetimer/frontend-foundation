# Pattern Atlas · 创建与设计页面

本文记录 Phase 7 起的**主流程**。历史的 Phase 6 双应用交接模式保留在原 Designer 中供兼容使用，但不再是默认设计流程。

## 在一个工作台完成新建与编辑

1. 在仓库根目录运行 `pnpm install --frozen-lockfile`、`pnpm dev:studio`，按 Vite 输出的地址打开 Showcase。
2. 进入 **创建页面** `/create`，选择“创建新项目”或者导入已有的 `foundation.project.json` 以追加页面。
3. 配置项目名称、页面名称，选择“空白 / Bento / 主从分栏”。右侧是实时视觉预览，页面 ID 等非必要字段收在“高级设置”内。
4. 选择 **进入拖拽设计器**。页面在 Showcase 的 `/studio` 打开，不需要另外启动或跳转到端口 5174。
5. 左侧选择或拖放组件，在画布中定位，在右侧修改**内容、形式、交互、特效、风格**，可切换设备与编辑/体验模式。顶部可直接增加更多项目页面。
6. 点击 **导出页面代码**，获得 ZIP：包含 Blueprint、可再次编辑的 Studio 文件、React 页面 TSX 和特效样式 CSS。

**重要**：设计器有本地自动保存，但浏览器本地存储不等于项目文件。要长期存档、分享或迁移，请使用 ZIP 内 `atlas.studio.json`；下次在 `/studio` 点击“打开项目”导入该文件以恢复配置。

## 导出两条独立路径

| 文件 | 用途 | 已包含的能力 |
|---|---|---|
| `foundation.project.json` | 交给 Foundation 0.21.x Project Compiler | Blueprint 标准布局、组件、原有资源及操作约束 |
| `atlas.studio.json` | 回到 Showcase `/studio` 继续设计 | Blueprint + 页面视觉形式、组件动效/交互、设计 Token |
| `pages/*.tsx` 与 `studio-effects.css` | 拷贝到 React 19 + Ant Design 6 业务项目集成 | Studio 支持的展示形式、CSS 动效和本地按钮反馈/跳转示例 |

Foundation Compiler 不读取 `atlas.studio.json` 中的私有动效配置。**仅编译 `foundation.project.json` 不会得到完整的 Studio 动效。** 带动效的页面应集成导出的 TSX/CSS，并根据实际项目调整路由、数据接口、权限和可访问性。

可在仓库根目录对导出的 Blueprint 执行：

```bash
node tooling/create-app/project.mjs validate ./my-app/foundation.project.json
node tooling/create-app/project.mjs compile ./my-app/foundation.project.json
```

项目编译和将 TSX/CSS 集成到业务工程是两种流程，不能把它们当作同一个命令的两个等价结果。

## 兼容和保留

- 原 `apps/designer` 仍保留，可通过 `pnpm designer` 单独使用，也有 `pnpm dev:studio:legacy` 双应用旧命令。
- 访问 Showcase `/designer` 会重定向到新的 `/studio`。
- 新设计器是**新增的应用层编辑体验**，不是原 Designer / Domain Registry / Action DSL 所有高级功能的完全替代。目前主要覆盖标准布局和基础组件、几类视觉编排、按钮反馈及 18 种可选 CSS 特效。
- AI 开发说明仍是可选的沟通材料，不是生成页面代码的前置步骤。
- 当前仅在本地浏览器保存；跨用户、多端协同、生产数据绑定与部署发布尚未实现。

详见 [Phase 7 统一设计器技术说明](PATTERN_ATLAS_PHASE7_UNIFIED_STUDIO.md)。
