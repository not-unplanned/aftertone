## 1. Configuration and Control Surface

- [x] 1.1 Keep the existing three source volume sliders (`Noise volume`, `Music volume` A, `Music volume` B) and remove any planned new mixer/balance control.
- [x] 1.2 Update config normalization to compute perceptual noise gain from `Noise volume` while preserving existing source control inputs.
- [x] 1.3 Ensure UI readouts remain accurate for the existing controls after noise mapping changes.

## 2. Runtime Three-Channel Source Mixer

- [x] 2.1 Add shared helper functions for dB/linear conversion, perceptual noise gain mapping, and source channel level application.
- [x] 2.2 Refactor runtime graph handling so noise, voice A, and voice B are treated as explicit source mixer channels feeding `masterGain`.
- [x] 2.3 Update startup and slider input handlers so each source slider updates its corresponding source channel level.

## 3. Export Parity

- [x] 3.1 Apply the same helper-driven noise mapping and three-channel source level model in offline export graph setup.
- [x] 3.2 Ensure export rendering derives effective `noise`, `voiceA`, and `voiceB` channel levels from the same UI snapshot model used by live playback.
- [x] 3.3 Verify export behavior keeps existing fade and end-of-track automation intact after source mixer model updates.

## 4. Validation

- [x] 4.1 Update the manual checklist with checks for low-end noise precision and three-channel balance using existing controls.
- [x] 4.2 Validate live behavior by sweeping each source volume slider independently and confirming only the intended source balance changes.
- [x] 4.3 Run deterministic generation regression checks and smoke-test Start/Stop plus Export flows.
