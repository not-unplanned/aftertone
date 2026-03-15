## Context

The tonal voices currently render through the same master path without explicit stereo placement, while the visualization assumes fixed left/right positions. This change introduces controlled, per-note stereo placement for the tonal voices, with overlapping placement most of the time and occasional outlier positions. Pan values are sampled at note start and held for the note duration. The visualization stays aligned to the same placement without adding new UI controls or altering mix behavior.

## Goals / Non-Goals

**Goals:**
- Add subtle, bounded stereo separation for tonal voice A and B with per-note random sampling.
- Favor overlapping placement ranges with occasional outlier positions for spatial contrast.
- Use the same placement values to position the tonal circles in the visualization.
- Keep the change self-contained to audio/visual modules with no new dependencies.

**Non-Goals:**
- Adding a new user-facing stereo width control.
- Changing the existing source mixer levels or noise path behavior.
- Reworking the visualization beyond placement alignment.

## Decisions

- **Stochastic placement field**: Introduce a shared placement generator that outputs pan samples with two modes: overlap (within ±0.2) and outlier (up to ±0.35) at low probability.
  - *Alternative considered*: Purely random pan on every frame; rejected to avoid jitter and listener fatigue.
- **Note-boundary sampling**: Sample new pan values at note start, hold them for the note duration, and limit per-sample change magnitude to keep motion subtle.
  - *Alternative considered*: Fixed placement per session; rejected because the requirement calls for gentle motion.
- **StereoPanner insertion**: Add `StereoPannerNode` per tonal voice in the audio graph, positioned after the tonal chain and before the master bus so the pan applies to the full voice signal.
  - *Alternative considered*: Panning the master bus; rejected because it would also affect noise and collapse separation.
- **Shared placement source for visuals**: Provide a single placement mapping function so both audio pan and visualization X positions use the same values.
  - *Alternative considered*: Hard-coding visualization offsets; rejected because it can drift from audio placement over time.

## Risks / Trade-offs

- **Over-wide placement reduces cohesion** → Clamp width to a conservative maximum (e.g., 0.35).
- **Perceptual imbalance** → Keep voice A/B magnitude symmetrical and avoid additional gain changes.
- **Motion feels jumpy** → Limit per-note pan changes and ease toward new pan targets at note start.

## Migration Plan

- No data migrations required. Update the audio graph and visualization placement in-place.
