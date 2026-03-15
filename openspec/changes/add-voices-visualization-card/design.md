## Context

The current UI exposes three voices and their controls without a visual layer that reflects how those inputs shape the sound. The change adds a new card to the existing `index.html` layout to render a lightweight visualization driven by the same control values, without altering audio generation or mixing.

## Goals / Non-Goals

**Goals:**
- Provide a visual representation of the three voices aligned to existing controls.
- Render a noise/static background field whose character responds to input values.
- Render tonal voice circles where unmixed amplitude drives radius and brightness drives color selection.
- Keep the visualization performant and self-contained within the current frontend.

**Non-Goals:**
- Changing the audio engine, mixing behavior, or control semantics.
- Building a full-featured oscilloscope or spectrum analyzer.
- Introducing new external libraries or heavy rendering dependencies.

## Decisions

- **Canvas-based rendering**: Use a single `<canvas>` inside the new card to draw noise and circles. This keeps rendering simple and efficient compared to SVG when animating per frame.
  - *Alternative considered*: SVG with individual elements; rejected due to more DOM churn and per-frame attribute updates.
- **Animation loop with requestAnimationFrame**: Drive redraws with `requestAnimationFrame` and reuse existing control values each frame to keep the visualization in sync with UI state.
  - *Alternative considered*: Redraw only on input change; rejected because the noise field needs continuous animation to read as static.
- **Deterministic mapping**: Map unmixed amplitude to circle radius and brightness to color selection through a small, documented mapping function to keep behavior predictable.
  - *Alternative considered*: Using post-mix amplitude; rejected because the requirement calls for unmixed amplitude per voice.

## Risks / Trade-offs

- **Visual jitter from fast parameter changes** → Apply light smoothing (e.g., lerp) on radius/color inputs.
- **Performance on low-end devices** → Cap canvas size to the card bounds and reduce noise sampling density if frame time spikes.
- **Ambiguity in control-to-visual mapping** → Document the mapping in code comments where it is not obvious and keep constants centralized.
