// App orchestration: runtime state, transport, and glue between UI + audio.
import {
  clamp,
  createSeededRng,
  getDefaultSeed,
  r01,
  randBetweenWith,
  sleep,
} from "./shared/utils.js";
import {
  DEBUG_RUNTIME,
  FADE_IN_SEC,
  FADE_OUT_SEC,
  FADE_PAUSE_SEC,
  MUSIC_NUDGE_MAX,
  MUSIC_NUDGE_STEP,
  MUSIC_NUDGE_TIMING,
  NOISE_PERCEPTUAL_MAX_GAIN,
  NOISE_PERCEPTUAL_MIN_GAIN,
} from "./audio/constants.js";
import {
  applyMusicBrightness,
  applyNoiseColor,
  applySourceMixerChannelLevel,
  buildGraph,
  formatNoiseVolumeReadout,
  gainToDb,
  mapNoiseVolumeToGain,
  setSourceMixerLevelsAtTime,
} from "./audio/engine.js";
import {
  createSchedulerMetrics,
  createTimedNoteRenderer,
  schedulerLoop,
} from "./audio/voices.js";
import {
  exportTrackMp3,
  getExportLedLevel,
  getExportTrackLabel,
} from "./audio/export.js";
import {
  bindUi,
  getUiElements,
  setLedLevel,
  updateReadouts,
} from "./ui/wiring.js";

const ui = getUiElements();
let liveConfig = null;
let random01 = Math.random;

function setRandomSeed(seed) {
  random01 = createSeededRng(seed);
}

function randBetween(min, max) {
  return randBetweenWith(random01, min, max);
}

function getEngineConfigFromUI(ui) {
  const noiseControl = clamp(r01(ui.noiseVol.value), 0, 1);
  const noiseVolume = mapNoiseVolumeToGain(noiseControl);
  const musicVolA = clamp(r01(ui.musicVol.value), 0, 1);
  const musicVolB = clamp(r01(ui.musicVol2.value), 0, 1);

  return {
    master: r01(ui.master.value),
    noise: {
      control: noiseControl,
      volume: noiseVolume,
      db: gainToDb(noiseVolume),
      color: r01(ui.noiseColor.value),
      pan: ui.noisePan.value / 100,
    },
    voices: {
      a: {
        musicVol: musicVolA,
        density: r01(ui.density.value),
        brightness: r01(ui.brightness.value),
      },
      b: {
        musicVol: musicVolB,
        density: r01(ui.density2.value),
        brightness: r01(ui.brightness2.value),
      },
    },
    sourceMixer: {
      noise: noiseVolume,
      voiceA: musicVolA,
      voiceB: musicVolB,
    },
  };
}

function refreshLiveConfig() {
  liveConfig = getEngineConfigFromUI(ui);
  return liveConfig;
}

function refreshUI() {
  const cfg = refreshLiveConfig();
  updateReadouts(ui, cfg, formatNoiseVolumeReadout);
}

function setPlaybackState(state) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch {
  }
}

async function togglePlayPauseTransport() {
  if (!running) {
    await start();
    return;
  }

  if (isPaused || (ctx && ctx.state === "suspended")) {
    await resume();
    return;
  }

  await pause();
}

function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "aftertone",
      artist: "not-unplanned",
      album: "procedural ambient music with white noise generator",
    });
  } catch {
  }

  const bindAction = (action, handler) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
    }
  };

  bindAction("play", async () => {
    if (running && !isPaused && (!ctx || ctx.state !== "suspended")) return;
    await togglePlayPauseTransport();
  });

  bindAction("pause", async () => {
    await pause();
  });

  bindAction("stop", async () => {
    await stop();
  });
}

// ---------- Event-based modulation (music only) ----------
// Goal: tiny, occasional parameter nudges to keep the tonal voices alive,
// without touching the noise masker settings.
let modTimers = [];
let musicBrightOffsetA = 0;
let musicBrightOffsetB = 0;

function stopAllMusicNudges() {
  for (const t of modTimers) clearTimeout(t);
  modTimers = [];
}

