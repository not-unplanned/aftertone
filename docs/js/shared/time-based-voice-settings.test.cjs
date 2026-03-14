#!/usr/bin/env node
"use strict";

const path = require("path");
const { pathToFileURL } = require("url");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approxEqual(actual, expected, epsilon, label) {
  const delta = Math.abs(actual - expected);
  if (delta > epsilon) {
    throw new Error(`${label} expected ${expected} got ${actual}`);
  }
}

async function run() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, "time-based-voice-settings.js"));
  const {
    applyTimeBasedVoiceSettings,
    resolveTimeBasedVoiceAdjustment,
  } = await import(moduleUrl);

  const schedule = {
    enabled: true,
    logTransitions: false,
    transitionWindowMinutes: 10,
    dayparts: [
      {
        name: "afternoon",
        start: "14:00",
        end: "18:30",
        adjustments: { density: 0.1, brightness: 0.05 },
      },
      {
        name: "evening",
        start: "18:30",
        end: "23:30",
        adjustments: { density: -0.1, brightness: -0.08 },
      },
    ],
  };

  const baseVoices = {
    a: { density: 0.5, brightness: 0.5, musicVol: 0.7 },
    b: { density: 0.5, brightness: 0.5, musicVol: 0.7 },
  };

  const afternoonResult = resolveTimeBasedVoiceAdjustment(schedule, new Date(2026, 2, 8, 15, 0, 0));
  assert(afternoonResult.daypart === "afternoon", "expected afternoon daypart selection");

  const eveningResult = resolveTimeBasedVoiceAdjustment(schedule, new Date(2026, 2, 8, 19, 0, 0));
  assert(eveningResult.daypart === "evening", "expected evening daypart selection");

  const transitionSchedule = {
    enabled: true,
    logTransitions: false,
    transitionWindowMinutes: 10,
    dayparts: [
      {
        name: "afternoon",
        start: "14:00",
        end: "18:30",
        adjustments: { density: 0, brightness: 0 },
      },
      {
        name: "evening",
        start: "18:30",
        end: "23:30",
        adjustments: { density: -0.3, brightness: -0.2 },
      },
    ],
  };

  const transitionVoices = {
    a: { density: 0.9, brightness: 0.05, musicVol: 0.7 },
    b: { density: 0.9, brightness: 0.05, musicVol: 0.7 },
  };

  const transitionDate = new Date(2026, 2, 8, 18, 25, 0);
  const transitionApplied = applyTimeBasedVoiceSettings(transitionVoices, transitionSchedule, transitionDate);
  approxEqual(transitionApplied.a.density, 0.75, 1e-6, "density interpolation");
  approxEqual(transitionApplied.b.density, 0.75, 1e-6, "density interpolation (voice b)");
  assert(transitionApplied.a.brightness === 0, "brightness should clamp at 0");
  assert(transitionApplied.b.brightness === 0, "brightness should clamp at 0 (voice b)");

  const fallback = applyTimeBasedVoiceSettings(baseVoices, null, new Date(2026, 2, 8, 12, 0, 0));
  assert(fallback.a.density === baseVoices.a.density, "fallback should keep base density");
  assert(fallback.a.brightness === baseVoices.a.brightness, "fallback should keep base brightness");
  assert(fallback.b.density === baseVoices.b.density, "fallback should keep base density (voice b)");
  assert(fallback.b.brightness === baseVoices.b.brightness, "fallback should keep base brightness (voice b)");

  console.log("time-based voice settings tests passed");
}

run().catch((err) => {
  console.error(`time-based voice settings tests failed: ${err && err.message ? err.message : err}`);
  process.exitCode = 1;
});
