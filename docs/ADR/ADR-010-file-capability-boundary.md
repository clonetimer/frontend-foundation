# ADR-010: File capability boundary

## Decision

Foundation File 只稳定选择、客户端预校验与传输状态 UI；真正上传/下载协议由项目负责。

## Rationale

不同项目使用 multipart、预签名 URL、分片、桌面桥接或专有设备协议。把这些固化进基座会制造错误抽象。
