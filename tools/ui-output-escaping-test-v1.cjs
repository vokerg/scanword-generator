"use strict";

const path = require("node:path");

function assert(condition, message) {
  if (!condition) throw new Error(`UI output-escaping test failed: ${message}`);
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
  seed: makeElement({ value: "escape-test" }),
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
const unsafeClue = 'Что <strong>это</strong> & "зачем"?';
const unsafeAnswer = 'ТЕСТ<img src=x onerror=alert(1)>&';

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

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
  escapeXml,
  renderSvg() { return '<svg width="148mm"></svg>'; },
};
window.ScanwordSolver = {
  generateBest(seed, poolSize, rows, cols) {
    return {
      rows,
      cols,
      pool: [{ answer: unsafeAnswer }],
      grid: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: "panel", char: null, slotIds: [], clues: [], footprintId: null }))),
      placed: [{ id: 1, clue: unsafeClue, answer: unsafeAnswer, length: 4, direction: "right", startRow: 0, startCol: 0 }],
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

require(path.resolve(__dirname, "..", "ui.js"));
assert(timers.length === 1, `expected one initial generation, got ${timers.length}`);
timers.shift()();

const table = elements.wordsTable.innerHTML;
assert(table.includes(escapeXml(unsafeClue)), "clue text was not escaped in the table");
assert(table.includes(escapeXml(unsafeAnswer)), "answer text was not escaped in the table");
assert(!table.includes("<strong>это</strong>"), "clue markup leaked into table HTML");
assert(!table.includes("<img src=x onerror=alert(1)>"), "answer markup leaked into table HTML");
assert(!/<img\b/i.test(table), "table contains an injected img element");

const current = window.ScanwordGenerator.getCurrentResult();
const exported = window.ScanwordGenerator.exportResult(current);
assert(exported.placedWords[0].clue === unsafeClue, "structured clue data was unexpectedly escaped/mutated");
assert(exported.placedWords[0].answer === unsafeAnswer, "structured answer data was unexpectedly escaped/mutated");

console.log(JSON.stringify({
  passed: true,
  clueEscapedInHtml: true,
  answerEscapedInHtml: true,
  structuredDataPreserved: true,
}));
