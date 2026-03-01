# aftertone Technical Description

This document explains the `index.html` implementation used by aftertone, with a focus on structure, Web Audio graph design, and API behaviors that matter when reusing this pattern in future projects.

## 1) High-level architecture

The app is a single-page, no-build Web Audio instrument with three sound sources:

- A **noise masker** (stereo noise + tone shaping).
- **Tonal generator A** (slow, sparse generative notes).
- **Tonal generator B** (offset companion voice with different profile).

All sources are mixed into a shared `masterGain` and then routed to `AudioContext.destination`.

The script is wrapped in an IIFE so the entire state stays private and avoids globals.

## 2) Page structure

`index.html` contains:

- **UI controls** for master, noise, and two tonal voices.
- **Status and transport** (`Start`/`Stop`).
- **LED meters** driven by analyser RMS values.
- **Inline script** that owns audio graph creation, scheduling, modulation, and UI binding.

The UI values are normalized from slider ranges into `0..1` where practical via `r01(x)`.

## 3) Audio graph overview

## Master path

```text
[Noise chain] ----\
[Music chain A] ---+--> masterGain --> destination
[Music chain B] ---/
```

`masterGain` is faded in/out on start/stop to avoid clicks.

## Noise path

```text
AudioWorklet noise --> highshelf (tilt) --> lowpass --> stereo pan --> noiseGain --> masterGain
                                   ^
                          "color" control maps here
```

Notes:

- Noise generation is done in an `AudioWorkletProcessor` to avoid main-thread timing jitter.
- "Color" is implemented as a lowpass cutoff + highshelf attenuation, not strict PSD-accurate white/pink/brown synthesis.
- A very slow LFO modulates `noiseGain.gain` for subtle movement.

## Music path (per voice)

```text
playNote() -> musicBus -> lowpass -> delay -> convolver(reverb) -> reverbMix --\
                            |                                                  +--> musicGain -> analyser -> masterGain
                            \---------------------- dry -----------------------/
```

Each voice has:

- A note scheduler (`schedulerLoop`) with Poisson timing.
- A pitch picker constrained to A minor pentatonic with weighted step movement.
- A custom profile (base pitch, duration ranges, FX levels, detune, shimmer).

Voice B is intentionally offset from Voice A (pitch center, delay/reverb, amplitude, duration), creating call-and-response texture.

## 4) Generative system details

## Timing model

- Inter-onset intervals use an **exponential distribution** (`expRand`) to emulate a Poisson event process.
- `density` maps to the mean gap between notes (roughly sparse to busy).
- Scheduling uses `setTimeout`/`sleep`, which is not sample-accurate, but acceptable for ambient macro-timing.

## Pitch model

- `makeNotePicker(baseMidi)` constrains to scale degrees `[0, 3, 5, 7, 10]` (A minor pentatonic intervals).
- Weighted steps favor small motion (`-1, 0, +1`) with rarer larger steps.
- Occasional octave drift adds slow long-term variation.

## Voice synthesis

`playNote(...)` uses:

- Main oscillator (`triangle` by default, profile-overridable).
- Very slow sine modulator into carrier frequency (light FM shimmer).
- Gain envelope with long attack/release.
- Random micro-detune.

Important envelope gotcha: exponential ramps cannot target exactly `0`, so a tiny floor (`0.0001`) is used.

## 5) Runtime modulation layer

`scheduleMusicNudges()` adds occasional, bounded brightness offsets per voice:

- Offsets drift in small random steps.
- Drift is clamped so UI value remains the primary intent.
- Timers are cleared and rebuilt safely on restart.

This gives movement without continuous obvious automation.

## 6) Metering and LED feedback

- Each music chain has an `AnalyserNode`; RMS is computed from time-domain data.
- Meters are smoothed asymmetrically (faster rise, slower decay) for readability.
- Noise LED level is inferred from control value (intentionally simple and stable).

These LEDs are qualitative indicators, not calibrated loudness meters.

## 7) Start/stop lifecycle

Start sequence:

1. Create `AudioContext` inside user gesture.
2. Build master, noise, and both music chains.
3. Apply initial control values.
4. Start schedulers and modulation nudges.
5. Ramp master gain from 0 to user value.

Stop sequence:

1. Abort schedulers and cancel modulation timers.
2. Fade master down.
3. Close `AudioContext`.
4. Reset runtime references and UI indicators.

Closing the context is important for releasing hardware resources and preventing orphaned audio processing.

## 8) Web Audio API gotchas to remember

- **User gesture requirement**: context creation/resume must happen after user interaction in most browsers.
- **Automation smoothing**: direct `.value` jumps can click; `setTargetAtTime` is safer for live controls.
- **Convolver cost**: IR length/decay increases CPU usage; keep modest defaults for browser reliability.
- **Worklet loading**: `audioWorklet.addModule()` is async and must resolve before node creation.
- **Timer precision**: JS timers are coarse compared with audio sample clocks; use look-ahead schedulers if tighter rhythm is needed.

## 9) Reuse guidance for future projects

Good patterns to carry forward:

- Keep graph construction in small composable builders (`buildMusicChain`, `playNote`, etc.).
- Separate UI normalization from DSP logic.
- Use profile objects for voice variants instead of duplicating code.
- Build explicit start/stop lifecycles with fades and cleanup.
- Add lightweight metering/visual feedback to make tuning easier.

If you later need stricter rhythm or sequencing, keep this structure and replace `schedulerLoop` with a look-ahead scheduler driven by `AudioContext.currentTime`.