function scheduleMusicNudges() {
  // Safety: if called twice, clear prior timers.
  stopAllMusicNudges();

  const nudgeA = () => {
    if (!ctx || !running || !musicA) return;
    if (isPaused || isPausing) {
      modTimers.push(setTimeout(nudgeA, 2000));
      return;
    }
    const delta = randBetween(-MUSIC_NUDGE_STEP, MUSIC_NUDGE_STEP);
    musicBrightOffsetA = clamp(musicBrightOffsetA + delta, -MUSIC_NUDGE_MAX, MUSIC_NUDGE_MAX);
    const base = liveConfig.voices.a.brightness;
    applyMusicBrightness(ctx, clamp(base + musicBrightOffsetA, 0, 1), musicA.musicLP);
    const nextMs = Math.floor(randBetween(MUSIC_NUDGE_TIMING.a.nextMinSec * 1000, MUSIC_NUDGE_TIMING.a.nextMaxSec * 1000));
    modTimers.push(setTimeout(nudgeA, nextMs));
  };

  const nudgeB = () => {
    if (!ctx || !running || !musicB) return;
    if (isPaused || isPausing) {
      modTimers.push(setTimeout(nudgeB, 2000));
      return;
    }
    const delta = randBetween(-MUSIC_NUDGE_STEP, MUSIC_NUDGE_STEP);
    musicBrightOffsetB = clamp(musicBrightOffsetB + delta, -MUSIC_NUDGE_MAX, MUSIC_NUDGE_MAX);
    const base = liveConfig.voices.b.brightness;
    applyMusicBrightness(ctx, clamp(base + musicBrightOffsetB, 0, 1), musicB.musicLP);
    const nextMs = Math.floor(randBetween(MUSIC_NUDGE_TIMING.b.nextMinSec * 1000, MUSIC_NUDGE_TIMING.b.nextMaxSec * 1000));
    modTimers.push(setTimeout(nudgeB, nextMs));
  };

  // Start with a gentle delay so it doesn't feel like immediate automation.
  modTimers.push(setTimeout(nudgeA, Math.floor(randBetween(MUSIC_NUDGE_TIMING.a.initialMinSec * 1000, MUSIC_NUDGE_TIMING.a.initialMaxSec * 1000))));
  modTimers.push(setTimeout(nudgeB, Math.floor(randBetween(MUSIC_NUDGE_TIMING.b.initialMinSec * 1000, MUSIC_NUDGE_TIMING.b.initialMaxSec * 1000))));
}

// ---------- Audio graph state ----------
let ctx = null;
let running = false;
let isStopping = false;
let isPausing = false;
let isPaused = false;
let masterFade = null;
let lastMasterVisual = 0;
let meterLevelMaster = 0;
let meterLevelNoise = 0;
let meterLevelA = 0;
let meterLevelB = 0;
let meterLevelExport = 0;

// nodes
let masterMeter = null;
let masterGain = null;
let noiseGain = null;
let noisePan = null;
let noiseTilt = null;
let noiseLP = null;
let noiseWorklet = null;
let sourceMixer = null;
let musicA = null;
let musicB = null;
let schedulerAbortA = { aborted: false };
let schedulerAbortB = { aborted: false };
let runtimeDiagnostics = null;

function readRms(chain) {
  if (!chain || !chain.analyser || !chain.meterData) return 0;
  chain.analyser.getFloatTimeDomainData(chain.meterData);
  let sum = 0;
  for (let i = 0; i < chain.meterData.length; i++) {
    const s = chain.meterData[i];
    sum += s * s;
  }
  return Math.sqrt(sum / chain.meterData.length);
}

function getMasterVisualGain() {
  if (masterFade) {
    const elapsed = performance.now() - masterFade.startedAt;
    const t = clamp(elapsed / masterFade.durationMs, 0, 1);
    lastMasterVisual = masterFade.from + (masterFade.to - masterFade.from) * t;
    if (t >= 1) masterFade = null;
    return lastMasterVisual;
  }

  if (!running && !isStopping) {
    lastMasterVisual = 0;
    return 0;
  }

  lastMasterVisual = liveConfig.master;
  return lastMasterVisual;
}

