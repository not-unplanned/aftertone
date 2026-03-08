# aftertone Technical Description

This document explains the current `index.html` + `js/` module implementation used by aftertone, with a focus on structure, Web Audio graph design, scheduling behavior, and the built-in offline export path.

## 1) High-level architecture

aftertone is a single-page, no-build Web Audio instrument with three sound sources:

- A **noise masker** (stereo noise + tone shaping).
- **Tonal generator A** (slow, sparse generative notes).
- **Tonal generator B** (offset companion voice with different profile).

All sources are mixed into a shared `masterGain`, metered by a master `AnalyserNode`, and then routed to `AudioContext.destination`.

Runtime state lives in ES modules, so app state remains private and no app globals leak into `window` (except optional debug diagnostics when explicitly enabled).

## 2) Page/runtime structure

`index.html` contains:

- UI controls for master, noise, and both tonal voices.
- Status and transport (`Start`/`Stop`) plus Media Session and keyboard (Spacebar) bindings.
- Export transport (`Export 864s MP3`) for offline library use.
- LED meters driven by analyser RMS values.
- ES module entrypoint `js/app.js` with supporting modules under `js/audio/*`, `js/ui/*`, and `js/shared/*`.

Control values are normalized from slider ranges into `0..1` where practical, then captured in a single runtime snapshot object (`liveConfig`) via `getEngineConfigFromUI(ui)`.
Effective voice settings are derived by applying the optional time-of-day schedule to `liveConfig.voices` right before scheduling/rendering.

Module map (expected contents):

- `js/app.js`: runtime state, transport, meters, and glue between UI and audio modules.
- `js/audio/constants.js`: shared constants for audio, export, and timing behavior.
- `js/audio/engine.js`: audio graph wiring (noise/music chains) and node helpers.
- `js/audio/voices.js`: tonal voice composition, scheduling, and profiles.
- `js/audio/export.js`: offline render + MP3 export pipeline and export LED state.
- `js/ui/wiring.js`: DOM lookup, readouts, LED helpers, and event wiring.
- `js/shared/utils.js`: shared math/RNG/timing helpers.
- `js/shared/time-based-voice-settings.js`: time-of-day schedule defaults and effective voice selector.

## 3) Audio graph overview

## Master path

```text
[Noise chain] ----\
[Music chain A] ---+--> masterGain --> master analyser --> destination
[Music chain B] ---/
```

`masterGain` is faded on start/pause/resume/stop to avoid clicks.

## Noise path

```text
AudioWorklet noise --> highshelf (tilt) --> lowpass --> stereo pan --> noiseGain --> masterGain
                                   ^
                          "color" control maps here
```

Notes:

- Noise generation runs in an `AudioWorkletProcessor` to reduce main-thread jitter impact.
- "Color" is implemented as lowpass cutoff + highshelf attenuation, not strict PSD-accurate white/pink/brown synthesis.
- A very slow LFO modulates `noiseGain.gain` for subtle movement.

## Music path (per voice)

```text
playNoteAtTime() -> musicBus -> lowpass -> delay -> convolver(reverb) -> reverbMix --\
                                    |                                                  +--> musicGain -> analyser -> masterGain
                                    \---------------------- dry -----------------------/
```

Each voice has:

- A composition function (`createVoiceComposer`) that emits note events.
- A scheduler (`schedulerLoop`) that maps events onto an absolute timeline.
- A profile object (base pitch, duration range, FX values, detune, shimmer).

Voice B is intentionally offset from Voice A (pitch center, FX, amplitude, duration), creating call-and-response texture.

## 4) Composition and scheduling model

## Deterministic RNG layer

- Runtime randomness is routed through `random01`.
- `setRandomSeed(seed)` switches to a seeded RNG (`createSeededRng`).
- Each `start()` session creates a fresh seed from `crypto.getRandomValues` (with fallback).

This allows deterministic generation checks and future export parity work.

## Composition output

`createVoiceComposer(profile)` emits an event object:

