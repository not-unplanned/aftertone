import { clamp, finiteOr } from "./utils.js";

const ZERO_ADJUSTMENT = { density: 0, brightness: 0 };

export const DEFAULT_TIME_BASED_VOICE_SCHEDULE = {
  enabled: true,
  transitionWindowMinutes: 10,
  dayparts: [
    {
      name: "Night (a)",
      start: "00:00",
      end: "08:00",
      adjustments: {
        density: -0.1,
        brightness: -0.12,
      },
    },
    {
      name: "morning",
      start: "08:00",
      end: "14:00",
      adjustments: {
        density: 0.1,
        brightness: 0.12,
      },
    },
    {
      name: "afternoon",
      start: "14:00",
      end: "18:30",
      adjustments: {
        density: 0,
        brightness: 0,
      },
    },
    {
      name: "evening",
      start: "18:30",
      end: "21:00",
      adjustments: {
        density: -0.08,
        brightness: -0.1,
      },
    },
    {
      name: "Night (b)",
      start: "21:04",
      end: "23:59",
      adjustments: {
        density: -0.18,
        brightness: -0.19,
      },
    },
  ],
};

export function createTimeSource(nowFn = () => new Date()) {
  return {
    now: () => nowFn(),
  };
}

function parseTimeToMinutes(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function toLocalMinutes(date) {
  if (!(date instanceof Date)) return null;
  const hours = date.getHours();
  const minutes = date.getMinutes();
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function normalizeAdjustment(adjustments) {
  return {
    density: finiteOr(adjustments && adjustments.density, 0),
    brightness: finiteOr(adjustments && adjustments.brightness, 0),
  };
}

function normalizeDayparts(dayparts = []) {
  return dayparts
    .map((part) => {
      const startMin = parseTimeToMinutes(part && part.start);
      const endMin = parseTimeToMinutes(part && part.end);
      if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
      if (startMin === endMin) return null;
      return {
        ...part,
        startMin,
        endMin,
        adjustments: normalizeAdjustment(part && part.adjustments),
      };
    })
    .filter(Boolean);
}

function isMinuteInDaypart(daypart, minutes) {
  if (!daypart || !Number.isFinite(minutes)) return false;
  if (daypart.startMin <= daypart.endMin) {
    return minutes >= daypart.startMin && minutes < daypart.endMin;
  }
  return minutes >= daypart.startMin || minutes < daypart.endMin;
}

function minutesUntilDaypartEnd(daypart, minutes) {
  if (!daypart || !Number.isFinite(minutes)) return null;
  if (daypart.startMin <= daypart.endMin) {
    return daypart.endMin - minutes;
  }
  if (minutes >= daypart.startMin) {
    return daypart.endMin + 1440 - minutes;
  }
  return daypart.endMin - minutes;
}

function interpolateAdjustments(a, b, t) {
  const safeT = clamp(finiteOr(t, 0), 0, 1);
  return {
    density: finiteOr(a && a.density, 0) + (finiteOr(b && b.density, 0) - finiteOr(a && a.density, 0)) * safeT,
    brightness: finiteOr(a && a.brightness, 0) + (finiteOr(b && b.brightness, 0) - finiteOr(a && a.brightness, 0)) * safeT,
  };
}

export function resolveTimeBasedVoiceAdjustment(schedule, now = new Date()) {
  if (!schedule || schedule.enabled === false) {
    return {
      adjustment: ZERO_ADJUSTMENT,
      daypart: null,
      nextDaypart: null,
      blend: 0,
    };
  }

  const dayparts = normalizeDayparts(schedule.dayparts);
  if (!dayparts.length) {
    return {
      adjustment: ZERO_ADJUSTMENT,
      daypart: null,
      nextDaypart: null,
      blend: 0,
    };
  }

  const minutes = toLocalMinutes(now);
  if (!Number.isFinite(minutes)) {
    return {
      adjustment: ZERO_ADJUSTMENT,
      daypart: null,
      nextDaypart: null,
      blend: 0,
    };
  }

  const currentIndex = dayparts.findIndex((part) => isMinuteInDaypart(part, minutes));
  if (currentIndex < 0) {
    return {
      adjustment: ZERO_ADJUSTMENT,
      daypart: null,
      nextDaypart: null,
      blend: 0,
    };
  }

  const current = dayparts[currentIndex];
  const transitionWindowMinutes = Math.max(0, finiteOr(schedule.transitionWindowMinutes, 0));
  let adjustment = current.adjustments;
  let nextDaypart = null;
  let blend = 0;

  if (transitionWindowMinutes > 0 && currentIndex < dayparts.length - 1) {
    const minutesUntilEnd = minutesUntilDaypartEnd(current, minutes);
    if (Number.isFinite(minutesUntilEnd) && minutesUntilEnd <= transitionWindowMinutes && minutesUntilEnd >= 0) {
      const next = dayparts[currentIndex + 1];
      blend = clamp(1 - minutesUntilEnd / transitionWindowMinutes, 0, 1);
      adjustment = interpolateAdjustments(current.adjustments, next.adjustments, blend);
      nextDaypart = next && next.name ? next.name : null;
    }
  }

  return {
    adjustment,
    daypart: current && current.name ? current.name : null,
    nextDaypart,
    blend,
  };
}

function applyAdjustmentToVoice(baseVoice, adjustment) {
  if (!baseVoice) return baseVoice;
  const baseDensity = finiteOr(baseVoice.density, 0.5);
  const baseBrightness = finiteOr(baseVoice.brightness, 0.5);
  return {
    ...baseVoice,
    density: clamp(baseDensity + finiteOr(adjustment && adjustment.density, 0), 0, 1),
    brightness: clamp(baseBrightness + finiteOr(adjustment && adjustment.brightness, 0), 0, 1),
  };
}

export function applyTimeBasedVoiceSettings(baseVoices, schedule = DEFAULT_TIME_BASED_VOICE_SCHEDULE, now = new Date()) {
  if (!baseVoices || !schedule || schedule.enabled === false) return baseVoices;
  const { adjustment } = resolveTimeBasedVoiceAdjustment(schedule, now);
  if (!adjustment || adjustment === ZERO_ADJUSTMENT) return baseVoices;

  return {
    ...baseVoices,
    a: applyAdjustmentToVoice(baseVoices.a, adjustment),
    b: applyAdjustmentToVoice(baseVoices.b, adjustment),
  };
}
