# Version governance

The repository currently uses the built-in `tooling/release` scripts as the authoritative pre-1.0 version and publication workflow so release validation does not depend on an additional CLI.

The `.changeset` directory is retained for a future migration to Changesets after the first dependency-linked Stable candidate proves the package graph and registry workflow. Introducing Changesets must not replace packed-consumer or release-preflight gates.
