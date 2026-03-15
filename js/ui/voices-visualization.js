import { clamp } from "../shared/utils.js";

const NOISE_COLORS = {
  white: [232, 234, 238],
  pink: [232, 168, 188],
  brown: [158, 116, 86],
};

const NOISE_SCALE = 4;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function getNoiseColor(amount) {
  const t = clamp(amount, 0, 1);
  if (t <= 0.5) return mixColor(NOISE_COLORS.white, NOISE_COLORS.pink, t * 2);
  return mixColor(NOISE_COLORS.pink, NOISE_COLORS.brown, (t - 0.5) * 2);
}

function getVoicePalette(baseHue, brightness) {
  const t = clamp(brightness, 0, 1);
  const hue = baseHue + (t - 0.5) * 30;
  const sat = 40 + t * 45;
  const light = 24 + t * 52;
  return { hue, sat, light };
}

export function createVoicesVisualization(canvas, getState) {
  if (!canvas) return { destroy: () => {} };
  const ctx = canvas.getContext("2d");
  if (!ctx) return { destroy: () => {} };

  const noiseCanvas = document.createElement("canvas");
  const noiseCtx = noiseCanvas.getContext("2d", { willReadFrequently: true });

  const stage = {
    width: 0,
    height: 0,
    dpr: 1,
    noiseW: 0,
    noiseH: 0,
    noiseImage: null,
    noiseData: null,
    background: null,
  };

  const smooth = {
    noise: 0,
    noiseColor: 0,
    noisePan: 0,
    ampA: 0,
    ampB: 0,
    brightA: 0,
    brightB: 0,
  };

  let rafId = 0;
  let lastTime = performance.now();

  function buildBackground(width, height) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#0b0b10");
    gradient.addColorStop(1, "#0a0a12");
    return gradient;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const pixelW = Math.max(1, Math.floor(width * dpr));
    const pixelH = Math.max(1, Math.floor(height * dpr));

    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stage.width = width;
    stage.height = height;
    stage.dpr = dpr;
    stage.background = buildBackground(width, height);

    const noiseW = Math.max(1, Math.floor(width / NOISE_SCALE));
    const noiseH = Math.max(1, Math.floor(height / NOISE_SCALE));
    if (noiseCanvas.width !== noiseW || noiseCanvas.height !== noiseH) {
      noiseCanvas.width = noiseW;
      noiseCanvas.height = noiseH;
      stage.noiseW = noiseW;
      stage.noiseH = noiseH;
      if (noiseCtx) {
        stage.noiseImage = noiseCtx.createImageData(noiseW, noiseH);
        stage.noiseData = stage.noiseImage.data;
      }
    }
  }

  function drawNoise(noiseLevel, noiseColor, noisePan) {
    if (!noiseCtx || !stage.noiseImage || !stage.noiseData) return;
    const { noiseW, noiseH } = stage;
    const data = stage.noiseData;
    const base = getNoiseColor(noiseColor);
    const intensityBase = 0.08 + noiseLevel * 0.7;
    const panStrength = clamp(noisePan, -1, 1) * 0.45;
    let i = 0;

    for (let y = 0; y < noiseH; y++) {
      for (let x = 0; x < noiseW; x++) {
        const grain = Math.random();
        const xNorm = noiseW > 1 ? x / (noiseW - 1) : 0.5;
        const panFactor = 1 + panStrength * (xNorm * 2 - 1);
        const lum = 0.45 + grain * 0.55;
        const alpha = clamp(intensityBase * (0.35 + grain * 0.65) * panFactor, 0, 1);

        data[i] = Math.round(base[0] * lum);
        data[i + 1] = Math.round(base[1] * lum);
        data[i + 2] = Math.round(base[2] * lum);
        data[i + 3] = Math.round(alpha * 255);
        i += 4;
      }
    }

    noiseCtx.putImageData(stage.noiseImage, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(noiseCanvas, 0, 0, stage.width, stage.height);
    ctx.restore();
  }

  function drawVoiceCircle(x, y, radius, palette, intensity) {
    if (radius <= 0.2) return;
    const { hue, sat, light } = palette;
    const glowRadius = radius * 1.45;
    const glow = ctx.createRadialGradient(x, y, radius * 0.15, x, y, glowRadius);
    glow.addColorStop(0, `hsla(${hue}, ${sat}%, ${light}%, ${0.65 * intensity})`);
    glow.addColorStop(1, `hsla(${hue}, ${sat}%, ${light}%, 0)`);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const core = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
    core.addColorStop(0, `hsla(${hue}, ${sat}%, ${Math.min(92, light + 18)}%, ${0.9 * intensity})`);
    core.addColorStop(1, `hsla(${hue}, ${sat}%, ${light}%, ${0.12 + intensity * 0.28})`);

    ctx.save();
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, radius * 0.05);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${Math.min(90, light + 24)}%, ${0.5 + intensity * 0.3})`;
    ctx.stroke();
    ctx.restore();
  }

  function render(now) {
    const snapshot = typeof getState === "function" ? getState() : null;
    if (!snapshot) {
      rafId = requestAnimationFrame(render);
      return;
    }

    const { width, height } = stage;
    if (width <= 1 || height <= 1) {
      rafId = requestAnimationFrame(render);
      return;
    }

    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    const smoothing = 1 - Math.exp(-dt * 8);

    const noiseLevel = clamp(snapshot.noise && snapshot.noise.control, 0, 1);
    const noiseColor = clamp(snapshot.noise && snapshot.noise.color, 0, 1);
    const noisePan = clamp(snapshot.noise && snapshot.noise.pan, -1, 1);
    const activity = snapshot.running && !snapshot.paused ? 1 : 0;
    const ampA = clamp(snapshot.voices && snapshot.voices.a && snapshot.voices.a.amplitude, 0, 1) * activity;
    const ampB = clamp(snapshot.voices && snapshot.voices.b && snapshot.voices.b.amplitude, 0, 1) * activity;
    const brightA = clamp(snapshot.voices && snapshot.voices.a && snapshot.voices.a.brightness, 0, 1);
    const brightB = clamp(snapshot.voices && snapshot.voices.b && snapshot.voices.b.brightness, 0, 1);

    smooth.noise = lerp(smooth.noise, noiseLevel, smoothing);
    smooth.noiseColor = lerp(smooth.noiseColor, noiseColor, smoothing);
    smooth.noisePan = lerp(smooth.noisePan, noisePan, smoothing);
    smooth.ampA = lerp(smooth.ampA, ampA, smoothing);
    smooth.ampB = lerp(smooth.ampB, ampB, smoothing);
    smooth.brightA = lerp(smooth.brightA, brightA, smoothing);
    smooth.brightB = lerp(smooth.brightB, brightB, smoothing);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = stage.background || "#0a0a12";
    ctx.fillRect(0, 0, width, height);

    drawNoise(smooth.noise, smooth.noiseColor, smooth.noisePan);

    const maxRadius = Math.min(width, height) * 0.32;
    const y = height * 0.54;
    const xA = width * 0.33;
    const xB = width * 0.67;
    const paletteA = getVoicePalette(210, smooth.brightA);
    const paletteB = getVoicePalette(24, smooth.brightB);
    drawVoiceCircle(xA, y, smooth.ampA * maxRadius, paletteA, 0.5 + smooth.ampA * 0.5);
    drawVoiceCircle(xB, y, smooth.ampB * maxRadius, paletteB, 0.5 + smooth.ampB * 0.5);

    rafId = requestAnimationFrame(render);
  }

  let observer = null;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => resize());
    observer.observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }
  resize();
  rafId = requestAnimationFrame(render);

  return {
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      else window.removeEventListener("resize", resize);
    },
  };
}
