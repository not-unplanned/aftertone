## Why

The three voices lack a visual counterpart, making it harder to understand how the controls shape the sound in real time. Adding a dedicated visualization card provides immediate feedback and makes the audio interaction more legible and engaging.

## What Changes

- Add a new card to `index.html` for a three-voice visualization.
- Render a noise/static background field whose density or texture responds to existing input controls.
- Render two tonal voice circles where radius maps to unmixed amplitude and color selection maps to brightness.
- Add or update supporting CSS/JS to drive the visualization while keeping existing audio behavior intact.

## Capabilities

### New Capabilities
- `voices-visualization-card`: Visual representation of the three voices, driven by the existing input controls.

### Modified Capabilities
- (none)

## Impact

- `index.html` layout updates to include the visualization card.
- Frontend JS responsible for drawing/animation of the visualization.
- CSS for card styling and the visualization surface (canvas or SVG).
