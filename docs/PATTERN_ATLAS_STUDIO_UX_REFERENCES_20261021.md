# Studio 编辑器交互优化：成熟设计器对照与验收

状态：候选 UX 增强，不扩充 Foundation 0.21.0 的 Blueprint、Registry 或 Action DSL。

## 参考产品与可核实的行为

- [Retool Classic App IDE](https://docs.retool.com/classic-apps/concepts/ide)：组件树、右侧 Inspector，以及按内容、交互、外观组织设置。
- [Retool IDE keyboard shortcuts](https://docs.retool.com/classic-apps/reference/keyboard-shortcuts)：Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z、Ctrl+Y、按层级导航。
- [Figma properties sidebar](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar)：选中元素后显示与该元素相关的编辑属性。
- [Appsmith widgets](https://docs.appsmith.com/reference/widgets)：拖拽组件与属性配置，区分展示、输入和数据组件。

以上仅为交互机制参考；不复制品牌外观、图形资产或业务组件。

## 现有 FF 问题（改动前）

1. 组件库可搜索，但图层树没有搜索、收起、全部展开/折叠；复杂页面会出现较长的层级滚动。
2. 画布中选中深层节点时，需要返回图层树逐级定位父容器。
3. 撤销/重做有按钮，没有可发现的编辑器快捷键。
4. 图层按钮文字偏小，父级展开和删除操作缺乏足够明确的点击目标。

## 本次最小优化

- 图层名称/类型/稳定 ID 搜索，保留命中节点及其所有父节点；搜索自动显示匹配路径，不修改手工折叠记录。
- 展开/折叠当前分组，以及一键展开/折叠全部分组；每个页面的折叠状态独立，不持久化到设计项目。
- 画布上方显示选中节点的可点击祖先路径，可直接定位上层容器并自动打开内容设置。
- 支持 Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z 和 Ctrl+Y 重做，并提供快捷键说明。体验模式、输入框/可编辑元素、弹窗中不接管键盘操作。
- 提升图层行及折叠/删除操作的键盘焦点提示和命中面积，小屏不再隐藏整棵图层树。

## 功能与安全边界

- 仅修改 Studio 编辑器展示层、独立无状态导航助手和测试；`atlas.studio.json` / `foundation.project.json` 不新增字段。
- 不修改业务应用导出器、HTTP/SQLite 后端，不引入存储或网络依赖，不改变已有组件的功能语义。
- 需经过 Showcase Vitest/TypeScript/构建、Pattern Atlas Stable Linux/Windows 门禁和现有 Chromium 导出回归；本机静态验证不能替代完整浏览器交互验收。

## 人工验收（适用于真实 Studio GUI）

1. 在有 3 层以上节点的页面输入子节点关键字，仅显示命中节点及其父路径，清空搜索后恢复原结构。
2. 折叠父节点；切换到另一页，再切回，检查各页折叠状态独立；搜索匹配时路径可见。
3. 在画布选中深层控件，点击“选中 > 父节点”定位并检查 Inspector。
4. 对编辑区操作使用 Ctrl/Cmd+Z、Ctrl+Shift+Z/Cmd+Shift+Z、Ctrl+Y；输入框文字仍使用浏览器原生撤销。
5. 小屏通过键盘 Tab 操作图层搜索、展开、选中、确认删除；体验模式不得触发编辑器撤销。
