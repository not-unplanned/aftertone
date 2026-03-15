## ADDED Requirements

### Requirement: Visualization surface
The UI SHALL include a new card dedicated to the three-voice visualization that contains a single canvas used as the rendering surface. The canvas SHALL scale to the card's drawable area.

#### Scenario: Visualization card renders
- **WHEN** the page loads
- **THEN** a visualization card is present with a single canvas sized to the card bounds

### Requirement: Noise field reflects noise controls
The visualization SHALL render a full-surface noise/static field. The noise volume control SHALL scale field intensity, the noise color control SHALL shift the palette from white to pink to brown, and the noise pan control SHALL bias intensity left-to-right.

#### Scenario: Noise field updates with inputs
- **WHEN** noise volume, color, or pan input values change
- **THEN** the noise field intensity, palette, or left/right balance updates to reflect the new values

### Requirement: Tonal circles reflect amplitude and brightness
The visualization SHALL render two circles representing tonal generator A and B. Each circle radius SHALL be proportional to the current unmixed amplitude for its voice (pre-mix). Each circle color selection SHALL be derived from the corresponding brightness control. Circle positions SHALL remain stable and separated, with voice A on the left and voice B on the right.

#### Scenario: Tonal circles update with audio and brightness
- **WHEN** unmixed amplitude or brightness values change for a voice
- **THEN** the corresponding circle radius and color update while its position remains fixed
