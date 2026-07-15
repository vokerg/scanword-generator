"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;

function cell(type, extra = {}) {
  return { type, char: null, slotIds: [], directions: [], clues: [], ...extra };
}

function cloneGrid(grid) {
  return grid.map((row) => row.map((item) => ({
    ...item,
    slotIds: [...(item.slotIds || [])],
    directions: [...(item.directions || [])],
    clues: [...(item.clues || [])],
  })));
}

function coverage(grid) {
  const cells = grid.flat();
  return {
    panelCells: cells.filter((item) => item.type === "panel").length,
    letterCells: cells.filter((item) => item.type === "letter").length,
  };
}

const victimA = {
  id: 41,
  answer: "КОТ",
  hasExactClue: true,
  clueRow: 1,
  clueCol: 4,
  cells: [{ row: 2, col: 4 }],
  direction: "down",
};
const victimB = {
  id: 42,
  answer: "ЛЕС",
  hasExactClue: true,
  clueRow: 2,
  clueCol: 0,
  cells: [{ row: 2, col: 1 }],
  direction: "right",
};
const anchorLeft = {
  id: 51,
  answer: "А",
  hasExactClue: true,
  clueRow: 1,
  clueCol: 0,
  cells: [{ row: 1, col: 1 }],
  direction: "right",
};
const anchorMiddle = {
  id: 52,
  answer: "М",
  hasExactClue: true,
  clueRow: 3,
  clueCol: 1,
  cells: [{ row: 3, col: 2 }],
  direction: "down",
};
const anchorRight = {
  id: 53,
  answer: "У",
  hasExactClue: true,
  clueRow: 1,
  clueCol: 2,
  cells: [{ row: 1, col: 3 }],
  direction: "right",
};
const anchors = [anchorLeft, anchorMiddle, anchorRight];
const structural = {
  rows: 4,
  cols: 5,
  panelCells: 9,
  grid: [
    [cell("panel"), cell("panel"), cell("panel"), cell("panel"), cell("panel")],
    [cell("panel"), cell("letter", { char: "А", slotIds: [51], directions: ["right"] }), cell("panel"), cell("letter", { char: "У", slotIds: [53], directions: ["right"] }), cell("panel")],
    [cell("panel"), cell("letter", { char: "Л", slotIds: [42], directions: ["right"] }), cell("panel"), cell("panel"), cell("letter", { char: "К", slotIds: [41], directions: ["down"] })],
    [cell("panel"), cell("panel"), cell("letter", { char: "М", slotIds: [52], directions: ["down"] }), cell("panel"), cell("panel")],
  ],
  placed: [victimA, victimB, ...anchors],
  clueFootprints: [],
};
const afterA = {
  ...structural,
  grid: cloneGrid(structural.grid),
  placed: [victimB, ...anchors],
  clueFootprints: [],
};
afterA.grid[2][4] = cell("panel");
const rolled = {
  ...structural,
  grid: cloneGrid(afterA.grid),
  placed: [...anchors],
  clueFootprints: [],
};
rolled.grid[2][1] = cell("panel");

const slotLeft = {
  clueRow: 0,
  clueCol: 1,
  clueKey: "0:1",
  direction: "down",
  startRow: 1,
  startCol: 1,
  length: 3,
  cells: [{ row: 1, col: 1 }, { row: 2, col: 1 }, { row: 3, col: 1 }],
  regionLetterKeys: ["2:1", "3:1"],
  regionLetterKeySet: new Set(["2:1", "3:1"]),
  forbiddenLetterKeys: [],
  existingIntersections: 1,
  signature: "down:0,1:1,1:3",
  baseDomain: [{ answer: "АДР", clue: "Условное слово", hasExactClue: true, weakFill: false, lexicalQuality: 80 }],
};
const slotMiddle = {
  clueRow: 3,
  clueCol: 0,
  clueKey: "3:0",
  direction: "right",
  startRow: 3,
  startCol: 1,
  length: 3,
  cells: [{ row: 3, col: 1 }, { row: 3, col: 2 }, { row: 3, col: 3 }],
  regionLetterKeys: ["3:1", "3:3"],
  regionLetterKeySet: new Set(["3:1", "3:3"]),
  forbiddenLetterKeys: [],
  existingIntersections: 1,
  signature: "right:3,0:3,1:3",
  baseDomain: [{ answer: "РМТ", clue: "Условное слово", hasExactClue: true, weakFill: false, lexicalQuality: 85 }],
};
const slotRight = {
  clueRow: 0,
  clueCol: 3,
  clueKey: "0:3",
  direction: "down",
  startRow: 1,
  startCol: 3,
  length: 3,
  cells: [{ row: 1, col: 3 }, { row: 2, col: 3 }, { row: 3, col: 3 }],
  regionLetterKeys: ["2:3", "3:3"],
  regionLetterKeySet: new Set(["2:3", "3:3"]),
  forbiddenLetterKeys: [],
  existingIntersections: 1,
  signature: "down:0,3:1,3:3",
  baseDomain: [{ answer: "УКТ", clue: "Условное слово", hasExactClue: true, weakFill: false, lexicalQuality: 90 }],
};

