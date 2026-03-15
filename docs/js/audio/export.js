// Offline render + MP3 export pipeline and export LED state.
import {
  clamp,
  createSeededRng,
  finiteOr,
  getDefaultSeed,
  randBetweenWith,
  sleep,
} from "../shared/utils.js";
import {
  DEBUG_RUNTIME,
  EXPORT_DENSITY_TAPER_FLOOR,
  EXPORT_DENSITY_TAPER_WINDOW_SEC,
  EXPORT_DURATION_SEC,
  EXPORT_FADE_IN_SEC,
  EXPORT_FADE_OUT_SEC,
  EXPORT_ID3_GENRE,
  EXPORT_ID3_GENRE_ID,
  EXPORT_LIB_ID3_URL,
  EXPORT_LIB_LAME_URL,
  EXPORT_MP3_BITRATE_KBPS,
  EXPORT_NOTE_END_GUARD_SEC,
  EXPORT_NOTE_TAIL_GUARD_SEC,
  EXPORT_SAMPLE_RATE,
  MUSIC_NUDGE_MAX,
  MUSIC_NUDGE_STEP,
  MUSIC_NUDGE_TIMING,
} from "./constants.js";
import { applyNoiseColorToNodes, buildGraph, setMusicBrightnessAtTime } from "./engine.js";
import {
  createTimedNoteRenderer,
  createTonalPanSampler,
  createVoiceComposer,
  sanitizeVoiceState,
} from "./voices.js";

let isExportingTrack = false;
let exportCodecModulesPromise = null;
let exportArtworkBytesPromise = null;
const externalScriptPromises = new Map();

let exportLedPhase = "idle";
let exportLedPhaseStartedAtMs = performance.now();
let exportLedEncodingProgress = 0;

function createDensityTaperAtTime(baseDensity, durationSec, taperWindowSec, taperFloor) {
  const safeBaseDensity = clamp(finiteOr(baseDensity, 0.5), 0, 1);
  const safeDurationSec = Math.max(1, finiteOr(durationSec, EXPORT_DURATION_SEC));
  const safeWindowSec = clamp(finiteOr(taperWindowSec, EXPORT_DENSITY_TAPER_WINDOW_SEC), 1, safeDurationSec);
  const floor = clamp(finiteOr(taperFloor, EXPORT_DENSITY_TAPER_FLOOR), 0.02, 1);
  const taperStartSec = Math.max(0, safeDurationSec - safeWindowSec);

  return function densityAtTime(timeSec) {
    const t = clamp(finiteOr(timeSec, 0), 0, safeDurationSec);
    if (t <= taperStartSec) return safeBaseDensity;
    const progress = (t - taperStartSec) / safeWindowSec;
    const scale = 1 - (1 - floor) * clamp(progress, 0, 1);
    return clamp(safeBaseDensity * scale, 0, 1);
  };
}

function createBrightnessNudgeTimeline(baseBrightness, durationSec, timingProfile, rand = Math.random) {
  const timeline = [{ timeSec: 0, value: clamp(baseBrightness, 0, 1) }];
  const safeDurationSec = Math.max(1, finiteOr(durationSec, EXPORT_DURATION_SEC));
  let offset = 0;
  let nowSec = randBetweenWith(rand, timingProfile.initialMinSec, timingProfile.initialMaxSec);

  while (nowSec < safeDurationSec) {
    offset = clamp(offset + randBetweenWith(rand, -MUSIC_NUDGE_STEP, MUSIC_NUDGE_STEP), -MUSIC_NUDGE_MAX, MUSIC_NUDGE_MAX);
    timeline.push({
      timeSec: nowSec,
      value: clamp(baseBrightness + offset, 0, 1),
    });
    nowSec += randBetweenWith(rand, timingProfile.nextMinSec, timingProfile.nextMaxSec);
  }

  return timeline;
}

function sampleTimelineAtTime(timeline, timeSec) {
  let value = timeline[0] ? timeline[0].value : 0.5;
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].timeSec > timeSec) break;
    value = timeline[i].value;
  }
  return value;
}

function scheduleBrightnessTimeline(lpNode, timeline) {
  if (!lpNode || !timeline || timeline.length === 0) return;
  const initialHz = 1200 + clamp(timeline[0].value, 0, 1) * 7800;
  lpNode.frequency.cancelScheduledValues(0);
  lpNode.frequency.setValueAtTime(initialHz, 0);
  for (let i = 1; i < timeline.length; i++) {
    setMusicBrightnessAtTime(lpNode, timeline[i].value, timeline[i].timeSec, 0.05);
  }
}

