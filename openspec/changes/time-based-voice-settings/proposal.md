## Why

Voice defaults are currently static, but I want the voice to slow down and darken in the evening with a subtle drift through late afternoon. Adding time-based defaults makes daily use feel more natural without manual tuning.

## What Changes

- Add time-of-day profiles for voice defaults (e.g., afternoon, evening) with pace and tonal adjustments.
- Introduce subtle, gradual transitions between adjacent dayparts so changes feel smooth.
- Use local UK time only; no multi-timezone or location support.
- Defer season and weather-based adjustments to a later change.

## Capabilities

### New Capabilities
- `time-based-voice-settings`: Define time-of-day voice default profiles and their transition behavior.

### Modified Capabilities
None.

## Impact

- Voice defaults configuration schema and storage.
- Time source and scheduling logic for selecting defaults.
- Voice rendering or TTS parameter mapping for pace and tone.
- Tests for time-based selection and transition behavior.