window.ScanwordClosedFill = {
  extractResidualRegions: () => [{
    id: 7,
    size: 1,
    cells: [{ row: 3, col: 3 }],
    boundaryWords: [41, 42],
  }],
  buildPatternIndex: () => ({}),
  enumerateRegionSlots: () => [slotLeft, slotMiddle, slotRight],
  measureCoverage: coverage,
};
window.ScanwordSolver = {
  generateTargetedVictimVariants: () => ({ states: [], telemetry: { statesAccepted: 0 } }),
  stripClueLayoutForTargetedVictim: () => structural,
  rollbackInlineWord(state, id) {
    if (state === structural && id === victimA.id) return afterA;
    if (state === afterA && id === victimB.id) return rolled;
    return null;
  },
  resultMetrics(state) {
    return {
      validation: { valid: true },
      components: state.placed.length >= 6 ? 1 : 3,
    };
  },
};
window.SCANWORD_TARGETED_SHORT_FILL = [];

require(path.resolve(__dirname, "..", "construction-victim-targeted-triple.js"));
const result = window.ScanwordSolver.generateTargetedVictimVariants(structural, [
  slotLeft.baseDomain[0],
  slotMiddle.baseDomain[0],
  slotRight.baseDomain[0],
], {
  atomicTripleMinimumPanels: 9,
  atomicTripleMaxRegions: 1,
  atomicTripleVictims: 2,
  atomicTripleSlotCandidates: 10,
  atomicTripleMaxSlots: 4,
  atomicTripleValuesPerSlot: 2,
  atomicTripleMaxVariants: 2,
  atomicTripleFinalists: 1,
});

const triple = result.states.find((state) => state.targetedVictimMeta?.atomicTriple);
assert.ok(triple, "two victims must be replaceable by a connected three-slot bundle");
assert.deepEqual(triple.targetedVictimMeta.victimAnswers, ["КОТ", "ЛЕС"]);
assert.deepEqual(triple.targetedVictimMeta.tripleAnswers, ["АДР", "РМТ", "УКТ"]);
assert.equal(triple.targetedVictimMeta.crossingRelations, 2);
assert.equal(triple.grid[3][3].type, "letter");
assert.equal(window.ScanwordSolver.resultMetrics(triple).components, 1);
assert.equal(result.telemetry.atomicTriple.victimPairsRolledBack, 1);
assert.equal(result.telemetry.atomicTriple.compatibleSlotTriples, 1);
assert.equal(result.telemetry.atomicTriple.statesAccepted, 1);
assert.equal(result.telemetry.atomicTriple.finalistsReserved, 1);

const rejectedTelemetry = {
  mode: "test",
  minimumPanels: 9,
  regionsConsidered: 0,
  victimPairsConsidered: 0,
  victimPairsRolledBack: 0,
  rollbackRejected: 0,
  rollbackInvalid: 0,
  maximumRollbackComponents: 0,
  emptyFocus: 0,
  slotsEnumerated: 0,
  slotTriplesConsidered: 0,
  componentPrunedTriples: 0,
  compatibleSlotTriples: 0,
  entryTriplesConsidered: 0,
  applyRejected: 0,
  validationRejected: 0,
  weakBudgetRejected: 0,
  answerCountRejected: 0,
  targetRejected: 0,
  patternLookups: 0,
  patternChecks: 0,
  statesAccepted: 0,
  finalistsReserved: 0,
};
window.ScanwordClosedFill.enumerateRegionSlots = () => [slotLeft, slotMiddle, {
  ...slotRight,
  cells: [{ row: 1, col: 3 }, { row: 2, col: 3 }],
  length: 2,
  regionLetterKeys: ["2:3"],
  regionLetterKeySet: new Set(["2:3"]),
  baseDomain: [{ answer: "УК", clue: "Условное слово", hasExactClue: true, weakFill: false, lexicalQuality: 90 }],
  signature: "down:0,3:1,3:2-pruned",
}];
const rejected = window.ScanwordSolver.generateAtomicTargetedTripleVariants(structural, [], {
  focusRadius: 2,
  maxFocusCells: 20,
  maxDomainSize: 20,
  atomicTripleMinimumPanels: 9,
  atomicTripleMaxRegions: 1,
  atomicTripleVictims: 2,
  atomicTripleSlotCandidates: 10,
  atomicTripleMaxSlots: 4,
  atomicTripleValuesPerSlot: 2,
  atomicTripleMaxVariants: 2,
}, rejectedTelemetry);
assert.equal(rejected.length, 0);
assert.equal(rejectedTelemetry.componentPrunedTriples, 1);
assert.equal(rejectedTelemetry.entryTriplesConsidered, 0);

console.log(JSON.stringify({
  atomicTriple: true,
  removedVictims: triple.targetedVictimMeta.victimAnswers,
  insertedAnswers: triple.targetedVictimMeta.tripleAnswers,
  temporaryComponents: 3,
  finalComponents: 1,
  componentLowerBound: true,
  telemetry: result.telemetry.atomicTriple,
}));
