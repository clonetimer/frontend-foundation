# ADR-011: Async operation boundary

## Decision

Foundation Async 使用领域无关 `AsyncOperation` 状态模型，并以 `load(signal)` 注入方式提供轮询。

## Rationale

后台任务可能来自 REST polling、SSE、WebSocket 或桌面 IPC。Kernel/Capability 不应规定 Job API。
