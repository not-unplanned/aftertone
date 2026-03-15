## Why

The tonal voices are currently perceived as centered, which flattens the space and makes it harder to relate audio placement to the visual field. Adding a subtle stereo width gives each voice a clearer position while keeping the mix cohesive and aligning the visualization with the audio.

## What Changes

- Introduce controlled stereo placement for tonal voice A and B with a modest width cap.
- Derive visualization circle positions from the same stereo placement used for audio.
- Update audio graph to apply the stereo placement while keeping existing controls and mix behavior intact.

## Capabilities

### New Capabilities
- `tonal-voice-stereo-width`: Define bounded stereo placement for tonal voices A and B.

### Modified Capabilities
- `voices-visualization-card`: Circle placement aligns with tonal voice stereo placement rather than fixed left/right positions.

## Impact

- Audio graph changes to pan or place tonal voices with a limited stereo width.
- Visualization rendering updates to place circles using the same stereo placement values.
