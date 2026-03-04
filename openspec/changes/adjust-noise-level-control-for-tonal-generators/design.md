## Context

aftertone currently maps `noiseVol` directly from slider percentage to linear gain with a hard minimum clamp. In practice, this makes low-end adjustments coarse and makes it easy for noise to mask tonal generators A/B with small control changes.

The runtime graph already has one gain stage per source path (`noiseGain`, `musicA.musicGain`, `musicB.musicGain`) before summing to master, so the system behaves like a three-channel source mixer today. This change makes that model explicit and consistent across runtime and export while keeping UI simple.

Constraints:
- Single-page `index.html` architecture with no build step.
- No new external dependencies.
- Runtime and offline export behavior should remain aligned.

## Goals / Non-Goals

**Goals:**
- Make low-level noise adjustments more precise and predictable.
- Keep mixing KISS by reusing existing source volume controls only.
- Make the three-source mixer model explicit in code and behavior.
- Keep live playback and offline export balance logic consistent.
- Preserve existing tonal generation controls and scheduling behavior.

**Non-Goals:**
- Add a new mixer/balance slider or other new mixer UI controls.
- Redesign tonal composition/synthesis algorithms.
- Decouple music volume sliders from any existing composition-level influence in this change.
- Introduce loudness normalization across devices.
- Change export format, metadata flow, or transport behavior.

## Decisions

1. **Use perceptual noise level mapping instead of linear gain.**
   - Convert normalized noise level to dB with a shaped curve (fine resolution near minimum), then convert dB to linear gain.
   - Keep the output continuous down to near-silent range instead of enforcing a relatively high floor.
   - Alternative considered: retain linear mapping with a lower clamp. Rejected because low-end control remains too coarse.

2. **Use an explicit three-channel source mixer with existing controls.**
   - Treat noise, voice A, and voice B as three source channels feeding the shared master path.
   - Drive channel levels from existing sliders (`noiseVol`, `musicVol`, `musicVol2`) with no additional mixer controls.
   - Alternative considered: add a dedicated `Noise ↔ Tonal mix` slider. Rejected to avoid UI clutter and preserve KISS.

3. **Centralize gain computations in shared helpers.**
   - Implement shared functions for noise-level mapping and source channel level application.
   - Use the same helpers in live parameter updates and offline export graph setup.
   - Alternative considered: duplicate formulas in runtime and export code paths. Rejected to avoid drift and regression risk.

4. **Preserve existing UI defaults and interaction surface.**
   - Keep current slider set and defaults, including noise color/pan and tonal voice controls.
   - Surface improvements through better noise mapping and clearer internal mixer behavior, not through added controls.

## Risks / Trade-offs

- [Perceived loudness variance between the three channels] -> Mitigation: keep channel-level calculations bounded and validate by ear plus meter checks.
- [Behavioral shift for users used to the old noise slider feel] -> Mitigation: preserve overall UI/controls and only refine the low-end noise mapping curve.
- [Implementation complexity in a single large file] -> Mitigation: isolate math into small helper functions and reuse across runtime/export.

## Migration Plan

1. Add shared helper functions for noise level curve and source channel level application.
2. Update runtime graph code so noise, voice A, and voice B are handled as explicit source mixer channels into `masterGain`.
3. Apply the same helper-driven channel gain model in offline export setup.
4. Validate runtime behavior and export parity using existing regression checklist plus targeted three-channel balance checks.

Rollback strategy: keep existing source routing/controls and restore prior linear noise gain mapping.

## Open Questions

- None at this time.
