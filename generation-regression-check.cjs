#!/usr/bin/env node
"use strict";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function normalizeSeed(seed) {
  const n = Number(seed);
  if (!Number.isFinite(n)) return 1;
  return (Math.floor(n) >>> 0) || 1;
}

function createSeededRng(seed) {
  let state = normalizeSeed(seed);
  return function next() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chooseWeighted(items, rng) {
  const sum = items.reduce((a, x) => a + x.w, 0);
  let r = rng() * sum;
  for (const x of items) {
    r -= x.w;
    if (r <= 0) return x.v;
  }
  return items[items.length - 1].v;
}

function expRand(meanSeconds, rng) {
  return -Math.log(1 - rng()) * meanSeconds;
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function sanitizeVoiceState(voiceState) {
  return {
    density: clamp(Number.isFinite(voiceState.density) ? voiceState.density : 0.5, 0, 1),
    musicVol: clamp(Number.isFinite(voiceState.musicVol) ? voiceState.musicVol : 0.5, 0, 1),
    brightness: clamp(Number.isFinite(voiceState.brightness) ? voiceState.brightness : 0.5, 0, 1),
  };
}

function makeNotePicker(baseMidi, rng) {
  const scale = [0, 3, 5, 7, 10];
  let degree = 0;
  let octave = 0;

  return function pick() {
    const step = chooseWeighted([
      { v: -2, w: 0.08 },
      { v: -1, w: 0.34 },
      { v: 0, w: 0.16 },
      { v: 1, w: 0.34 },
      { v: 2, w: 0.08 },
    ], rng);

    degree = clamp(degree + step, 0, scale.length - 1);

    if (rng() < 0.03) {
      octave = clamp(octave + (rng() < 0.5 ? -1 : 1), -1, 1);
    }

    const midi = baseMidi + octave * 12 + scale[degree];
    return midiToFreq(midi);
  };
}

function composeVoiceEvents(opts) {
  const seed = normalizeSeed(opts.seed);
  const count = opts.count;
  const profile = opts.profile;
  const state = sanitizeVoiceState(opts.voiceState);
  const rng = createSeededRng(seed);
  const pick = makeNotePicker(profile.baseMidi ?? 48, rng);
  const events = [];

  for (let i = 0; i < count; i++) {
    const meanGap = (30 - state.density * 23) * (profile.gapScale ?? 1);
    const waitSeconds = Math.max(0, expRand(meanGap, rng));

    const bright = state.brightness;
    const freq = Math.max(20, pick());
    const amp = Math.max(0.0001, ((0.012 + rng() * 0.02) * (0.25 + state.musicVol * 0.95)) * (profile.ampScale ?? 1));

    const minDur = profile.minDur ?? 5;
    const maxDur = profile.maxDur ?? 18;
    const dur = clamp(minDur + rng() * Math.max(0.1, maxDur - minDur), minDur, maxDur);

    events.push({ waitSeconds, freq, amp, dur, bright });
  }

  return events;
}

function round(n, digits) {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

function compactEventView(events) {
  return events.map((e) => ({
    w: round(e.waitSeconds, 6),
    f: round(e.freq, 5),
    a: round(e.amp, 6),
    d: round(e.dur, 5),
    b: round(e.bright, 4),
  }));
}

function summarize(events) {
  const totalWait = events.reduce((a, e) => a + e.waitSeconds, 0);
  const ampMin = events.reduce((a, e) => Math.min(a, e.amp), Infinity);
  const ampMax = events.reduce((a, e) => Math.max(a, e.amp), 0);
  const notesPerMinute = events.length / Math.max(totalWait / 60, 1e-9);
  return { ampMin, ampMax, notesPerMinute };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function checkDeterminism(profile, voiceState) {
  const first = compactEventView(composeVoiceEvents({ seed: 424242, count: 128, profile, voiceState }));
  const second = compactEventView(composeVoiceEvents({ seed: 424242, count: 128, profile, voiceState }));
  const differentSeed = compactEventView(composeVoiceEvents({ seed: 424243, count: 128, profile, voiceState }));

  assert(JSON.stringify(first) === JSON.stringify(second), "same seed should produce identical events");
  assert(JSON.stringify(first) !== JSON.stringify(differentSeed), "different seeds should produce different events");
}

function checkRanges(profile, voiceState, label, notesPerMinuteMin, notesPerMinuteMax) {
  let minNpm = Infinity;
  let maxNpm = 0;
  let globalAmpMin = Infinity;
  let globalAmpMax = 0;

  for (let seed = 1; seed <= 32; seed++) {
    const events = composeVoiceEvents({ seed, count: 192, profile, voiceState });
    for (const e of events) {
      assert(Number.isFinite(e.waitSeconds) && e.waitSeconds >= 0, `${label}: invalid waitSeconds`);
      assert(Number.isFinite(e.freq) && e.freq >= 20, `${label}: invalid freq`);
      assert(Number.isFinite(e.amp) && e.amp > 0, `${label}: invalid amp`);
      assert(Number.isFinite(e.dur) && e.dur >= (profile.minDur ?? 5) && e.dur <= (profile.maxDur ?? 18), `${label}: invalid duration`);
      assert(Number.isFinite(e.bright) && e.bright >= 0 && e.bright <= 1, `${label}: invalid brightness`);
    }

    const s = summarize(events);
    minNpm = Math.min(minNpm, s.notesPerMinute);
    maxNpm = Math.max(maxNpm, s.notesPerMinute);
    globalAmpMin = Math.min(globalAmpMin, s.ampMin);
    globalAmpMax = Math.max(globalAmpMax, s.ampMax);
  }

  assert(minNpm >= notesPerMinuteMin, `${label}: notes/min too low (${minNpm.toFixed(2)})`);
  assert(maxNpm <= notesPerMinuteMax, `${label}: notes/min too high (${maxNpm.toFixed(2)})`);
  assert(globalAmpMin >= 0.005, `${label}: amp min unexpectedly low (${globalAmpMin.toFixed(5)})`);
  assert(globalAmpMax <= 0.04, `${label}: amp max unexpectedly high (${globalAmpMax.toFixed(5)})`);

  return {
    label,
    notesPerMinute: [minNpm, maxNpm],
    amp: [globalAmpMin, globalAmpMax],
  };
}

function run() {
  const voiceAProfile = {
    baseMidi: 45,
    gapScale: 1,
    ampScale: 1,
    minDur: 5,
    maxDur: 18,
  };
  const voiceBProfile = {
    baseMidi: 52,
    gapScale: 0.95,
    ampScale: 0.82,
    minDur: 8,
    maxDur: 22,
  };

  const voiceAState = { musicVol: 0.67, density: 0.89, brightness: 0.35 };
  const voiceBState = { musicVol: 0.89, density: 0.74, brightness: 0.62 };

  checkDeterminism(voiceAProfile, voiceAState);
  checkDeterminism(voiceBProfile, voiceBState);

  const summaryA = checkRanges(voiceAProfile, voiceAState, "voiceA", 3, 12);
  const summaryB = checkRanges(voiceBProfile, voiceBState, "voiceB", 2, 10);

  console.log("aftertone generation regression check passed");
  for (const s of [summaryA, summaryB]) {
    console.log(`${s.label}: notes/min ${s.notesPerMinute[0].toFixed(2)}..${s.notesPerMinute[1].toFixed(2)} | amp ${s.amp[0].toFixed(5)}..${s.amp[1].toFixed(5)}`);
  }
}

try {
  run();
} catch (err) {
  console.error(`generation regression check failed: ${err && err.message ? err.message : err}`);
  process.exitCode = 1;
}
