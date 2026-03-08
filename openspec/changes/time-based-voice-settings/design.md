## Context

Voice defaults are currently static for the whole day. The change introduces time-of-day defaults for a single user in the UK, with a subtle drift from afternoon into evening.

## Goals / Non-Goals

**Goals:**
- Provide time-of-day voice default profiles with smooth transitions between adjacent dayparts.
- Keep behavior deterministic and testable by centralizing time-based selection in a single function.
- Default to UK local time without requiring explicit timezone configuration.

**Non-Goals:**
- Season or weather-based adjustments.
- Multi-user or multi-timezone support.
- New UI for configuring schedules (unless already present).

## Decisions

- brightness and density are in scope for transitions.
- Transitions occur over the space of 10 minutes before the start of the next daypart. Once the new daypart arrived the transition is complete.
- Model the schedule as an ordered list of dayparts with local start and end times plus target adjustments (pace, tone, and other supported parameters).
  - Alternative: encode a continuous curve across 24h. Rejected for complexity and harder editing.
- Implement smooth transitions by interpolating between adjacent profiles over a configurable transition window around boundaries.
  - Alternative: abrupt switching at boundary times. Rejected because the requirement calls for subtle drift.
- Compute effective defaults via a pure selector: `baseDefaults + schedule + now -> effectiveDefaults`.
  - Alternative: mutate defaults in place with background timers. Rejected for harder testing and statefulness.
- Use system local time as the only time source in production, with injectable time for tests.
  - Alternative: allow explicit timezone configuration. Rejected as unnecessary for single-user UK use.

## Risks / Trade-offs

- System clock or timezone is incorrect → Document reliance on local time and allow time injection in tests.
- Interpolation can push parameters outside safe ranges → Clamp adjustments within known bounds.
- Too-frequent recalculation could cause jitter → Recompute at boundaries or on a coarse interval.

## Migration Plan

- Add the new schedule schema with defaults that preserve existing behavior when the schedule is absent or disabled.
- No data migration required; use base defaults as fallback.
