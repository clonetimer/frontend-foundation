# Refine Core PoC

Goal: test Refine **headless core only** for Data/Auth/AccessControl.

Deliberately absent:
- `@refinedev/antd` (currently Ant Design 5-bound);
- `@refinedev/react-router` (currently React Router 7-bound).

The first gate asks whether Refine Core reduces project code while preserving Foundation API/AppError/trace semantics. React Router 8 integration is a later gate and, if needed, uses Refine's custom router-provider interface rather than downgrading Foundation.