function scheduleExportMasterFade(audioCtx, masterNode, targetGain, durationSec) {
  if (!audioCtx || !masterNode) return;
  const safeDurationSec = Math.max(1, finiteOr(durationSec, EXPORT_DURATION_SEC));
  const fadeInSec = clamp(finiteOr(EXPORT_FADE_IN_SEC, 0), 0, safeDurationSec * 0.5);
  const fadeOutSec = clamp(finiteOr(EXPORT_FADE_OUT_SEC, 0), 0, safeDurationSec * 0.5);
  const fadeOutStartSec = Math.max(fadeInSec, safeDurationSec - fadeOutSec);

  masterNode.gain.cancelScheduledValues(0);
  masterNode.gain.setValueAtTime(0, 0);
  if (fadeInSec > 0) {
    masterNode.gain.linearRampToValueAtTime(targetGain, fadeInSec);
  } else {
    masterNode.gain.setValueAtTime(targetGain, 0);
  }

  masterNode.gain.setValueAtTime(targetGain, fadeOutStartSec);
  if (fadeOutSec > 0) {
    masterNode.gain.linearRampToValueAtTime(0.0001, safeDurationSec);
  }
}

function buildExportVoiceStateReader(baseVoiceState, durationSec, brightnessTimeline) {
  const base = sanitizeVoiceState(baseVoiceState);
  const densityAtTime = createDensityTaperAtTime(base.density, durationSec, EXPORT_DENSITY_TAPER_WINDOW_SEC, EXPORT_DENSITY_TAPER_FLOOR);

  return function getVoiceStateAtTime(timeSec) {
    return {
      musicVol: base.musicVol,
      density: densityAtTime(timeSec),
      brightness: sampleTimelineAtTime(brightnessTimeline, timeSec),
    };
  };
}

function renderOfflineVoiceTimeline(audioCtx, durationSec, getVoiceStateAtTime, targetBus, profile = {}, rand = Math.random, options = {}) {
  const composeNextEvent = createVoiceComposer(profile, rand);
  const renderNoteAtTime = createTimedNoteRenderer(audioCtx, targetBus, profile, rand);
  const safeDurationSec = Math.max(1, finiteOr(durationSec, EXPORT_DURATION_SEC));
  const scheduleCutoffSec = clamp(finiteOr(options.scheduleCutoffSec, safeDurationSec), 0, safeDurationSec);
  const noteTailCutoffSec = clamp(finiteOr(options.noteTailCutoffSec, safeDurationSec), 0, safeDurationSec);
  const panSampler = options && typeof options.panSampler?.sample === "function" ? options.panSampler : null;
  const voiceId = options && typeof options.voiceId === "string" ? options.voiceId : "";
  const maxEvents = 24000;
  let nextNoteAt = 0;
  let noteCount = 0;

  for (let i = 0; i < maxEvents; i++) {
    const stateNow = sanitizeVoiceState(getVoiceStateAtTime(nextNoteAt));
    const event = composeNextEvent(stateNow);
    nextNoteAt += event.waitSeconds;
    if (nextNoteAt >= scheduleCutoffSec) break;

    const stateAtNote = sanitizeVoiceState(getVoiceStateAtTime(nextNoteAt));
    event.note.bright = stateAtNote.brightness;
    if (panSampler && voiceId) {
      event.note.pan = panSampler.sample(voiceId);
    }
    if ((nextNoteAt + event.note.dur) > noteTailCutoffSec) break;

    renderNoteAtTime(nextNoteAt, event.note);
    noteCount += 1;
  }

  return noteCount;
}

