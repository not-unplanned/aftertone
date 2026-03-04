## Why

Playback currently depends on clicking Start/Stop or using OS media keys. Adding a Spacebar shortcut makes quick control easier during long listening sessions and reduces friction.

## What Changes

- Add a Spacebar keyboard handler that toggles Start/Pause/Resume behavior.
- Start playback from stopped state when Spacebar is pressed.
- Guard against accidental triggers (editable targets, modifiers, repeated keydown) and prevent default browser behavior when handled.
- Reuse shared transport intent logic so keyboard and Media Session play behavior stay aligned.

## Capabilities

### New Capabilities
- `spacebar-play-pause-transport`: Provide a guarded Spacebar transport toggle that starts from stopped and alternates pause/resume while running.

### Modified Capabilities

## Impact

- `index.html` transport intent logic and UI event wiring.
- `testing-checklist.md` for a manual keyboard transport check.
