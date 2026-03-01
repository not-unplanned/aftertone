# aftertone Technical Description

This document explains the current `index.html` implementation used by aftertone, with a focus on structure, Web Audio graph design, scheduling behavior, and reuse patterns for future work (including offline/export paths).

## 1) High-level architecture

aftertone is a single-page, no-build Web Audio instrument with three sound sources:

- A **noise masker** (stereo noise + tone shaping).
- **Tonal generator A** (slow, sparse generative notes).
- **Tonal generator B** (offset companion voice with different profile).

All sources are mixed into a shared `masterGain` and then routed to `AudioContext.destination`.

The script is wrapped in an IIFE so state remains private and no app globals leak into `window` (except optional debug diagnostics when explicitly enabled).

## 2) Page/runtime structure

`index.html` contains:

- UI controls for master, noise, and both tonal voices.
- Status and transport (`Start`/`Stop`) plus Media Session bindings.
- LED meters driven by analyser RMS values.
- Inline script that owns graph construction, composition, scheduling, modulation, and UI wiring.

Control values are normalized from slider ranges into `0..1` where practical, then captured in a single runtime snapshot object (`liveConfig`) via `getEngineConfigFromUI(ui)`.

## 3) Audio graph overview

## Master path

```text
[Noise chain] ----\
[Music chain A] ---+--> masterGain --> destination
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

## 7) Graph adapter and lifecycle

Graph construction now routes through `buildGraph(audioCtx, config)`:

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

- Each music chain has an `AnalyserNode`; RMS is computed from time-domain samples.
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

## 11) Media Session and hardware keys

aftertone registers browser Media Session handlers:

- `play`: start or resume.
- `pause`: fade then suspend.
- `stop`: full teardown (`close()`).

Why it matters:

- OS media keys route through media sessions, not regular keyboard handlers.
- Suspend/resume keeps graph state alive and avoids abrupt cutoff artifacts.

## 12) Regression tooling

`generation-regression-check.cjs` provides deterministic generation checks:

- Verifies same seed -> identical event sequence.
- Verifies different seeds -> different sequence.
- Validates generated value ranges and approximate density/amplitude envelopes.

`testing-checklist.md` includes this command as part of regression pass:

```bash
node generation-regression-check.cjs
```

## 13) Web Audio API gotchas to remember

- User gesture is required for context create/resume on most browsers.
- `setTargetAtTime`/automation smoothing is safer than hard parameter jumps.
- Convolver IR size directly impacts CPU.
- `audioWorklet.addModule()` is async and must complete before node creation.
- JS timers are coarse vs audio clocks; this architecture intentionally accepts that for ambient timing.

## 14) Reuse guidance

Good patterns to carry forward:

- Keep graph builders composable and context-injected (`buildGraph`, `buildMusicChain`).
- Keep composition data-oriented (`waitSeconds` + note payload).
- Keep rendering time-explicit (`playNoteAtTime`).
- Keep runtime config normalized and centralized.
- Keep diagnostics optional and low overhead.

For stricter timing or export rendering, this structure can be extended with an offline timeline renderer that consumes the same event composition layer.
