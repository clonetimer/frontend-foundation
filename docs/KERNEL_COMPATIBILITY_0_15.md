# Kernel Compatibility — 0.15

0.15 is a planned, narrow Runtime Kernel evolution over 0.14.

## Intended Runtime change

Only `@foundation/ui` Visual Composition widget contracts are expanded:

- `ButtonWidget.onPress?: () => void`
- `InputWidget.value?: string`
- `InputWidget.onValueChange?: (value: string) => void`
- `SelectWidget.value?: string`
- `SelectWidget.onValueChange?: (value: string) => void`

Existing props remain supported. Visual-only 0.14 generated pages continue to compile against the additive API.

## Non-goals

0.15 does not move Project Blueprint parsing into Runtime and does not change `core`, `app`, `api`, `security`, `theme`, `observability`, or `testing` interaction contracts.

The owned-Kernel baseline may be reset only after the 0.14 → 0.15 source-hash review confirms the intended narrow delta.
