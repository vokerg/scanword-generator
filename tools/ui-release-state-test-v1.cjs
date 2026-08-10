"use strict";

const path = require("node:path");

function assert(condition, message) {
  if (!condition) throw new Error(`UI release-state test failed: ${message}`);
}

function makeElement(initial = {}) {
  const listeners = new Map();
  const attributes = new Map();
  return {
    value: "",
    checked: false,
    disabled: false,
    innerHTML: "",
    textContent: "",
    ...initial,
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    dispatch(type) {
      const callback = listeners.get(type);
      if (!callback) throw new Error(`No ${type} listener registered`);
      return callback({ type, target: this });
    },
  };
}

const elements = {
  seed: makeElement({ value: "ui-state-a" }),
  cols: makeElement({ value: "13" }),
  rows: makeElement({ value: "17" }),
  poolSize: makeElement({ value: "3500" }),
  targetWords: makeElement({ value: "30" }),
  clueDensity: makeElement({ value: "27" }),
  showAnswers: makeElement({ checked: false }),
  generate: makeElement(),
  downloadSvg: makeElement(),
  downloadJson: makeElement(),
  stats: makeElement(),
  preview: makeElement(),
  wordsTable: makeElement(),
  generationStatus: makeElement({ textContent: "ready" }),
};

const timers = [];
let shouldFail = false;
let generationCalls = 0;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function makeGrid(rows, cols) {
  return Array.from({ length: rows }, (_, row) => (
    Array.from({ length: cols }, (_, col) => ({
      type: row === 0 && col === 0 ? "letter" : "panel",
      char: row === 0 && col === 0 ? "А" : null,
      slotIds: row === 0 && col === 0 ? [1] : [],
      clues: [],
      footprintId: null,
    }))
  ));
}

function makeResult(seed, rows, cols) {
  return {
    rows,
    cols,
    pool: [{ answer: "АЛЬФА" }, { answer: "БЕТА" }],
    grid: makeGrid(rows, cols),
    placed: [{
      id: 1,
      clue: `clue-${seed}`,
      answer: "АЛЬФА",
      length: 5,
      direction: "right",
      startRow: 0,
      startCol: 0,
    }],
    clueFootprints: [],
    intersections: 1,
    fillRatio: 0.42,
    answerCoverage: 0.67,
    clueTextCells: 2,
    panelCells: 5,
    panelRatio: 0.02,
    components: 1,
    coverageCheckpoint: 0.67,
    externalClueTexts: 0,
    panelRegions: 1,
    isolatedPanels: 0,
    attempt: 0,
    attemptBudget: 8,
  };
}