function meterLoop() {
  const nowMs = performance.now();
  const masterLevel = clamp((readRms(masterMeter) - 0.0015) / 0.05, 0, 1);
  const noiseLevel = clamp((liveConfig.noise.volume - NOISE_PERCEPTUAL_MIN_GAIN) / (NOISE_PERCEPTUAL_MAX_GAIN - NOISE_PERCEPTUAL_MIN_GAIN), 0, 1);
  const meterA = clamp((readRms(musicA) - 0.0015) / 0.05, 0, 1);
  const meterB = clamp((readRms(musicB) - 0.0015) / 0.05, 0, 1);
  const exportLevel = getExportLedLevel(nowMs);

  meterLevelMaster = masterLevel > meterLevelMaster
    ? meterLevelMaster + (masterLevel - meterLevelMaster) * 0.45
    : meterLevelMaster * 0.9;

  meterLevelNoise = noiseLevel > meterLevelNoise
    ? meterLevelNoise + (noiseLevel - meterLevelNoise) * 0.25
    : meterLevelNoise * 0.93;

  meterLevelA = meterA > meterLevelA
    ? meterLevelA + (meterA - meterLevelA) * 0.45
    : meterLevelA * 0.88;
  meterLevelB = meterB > meterLevelB
    ? meterLevelB + (meterB - meterLevelB) * 0.45
    : meterLevelB * 0.88;

  meterLevelExport = exportLevel > meterLevelExport
    ? meterLevelExport + (exportLevel - meterLevelExport) * 0.7
    : meterLevelExport + (exportLevel - meterLevelExport) * 0.2;

  if (!running && !isStopping) {
    meterLevelMaster *= 0.8;
    meterLevelNoise *= 0.8;
    meterLevelA *= 0.8;
    meterLevelB *= 0.8;
  }

  setLedLevel(ui.masterLed, meterLevelMaster);
  setLedLevel(ui.noiseLed, meterLevelNoise);
  setLedLevel(ui.musicLedA, meterLevelA);
  setLedLevel(ui.musicLedB, meterLevelB);
  setLedLevel(ui.exportLed, meterLevelExport);

  requestAnimationFrame(meterLoop);
}

