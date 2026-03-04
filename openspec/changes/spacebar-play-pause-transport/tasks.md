## 1. Shared Transport Intent

- [x] 1.1 Add a helper in `index.html` that maps state to start/pause/resume.
- [x] 1.2 Reuse the helper in Media Session play handling.

## 2. Spacebar Handler

- [x] 2.1 Add a document-level `keydown` listener in `bind()` for Spacebar.
- [x] 2.2 Ignore repeated keydown events and modifier combos.
- [x] 2.3 Ignore editable/interactive targets and contenteditable elements.
- [x] 2.4 Prevent default browser behavior when the shortcut is accepted.
- [x] 2.5 Invoke the shared transport helper from the handler.

## 3. Validation

- [x] 3.1 Verify Spacebar starts playback from stopped.
- [x] 3.2 Verify Spacebar pauses while running and resumes while paused.
- [x] 3.3 Verify holding Spacebar does not rapidly toggle.
- [x] 3.4 Add a manual checklist item for Spacebar transport toggle.