function concatUint8Arrays(chunks) {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function floatSampleToInt16(sample) {
  const s = clamp(sample, -1, 1);
  return s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
}

function loadExternalScript(url) {
  if (externalScriptPromises.has(url)) return externalScriptPromises.get(url);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Script load failed: ${url}`));
    document.head.appendChild(script);
  });

  externalScriptPromises.set(url, promise);
  return promise;
}

async function loadExportCodecModules() {
  if (!exportCodecModulesPromise) {
    exportCodecModulesPromise = (async () => {
      const [, id3Module] = await Promise.all([
        loadExternalScript(EXPORT_LIB_LAME_URL),
        import(EXPORT_LIB_ID3_URL),
      ]);

      const lameGlobal = window.lamejs;

      if (!lameGlobal || typeof lameGlobal.Mp3Encoder !== "function") {
        throw new Error("MP3 encoder module did not load");
      }
      if (!id3Module || typeof id3Module.ID3Writer !== "function") {
        throw new Error("ID3 writer module did not load");
      }

      return {
        Mp3Encoder: lameGlobal.Mp3Encoder,
        ID3Writer: id3Module.ID3Writer,
      };
    })();
  }

  return exportCodecModulesPromise;
}

async function getExportArtworkBytes() {
  if (!exportArtworkBytesPromise) {
    exportArtworkBytesPromise = (async () => {
      const res = await fetch("./aftertone.png");
      if (!res.ok) throw new Error("Artwork fetch failed");
      const ab = await res.arrayBuffer();
      return new Uint8Array(ab);
    })();
  }

  return exportArtworkBytesPromise;
}

async function encodeAudioBufferToMp3(audioBuffer, bitRateKbps, Mp3Encoder, progressCallback = null) {
  const channelCount = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const frameCount = audioBuffer.length;
  const chunkSize = 1152;
  const left = audioBuffer.getChannelData(0);
  const right = channelCount > 1 ? audioBuffer.getChannelData(1) : null;
  const encoder = new Mp3Encoder(channelCount, sampleRate, bitRateKbps);
  const out = [];

  for (let i = 0; i < frameCount; i += chunkSize) {
    const n = Math.min(chunkSize, frameCount - i);
    const leftChunk = new Int16Array(n);
    for (let j = 0; j < n; j++) leftChunk[j] = floatSampleToInt16(left[i + j]);

    let mp3buf;
    if (channelCount > 1 && right) {
      const rightChunk = new Int16Array(n);
      for (let j = 0; j < n; j++) rightChunk[j] = floatSampleToInt16(right[i + j]);
      mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    } else {
      mp3buf = encoder.encodeBuffer(leftChunk);
    }

    if (mp3buf.length > 0) out.push(new Uint8Array(mp3buf));

    if ((i / chunkSize) % 240 === 0) {
      if (progressCallback) progressCallback(i / frameCount);
      await sleep(0);
    }
  }

  const flush = encoder.flush();
  if (flush.length > 0) out.push(new Uint8Array(flush));
  if (progressCallback) progressCallback(1);
  return concatUint8Arrays(out);
}

function addId3Tags(mp3Bytes, ID3Writer, metadata) {
  const source = mp3Bytes.buffer.slice(mp3Bytes.byteOffset, mp3Bytes.byteOffset + mp3Bytes.byteLength);
  const writer = new ID3Writer(source);
  const normalizedTrack = Number.isInteger(metadata.track)
    ? ((metadata.track - 1) % 9999 + 9999) % 9999 + 1
    : null;
  writer.setFrame("TIT2", metadata.title);
  writer.setFrame("TPE1", [metadata.artist]);
  writer.setFrame("TALB", metadata.album);
  if (normalizedTrack != null) writer.setFrame("TRCK", String(normalizedTrack));
  if (metadata.year != null) writer.setFrame("TYER", String(metadata.year));
  const genre = typeof metadata.genre === "string" ? metadata.genre.trim() : "";
  if (genre) {
    const genreId = Number.isInteger(metadata.genreId) ? metadata.genreId : null;
    const genreValue = genreId != null ? `(${genreId})${genre}` : genre;
    writer.setFrame("TCON", [genreValue]);
  }
  writer.setFrame("COMM", {
    description: "aftertone",
    text: metadata.comment,
    language: "eng",
  });

  if (metadata.artworkBytes) {
    writer.setFrame("APIC", {
      type: 3,
      data: metadata.artworkBytes,
      description: "Cover",
      useUnicodeEncoding: false,
    });
  }

  writer.addTag();
  return new Uint8Array(writer.arrayBuffer);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getExportTrackLabel() {
  return `Export ${EXPORT_DURATION_SEC}s MP3`;
}

export function setExportLedPhase(phase) {
  const nextPhase = typeof phase === "string" ? phase : "idle";
  if (nextPhase === exportLedPhase) return;
  exportLedPhase = nextPhase;
  exportLedPhaseStartedAtMs = performance.now();
  if (nextPhase !== "encoding") exportLedEncodingProgress = 0;
}

export function setExportLedEncodingProgress(progress01) {
  exportLedEncodingProgress = clamp(progress01, 0, 1);
}

export function getExportLedLevel(nowMs) {
  const elapsedMs = Math.max(0, nowMs - exportLedPhaseStartedAtMs);

  if (exportLedPhase === "loading") {
    const cycleMs = elapsedMs % 1300;
    const pulseA = Math.max(0, 1 - Math.abs(cycleMs - 180) / 150);
    const pulseB = Math.max(0, 1 - Math.abs(cycleMs - 430) / 150);
    return 0.24 + Math.max(pulseA, pulseB) * 0.20;
  }

  if (exportLedPhase === "rendering") {
    const wave = 0.5 + 0.5 * Math.sin((elapsedMs / 1000) * Math.PI * 2 * 0.42);
    return 0.55 + wave * 0.20;
  }

  if (exportLedPhase === "encoding") {
    const wave = 0.5 + 0.5 * Math.sin((elapsedMs / 1000) * Math.PI * 2 * 1.6);
    const base = 0.45 + exportLedEncodingProgress * 0.47;
    return clamp(base + wave * 0.05, 0, 1);
  }

  if (exportLedPhase === "tagging") {
    const wave = 0.5 + 0.5 * Math.sin((elapsedMs / 1000) * Math.PI * 2 * 2.4);
    return 0.80 + wave * 0.15;
  }

  if (exportLedPhase === "success") {
    if (elapsedMs < 180) return 1;
    const t = clamp((elapsedMs - 180) / 850, 0, 1);
    return 1 - t;
  }

  if (exportLedPhase === "error") {
    if (elapsedMs < 620) {
      const pulseA = Math.max(0, 1 - Math.abs(elapsedMs - 120) / 130);
      const pulseB = Math.max(0, 1 - Math.abs(elapsedMs - 360) / 130);
      return 0.08 + Math.max(pulseA, pulseB) * 0.82;
    }
    const t = clamp((elapsedMs - 620) / 900, 0, 1);
    return (1 - t) * 0.28;
  }

  return 0;
}

export async function exportTrackMp3({ config, updateUi }) {
  if (isExportingTrack) return;
  if (!config) return;

  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineCtx) {
    if (typeof updateUi === "function") updateUi({ text: "Offline N/A" });
    setExportLedPhase("error");
    setTimeout(() => {
      if (typeof updateUi === "function") updateUi({ text: getExportTrackLabel(), disabled: false });
      setExportLedPhase("idle");
    }, 1400);
    return;
  }

  const snapshot = {
    master: config.master,
    noise: {
      control: config.noise.control,
      volume: config.noise.volume,
      db: config.noise.db,
      color: config.noise.color,
      pan: config.noise.pan,
    },
    voices: {
      a: { ...config.voices.a },
      b: { ...config.voices.b },
    },
    sourceMixer: {
      ...config.sourceMixer,
    },
  };

  isExportingTrack = true;
  setExportLedEncodingProgress(0);
  setExportLedPhase("loading");
  if (typeof updateUi === "function") updateUi({ text: "Loading codecs...", disabled: true });

  try {
    const { Mp3Encoder, ID3Writer } = await loadExportCodecModules();
    const artworkBytes = await getExportArtworkBytes().catch(() => null);

    setExportLedPhase("rendering");
    if (typeof updateUi === "function") updateUi({ text: "Rendering..." });

    const frameCount = Math.ceil(EXPORT_DURATION_SEC * EXPORT_SAMPLE_RATE);
    const offlineCtx = new OfflineCtx(2, frameCount, EXPORT_SAMPLE_RATE);
    const exportSeed = getDefaultSeed();
    const rngNoise = createSeededRng(exportSeed ^ 0x1f123bb5);
    const rngA = createSeededRng(exportSeed ^ 0xa5a5a5a5);
    const rngB = createSeededRng(exportSeed ^ 0x5a5a5a5a);
    const rngNudgeA = createSeededRng(exportSeed ^ 0x11aa66bb);
    const rngNudgeB = createSeededRng(exportSeed ^ 0xbb66aa11);
    const rngPan = createSeededRng(exportSeed ^ 0x3c6ef372);
    const panSampler = createTonalPanSampler({ rand: rngPan });

    const graph = await buildGraph(offlineCtx, snapshot, {
      offlineRenderDurationSec: EXPORT_DURATION_SEC,
      noiseRandom: rngNoise,
    });

    scheduleExportMasterFade(offlineCtx, graph.masterGain, snapshot.master, EXPORT_DURATION_SEC);
    applyNoiseColorToNodes(offlineCtx, graph.noiseLP, graph.noiseTilt, snapshot.noise.color);

    const brightnessTimelineA = createBrightnessNudgeTimeline(snapshot.voices.a.brightness, EXPORT_DURATION_SEC, MUSIC_NUDGE_TIMING.a, rngNudgeA);
    const brightnessTimelineB = createBrightnessNudgeTimeline(snapshot.voices.b.brightness, EXPORT_DURATION_SEC, MUSIC_NUDGE_TIMING.b, rngNudgeB);
    scheduleBrightnessTimeline(graph.musicA.musicLP, brightnessTimelineA);
    scheduleBrightnessTimeline(graph.musicB.musicLP, brightnessTimelineB);

    const getVoiceStateA = buildExportVoiceStateReader(snapshot.voices.a, EXPORT_DURATION_SEC, brightnessTimelineA);
    const getVoiceStateB = buildExportVoiceStateReader(snapshot.voices.b, EXPORT_DURATION_SEC, brightnessTimelineB);

    const scheduleCutoffSec = Math.max(0, EXPORT_DURATION_SEC - Math.max(EXPORT_NOTE_END_GUARD_SEC, EXPORT_FADE_OUT_SEC + 0.5));
    const noteTailCutoffSec = Math.max(0, EXPORT_DURATION_SEC - EXPORT_NOTE_TAIL_GUARD_SEC);

    const noteCountA = renderOfflineVoiceTimeline(offlineCtx, EXPORT_DURATION_SEC, getVoiceStateA, graph.musicA.musicBus, graph.voiceA, rngA, {
      scheduleCutoffSec,
      noteTailCutoffSec,
      panSampler,
      voiceId: "a",
    });
    const noteCountB = renderOfflineVoiceTimeline(offlineCtx, EXPORT_DURATION_SEC, getVoiceStateB, graph.musicB.musicBus, graph.voiceB, rngB, {
      scheduleCutoffSec,
      noteTailCutoffSec,
      panSampler,
      voiceId: "b",
    });

    const rendered = await offlineCtx.startRendering();
    setExportLedPhase("encoding");
    if (typeof updateUi === "function") updateUi({ text: "Encoding MP3..." });

    const mp3Bytes = await encodeAudioBufferToMp3(rendered, EXPORT_MP3_BITRATE_KBPS, Mp3Encoder, (progress01) => {
      setExportLedEncodingProgress(progress01);
      if (progress01 >= 0.999) return;
      const pct = Math.floor(progress01 * 100);
      if (typeof updateUi === "function") updateUi({ text: `Encoding ${pct}%...` });
    });

    const fullYear = new Date().getFullYear();

    setExportLedPhase("tagging");
    if (typeof updateUi === "function") updateUi({ text: "Tagging..." });
    const taggedMp3 = addId3Tags(mp3Bytes, ID3Writer, {
      title: "aftertone",
      track: exportSeed,
      artist: "not-unplanned",
      album: "aftertone exports",
      year: fullYear,
      genre: EXPORT_ID3_GENRE,
      genreId: EXPORT_ID3_GENRE_ID,
      comment: `https://not-unplanned.github.io/aftertone/; (ɔ) ${fullYear} Copyleft – all rights reversed; seed=${exportSeed};`,
      artworkBytes,
    });

    const fileName = `aftertone-${EXPORT_DURATION_SEC}s-${exportSeed}.mp3`;
    downloadBlob(new Blob([taggedMp3], { type: "audio/mpeg" }), fileName);

    setExportLedPhase("success");
    if (typeof updateUi === "function") updateUi({ text: "Exported" });
    if (DEBUG_RUNTIME) {
      const nudgeA = Math.max(0, brightnessTimelineA.length - 1);
      const nudgeB = Math.max(0, brightnessTimelineB.length - 1);
      console.debug(`[aftertone] export seed=${exportSeed} notesA=${noteCountA} notesB=${noteCountB} nudgesA=${nudgeA} nudgesB=${nudgeB} file=${fileName}`);
    }
  } catch (err) {
    setExportLedPhase("error");
    if (typeof updateUi === "function") updateUi({ text: "Export failed" });
    console.error("[aftertone] export failed", err);
  } finally {
    isExportingTrack = false;
    setTimeout(() => {
      if (typeof updateUi === "function") updateUi({ text: getExportTrackLabel(), disabled: false });
      setExportLedPhase("idle");
    }, 1400);
  }
}
