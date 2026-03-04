## ADDED Requirements

### Requirement: Spacebar toggles playback transport
The system SHALL interpret a Spacebar press as a transport toggle for Start/Pause/Resume.

#### Scenario: Spacebar starts playback from stopped
- **WHEN** playback is stopped and the user presses Spacebar
- **THEN** the system SHALL start playback

#### Scenario: Spacebar pauses playback while running
- **WHEN** playback is running and the user presses Spacebar
- **THEN** the system SHALL pause playback

#### Scenario: Spacebar resumes playback while paused or suspended
- **WHEN** playback is paused or the AudioContext is suspended and the user presses Spacebar
- **THEN** the system SHALL resume playback

### Requirement: Spacebar shortcut is guarded against accidental activation
The system SHALL only handle Spacebar transport events when safe and intentional.

#### Scenario: Repeated keydown is ignored
- **WHEN** Spacebar keydown events repeat from a key hold
- **THEN** only the first eligible key press SHALL trigger transport behavior

#### Scenario: Editable targets are not hijacked
- **WHEN** focus is inside an editable or interactive element (`input`, `textarea`, `select`, `button`, or contenteditable)
- **THEN** Spacebar SHALL NOT trigger transport behavior

#### Scenario: Modifier combinations are ignored
- **WHEN** Ctrl, Alt, or Meta is held with Spacebar
- **THEN** Spacebar SHALL NOT trigger transport behavior

#### Scenario: Default browser behavior is suppressed when handled
- **WHEN** an eligible Spacebar press triggers transport behavior
- **THEN** the system SHALL prevent default browser behavior for that key event