```text
{
  waitSeconds,
  note: { freq, amp, dur, bright }
}
```

Timing uses exponential inter-onset spacing (`expRand`) to emulate a Poisson process.

## Runtime scheduler

`schedulerLoop` keeps a per-voice absolute target time (`nextNoteAt`) and schedules from that reference rather than from "now".

This is still JS-timer driven (ambient-appropriate, not sample-accurate), but now structurally aligned with offline rendering patterns because events are timeline-based and note rendering is time-explicit.

## 5) Voice synthesis

`playNoteAtTime(audioCtx, targetBus, startTime, ...)` uses:

- Main oscillator (`triangle` default, profile-overridable).
- Very slow sine modulator into carrier frequency (light FM shimmer).
- Long attack/release gain envelope.
- Random micro-detune.

Envelope note: exponential ramps cannot target exactly `0`, so a tiny floor (`0.0001`) is used.

## 6) Runtime modulation layer

`scheduleMusicNudges()` adds bounded, occasional brightness drift per voice:

- Small random steps.
- Clamped offset window so UI value remains the primary intent.
- Timers are cleared and rebuilt safely on restart.

This keeps motion subtle without obvious continuous automation.

Time-of-day voice defaults add a separate, slow-moving layer:

- A schedule defines local-time dayparts (afternoon, evening) with density/brightness adjustments.
- A 10-minute linear transition window blends from the current daypart to the next, completing at the next daypart start.
- UI sliders remain the base defaults; time-based adjustments are applied at render time so the interface stays stable.

## 7) Graph adapter and lifecycle

Graph construction now routes through `buildGraph(audioCtx, config)` in `js/audio/engine.js`:

- Builds master/noise/music chains.
- Returns node references plus voice profiles.
- Keeps `start()` focused on orchestration (seeding, graph build, initial params, scheduler start, fades).

`buildMusicChain(audioCtx, masterBus, volume01, profile)` is now context/bus-driven instead of directly coupling to global `ctx/masterGain`.

This refactor is the main foundation for future `OfflineAudioContext` reuse.

## 8) Hardening and diagnostics

A lightweight runtime safety layer is included:

- `sanitizeVoiceState` clamps/normalizes incoming control state.
- `finiteOr` guards against invalid numeric values.
- Composer outputs are bounded/fallback-safe for gap, frequency, amplitude, and duration.

Optional runtime diagnostics are enabled with `?debug`:

- Logs session seed at start.
- Tracks per-voice scheduler metrics (events, notes/min, amp/duration/gap ranges).
- Logs lag warnings when scheduler lateness exceeds threshold.
- Exposes diagnostics as `window.__aftertoneDiagnostics`.

These diagnostics are opt-in and do not affect normal playback behavior.

## 9) Metering and LED feedback

- Each music chain plus the master path has an `AnalyserNode`; RMS is computed from time-domain samples.
- Meter smoothing is asymmetric (faster rise, slower decay).
- Noise LED level is inferred from control value for stable visual feedback.

These indicators are qualitative, not calibrated loudness meters.

## 10) Start/pause/resume/stop behavior

Start sequence:

1. Snapshot normalized UI config.
2. Seed runtime RNG.
3. Create `AudioContext` in user gesture.
4. Build graph via `buildGraph`.
5. Apply initial params and start schedulers/modulation.
6. Fade master from `0` to user value.

Pause/resume:

- Pause fades down then `suspend()`s context.
- Resume `resume()`s context then fades up.
- Scheduler and modulation loops are pause-aware.

Stop sequence:

1. Abort schedulers and modulation timers.
2. Fade master down.
3. Close `AudioContext`.
4. Reset runtime references and LEDs.

Closing the context is important for hardware/resource release.

## 11) Media Session, hardware keys, and keyboard transport

aftertone registers browser Media Session handlers:

- `play`: start or resume.
- `pause`: fade then suspend.
- `stop`: full teardown (`close()`).

