"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
global.window = global;

const penalties = {
  TGT: { formulaicShort: true, editorialPenalty: 100, editorialQuality: 0 },
  ETE: { formulaicShort: false, editorialPenalty: 10, editorialQuality: 70 },
  LGL: { formulaicShort: false, editorialPenalty: 10, editorialQuality: 70 },
  HGT: { formulaicShort: false, editorialPenalty: 20, editorialQuality: 60 },
  EXE: { formulaicShort: false, editorialPenalty: 20, editorialQuality: 60 },
  FGT: { formulaicShort: false, editorialPenalty: 1, editorialQuality: 99 },
  EFE: { formulaicShort: false, editorialPenalty: 1, editorialQuality: 99 },
  THT: { formulaicShort: false, editorialPenalty: 30, editorialQuality: 50 },
  LHL: { formulaicShort: false, editorialPenalty: 30, editorialQuality: 50 },
};

window.ScanwordEditorialLexicalPolicyV3 = {
  classify(answer) {
    return {
      editorialWeak: false,
      commonShort: false,
      specialistShort: false,
      editorialTier: penalties[answer]?.formulaicShort ? "formulaic" : "standard",
      ...(penalties[answer] || { formulaicShort: false, editorialPenalty: 50, editorialQuality: 30 }),
    };
  },
  summarize(entries) {
    const classified = entries.map((entry) => this.classify(entry.answer));
    return {
      formulaicShortCount: classified.filter((entry) => entry.formulaicShort).length,
      editorialPenalty: classified.reduce((sum, entry) => sum + entry.editorialPenalty, 0),
    };
  },
};

const selectedFallbacks = [];
window.ScanwordFullCorpusPatternIndexV1 = {
  enabled() { return true; },
  snapshot() { return { selectedFallbackAnswers: [...selectedFallbacks] }; },
  attachTelemetry(result) { return result; },
  augmentDomain(hotDomain, pattern) {
    const fallback = [];
    if (pattern === "?GT") fallback.push(entry("FGT", true));
    if (pattern === "E?E") fallback.push(entry("EFE", true));
    return { entries: [...hotDomain, ...fallback], hotCount: hotDomain.length, fallbackEntries: fallback };
  },
  recordSelected(candidate) {
    if (candidate.fullCorpusFallback) selectedFallbacks.push(candidate.answer);
  },
};

window.ScanwordSolver = {
  generateBest() { throw new Error("not used"); },
  validateGrid() { return { valid: true }; },
  resultMetrics(result) {
    return {
      validation: { valid: true },
      intersections: 2,
      doubles: 0,
      components: 1,
      score: 1,
      panelCells: result.panelCells,
    };
  },
};

function entry(answer, fallback = false) {
  return {
    answer,
    clue: `clue:${answer}`,
    hasExactClue: true,
    lexicalQuality: 80,
    lexicalSource: fallback ? "full" : "hot",
    lexicalCategory: "fixture",
    fullCorpusFallback: fallback,
  };
}

function letter(char, slotIds) {
  return { type: "letter", char, slotIds: [...slotIds], directions: [], clues: [] };
}

const grid = Array.from({ length: 3 }, () =>
  Array.from({ length: 3 }, () => ({ type: "panel", char: null, slotIds: [], directions: [], clues: [] })),
);
grid[1][0] = letter("T", [1, 2]);
grid[1][1] = letter("G", [1, 3]);
grid[1][2] = letter("T", [1, 4]);
grid[0][0] = letter("E", [2, 5]);
grid[2][0] = letter("E", [2, 6]);
grid[0][1] = letter("L", [3, 7]);
grid[2][1] = letter("L", [3, 8]);

const target = {
  id: 1,
  answer: "TGT",
  clue: "target",
  hasExactClue: true,
  cells: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
};
const earlyPartner = {
  id: 2,
  answer: "ETE",
  clue: "early",
  hasExactClue: true,
  cells: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }],
};
const laterPartner = {
  id: 3,
  answer: "LGL",
  clue: "later",
  hasExactClue: true,
  cells: [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
};

const result = {
  rows: 3,
  cols: 3,
  grid,
  placed: [target, earlyPartner, laterPartner],
  pool: [entry("HGT"), entry("EXE"), entry("THT"), entry("LHL")],
  panelCells: 2,
  constructionV2: {},
};

require(path.join(root, "construction-editorial-pair-refit-v3.js"));
window.ScanwordSolver.applyEditorialPairRefitsV3(result);

assert.equal(target.answer, "THT", "later hot target candidate must beat earlier fallback candidate");
assert.equal(earlyPartner.answer, "ETE", "earlier partner must remain unchanged");
assert.equal(laterPartner.answer, "LHL", "later hot partner candidate must be accepted");
assert.deepEqual(selectedFallbacks, [], "no fallback may be selected while any hot partner repair succeeds");
assert.equal(result.constructionV2.editorialPairRefit.accepted, 1);
assert.equal(result.constructionV2.editorialPairRefit.replacements[0].targetRetrievalSource, "hot-working-set");
assert.equal(result.constructionV2.editorialPairRefit.replacements[0].partnerRetrievalSource, "hot-working-set");

console.log(JSON.stringify({
  status: "ok",
  target: target.answer,
  partner: laterPartner.answer,
  selectedFallbacks,
}));
