# ADR-009: Forms Capability Boundary

## Status
Accepted for 0.2.

## Decision
`@foundation/forms` standardizes form structure and error integration while leaving basic controls to Ant Design and state/validation to React Hook Form + project-selected Zod schemas.

The package provides `FormLayout`, `FormField`, `FormSection`, `FormActions`, `FormErrorSummary`, and `applyAppErrorToForm`.

It intentionally does not provide `FoundationInput`, `FoundationSelect`, a schema-driven page engine, or a universal form DSL.

## Consequences
- Projects retain full access to Ant Design controls.
- Server field validation can be mapped from `AppError.fieldErrors` consistently.
- SchemaForm remains a later capability and cannot redefine the basic form contract without a separate ADR.
