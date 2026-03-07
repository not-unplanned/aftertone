// Tonal voice composition, scheduling, and profiles.
import { clamp, finiteOr, sleep } from "../shared/utils.js";
import {
  DEBUG_RUNTIME,
  SCHEDULER_LATE_WARN_MS,
  SCHEDULER_REPORT_EVERY_MS,
} from "./constants.js";

export function sanitizeVoiceState(voiceState) {
  return {
    density: clamp(finiteOr(voiceState && voiceState.density, 0.5), 0, 1),
    musicVol: clamp(finiteOr(voiceState && voiceState.musicVol, 0.5), 0, 1),
    brightness: clamp(finiteOr(voiceState && voiceState.brightness, 0.5), 0, 1),
  };
}

export function createSchedulerMetrics(voiceId) {
  const now = performance.now();
  return {
    voiceId,
    startedAtMs: now,
    lastReportAtMs: now,
    eventsComposed: 0,
    notesRendered: 0,
    maxLateMs: 0,
    ampMin: Infinity,
    ampMax: 0,
    durMin: Infinity,
    durMax: 0,
    gapMinSec: Infinity,
    gapMaxSec: 0,
  };
}

export function updateMetricsForEvent(metrics, event) {
  if (!metrics || !event || !event.note) return;
  metrics.eventsComposed += 1;
  metrics.ampMin = Math.min(metrics.ampMin, event.note.amp);
  metrics.ampMax = Math.max(metrics.ampMax, event.note.amp);
  metrics.durMin = Math.min(metrics.durMin, event.note.dur);
  metrics.durMax = Math.max(metrics.durMax, event.note.dur);
  metrics.gapMinSec = Math.min(metrics.gapMinSec, event.waitSeconds);
  metrics.gapMaxSec = Math.max(metrics.gapMaxSec, event.waitSeconds);
}

export function maybeReportSchedulerMetrics(metrics) {
  if (!DEBUG_RUNTIME || !metrics) return;
  const now = performance.now();
  if ((now - metrics.lastReportAtMs) < SCHEDULER_REPORT_EVERY_MS) return;
  metrics.lastReportAtMs = now;
  const elapsedMin = Math.max((now - metrics.startedAtMs) / 60000, 1e-6);
  const notesPerMin = metrics.notesRendered / elapsedMin;
  const ampMin = Number.isFinite(metrics.ampMin) ? metrics.ampMin.toFixed(4) : "-";
  const ampMax = Number.isFinite(metrics.ampMax) ? metrics.ampMax.toFixed(4) : "-";
  const durMin = Number.isFinite(metrics.durMin) ? metrics.durMin.toFixed(2) : "-";
  const durMax = Number.isFinite(metrics.durMax) ? metrics.durMax.toFixed(2) : "-";
  const gapMin = Number.isFinite(metrics.gapMinSec) ? metrics.gapMinSec.toFixed(2) : "-";
  const gapMax = Number.isFinite(metrics.gapMaxSec) ? metrics.gapMaxSec.toFixed(2) : "-";
  console.debug(`[aftertone] voice ${metrics.voiceId} notes/min=${notesPerMin.toFixed(2)} lateMaxMs=${metrics.maxLateMs.toFixed(1)} amp=[${ampMin},${ampMax}] dur=[${durMin},${durMax}] gap=[${gapMin},${gapMax}]`);
}

export function expRand(meanSeconds, rand = Math.random) {
  // Exponential distribution for Poisson process timing.
  return -Math.log(1 - rand()) * meanSeconds;
}

export function chooseWeighted(items, rand = Math.random) {
  const sum = items.reduce((a, x) => a + x.w, 0);
  let r = rand() * sum;
  for (const x of items) {
    r -= x.w;
    if (r <= 0) return x.v;
  }
  return items[items.length - 1].v;
}

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function makeNotePicker(baseMidi = 48, rand = Math.random) {
  // Minor pentatonic: forgiving + "never too melodic".
  // A Minor Pentatonic: A (0), C(3), D(5), E(7), and G(10)
  const scale = [0, 3, 5, 7, 10];

  let degree = 0; // home-ish
  let octave = 0; // slow drift

  return function pick() {
    // Stepwise most of the time.
    const step = chooseWeighted([
      { v: -2, w: 0.08 },
      { v: -1, w: 0.34 },
      { v: 0, w: 0.16 },
      { v: 1, w: 0.34 },
      { v: 2, w: 0.08 },
    ], rand);
    degree = clamp(degree + step, 0, scale.length - 1);

    // Rare octave drift (minutes-scale).
    if (rand() < 0.03) octave = clamp(octave + (rand() < 0.5 ? -1 : 1), -1, 1);

    const midi = baseMidi + octave * 12 + scale[degree];
    return midiToFreq(midi);
  };
}

