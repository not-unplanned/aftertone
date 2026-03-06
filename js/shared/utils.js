// Shared utility helpers (math, RNG, timing).
export function r01(x) {
  return x / 100;
}

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeSeed(seed) {
  const n = Number(seed);
  if (!Number.isFinite(n)) return 1;
  return (Math.floor(n) >>> 0) || 1;
}

export function getDefaultSeed() {
  if (window.crypto && window.crypto.getRandomValues) {
    const seed = new Uint32Array(1);
    window.crypto.getRandomValues(seed);
    return normalizeSeed(seed[0]);
  }
  return normalizeSeed(Date.now());
}

export function createSeededRng(seed) {
  let state = normalizeSeed(seed);
  return function next() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randBetweenWith(rand, min, max) {
  return min + rand() * (max - min);
}
