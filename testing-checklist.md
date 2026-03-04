# aftertone manual testing checklist

Use this checklist after refactors that touch scheduling, gain staging, or UI wiring.

## Baseline behavior

- [ ] Page loads without console errors.
- [ ] Default slider value text matches each control position.
- [ ] Clicking `Start` moves status to `Running` and begins audible output after fade-in.
- [ ] Clicking `Stop` moves status to `Stopping...` then `Stopped` after fade-out.
- [ ] Starting again after stop still works.

## Controls and responsiveness

- [ ] `Master volume` changes overall level smoothly while running.
- [ ] `Noise volume`, `Noise color`, and `Noise pan` respond smoothly while running.
- [ ] In the lowest 20% of `Noise volume`, 1-2 step slider moves produce fine, audible-but-small level changes.
- [ ] `Music volume`, `Density`, and `Brightness` for generator A respond while running.
- [ ] `Music volume`, `Density`, and `Brightness` for generator B respond while running.
- [ ] Sweeping `Noise volume` changes only noise balance; sweeping each `Music volume` changes only its corresponding tonal voice balance.
- [ ] No audible clicks/pops during normal slider movement.

## Voice activity and meters

- [ ] Noise LED animates with noise level.
- [ ] Tonal LEDs animate when notes occur and decay naturally.
- [ ] Lower density values feel sparser than higher density values on both voices.
- [ ] Brightness changes are audible (darker to brighter timbre shift).

## Session controls

- [ ] OS/media hardware play/pause controls work when supported.
- [ ] Pause transitions are smooth and resume returns to running state.
- [ ] Spacebar toggles transport: stopped -> start, running -> pause, paused -> resume.

## Regression quick pass

- [ ] Leave running for 5+ minutes: no runaway CPU symptoms, no lockups.
- [ ] Stop while notes are active: fade-out remains smooth.
- [ ] Reload page and verify defaults are restored.
- [ ] Confirm the three source channels (`Noise`, `Music A`, `Music B`) can each be faded from low to high without destabilizing the other channels.
- [ ] Click `Export 864s MP3` and verify an MP3 file downloads with artwork and ID3 genre `Ambient` (ID `26`).
- [ ] Run `node generation-regression-check.cjs` and confirm it passes.