aftertone also registers a guarded Spacebar transport shortcut on `keydown`:

- Stopped -> start.
- Running -> pause.
- Paused/suspended -> resume.
- Ignores repeated keydown, modifier combos (`Ctrl`/`Alt`/`Meta`), and editable/interactive targets.
- Calls `preventDefault()` only when the Spacebar transport shortcut is accepted.

This behavior is centralized through a shared play/pause transport intent helper so Media Session `play` and Spacebar use the same state mapping.

Why it matters:

- OS media keys route through media sessions, not regular keyboard handlers.
- Spacebar gives a fast in-tab transport control path without adding UI complexity.
- Suspend/resume keeps graph state alive and avoids abrupt cutoff artifacts.

## 12) Export pipeline (864s MP3)

aftertone now includes an offline export pipeline that reuses the shared composition/render architecture.

High-level flow:

1. Snapshot current normalized UI settings.
2. Build an `OfflineAudioContext` graph for `864s` (44.1kHz, stereo).
3. Render both voices via timeline composition (same core composer logic as runtime).
4. Apply export-specific automation/polish.
5. Encode rendered PCM to MP3.
6. Write ID3 tags + APIC artwork, then download.

Key behaviors:

- **Fade in/out**: export master gain uses explicit start/end fades (`scheduleExportMasterFade`).
- **End guardrails**: notes are not scheduled too close to file end, and note tails are prevented from overrunning the ending.
- **Nudges included**: brightness nudge timelines are generated and scheduled in offline rendering so exported timbre movement matches runtime character.
- **Export-only density taper**: density progressively reduces near the end to create a natural settle-out.
- **Time-based defaults**: export captures the effective voice settings at export start (based on local time).

Codec/tagging implementation:

- MP3 encoding is done with `lamejs` in chunked blocks.
- ID3 writing uses `browser-id3-writer` (title/artist/album/track/year/comment + genre `TCON` set to `Ambient` / ID `26`).
- Artwork is read from `aftertone.png` and written to APIC.

Loading/perf strategy:

- MP3/ID3 libraries are lazy-loaded when export starts (live playback path stays lightweight).
- Export status text transitions through loading/rendering/encoding/tagging states.

## 13) Regression tooling

`generation-regression-check.cjs` provides deterministic generation checks:

- Verifies same seed -> identical event sequence.
- Verifies different seeds -> different sequence.
- Validates generated value ranges and approximate density/amplitude envelopes.

Manual checklist also includes export validation:

- `Export 864s MP3` downloads successfully.
- Resulting file contains embedded artwork.
- Resulting file ID3 tags include genre `Ambient` (ID `26`).

`testing-checklist.md` includes this command as part of regression pass:

```bash
node generation-regression-check.cjs
node js/shared/time-based-voice-settings.test.cjs
```

## 14) Web Audio API gotchas to remember

- User gesture is required for context create/resume on most browsers.
- `setTargetAtTime`/automation smoothing is safer than hard parameter jumps.
- Convolver IR size directly impacts CPU.
- `audioWorklet.addModule()` is async and must complete before node creation.
- JS timers are coarse vs audio clocks; this architecture intentionally accepts that for ambient timing.

## 15) Reuse guidance

Good patterns to carry forward:

- Keep graph builders composable and context-injected (`buildGraph`, `buildMusicChain`).
- Keep composition data-oriented (`waitSeconds` + note payload).
- Keep rendering time-explicit (`playNoteAtTime`).
- Keep runtime config normalized and centralized.
- Keep diagnostics optional and low overhead.
- Keep heavyweight codecs and metadata libraries lazy-loaded from the export action path.

For stricter timing or export rendering, this structure can be extended with an offline timeline renderer that consumes the same event composition layer.

## 16) Repo/GitHub Pages packaging note

- `deploy.sh` uses `docs/` as a publish target for GitHub Pages (`github.io`).
- The script intentionally copies only a limited subset of root assets into `docs/` to constrain what is publicly exposed.
