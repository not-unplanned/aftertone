// Audio graph wiring and node-level helpers.
import { clamp, finiteOr } from "../shared/utils.js";
import {
  NOISE_PERCEPTUAL_CURVE,
  NOISE_PERCEPTUAL_MAX_DB,
  NOISE_PERCEPTUAL_MAX_GAIN,
  NOISE_PERCEPTUAL_MIN_DB,
  NOISE_PERCEPTUAL_MIN_GAIN,
} from "./constants.js";
import { getVoiceProfiles } from "./voices.js";

export function dbToGain(db) {
  return Math.pow(10, finiteOr(db, 0) / 20);
}

export function gainToDb(gain) {
  return 20 * Math.log10(Math.max(1e-6, finiteOr(gain, 1)));
}

export function mapNoiseVolumeToGain(control01) {
  const control = clamp(finiteOr(control01, 0), 0, 1);
  const shaped = Math.pow(control, NOISE_PERCEPTUAL_CURVE);
  const db = NOISE_PERCEPTUAL_MIN_DB + (NOISE_PERCEPTUAL_MAX_DB - NOISE_PERCEPTUAL_MIN_DB) * shaped;
  return clamp(dbToGain(db), NOISE_PERCEPTUAL_MIN_GAIN, NOISE_PERCEPTUAL_MAX_GAIN);
}

export function formatNoiseVolumeReadout(gain) {
  const safeGain = clamp(finiteOr(gain, NOISE_PERCEPTUAL_MIN_GAIN), NOISE_PERCEPTUAL_MIN_GAIN, NOISE_PERCEPTUAL_MAX_GAIN);
  if (safeGain < 0.01) return safeGain.toFixed(4);
  if (safeGain < 0.1) return safeGain.toFixed(3);
  return safeGain.toFixed(2);
}

export function getSourceMixerLevels(config) {
  const safeConfig = config || {};
  const safeMixer = safeConfig.sourceMixer || {};
  const noise = finiteOr(safeMixer.noise, finiteOr(safeConfig.noise && safeConfig.noise.volume, 0));
  const voiceA = finiteOr(safeMixer.voiceA, finiteOr(safeConfig.voices && safeConfig.voices.a && safeConfig.voices.a.musicVol, 0));
  const voiceB = finiteOr(safeMixer.voiceB, finiteOr(safeConfig.voices && safeConfig.voices.b && safeConfig.voices.b.musicVol, 0));
  return {
    noise: clamp(noise, 0, 1),
    voiceA: clamp(voiceA, 0, 1),
    voiceB: clamp(voiceB, 0, 1),
  };
}

export function setSourceMixerLevelsAtTime(sourceMixer, levels, timeSec) {
  if (!sourceMixer || !levels) return;
  const t = Math.max(0, finiteOr(timeSec, 0));
  if (sourceMixer.noise) sourceMixer.noise.gain.setValueAtTime(clamp(finiteOr(levels.noise, 0), 0, 1), t);
  if (sourceMixer.voiceA) sourceMixer.voiceA.gain.setValueAtTime(clamp(finiteOr(levels.voiceA, 0), 0, 1), t);
  if (sourceMixer.voiceB) sourceMixer.voiceB.gain.setValueAtTime(clamp(finiteOr(levels.voiceB, 0), 0, 1), t);
}

export function applySourceMixerChannelLevel(audioCtx, sourceMixer, channelId, level, timeConstantSec = 0.05) {
  if (!audioCtx || !sourceMixer || !channelId) return;
  const channel = sourceMixer[channelId];
  if (!channel) return;
  const now = audioCtx.currentTime;
  const tc = Math.max(0.0001, finiteOr(timeConstantSec, 0.05));
  channel.gain.setTargetAtTime(clamp(finiteOr(level, 0), 0, 1), now, tc);
}

export function makeReverbIR(ctx, seconds = 2.3, decay = 2.2) {
  // Simple synthetic impulse response (stereo) for ConvolverNode.
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Noise shaped by exponential-ish decay.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buffer;
}

