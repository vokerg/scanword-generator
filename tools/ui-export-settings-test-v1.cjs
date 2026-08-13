"use strict";

const path = require("node:path");

function assert(condition, message) {
  if (!condition) throw new Error(`UI export-settings test failed: ${message}`);
}

function makeElement(initial = {}) {
  const listeners = new Map();
  const attributes = new Map();
  return {
    value: "",
    min: "",
    max: "",
    checked: false,
    disabled: false,
    innerHTML: "",
    textContent: "",
    ...initial,
    addEventListener(type, callback) { listeners.set(type, callback); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    dispatch(type) {
      const callback = listeners.get(type);
      assert(callback, `missing ${type} listener`);
      callback({ type, target: this });
    },
  };
}

const elements = {
  seed: makeElement({ value: "export-a" }),
  cols: makeElement({ value: "13", min: "11", max: "19" }),
  rows: makeElement({ value: "17", min: "13", max: "27" }),
  poolSize: makeElement({ value: "3500", min: "1000", max: "10000" }),
  targetWords: makeElement({ value: "30", min: "12", max: "60" }),
  clueDensity: makeElement({ value: "27", min: "16", max: "38" }),
  showAnswers: makeElement(),
  generate: makeElement(),
  downloadSvg: makeElement(),
  downloadJson: makeElement(),
  printA5: makeElement(),
  stats: makeElement(),
  preview: makeElement(),
  wordsTable: makeElement(),
  generationStatus: makeElement({ textContent: "ready" }),
};

const timers = [];
function escapeXml(value) { return String(value); }

global.window = global;
global.document = {
  querySelector(selector) { return elements[String(selector).replace(/^#/, "")] || null; },
  createElement() { return { href: "", download: "", click() {} }; },
};
window.setTimeout = (callback) => { timers.push(callback); return timers.length; };
window.print = () => {};
window.RUSSIAN_WORDS = Array.from({ length: 40966 }, (_, index) => `WORD-${index}`);
window.ScanwordCore = {
  DIRECTIONS: { right: { label: "right", arrow: "→" }, down: { label: "down", arrow: "↓" } },
  createMask() {}, extractSlots() {}, analyzeAssignments() {},
};
window.ScanwordRenderer = { escapeXml, renderSvg() { return '<svg width="148mm"></svg>'; } };
window.ScanwordSolver = {
  generateBest(seed, poolSize, rows, cols, targetWords, clueDensity) {
    return {
      rows, cols,
      pool: Array.from({ length: Math.min(poolSize, 3) }, (_, index) => ({ answer: `ТЕСТ${index}` })),
      grid: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: "panel", char: null, slotIds: [], clues: [], footprintId: null }))),
      placed: [{ id: 1, clue: `Подсказка ${seed}`, answer: "ТЕСТ", length: 4, direction: "right", startRow: 0, startCol: 0 }],
      clueFootprints: [], intersections: 0, fillRatio: 0.1, answerCoverage: 0.1,
      clueTextCells: 1, panelCells: rows * cols - 1, panelRatio: 0.9, components: 1,
      coverageCheckpoint: 0.1, externalClueTexts: 0, panelRegions: 1, isolatedPanels: 0,
      attempt: 0, attemptBudget: 1, targetWords, clueDensity,
    };
  },
  validateGrid() { return { valid: true, accidentalRuns: [], conflicts: 0, orphanLetters: 0, clueDirectionConflicts: 0 }; },
};

function flush() {
  assert(timers.length === 1, `expected one queued generation, got ${timers.length}`);
  timers.shift()();
}

function assertSettings(actual, expected, label) {
  assert(actual && typeof actual === "object", `${label}: missing generationSettings`);
  for (const [key, value] of Object.entries(expected)) {
    assert(actual[key] === value, `${label}: ${key}=${actual[key]}, expected ${value}`);
  }
}

require(path.resolve(__dirname, "..", "ui.js"));
flush();

const api = window.ScanwordGenerator;
const resultA = api.getCurrentResult();
const settingsA = { seed: "export-a", cols: 13, rows: 17, poolSize: 3500, targetWords: 30, clueDensity: 27 };
const exportA = api.exportResult(resultA);
assert(exportA.version === "0.9.0", "existing export version changed");
assert(exportA.seed === settingsA.seed, "top-level seed lost result binding");
assertSettings(exportA.generationSettings, settingsA, "initial export");

// Editing visible controls must not rewrite metadata for an already-generated result.
elements.seed.value = "uncommitted-control-seed";
elements.poolSize.value = "9999";
assertSettings(api.exportResult(resultA).generationSettings, settingsA, "edited-control export");

// Publish a second result with different effective settings.
elements.seed.value = "export-b";
elements.cols.value = "19";
elements.rows.value = "27";
elements.poolSize.value = "10000";
elements.targetWords.value = "60";
elements.clueDensity.value = "16";
elements.generate.dispatch("click");
flush();
const resultB = api.getCurrentResult();
const settingsB = { seed: "export-b", cols: 19, rows: 27, poolSize: 10000, targetWords: 60, clueDensity: 16 };
assert(resultB !== resultA, "second generation did not publish a new result object");
const exportB = api.exportResult(resultB);
assert(exportB.seed === settingsB.seed, "new result top-level seed is incorrect");
assertSettings(exportB.generationSettings, settingsB, "second export");

// Historical result metadata must remain stable after a later result becomes current.
const historicalA = api.exportResult(resultA);
assert(historicalA.seed === settingsA.seed, "historical result top-level seed drifted after later generation");
assertSettings(historicalA.generationSettings, settingsA, "historical export");

// Exported metadata must be a copy, not a mutable reference to internal settings state.
historicalA.generationSettings.seed = "tampered";
historicalA.generationSettings.poolSize = 1;
const historicalAgain = api.exportResult(resultA);
assertSettings(historicalAgain.generationSettings, settingsA, "historical export after tamper");

console.log(JSON.stringify({
  passed: true,
  additiveGenerationSettings: true,
  resultBoundAcrossControlEdits: true,
  historicalResultBinding: true,
  metadataCopyIsolation: true,
  versionPreserved: "0.9.0",
}));
