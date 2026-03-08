## ADDED Requirements

### Requirement: Time-of-day schedule definition
The system SHALL support a time-of-day schedule made of one or more dayparts. Each daypart MUST include a name, local start and end times (24-hour format), and adjustments for supported voice parameters that are applied to base defaults.

#### Scenario: Apply daypart adjustments
- **WHEN** a schedule defines an `afternoon` daypart with pace and tone adjustments
- **THEN** the system computes target defaults by applying those adjustments to the base defaults

### Requirement: Default afternoon and evening profiles
The system SHALL provide a default schedule that includes at least `afternoon` and `evening` dayparts, where the evening target defaults are slower and darker than the afternoon target defaults.

#### Scenario: Evening defaults are slower and darker
- **WHEN** the default schedule is active and local time falls within the evening daypart
- **THEN** the effective pace is lower than the afternoon target pace and the tone is darker than the afternoon target tone

### Requirement: Local-time evaluation
The system SHALL evaluate dayparts using the system's local time (UK) with no timezone overrides or location lookups.

#### Scenario: Select daypart by local time
- **WHEN** the local time is within the evening daypart range
- **THEN** the evening daypart is selected for evaluation

### Requirement: Smooth transition interpolation
The system SHALL linearly interpolate between adjacent dayparts during a configurable transition window. The default transition window MUST be 10 minutes. The system SHALL compelte the transition at the beginning of the new daypart

#### Scenario: Interpolate during transition window
- **WHEN** the local time falls within the transition window between afternoon and evening
- **THEN** the effective defaults are between the afternoon and evening target defaults

### Requirement: Fallback to base defaults
If no schedule is configured or the schedule is disabled, the system MUST use the base defaults unchanged.

#### Scenario: No schedule configured
- **WHEN** no time-of-day schedule is present
- **THEN** the effective defaults match the base defaults

### Requirement: Parameter bounds
The system MUST clamp effective voice parameters to supported ranges after applying adjustments and interpolation.

#### Scenario: Clamp out-of-range values
- **WHEN** adjustments or interpolation would exceed a supported parameter range
- **THEN** the effective value is clamped to the nearest supported bound
