# Capability 0.3 — File / Async / Visualization

## Objective

验证 Kernel 在第三轮外围能力增长中仍然无需扩张，同时补齐工具型/数据型 Web 应用常见的三类技术原语。

## @foundation/file

Public API：

- `validateFileSelection`
- `FileDropZone`
- `FileTransferList`
- `formatFileSize`
- File selection/transfer types

明确不负责：上传 URL、multipart/chunk protocol、OSS/S3 adapter、业务文件解析。

## @foundation/async

Public API：

- `AsyncOperation`
- `normalizeOperationProgress`
- `isAsyncOperationTerminal`
- `pollAsyncOperation`
- `AsyncOperationPanel`
- `AsyncOperationLog`

轮询器只接收 `load(signal)`，因此 HTTP/API 仍由项目层定义。

## @foundation/visualization

Public API：

- `EChart`
- `ChartPanel`
- `TimeSeriesChart`
- `createTimeSeriesOption`

Apache ECharts 是 peer dependency，不打入 Foundation library bundle。项目可直接使用原生 ECharts option；Foundation 不发明第二套图表 DSL。

## Showcase

新增领域无关 `Capabilities` module，分别验证 File / Async / Visualization。Starter 未加入这些 Demo。

## Release gate

0.3 candidate 必须统一通过：

```bash
pnpm install
pnpm check
pnpm consumer:test
pnpm storybook:build
```

通过后再决定是否将 0.3.x 标记 Stable。
