## Requirements

### Requirement: Noise Level Uses a Perceptual Control Curve
The system SHALL map the `Noise volume` control to noise gain with a non-linear curve that provides finer resolution at lower settings while still allowing near-silent output.

#### Scenario: Minimum control value is near-silent
- **WHEN** the user sets `Noise volume` to its minimum value
- **THEN** the applied noise gain SHALL be less than or equal to `0.005`

#### Scenario: Low-end control steps are finer than high-end steps
- **WHEN** gain deltas are compared for equal 1% slider moves in the lowest 20% and highest 20% of the control range
- **THEN** the low-end 1% move SHALL produce a smaller gain change than the high-end 1% move

### Requirement: Runtime Uses a Three-Channel Source Mixer
The system SHALL route noise masker, tonal generator A, and tonal generator B through dedicated source channel gain controls before summing to the shared master path.

#### Scenario: Runtime graph exposes three source channels
- **WHEN** the live audio graph is built
- **THEN** it SHALL include one channel level control for each source path (`noise`, `voiceA`, `voiceB`) feeding the shared master path

#### Scenario: Noise slider updates only the noise channel level
- **WHEN** the user changes `Noise volume`
- **THEN** the runtime SHALL update only the noise source channel level in response to that control change

#### Scenario: Music sliders update their corresponding voice channels
- **WHEN** the user changes `Music volume` for voice A or voice B
- **THEN** the runtime SHALL update only the corresponding voice source channel level in response to that control change

### Requirement: Mixer Reuses Existing Controls Without New UI
The system SHALL use existing source volume sliders (`Noise volume`, `Music volume` A, `Music volume` B) as mixer channel controls and SHALL NOT add a dedicated mixer balance slider.

#### Scenario: Mixer control surface remains unchanged
- **WHEN** the user views the playback controls
- **THEN** the available source volume controls SHALL remain the existing three sliders with no additional mixer-specific level or balance control

### Requirement: Offline Export Uses the Same Source Mixer Model
The system SHALL apply the same perceptual noise mapping and source channel level model in offline export rendering as in live playback.

#### Scenario: Export channel levels match live model
- **WHEN** the user starts an export with a given set of UI values
- **THEN** the export renderer SHALL compute and apply the same effective `noise`, `voiceA`, and `voiceB` channel levels as the live engine configuration derived from those values
