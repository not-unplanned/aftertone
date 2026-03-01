# aftertone session summary (2026-03-01)

## Scope

This session focused on the refactor roadmap discussed for export readiness while keeping the current live experience stable:

- Phase 0 baseline/testing guardrails
- Phase 1 config snapshot normalization
- Phase 2 deterministic RNG utility extraction
- Phase 3 composition/scheduling separation
- Phase 4 time-explicit note rendering
- Phase 5 runtime graph adapter cleanup
- Phase 6 hardening + diagnostics + generation regression checks

## What changed

### Phase 0

- Added `testing-checklist.md` as a dedicated manual validation checklist (kept `README.md` minimal as requested).

### Phase 1

- Introduced `getEngineConfigFromUI(ui)` and `liveConfig` usage so runtime scheduling and updates consume normalized config instead of direct slider reads in multiple places.

### Phase 2

- Added deterministic RNG utilities (`normalizeSeed`, `createSeededRng`, seeded `random01` indirection).
- Routed generative randomness through shared `random01` so session behavior can be seeded/replayed.

### Phase 3

- Split event composition from rendering:
  - `createVoiceComposer(profile)` now emits event data.
  - rendering adapter applies composed events to synth path.

### Phase 4

- Made note rendering time-explicit:
  - `playNoteAtTime(audioCtx, targetBus, startTime, ...)`
  - scheduler now tracks per-voice absolute timeline (`nextNoteAt`).

### Phase 5

- Added runtime graph adapter path:
  - `buildGraph(audioCtx, config)` centralizes audio construction.
  - `buildMusicChain(audioCtx, masterBus, ...)` no longer depends on global context implicitly.
  - `getVoiceProfiles()` centralizes voice profile definitions.

### Phase 6

- Added hardening around composition inputs and generated values:
  - `sanitizeVoiceState`, `finiteOr`, bounded/fallback-safe composition outputs.
- Added opt-in diagnostics (`?debug`):
  - seed logging,
  - scheduler lag warnings,
  - periodic per-voice notes/min and range reporting,
  - `window.__aftertoneDiagnostics` runtime snapshot.
- Added deterministic regression script:
  - `generation-regression-check.cjs` validates same-seed determinism and generation envelopes.
- Updated checklist to include the regression script.

## Technical docs updated

- `aftertone-technical-description.md` was refreshed to match the new architecture (time-explicit scheduling, graph adapter, diagnostics, and regression tooling).

## Validation performed

- Manual local listening and checklist passes reported by user after each phase group.
- Script validation:
  - `node generation-regression-check.cjs` (pass)
  - inline script parse check via Node function compilation (pass)

## Commits created during this session

- `a7010ed` refactor runtime around normalized UI config and add manual checklist
- `e8ef684` extract deterministic rng utilities for generative scheduling
- `60493bf` separate voice event composition from runtime scheduling
- `61f8d4a` make note scheduling time-explicit for runtime voices
- `cd2d7d9` route runtime audio construction through a buildGraph adapter

## Current outcome

Live playback behavior remains stable by ear and checklist, while the code now has clearer boundaries between:

- UI normalization,
- composition,
- timed rendering,
- graph construction,
- runtime diagnostics.

This structure is now much better positioned for an offline/export implementation without destabilizing the main use case.
