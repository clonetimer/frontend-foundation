# ADR-003: @foundation/app as Composition Root

Status: Accepted

`@foundation/app` 可以同时认识 API、Auth、Telemetry、Theme、Query 和 Router。其他基础 package 不应互相形成横向耦合。API 通过 `getAccessToken`/`onError` 等函数注入连接安全与可观测性。
