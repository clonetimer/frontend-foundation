# Kernel Compatibility 0.1 → 0.2

Compared the complete `src/` trees of the eight Kernel packages.

Result: **SOURCE-IDENTICAL**.

| Package | Source files | Changed files |
|---|---:|---:|
| @foundation/core | 5 | 0 |
| @foundation/observability | 5 | 0 |
| @foundation/security | 8 | 0 |
| @foundation/api | 5 | 0 |
| @foundation/theme | 3 | 0 |
| @foundation/ui | 4 | 0 |
| @foundation/app | 17 | 0 |
| @foundation/testing | 6 | 0 |

0.2 adds `@foundation/data` and `@foundation/forms` plus Showcase/Storybook/consumer validation changes. No Kernel source file was modified. Package manifest versions were bumped to 0.2.0, but Kernel runtime/public source is unchanged.

This is a source-level compatibility result; semantic build compatibility still requires dependency installation and the full release gates in `VALIDATION.md`.