export async function buildNoiseWorklet(ctx) {
  // AudioWorklet keeps noise generation off the main thread (lower UI-jitter risk).
  // Gotcha: addModule is async and must finish before creating AudioWorkletNode.
  const code = `
      class NoiseNode extends AudioWorkletProcessor {
        process(inputs, outputs) {
          const out = outputs[0];
          for (let ch = 0; ch < out.length; ch++) {
            const o = out[ch];
            for (let i = 0; i < o.length; i++) o[i] = (Math.random() * 2 - 1);
          }
          return true;
        }
      }
      registerProcessor('noise-node', NoiseNode);
    `;
  const blob = new Blob([code], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  await ctx.audioWorklet.addModule(url);
  // Safe to revoke after module load; processor code is already compiled/registered.
  URL.revokeObjectURL(url);
  return new AudioWorkletNode(ctx, "noise-node", { numberOfOutputs: 1, outputChannelCount: [2] });
}

export function applyNoiseColorToNodes(audioCtx, lpNode, tiltNode, amount01) {
  // amount01: 0 (white) -> 1 (brown-ish)
  // We do a gentle lowpass + tilt using shelving filters.
  // Map to meaningful ranges.
  const lpHz = 18000 - amount01 * 15500; // 18k -> 2.5k
  const tiltDb = -amount01 * 10; // 0 -> -10 dB highs (darker)
  // setTargetAtTime avoids zipper noise from slider moves on filter params.
  lpNode.frequency.setTargetAtTime(lpHz, audioCtx.currentTime, 0.04);
  tiltNode.gain.setTargetAtTime(tiltDb, audioCtx.currentTime, 0.04);
}

export function applyNoiseColor(audioCtx, lpNode, tiltNode, amount01) {
  if (!audioCtx || !lpNode || !tiltNode) return;
  applyNoiseColorToNodes(audioCtx, lpNode, tiltNode, amount01);
}

export function setMusicBrightnessAtTime(lpNode, amount01, timeSec, timeConstantSec = 0.05) {
  if (!lpNode) return;
  const hz = 1200 + clamp(amount01, 0, 1) * 7800;
  lpNode.frequency.setTargetAtTime(hz, Math.max(0, timeSec), Math.max(0.0001, timeConstantSec));
}

export function applyMusicBrightnessToNode(audioCtx, amount01, lpNode) {
  if (!lpNode) return;
  setMusicBrightnessAtTime(lpNode, amount01, audioCtx.currentTime, 0.05);
}

export function applyMusicBrightness(audioCtx, amount01, lpNode) {
  if (!audioCtx) return;
  applyMusicBrightnessToNode(audioCtx, amount01, lpNode);
}

export function buildMusicChain(audioCtx, masterBus, volume01, profile = {}) {
  const musicGain = audioCtx.createGain();
  musicGain.gain.value = volume01;

  const musicBus = audioCtx.createGain();

  const musicLP = audioCtx.createBiquadFilter();
  musicLP.type = "lowpass";
  musicLP.Q.value = profile.filterQ ?? 0.35;

  // delay
  const delay = audioCtx.createDelay(2.0);
  delay.delayTime.value = profile.delayTime ?? 0.42;
  const delayFB = audioCtx.createGain();
  delayFB.gain.value = profile.delayFeedback ?? 0.22;
  delay.connect(delayFB);
  delayFB.connect(delay);

  // reverb
  const reverb = audioCtx.createConvolver();
  reverb.buffer = makeReverbIR(audioCtx, 2.6, 2.4);

  const reverbMix = audioCtx.createGain();
  reverbMix.gain.value = profile.reverbMix ?? 0.26;

  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.78;
  const meterData = new Float32Array(analyser.fftSize);

  // route music: dry + wet
  musicBus.connect(musicLP);
  musicLP.connect(delay);
  delay.connect(reverb);
  reverb.connect(reverbMix);

  // dry
  musicLP.connect(musicGain);
  // wet
  reverbMix.connect(musicGain);

  musicGain.connect(analyser);
  analyser.connect(masterBus);

  return { musicGain, musicBus, musicLP, delay, delayFB, reverb, reverbMix, analyser, meterData };
}

export async function buildGraph(audioCtx, config, options = {}) {
  const offlineRenderDurationSec = Math.max(0, finiteOr(options.offlineRenderDurationSec, 0));
  const noiseRandom = typeof options.noiseRandom === "function" ? options.noiseRandom : Math.random;
  const sourceLevels = getSourceMixerLevels(config);

  const graphMasterGain = audioCtx.createGain();
  graphMasterGain.gain.value = 0;

  const graphMasterAnalyser = audioCtx.createAnalyser();
  graphMasterAnalyser.fftSize = 1024;
  graphMasterAnalyser.smoothingTimeConstant = 0.78;
  const graphMasterMeterData = new Float32Array(graphMasterAnalyser.fftSize);

  graphMasterGain.connect(graphMasterAnalyser);
  graphMasterAnalyser.connect(audioCtx.destination);

  const graphNoiseGain = audioCtx.createGain();
  graphNoiseGain.gain.value = 0;

  const t0 = audioCtx.currentTime;
  const noiseMod = audioCtx.createOscillator();
  noiseMod.type = "sine";
  noiseMod.frequency.setValueAtTime(0.05, t0);

  const noiseModDepth = audioCtx.createGain();
  noiseModDepth.gain.setValueAtTime(0.002, t0);

  noiseMod.connect(noiseModDepth);
  noiseModDepth.connect(graphNoiseGain.gain);
  noiseMod.start(t0);

  const graphNoisePan = audioCtx.createStereoPanner();
  graphNoisePan.pan.value = config.noise.pan;

  const graphNoiseTilt = audioCtx.createBiquadFilter();
  graphNoiseTilt.type = "highshelf";
  graphNoiseTilt.frequency.value = 2200;

  const graphNoiseLP = audioCtx.createBiquadFilter();
  graphNoiseLP.type = "lowpass";
  graphNoiseLP.Q.value = 0.2;

  let graphNoiseWorklet = null;

  if (offlineRenderDurationSec > 0) {
    const frameCount = Math.max(1, Math.ceil(offlineRenderDurationSec * audioCtx.sampleRate));
    const noiseBuffer = audioCtx.createBuffer(2, frameCount, audioCtx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = noiseBuffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] = (noiseRandom() * 2 - 1);
    }
    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.connect(graphNoiseTilt);
    noiseSource.start(t0);
    noiseSource.stop(t0 + offlineRenderDurationSec);
    graphNoiseWorklet = noiseSource;
  } else {
    graphNoiseWorklet = await buildNoiseWorklet(audioCtx);
    graphNoiseWorklet.connect(graphNoiseTilt);
  }

  graphNoiseTilt.connect(graphNoiseLP);
  graphNoiseLP.connect(graphNoisePan);
  graphNoisePan.connect(graphNoiseGain);
  graphNoiseGain.connect(graphMasterGain);

  const { voiceA, voiceB } = getVoiceProfiles();
  const graphMusicA = buildMusicChain(audioCtx, graphMasterGain, 0, voiceA);
  const graphMusicB = buildMusicChain(audioCtx, graphMasterGain, 0, voiceB);
  const graphSourceMixer = {
    noise: graphNoiseGain,
    voiceA: graphMusicA.musicGain,
    voiceB: graphMusicB.musicGain,
  };
  setSourceMixerLevelsAtTime(graphSourceMixer, sourceLevels, t0);

  return {
    masterGain: graphMasterGain,
    masterMeter: { analyser: graphMasterAnalyser, meterData: graphMasterMeterData },
    sourceMixer: graphSourceMixer,
    noiseGain: graphNoiseGain,
    noisePan: graphNoisePan,
    noiseTilt: graphNoiseTilt,
    noiseLP: graphNoiseLP,
    noiseWorklet: graphNoiseWorklet,
    musicA: graphMusicA,
    musicB: graphMusicB,
    voiceA,
    voiceB,
  };
}
