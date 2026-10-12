/** Decision checklist: this catalog is advisory, not a claim that the engine supports every dimension. */
export const configurationDimensions = [
  { icon: '◈', name: '信息架构', status: '规划项', detail: '核心任务、层级、阅读优先级、渐进呈现。布局应服从目标。' },
  { icon: '☷', name: '导航模型', status: '规划项', detail: '全局/局部导航、搜索、面包屑、深链接、返回路径。' },
  { icon: '◐', name: '视觉设计 Token', status: 'Phase 3：10 项局部可配置', detail: '配色、背景、排版、字号、间距、密度、圆角、阴影和运动参数已进入独立配置中心。' },
  { icon: '▦', name: '响应式策略', status: 'Phase 3：模拟容器预览', detail: '支持桌面、平板、手机模拟与容器重排；真实浏览器与真机仍需验证。' },
  { icon: '⇄', name: '状态与行为', status: 'Phase 3：演示状态', detail: '正常、加载、空态、错误、成功可预览；真实请求、撤销、并发仍由业务实现。' },
  { icon: '⌁', name: '数据与操作', status: '需业务定义', detail: '数据模式、分页筛选、缓存、权限边界、接口错误恢复。' },
  { icon: '◎', name: '无障碍规范', status: '需专项验收', detail: '键盘焦点、语义标签、对比度、减少动态、读屏支持。' },
  { icon: 'A', name: '文字与国际化', status: '规划项', detail: '字体层级、长文本、语言切换、数字与日期本地化。' },
  { icon: '⚡', name: '性能预算', status: '需工程测量', detail: '首屏、资源体积、动画合成层、虚拟化与懒加载。' },
  { icon: '▣', name: '表单与安全', status: '需业务定义', detail: '校验、误操作确认、权限、隐私数据展示与脱敏。' },
  { icon: '✦', name: '视觉特效与节奏', status: 'Phase 3：三处绑定示例', detail: '允许按钮、卡片、状态提示绑定经审核的效果与触发方式；未实现通用行为引擎。' },
  { icon: '◴', name: '可观测与验收', status: '规划项', detail: '关键流程测试、错误监控、性能测量、可用性验证。' }
] as const;
