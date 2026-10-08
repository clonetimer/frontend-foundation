# ADR-002: React Router Data Mode

Status: Accepted

采用 React Router Data Mode，自行控制 Vite、Runtime Config、Application Bootstrap 和 Provider Composition。Route Object 原生承担路由能力，Foundation 仅增加稳定元数据约束，不重新发明 Router API。
