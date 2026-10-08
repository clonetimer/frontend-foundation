# ADR-012: Visualization uses ECharts as a peer dependency

## Decision

`@foundation/visualization` 使用 Apache ECharts 6，并将 `echarts` 声明为 peer dependency。

## Rationale

避免每个 Foundation package bundle 内嵌图表引擎，也让应用可以进行 route-level lazy loading。Foundation 只增加生命周期和高价值通用 Pattern，不重新设计 ECharts option DSL。
