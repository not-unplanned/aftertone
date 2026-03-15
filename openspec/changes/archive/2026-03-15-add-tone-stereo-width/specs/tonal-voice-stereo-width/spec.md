## ADDED Requirements

### Requirement: Tonal voices use bounded, per-note placement
The system SHALL assign a stereo pan value to each tonal note for voice A and voice B by sampling from a shared placement field. The sampled pan SHALL be held for the duration of the note. Pan values SHALL remain within ±0.35, and the absolute change between consecutive pan samples for a voice SHALL be no more than 0.15.

#### Scenario: Voice pan uses bounded width
- **WHEN** a tonal note starts
- **THEN** the assigned pan value SHALL be within ±0.35

#### Scenario: Voice pan holds for the note duration
- **WHEN** a tonal note is playing
- **THEN** the assigned pan value SHALL remain constant until the note ends

#### Scenario: Voice pan changes are subtle between notes
- **WHEN** consecutive pan samples are generated for the same voice
- **THEN** the absolute pan difference SHALL be no more than 0.15

### Requirement: Placement favors overlap with occasional outliers
The system SHALL derive pan samples for both voices from a shared placement field so that they generally occupy the same stereo space. The system SHALL implement two placement modes: an overlap mode that keeps both pan samples within ±0.2, and an outlier mode that allows a pan sample to exceed ±0.2 while remaining within the maximum bound. The outlier mode SHALL be selected with low probability, less than or equal to 0.2.

#### Scenario: Overlap mode keeps voices within the shared field
- **WHEN** an overlap placement sample is generated for both voices
- **THEN** both voice pan values SHALL be within ±0.2

#### Scenario: Outlier mode allows a wider placement
- **WHEN** an outlier placement sample is generated
- **THEN** at least one voice pan value MAY exceed ±0.2 and SHALL remain within ±0.35
