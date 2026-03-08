// UI element lookup, readouts, LED helpers, and event wiring.
import { clamp } from "../shared/utils.js";

const $ = (id) => document.getElementById(id);

export function getUiElements() {
  return {
    toggle: $("toggle"),
    exportTrack: $("exportTrack"),
    exportLed: $("exportLed"),
    status: $("status"),
    master: $("master"),
    noiseVol: $("noiseVol"),
    noiseColor: $("noiseColor"),
    noisePan: $("noisePan"),
    musicVol: $("musicVol"),
    density: $("density"),
    brightness: $("brightness"),
    musicVol2: $("musicVol2"),
    density2: $("density2"),
    brightness2: $("brightness2"),
    masterLed: $("masterLed"),
    noiseLed: $("noiseLed"),
    musicLedA: $("musicLedA"),
    musicLedB: $("musicLedB"),
    masterVal: $("masterVal"),
    noiseVolVal: $("noiseVolVal"),
    noiseColorVal: $("noiseColorVal"),
    noisePanVal: $("noisePanVal"),
    musicVolVal: $("musicVolVal"),
    densityVal: $("densityVal"),
    brightnessVal: $("brightnessVal"),
    musicVol2Val: $("musicVol2Val"),
    density2Val: $("density2Val"),
    brightness2Val: $("brightness2Val"),
  };
}

function setVal(node, v) {
  const text = typeof v === "number" ? v.toFixed(2) : String(v);
  node.textContent = text;
}

export function updateReadouts(ui, config, formatNoiseVolumeReadout) {
  setVal(ui.masterVal, config.master);
  setVal(ui.noiseVolVal, formatNoiseVolumeReadout(config.noise.volume));
  setVal(ui.noiseColorVal, config.noise.color);
  setVal(ui.noisePanVal, config.noise.pan);
  setVal(ui.musicVolVal, config.voices.a.musicVol);
  setVal(ui.densityVal, config.voices.a.density);
  setVal(ui.brightnessVal, config.voices.a.brightness);
  setVal(ui.musicVol2Val, config.voices.b.musicVol);
  setVal(ui.density2Val, config.voices.b.density);
  setVal(ui.brightness2Val, config.voices.b.brightness);
}

export function setLedLevel(node, amount01) {
  if (!node) return;
  const level = clamp(amount01, 0, 1);
  const body = 0.22 + level * 0.78;
  const glowSize = 2 + level * 12;
  const glowAlpha = 0.08 + level * 0.72;
  const edgeAlpha = 0.12 + level * 0.45;

  node.style.opacity = (0.24 + level * 0.76).toFixed(3);
  node.style.background = `rgba(255, 52, 42, ${body.toFixed(3)})`;
  node.style.boxShadow = `inset 0 0 2px rgba(255, 210, 210, ${edgeAlpha.toFixed(3)}), 0 0 ${glowSize.toFixed(2)}px rgba(255, 52, 42, ${glowAlpha.toFixed(3)})`;
}

export function bindUi(ui, handlers = {}) {
  const {
    onSpaceToggle,
    onToggleClick,
    onExportClick,
    onMasterInput,
    onNoiseVolInput,
    onNoisePanInput,
    onNoiseColorInput,
    onMusicVolInput,
    onBrightnessInput,
    onDensityInput,
    onMusicVol2Input,
    onBrightness2Input,
    onDensity2Input,
  } = handlers;

  document.addEventListener("keydown", async (event) => {
    const isSpace = event.code === "Space" || event.key === " " || event.key === "Spacebar";
    if (!isSpace) return;
    if (event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.isContentEditable) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
    }

    event.preventDefault();
    if (typeof onSpaceToggle === "function") await onSpaceToggle();
  });

  ui.toggle.addEventListener("click", async () => {
    if (typeof onToggleClick === "function") await onToggleClick();
  });

  ui.exportTrack.addEventListener("click", async () => {
    if (typeof onExportClick === "function") await onExportClick();
  });

  ui.master.addEventListener("input", () => {
    if (typeof onMasterInput === "function") onMasterInput();
  });

  ui.noiseVol.addEventListener("input", () => {
    if (typeof onNoiseVolInput === "function") onNoiseVolInput();
  });

  ui.noisePan.addEventListener("input", () => {
    if (typeof onNoisePanInput === "function") onNoisePanInput();
  });

  ui.noiseColor.addEventListener("input", () => {
    if (typeof onNoiseColorInput === "function") onNoiseColorInput();
  });

  ui.musicVol.addEventListener("input", () => {
    if (typeof onMusicVolInput === "function") onMusicVolInput();
  });

  ui.brightness.addEventListener("input", () => {
    if (typeof onBrightnessInput === "function") onBrightnessInput();
  });

  ui.density.addEventListener("input", () => {
    if (typeof onDensityInput === "function") onDensityInput();
  });

  ui.musicVol2.addEventListener("input", () => {
    if (typeof onMusicVol2Input === "function") onMusicVol2Input();
  });

  ui.brightness2.addEventListener("input", () => {
    if (typeof onBrightness2Input === "function") onBrightness2Input();
  });

  ui.density2.addEventListener("input", () => {
    if (typeof onDensity2Input === "function") onDensity2Input();
  });
}
