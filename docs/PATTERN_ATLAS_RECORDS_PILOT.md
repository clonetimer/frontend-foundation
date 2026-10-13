# Pattern Atlas · Phase 5: Records 业务页面主题试点

**基线**：Phase 4 完整源码。保持 Frontend Foundation `0.21.0`、Design DSL、Designer、编译器、`packages/*` 不变。

## 试点选型

选择 Showcase 既有 `/records` 列表，原因：已存在 `useQuery + useApiTransport + DataToolbar/DataTable + URL state + 编辑路由`，可以实测“只改界面，不改业务逻辑”。**注意**：Showcase Vite dev server 的 `/api/records` 使用内存种子数据，这是一条真实的接口调用链路，但不是生产数据库。

## 路由与安全开关

- `/records`：**默认保持原版**。如果且仅如果 `features.patternAtlasPilot === true` 且用户在本浏览器明确激活了一个保存版本，才在既有 DataToolbar/DataTable 外添加局部 Ant Design `ConfigProvider`。
- `/records/pilot`：对照工作台，继承原 `records` feature flag 和 `records.read` 权限；内部再次校验 `features.records` 与 `features.patternAtlasPilot`。只读取 `GET /api/records?page=1&pageSize=6`，两侧渲染相同结果，不能在这里编辑业务记录。
- `apps/showcase/public/runtime-config.json` 在**演示工程**中显式将 `features.patternAtlasPilot` 置为 `true`，以便本地访问。运维可将其改成 `false` 作为**单机/部署级 kill switch**；生产环境上线时默认应为 `false` 并通过发布流程控制。
- 保存方案并不自动启用；“保存并启用”或“启用此版本”是明确的二次操作；“恢复原版”即时移除局部主题，保留历史。
- 不修改 `FoundationThemeProvider` 全局实例，不重置用户已保存的主题密度偏好，不往 Blueprint 中插入不受支持的字段。

## 局部映射范围

- 复用 Phase 4 `toFoundationThemeExport` 与 `antdPreviewTheme`，支持 8/10 项设计 Token 映射：颜色、明暗算法、密度算法、圆角、字体、字号、间距、阴影。
- 运动策略/速度仍为“预览参数”，不会冒充 Theme API。任何业务行为、接口、分页、搜索和路由编辑都没有修改。
- 原版没有嵌套 `ConfigProvider`，回退后直接继承外层主题；候选版在独立子树内预览。

## 快照与导入约束

- `foundation-pattern-atlas-records-pilot` `version: 1` 结构，固定 `target: 'records.list'`；存储于浏览器的 `foundation-showcase:pattern-atlas:v1:records-pilot` key。
- 每版保存 `id`、创建时间、名称、备注和十项设计参数；**最多 12 个不可变历史快照**。新保存不会覆盖现有快照，保留当前活动版本。
- 一键回退选择当前活动版本之前保存的版本；当不存在更早版本时，回退操作不可用，可点击「恢复原版」。
- 文件导入限制 150 KB、严格格式版本、唯一 ID、数量上限和白名单参数；**导入后始终关闭试点**，手动审阅后才允许重新启用。
- localStorage 数据仅供本地实验，同源标签页通过 storage event 同步；不是多用户发布系统、服务器审计日志或生产级 feature flag 平台。

## 验收路线

1. 安装依赖，执行 `pnpm --filter @foundation/showcase typecheck`、`test`、`build`，再运行 `pnpm -r build`。
2. `pnpm dev`，先打开 `/records`，确认与原版相同（默认仅多一个试点入口）。
3. `/records/pilot`：验证两侧使用同一次 API 数据、状态和 ID 一致，尝试关闭网络并观察错误提示；不发生写入。
4. 切换深色/高密度预设，确认候选版仅右侧变化；点击「保存候选版本」后 `/records` 仍原版。
5. 点击「启用此版本」，检查 `/records` 主题变化但 URL 搜索、状态筛选、分页和编辑保存仍按原路径工作。
6. 再保存第二个版本：先启用新版本，再点击「回退上一版本」，检查恢复较早版本；点击「恢复原版」检查原有主题。
7. 导出 JSON、清空试点、重新导入：确认导入不会自动启用；故意篡改 `version`、`activeId`、`design` 等字段，核对拒绝或降级策略。
8. 将 `features.patternAtlasPilot` 设为 `false`，刷新 `/records`，即使 localStorage 记录 `enabled=true`，也必须呈现原版。
9. 检查 375px、768px、1440px 宽度、键盘焦点、深浅色对比、减少动画、浏览器控制台和无障碍扫描。

**本阶段范围外**：服务端持久化与多人方案协作、自动业务录屏/截图比对、权限到“发布试点”操作的细分授权、生产灰度/遥测、全局主题发布和对业务数据模型的迁移。

## 可选 Chromium 浏览器冒烟测试

启动 `pnpm dev` 后，另开终端执行：

```bash
PILOT_SMOKE_URL=http://127.0.0.1:5173 pnpm patterns:pilot:browser-smoke
```

要求本地有 Chromium（默认 `/usr/bin/chromium`，可通过 `CHROMIUM_BIN` 覆盖）。测试将使用**全新的隔离浏览器 Profile**，验证原版默认、同一批 API 数据、仅保存不启用、显式启用、恢复原版及版本保留。它不会访问或改变日常浏览器的用户偏好。测试目前尚未在完整依赖环境实际执行，待真实机器验收。