export function playNoteAtTime(audioCtx, targetBus, startTime, freq, amp, durSeconds, bright01, profile = {}, rand = Math.random) {
  // A gentle tonal voice: triangle + very light FM shimmer.
  const t0 = startTime;
  const t1 = t0 + durSeconds;

  const carrier = audioCtx.createOscillator();
  carrier.type = profile.waveform || "triangle";
  carrier.frequency.setValueAtTime(freq, t0);

  const mod = audioCtx.createOscillator();
  mod.type = "sine";
  const modMinHz = profile.modMinHz ?? 0.12;
  const modSpanHz = profile.modSpanHz ?? 0.35;
  mod.frequency.setValueAtTime(modMinHz + rand() * modSpanHz, t0); // ultra-slow

  const modGain = audioCtx.createGain();
  // tiny FM index, scaled a bit by brightness
  const shimmerScale = profile.shimmerScale ?? 1;
  modGain.gain.setValueAtTime(((0.4 + bright01 * 1.2) * (rand() < 0.5 ? 1 : 0.7)) * shimmerScale, t0);

  // FM: mod -> carrier.frequency
  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  const vca = audioCtx.createGain();
  vca.gain.setValueAtTime(0, t0);

  // Long, soft envelope
  const a = 0.12 + rand() * 0.22; // attack
  const r = 1.6 + rand() * 3.2; // release tail
  const sustainTime = Math.max(0.2, durSeconds - a - r);

  vca.gain.linearRampToValueAtTime(amp, t0 + a);
  vca.gain.setValueAtTime(amp, t0 + a + sustainTime);
  // Exponential ramps cannot target 0 exactly, so use a tiny floor value.
  vca.gain.exponentialRampToValueAtTime(0.0001, t1);

  // Gentle random detune drift
  const detuneCents = profile.detuneCents ?? 4;
  carrier.detune.setValueAtTime((rand() * 2 - 1) * detuneCents, t0);

  carrier.connect(vca);
  vca.connect(targetBus);

  mod.start(t0);
  carrier.start(t0);

  // stop
  mod.stop(t1 + 0.05);
  carrier.stop(t1 + 0.05);
}

export function createVoiceComposer(profile = {}, rand = Math.random) {
  const pick = makeNotePicker(profile.baseMidi ?? 48, rand);
  const fallbackFreq = midiToFreq(profile.baseMidi ?? 48);

  return function composeNextEvent(voiceState) {
    const state = sanitizeVoiceState(voiceState);

    // Density maps to mean gap seconds:
    // 0 => ~30s gap, 1 => ~7s gap.
    const d = state.density;
    const meanGap = (30 - d * 23) * (profile.gapScale ?? 1);
    const gapSeconds = Math.max(0, finiteOr(expRand(meanGap, rand), meanGap));

    const bright = state.brightness;
    const freq = Math.max(20, finiteOr(pick(), fallbackFreq));

    // Quiet amplitude by design; scaled by Music volume.
    const musicVol = state.musicVol;
    const amp = Math.max(0.0001, finiteOr(((0.012 + rand() * 0.02) * (0.25 + musicVol * 0.95)) * (profile.ampScale ?? 1), 0.01));

    // Long durations: 5-18 sec
    const minDur = profile.minDur ?? 5;
    const maxDur = profile.maxDur ?? 18;
    const dur = clamp(minDur + rand() * Math.max(0.1, (maxDur - minDur)), minDur, maxDur);

    return {
      waitSeconds: gapSeconds,
      note: { freq, amp, dur, bright },
    };
  };
}

export function createTimedNoteRenderer(audioCtx, targetBus, profile = {}, rand = Math.random) {
  return function renderNoteAtTime(noteStartTime, note) {
    playNoteAtTime(audioCtx, targetBus, noteStartTime, note.freq, note.amp, note.dur, note.bright, profile, rand);
  };
}

export async function schedulerLoop({
  abortToken,
  audioCtx,
  getVoiceState,
  renderNoteAtTime,
  profile = {},
  metrics = null,
  rand = Math.random,
  shouldPause = () => false,
}) {
  const composeNextEvent = createVoiceComposer(profile, rand);
  let nextNoteAt = null;

  while (!abortToken.aborted) {
    while (!abortToken.aborted && shouldPause()) {
      await sleep(120);
    }
    if (abortToken.aborted) break;
    if (!audioCtx || audioCtx.state === "closed") break;

    const voiceState = getVoiceState();
    const event = composeNextEvent(voiceState);
    updateMetricsForEvent(metrics, event);
    if (nextNoteAt === null) nextNoteAt = audioCtx.currentTime;
    nextNoteAt += event.waitSeconds;

    // JS timers are not sample-accurate; we keep an absolute target time per voice.
    const waitMs = Math.max(0, (nextNoteAt - audioCtx.currentTime) * 1000);
    await sleep(waitMs);
    if (abortToken.aborted) break;
    while (!abortToken.aborted && shouldPause()) {
      await sleep(120);
    }
    if (abortToken.aborted) break;
    if (!audioCtx || audioCtx.state === "closed") break;

    const lateMs = Math.max(0, (audioCtx.currentTime - nextNoteAt) * 1000);
    if (metrics) {
      metrics.notesRendered += 1;
      metrics.maxLateMs = Math.max(metrics.maxLateMs, lateMs);
    }
    if (DEBUG_RUNTIME && lateMs > SCHEDULER_LATE_WARN_MS) {
      console.debug(`[aftertone] scheduler lag voice ${metrics ? metrics.voiceId : "?"}: ${lateMs.toFixed(1)}ms`);
    }

    const noteStartTime = Math.max(nextNoteAt, audioCtx.currentTime);
    renderNoteAtTime(noteStartTime, event.note);
    maybeReportSchedulerMetrics(metrics);
  }
}

export function getVoiceProfiles() {
  return {
    voiceA: {
      baseMidi: 45, //A1
      gapScale: 1,
      ampScale: 1,
      minDur: 5,
      maxDur: 18,
      delayTime: 0.42,
      delayFeedback: 0.22,
      reverbMix: 0.26,
      filterQ: 0.35,
      detuneCents: 4,
      shimmerScale: 1,
    },
    voiceB: {
      baseMidi: 52, // E1
      gapScale: 0.95,
      ampScale: 0.82,
      minDur: 8,
      maxDur: 22,
      delayTime: 0.66,
      delayFeedback: 0.27,
      reverbMix: 0.34,
      filterQ: 0.28,
      detuneCents: 7,
      shimmerScale: 1.2,
      waveform: "sine",
      modMinHz: 0.15,
      modSpanHz: 0.45,
    },
  };
}
