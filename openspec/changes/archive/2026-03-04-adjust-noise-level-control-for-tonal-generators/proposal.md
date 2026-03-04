## Why

The current noise volume control is difficult to dial in at low levels because a small slider move can shift the perceived balance too much. This makes it harder to keep the noise masker present but still blend it cleanly with tonal generators A/B.

## What Changes

- Add a more controllable noise level mapping so low-end adjustments are finer and more predictable.
- Formalize a three-channel internal source mixer (noise, tonal A, tonal B) that feeds master.
- Reuse the existing `Noise volume`, `Music volume` A, and `Music volume` B sliders as mixer channel controls (no additional mixer UI controls).
- Ensure the same noise level and three-channel mixer behavior is applied in both live playback and offline export rendering.

## Capabilities

### New Capabilities
- `three-channel-source-mixer`: Provide precise noise level control and a KISS three-channel source mixer using existing volume controls in runtime and export paths.

### Modified Capabilities
- None.

## Impact

- `index.html` config normalization and gain application logic for noise and source channels.
- Live audio graph routing and balancing between noise, voice A, voice B, and `masterGain`.
- Offline export graph setup so rendered MP3 balance matches live behavior.
- Regression checklist updates for validating low-level noise control and three-channel balance.