global.window = global;
global.document = {
  querySelector(selector) {
    return elements[String(selector).replace(/^#/, "")] || null;
  },
  createElement() {
    return { href: "", download: "", click() {} };
  },
};
window.setTimeout = (callback) => {
  timers.push(callback);
  return timers.length;
};
window.RUSSIAN_WORDS = Array.from({ length: 40966 }, (_, index) => `WORD-${index}`);
window.ScanwordCore = {
  DIRECTIONS: {
    right: { label: "right", arrow: "→" },
    down: { label: "down", arrow: "↓" },
  },
  createMask() {},
  extractSlots() {},
  analyzeAssignments() {},
};
window.ScanwordRenderer = {
  renderSvg: () => "<svg></svg>",
  escapeXml,
};
window.ScanwordSolver = {
  generateBest(seed, poolSize, rows, cols, targetWords, clueDensity) {
    generationCalls += 1;
    assert(poolSize === 3500, `unexpected pool size ${poolSize}`);
    assert(targetWords === 30, `unexpected target words ${targetWords}`);
    assert(clueDensity === 27, `unexpected clue density ${clueDensity}`);
    if (shouldFail) throw new Error("synthetic failure <unsafe>");
    return makeResult(seed, rows, cols);
  },
  validateGrid() {
    return {
      valid: true,
      accidentalRuns: [],
      conflicts: 0,
      orphanLetters: 0,
      clueDirectionConflicts: 0,
    };
  },
};

function flushGeneration() {
  assert(timers.length === 1, `expected exactly one pending generation, got ${timers.length}`);
  const callback = timers.shift();
  callback();
}

require(path.resolve(__dirname, "..", "ui.js"));

const api = window.ScanwordGenerator;
assert(api && typeof api.getCurrentResult === "function", "public generator state API is unavailable");
assert(typeof api.getCurrentSettings === "function", "current settings snapshot API is unavailable");

// Initial automatic generation must not expose stale or partial exports.
assert(api.getCurrentResult() === null, "result must be empty while initial generation is pending");
assert(api.getCurrentSettings() === null, "settings must be empty while initial generation is pending");
assert(elements.generate.disabled === true, "Generate must be disabled while initial generation is pending");
assert(elements.downloadSvg.disabled === true, "SVG export must be disabled while initial generation is pending");
assert(elements.downloadJson.disabled === true, "JSON export must be disabled while initial generation is pending");
assert(elements.preview.getAttribute("aria-busy") === "true", "preview must expose aria-busy during generation");
assert(elements.generationStatus.textContent === "generating…", "initial generation status is incorrect");

flushGeneration();

const firstResult = api.getCurrentResult();
assert(firstResult, "successful initial generation did not publish a result");
assert(elements.generate.disabled === false, "Generate was not restored after success");
assert(elements.downloadSvg.disabled === false, "SVG export was not enabled after success");
assert(elements.downloadJson.disabled === false, "JSON export was not enabled after success");
assert(elements.preview.getAttribute("aria-busy") === "false", "preview stayed busy after success");
assert(api.getCurrentSettings()?.seed === "ui-state-a", "generated settings did not preserve the original seed");

const copiedSettings = api.getCurrentSettings();
copiedSettings.seed = "tampered";
assert(api.getCurrentSettings()?.seed === "ui-state-a", "settings API leaked mutable internal state");

// Editing controls after generation must not rewrite metadata for the existing grid.
elements.seed.value = "ui-state-b";
const exported = api.exportResult(firstResult);
assert(exported.version === "0.9.0", `export version drifted: ${exported.version}`);
assert(exported.seed === "ui-state-a", `export seed drifted to current input: ${exported.seed}`);
assert(exported.quality?.structurallyValid === true, "existing export quality schema was not preserved");
assert(exported.quality?.panelCells === 5, "existing export quality metrics were not preserved");
assert(Array.isArray(exported.placedWords) && exported.placedWords.length === 1, "placedWords export changed unexpectedly");

// A retry immediately invalidates the previous exportable result before work starts.
shouldFail = true;
elements.generate.dispatch("click");
assert(api.getCurrentResult() === null, "old result remained current during retry");
assert(api.getCurrentSettings() === null, "old settings remained current during retry");
assert(elements.generate.disabled === true, "Generate must be disabled during retry");
assert(elements.downloadSvg.disabled === true, "SVG export remained enabled during retry");
assert(elements.downloadJson.disabled === true, "JSON export remained enabled during retry");
assert(elements.preview.getAttribute("aria-busy") === "true", "retry did not mark preview busy");

flushGeneration();

assert(api.getCurrentResult() === null, "failed retry published a result");
assert(api.getCurrentSettings() === null, "failed retry published settings");
assert(elements.generate.disabled === false, "Generate was not restored after failure");
assert(elements.downloadSvg.disabled === true, "SVG export became enabled after failure");
assert(elements.downloadJson.disabled === true, "JSON export became enabled after failure");
assert(elements.preview.getAttribute("aria-busy") === "false", "preview stayed busy after failure");
assert(elements.generationStatus.textContent === "no valid grid", "failure status is incorrect");
assert(elements.preview.innerHTML.includes("Generation failed."), "failure message was not rendered");
assert(elements.preview.innerHTML.includes("synthetic failure &lt;unsafe&gt;"), "failure message was not escaped");
assert(elements.stats.innerHTML === "", "stale stats remained after failure");
assert(elements.wordsTable.innerHTML === "", "stale word table remained after failure");

// Recovery from failure must publish a new state and re-enable exports.
shouldFail = false;
elements.seed.value = "ui-state-c";
elements.generate.dispatch("click");
assert(elements.downloadJson.disabled === true, "JSON export was enabled before recovery generation completed");
flushGeneration();
assert(api.getCurrentResult(), "successful recovery did not publish a result");
assert(api.getCurrentSettings()?.seed === "ui-state-c", "recovery settings were not captured");
assert(elements.downloadSvg.disabled === false, "SVG export was not restored after recovery");
assert(elements.downloadJson.disabled === false, "JSON export was not restored after recovery");
assert(api.exportResult(api.getCurrentResult()).seed === "ui-state-c", "recovery export seed is incorrect");
assert(generationCalls === 3, `expected three generation attempts, got ${generationCalls}`);

console.log(JSON.stringify({
  passed: true,
  generationCalls,
  initialBusyContract: true,
  generatedSettingsSnapshot: true,
  exportSeedBoundToResult: true,
  exportQualitySchemaPreserved: true,
  staleExportBlockedDuringRetry: true,
  failureStateSafe: true,
  retryRecovery: true,
}));
