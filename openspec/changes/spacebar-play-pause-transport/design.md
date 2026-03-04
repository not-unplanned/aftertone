## Context

aftertone uses a single-page `index.html` with transport primitives (`start`, `pause`, `resume`, `stop`) plus Media Session handlers for OS media keys. There is no keyboard shortcut for transport, and the Spacebar currently performs default browser behavior.

Constraints:
- Single HTML file, no build step.
- Avoid new dependencies.

## Goals / Non-Goals

**Goals:**
- Spacebar starts playback from stopped state.
- Spacebar toggles pause/resume while running.
- Guard against accidental triggers in editable or interactive UI contexts.
- Keep keyboard behavior aligned with Media Session play intent.

**Non-Goals:**
- Add a new key binding for Stop.
- Add UI for key mapping or settings.
- Change existing transport fade timing or audio behavior.

## Decisions

1. **Introduce a shared transport intent helper.**
   - Create a small helper (e.g. `togglePlayPauseTransport`) that maps state to `start`, `pause`, or `resume`.
   - Reuse this helper for Spacebar and Media Session play handling to keep behavior consistent.
   - Alternative: inline logic in each handler. Rejected to avoid drift.

2. **Use a document-level `keydown` listener with strict guards.**
   - Listen in `bind()` to keep UI wiring localized.
   - Accept only Spacebar (`event.code === "Space"` with `event.key` fallback).
   - Ignore repeated keydown events and modifier combos.
   - Ignore editable/interactive targets and contenteditable elements.
   - Call `event.preventDefault()` only when the shortcut is accepted.

## Risks / Trade-offs

- [Global shortcut conflicts with input focus] → Guard against inputs, buttons, selects, and contenteditable targets.
- [Browser key value differences] → Check both `event.code` and `event.key`.
