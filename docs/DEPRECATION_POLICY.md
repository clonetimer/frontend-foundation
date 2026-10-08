# Deprecation policy

Before 1.0, minor releases may contain breaking changes, but silent breakage is not acceptable.

A public API planned for removal should, where practical:

1. be marked `@deprecated`;
2. name the replacement in code/docs;
3. remain available for at least one migration release unless security/correctness prevents it;
4. be listed in the release note;
5. have `foundation-doctor` or another automated check added when the usage can be detected statically.

Kernel contract removals require an ADR and an explicit migration section. Internal/non-exported symbols do not carry compatibility guarantees.
