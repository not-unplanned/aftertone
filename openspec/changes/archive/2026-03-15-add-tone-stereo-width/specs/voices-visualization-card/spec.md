## MODIFIED Requirements

### Requirement: Tonal circles reflect amplitude, brightness, and per-note placement
The visualization SHALL render two circles representing tonal generator A and B. Each circle radius SHALL be proportional to the current unmixed amplitude for its voice (pre-mix). Each circle color selection SHALL be derived from the corresponding brightness control. Each circle horizontal position SHALL be derived from the tonal voice stereo pan value, mapping negative pan left of center and positive pan right of center. The circle position SHALL remain stable for the duration of a note while its pan sample is held, and SHALL update when a new pan sample is applied.

#### Scenario: Tonal circles update with audio, brightness, and placement samples
- **WHEN** unmixed amplitude, brightness, or a tonal voice pan sample updates for a note
- **THEN** the corresponding circle radius, color, and position update while remaining within the visualization bounds

#### Scenario: Tonal circles hold placement during a note
- **WHEN** a tonal note continues without a new pan sample
- **THEN** the corresponding circle position SHALL remain stable
