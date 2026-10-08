# Foundation Capability 0.2

## Goal
Validate that the 0.1 Kernel can accept reusable data and form capabilities without changing the Kernel contracts.

## Added packages

- `@foundation/data`
  - `DataTable`
  - `DataToolbar`
- `@foundation/forms`
  - `FormLayout`
  - `FormField`
  - `FormSection`
  - `FormActions`
  - `FormErrorSummary`
  - `applyAppErrorToForm`

## Showcase vertical slice

`/records`

```text
URL Search Params
  -> TanStack Query
  -> @foundation/api ApiTransport
  -> Vite dev mock API
  -> @foundation/data DataTable
```

`/records/:id/edit`

```text
TanStack Query detail
  -> React Hook Form + Zod
  -> @foundation/forms
  -> PUT through ApiTransport
  -> HTTP 422 Problem Details
  -> AppError.fieldErrors
  -> React Hook Form field errors
```

The mock API exists only in the Showcase Vite development server. It is test infrastructure, not a Foundation runtime capability.

## Kernel compatibility result

No changes are required to:

- `ApplicationDefinition`
- `ApplicationModule`
- `FoundationRouteObject`
- `FoundationRuntimeConfig`
- `AuthAdapter`
- `AppError`

This is the primary architectural acceptance criterion for 0.2.
