"use strict";

const fs = require("node:fs");
const path = require("node:path");

function assert(condition, message) {
  if (!condition) throw new Error(`UI effective-settings test failed: ${message}`);
}

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function inputConfig(id) {
  const match = html.match(new RegExp(`<input\\s+id=["']${id}["'][^>]*>`, "i"));
  assert(match, `missing #${id} input in index.html`);
  const tag = match[0];
  const attr = (name) => tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"))?.[1] ?? "";
  return { value: attr("value"), min: attr("min"), max: attr("max") };
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
  seed: makeElement(inputConfig("seed")),
  cols: makeElement(inputConfig("cols")),
  rows: makeElement(inputConfig("rows")),
  poolSize: makeElement(inputConfig("poolSize")),
  targetWords: makeElement(inputConfig("targetWords")),
  clueDensity: makeElement(inputConfig("clueDensity")),
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
let lastGenerationSettings = null;

global.window = global;
global.document = {
  querySelector(selector) { return elements[String(selector).replace(/^#/, "")] || null; },
  createElement() { return { href: "", download: "", click() {} }; },
};
window.setTimeout = (callback) => {
  timers.push(callback);
  return timers.length;
};
window.print = () => {};
window.RUSSIAN_WORDS = Array.from({ length: 40966 }, (_, index) => `WORD-${index}`);
window.ScanwordCore = {
  DIRECTIONS: { right: { label: "right", arrow: "→" }, down: { label: "down", arrow: "↓" } },
  createMask() {},
  extractSlots() {},
  analyzeAssignments() {},
};
window.ScanwordRenderer = {
  escapeXml(value) { return String(value); },
  renderSvg() { return '<svg width="148mm"></svg>'; },
};
window.ScanwordSolver = {
  generateBest(seed, poolSize, rows, cols, targetWords, clueDensity) {
    lastGenerationSettings = { seed, poolSize, rows, cols, targetWords, clueDensity };
    return {
      seed,
      rows,
      cols,
      pool: [{ answer: "ТЕСТ" }],
      grid: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: "panel", char: null, slotIds: [], clues: [], footprintId: null }))),
      placed: [{ id: 1, clue: "Подсказка", answer: "ТЕСТ", length: 4, direction: "right", startRow: 0, startCol: 0 }],
      clueFootprints: [],
      intersections: 0,
      fillRatio: 0.1,
      answerCoverage: 0.1,
      clueTextCells: 1,
      panelCells: rows * cols - 1,
      panelRatio: 0.9,
      components: 1,
      coverageCheckpoint: 0.1,
      externalClueTexts: 0,
      panelRegions: 1,
      isolatedPanels: 0,
      attempt: 0,
      attemptBudget: 1,
    };
  },
  validateGrid() {
    return { valid: true, accidentalRuns: [], conflicts: 0, orphanLetters: 0, clueDirectionConflicts: 0 };
  },
};

function flushGeneration() {
  assert(timers.length === 1, `expected one queued generation, got ${timers.length}`);
  timers.shift()();
}

function assertEffective(expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    assert(elements[key].value === String(value), `${label}: visible ${key}=${elements[key].value}, expected ${value}`);
  }
  flushGeneration();
  for (const [key, value] of Object.entries(expected)) {
    assert(lastGenerationSettings[key] === value, `${label}: generator ${key}=${lastGenerationSettings[key]}, expected ${value}`);
    assert(window.ScanwordGenerator.getCurrentSettings()?.[key] === value, `${label}: current ${key} did not match effective value`);
  }
}

require(path.join(root, "ui.js"));
flushGeneration();

Object.assign(elements.seed, { value: "   " });
Object.assign(elements.cols, { value: "3" });
Object.assign(elements.rows, { value: "2" });
Object.assign(elements.poolSize, { value: "100" });
Object.assign(elements.targetWords, { value: "7" });
Object.assign(elements.clueDensity, { value: "99" });
elements.generate.dispatch("click");
assertEffective({ seed: "arrowword", cols: 11, rows: 13, poolSize: 1000, targetWords: 12, clueDensity: 38 }, "lower bounds");
assert(window.ScanwordGenerator.exportResult(window.ScanwordGenerator.getCurrentResult()).seed === "arrowword", "seed fallback did not reach export metadata");

Object.assign(elements.seed, { value: "  bounded-seed  " });
Object.assign(elements.cols, { value: "99" });
Object.assign(elements.rows, { value: "99" });
Object.assign(elements.poolSize, { value: "20000" });
Object.assign(elements.targetWords, { value: "99" });
Object.assign(elements.clueDensity, { value: "1" });
elements.generate.dispatch("click");
assertEffective({ seed: "bounded-seed", cols: 19, rows: 27, poolSize: 10000, targetWords: 60, clueDensity: 16 }, "upper bounds");

Object.assign(elements.seed, { value: "fallback-seed" });
Object.assign(elements.cols, { value: "" });
Object.assign(elements.rows, { value: "" });
Object.assign(elements.poolSize, { value: "" });
Object.assign(elements.targetWords, { value: "" });
Object.assign(elements.clueDensity, { value: "" });
elements.generate.dispatch("click");
assertEffective({ seed: "fallback-seed", cols: 13, rows: 17, poolSize: 3500, targetWords: 30, clueDensity: 27 }, "fallback values");

console.log(JSON.stringify({
  passed: true,
  htmlBoundsDriveRuntime: true,
  controlsMirrorEffectiveSettings: true,
  poolSizeRange: [1000, 10000],
  seedFallbackVisible: true,
  exportSeedBoundToEffectiveSettings: true,
}));