// ---------- Start/Stop ----------
async function start() {
  if (running || isStopping) return;
  refreshLiveConfig();
  const sessionSeed = getDefaultSeed();
  setRandomSeed(sessionSeed);
  if (DEBUG_RUNTIME) console.debug(`[aftertone] seed ${sessionSeed}`);

  // Must be created in a user gesture (button click) on modern browsers.
  // If auto-starting from elsewhere, call ctx.resume() after user interaction.
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  const graph = await buildGraph(ctx, liveConfig);
  masterGain = graph.masterGain;
  masterMeter = graph.masterMeter;
  sourceMixer = graph.sourceMixer;
  noiseGain = graph.noiseGain;
  noisePan = graph.noisePan;
  noiseTilt = graph.noiseTilt;
  noiseLP = graph.noiseLP;
  noiseWorklet = graph.noiseWorklet;
  musicA = graph.musicA;
  musicB = graph.musicB;
  const voiceA = graph.voiceA;
  const voiceB = graph.voiceB;

  // Master
  const startTime = ctx.currentTime;
  masterGain.gain.setValueAtTime(0, startTime);
  masterFade = {
    from: 0,
    to: liveConfig.master,
    startedAt: performance.now(),
    durationMs: FADE_IN_SEC * 1000,
  };

  // apply initial params
  setSourceMixerLevelsAtTime(sourceMixer, liveConfig.sourceMixer, startTime);
  applyNoiseColor(ctx, noiseLP, noiseTilt, liveConfig.noise.color);
  applyMusicBrightness(ctx, clamp(liveConfig.voices.a.brightness + musicBrightOffsetA, 0, 1), musicA.musicLP);
  applyMusicBrightness(ctx, clamp(liveConfig.voices.b.brightness + musicBrightOffsetB, 0, 1), musicB.musicLP);

  // start schedulers
  schedulerAbortA = { aborted: false };
  schedulerAbortB = { aborted: false };
  const metricsA = createSchedulerMetrics("A");
  const metricsB = createSchedulerMetrics("B");
  runtimeDiagnostics = {
    seed: sessionSeed,
    voices: {
      a: metricsA,
      b: metricsB,
    },
  };
  if (DEBUG_RUNTIME) window.__aftertoneDiagnostics = runtimeDiagnostics;
  const renderVoiceA = createTimedNoteRenderer(ctx, musicA.musicBus, voiceA, random01);
  const renderVoiceB = createTimedNoteRenderer(ctx, musicB.musicBus, voiceB, random01);
  const shouldPause = () => isPaused || isPausing || (ctx && ctx.state === "suspended");
  schedulerLoop({
    abortToken: schedulerAbortA,
    audioCtx: ctx,
    getVoiceState: () => liveConfig.voices.a,
    renderNoteAtTime: renderVoiceA,
    profile: voiceA,
    metrics: metricsA,
    rand: random01,
    shouldPause,
  });
  schedulerLoop({
    abortToken: schedulerAbortB,
    audioCtx: ctx,
    getVoiceState: () => liveConfig.voices.b,
    renderNoteAtTime: renderVoiceB,
    profile: voiceB,
    metrics: metricsB,
    rand: random01,
    shouldPause,
  });
  scheduleMusicNudges();

  masterGain.gain.cancelScheduledValues(ctx.currentTime);
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(liveConfig.master, ctx.currentTime + FADE_IN_SEC);

  running = true;
  isPaused = false;
  isPausing = false;
  setPlaybackState("playing");
  ui.toggle.textContent = "Stop";
  ui.status.textContent = "Running";
}

async function pause() {
  if (!running || isStopping || isPausing || isPaused) return;
  if (!ctx || !masterGain) return;

  isPausing = true;
  ui.status.textContent = "Pausing...";

  const pauseTime = ctx.currentTime;
  masterFade = {
    from: getMasterVisualGain(),
    to: 0,
    startedAt: performance.now(),
    durationMs: FADE_PAUSE_SEC * 1000,
  };

  masterGain.gain.cancelScheduledValues(pauseTime);
  masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), pauseTime);
  masterGain.gain.linearRampToValueAtTime(0.0001, pauseTime + FADE_PAUSE_SEC);
  await sleep((FADE_PAUSE_SEC + 0.05) * 1000);

  if (ctx.state === "running") {
    try {
      await ctx.suspend();
    } catch {
    }
  }

  isPaused = true;
  isPausing = false;
  setPlaybackState("paused");
  ui.status.textContent = "Paused";
}

async function resume() {
  if (!running || isStopping || isPausing || !isPaused) return;
  if (!ctx || !masterGain) return;

  try {
    await ctx.resume();
  } catch {
  }

  const resumeTime = ctx.currentTime;
  masterFade = {
    from: 0,
    to: liveConfig.master,
    startedAt: performance.now(),
    durationMs: FADE_PAUSE_SEC * 1000,
  };

  masterGain.gain.cancelScheduledValues(resumeTime);
  masterGain.gain.setValueAtTime(0.0001, resumeTime);
  masterGain.gain.linearRampToValueAtTime(liveConfig.master, resumeTime + FADE_PAUSE_SEC);

  isPaused = false;
  setPlaybackState("playing");
  ui.status.textContent = "Running";
}

