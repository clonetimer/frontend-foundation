# Upstream Dependency Policy

## OSS-first rule

Before adding a new Foundation capability, maintainers must search for a maintained upstream implementation and record why it is adopted, wrapped or rejected.

## Prefer dependency over fork

Preferred order:

1. direct dependency;
2. thin adapter;
3. small patch / upstream contribution;
4. maintained fork only when licensing, security or release constraints make the above impossible.

A copied template is not considered reuse because it cannot receive fixes through normal package upgrades.

## Pinning during evaluation

Shadow PoCs pin exact upstream versions. After promotion, Foundation may use controlled compatible ranges plus lockfile and upgrade gates.

## Upstream exit criteria

An adopted upstream must have a documented fallback when any occurs:

- maintenance stops;
- license changes incompatibly;
- required major version support is dropped;
- security response becomes unacceptable;
- adapter code becomes larger/more complex than the capability it replaces.

## Owned Kernel isolation baseline

OSS shadow PoCs are prevented from silently mutating production Runtime Kernel source by `docs/oss/kernel-owned-hashes.json`.

- Historical `kernel-0.5-hashes.json` remains an audit artifact.
- `kernel-owned-hashes.json` represents the **current intentionally owned Kernel**.
- A planned Kernel release may update the owned baseline only together with the reviewed source change and release/ADR documentation.
- `pnpm oss:verify` rejects changed, removed, or newly added Kernel source files relative to that current baseline.
- `pnpm oss:kernel-baseline -- --write` is therefore a governance action, not a routine test repair.
