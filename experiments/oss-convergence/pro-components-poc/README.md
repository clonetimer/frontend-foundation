# ProComponents PoC

Goal: compare ProLayout/ProTable/ProForm with the current Management Pilot without changing Foundation runtime contracts.

This experiment is excluded from the main workspace until its exact upstream dependency set is available in the validation environment.

Measure:
- page/source LOC;
- table/form adapter LOC;
- production bundle;
- behavior parity;
- whether API/AppError integration requires wrappers;
- whether ProLayout can consume current Foundation navigation metadata without changing route contracts.