async function stop() {
  if (!running || isStopping) return;
  isStopping = true;
  isPausing = false;
  ui.toggle.textContent = "Stopping...";
  ui.status.textContent = "Stopping...";

  const masterBeforeStop = getMasterVisualGain();
  masterFade = {
    from: masterBeforeStop,
    to: 0,
    startedAt: performance.now(),
    durationMs: FADE_OUT_SEC * 1000,
  };

  schedulerAbortA.aborted = true;
  schedulerAbortB.aborted = true;
  stopAllMusicNudges();

  if (ctx && masterGain && !isPaused) {
    const stopTime = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(stopTime);
    masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), stopTime);
    masterGain.gain.linearRampToValueAtTime(0.0001, stopTime + FADE_OUT_SEC);
    // Fade out before close to avoid clicks from abrupt graph teardown.
    await sleep((FADE_OUT_SEC + 0.05) * 1000);
  }

  // Close releases audio hardware/resources; old nodes become unusable after this.
  try {
    await ctx.close();
  } catch {
  }
  ctx = null;
  masterMeter = null;
  sourceMixer = null;
  musicA = null;
  musicB = null;
  masterFade = null;
  meterLevelMaster = 0;
  meterLevelNoise = 0;
  meterLevelA = 0;
  meterLevelB = 0;
  setLedLevel(ui.masterLed, 0);
  setLedLevel(ui.noiseLed, 0);
  setLedLevel(ui.musicLedA, 0);
  setLedLevel(ui.musicLedB, 0);
  setPlaybackState("none");
  isStopping = false;
  isPaused = false;

  if (DEBUG_RUNTIME) {
    window.__aftertoneDiagnostics = runtimeDiagnostics;
    if (runtimeDiagnostics) runtimeDiagnostics.stoppedAtMs = performance.now();
  }

  running = false;
  ui.toggle.textContent = "Start";
  ui.status.textContent = "Stopped";
}

// ---------- UI wiring ----------
function handleExportClick() {
  refreshUI();
  return exportTrackMp3({
    config: liveConfig,
    updateUi: ({ text, disabled }) => {
      if (typeof text === "string") ui.exportTrack.textContent = text;
      if (typeof disabled === "boolean") ui.exportTrack.disabled = disabled;
    },
  });
}

function init() {
  refreshUI();
  meterLoop();
  setupMediaSession();
  ui.exportTrack.textContent = getExportTrackLabel();

  bindUi(ui, {
    onSpaceToggle: togglePlayPauseTransport,
    onToggleClick: async () => {
      if (!running) await start();
      else await stop();
    },
    onExportClick: handleExportClick,
    onMasterInput: () => {
      refreshUI();
      if (isStopping) return;
      if (ctx && masterGain) masterGain.gain.setTargetAtTime(liveConfig.master, ctx.currentTime, 0.05);
    },
    onNoiseVolInput: () => {
      refreshUI();
      if (ctx && sourceMixer) applySourceMixerChannelLevel(ctx, sourceMixer, "noise", liveConfig.sourceMixer.noise, 0.05);
    },
    onNoisePanInput: () => {
      refreshUI();
      if (ctx && noisePan) noisePan.pan.setTargetAtTime(liveConfig.noise.pan, ctx.currentTime, 0.05);
    },
    onNoiseColorInput: () => {
      refreshUI();
      if (ctx && noiseLP && noiseTilt) applyNoiseColor(ctx, noiseLP, noiseTilt, liveConfig.noise.color);
    },
    onMusicVolInput: () => {
      refreshUI();
      if (ctx && sourceMixer) applySourceMixerChannelLevel(ctx, sourceMixer, "voiceA", liveConfig.sourceMixer.voiceA, 0.06);
    },
    onBrightnessInput: () => {
      refreshUI();
      if (ctx && musicA) applyMusicBrightness(ctx, clamp(liveConfig.voices.a.brightness + musicBrightOffsetA, 0, 1), musicA.musicLP);
    },
    onDensityInput: refreshUI,
    onMusicVol2Input: () => {
      refreshUI();
      if (ctx && sourceMixer) applySourceMixerChannelLevel(ctx, sourceMixer, "voiceB", liveConfig.sourceMixer.voiceB, 0.06);
    },
    onBrightness2Input: () => {
      refreshUI();
      if (ctx && musicB) applyMusicBrightness(ctx, clamp(liveConfig.voices.b.brightness + musicBrightOffsetB, 0, 1), musicB.musicLP);
    },
    onDensity2Input: refreshUI,
  });
}

init();
