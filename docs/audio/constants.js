// Audio + export constants shared across modules.
export const DEBUG_RUNTIME = new URLSearchParams(window.location.search).has("debug");

export const SCHEDULER_LATE_WARN_MS = 180;
export const SCHEDULER_REPORT_EVERY_MS = 60000;

export const EXPORT_DURATION_SEC = 864;
export const EXPORT_SAMPLE_RATE = 44100;
export const EXPORT_MP3_BITRATE_KBPS = 256;
export const EXPORT_FADE_IN_SEC = 2.0;
export const EXPORT_FADE_OUT_SEC = 3.0;
export const EXPORT_NOTE_END_GUARD_SEC = 12;
export const EXPORT_NOTE_TAIL_GUARD_SEC = 2;
export const EXPORT_DENSITY_TAPER_WINDOW_SEC = 150;
export const EXPORT_DENSITY_TAPER_FLOOR = 0.22;
export const EXPORT_LIB_LAME_URL = "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
export const EXPORT_LIB_ID3_URL = "https://cdn.jsdelivr.net/npm/browser-id3-writer@6.3.1/dist/browser-id3-writer.mjs";
export const EXPORT_ID3_GENRE = "Ambient";
export const EXPORT_ID3_GENRE_ID = 26;

export const NOISE_PERCEPTUAL_MIN_DB = -52;
export const NOISE_PERCEPTUAL_MAX_DB = -2;
export const NOISE_PERCEPTUAL_CURVE = 1.85;
export const NOISE_PERCEPTUAL_MIN_GAIN = Math.pow(10, NOISE_PERCEPTUAL_MIN_DB / 20);
export const NOISE_PERCEPTUAL_MAX_GAIN = Math.pow(10, NOISE_PERCEPTUAL_MAX_DB / 20);

export const MUSIC_NUDGE_STEP = 0.03;
export const MUSIC_NUDGE_MAX = 0.12;
export const MUSIC_NUDGE_TIMING = {
  a: {
    initialMinSec: 8,
    initialMaxSec: 16,
    nextMinSec: 12,
    nextMaxSec: 38,
  },
  b: {
    initialMinSec: 10,
    initialMaxSec: 20,
    nextMinSec: 15,
    nextMaxSec: 45,
  },
};

export const FADE_IN_SEC = 2.0;
export const FADE_PAUSE_SEC = 1.0;
export const FADE_OUT_SEC = 3.0;
