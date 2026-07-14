"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;

function cell(type, extra = {}) {
  return { type, char: null, slotIds: [], directions: [], clues: [], ...extra };
}

function coverage(grid) {
  const cells = grid.flat();
  return {
    panelCells: cells.filter((item) => item.type === "panel").length,
    letterCells: cells.filter((item) => item.type === "letter").length,
  };
}

function telemetry() {
  return {
    regionsConsidered: 0,
    victimsConsidered: 0,
    victimsRolledBack: 0,
    rollbackRejected: 0,
    rollbackInvalid: 0,
    disconnectedRollbackRelaxed: 0,
    maximumRollbackComponents: 0,
    componentPrunedPairs: 0,
    emptyFocus: 0,
    slotsEnumerated: 0,
    slotPairsConsidered: 0,
    compatibleSlotPairs: 0,
    crossingSlotPairs: 0,
    disjointSlotPairs: 0,
    entryPairsConsidered: 0,
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
}

const victim = {
  id: 21,
  answer: "МОСТ",
  hasExactClue: true,
  clueRow: 1,
  clueCol: 4,
  cells: [{ row: 2, col: 4 }],
  direction: "down",
};
const anchorLeft = {
  id: 22,
  answer: "А",
  hasExactClue: true,
  clueRow: 1,
  clueCol: 0,
  cells: [{ row: 1, col: 1 }],
  direction: "right",
};
const anchorBridge = {
  id: 23,
  answer: "РАР",
  hasExactClue: true,
  clueRow: 3,
  clueCol: 0,
  cells: [{ row: 3, col: 1 }, { row: 3, col: 2 }, { row: 3, col: 3 }],
  direction: "right",
};
const anchorRight = {
  id: 24,
  answer: "У",
  hasExactClue: true,
  clueRow: 1,
  clueCol: 2,
  cells: [{ row: 1, col: 3 }],
  direction: "right",
};
const anchors = [anchorLeft, anchorBridge, anchorRight];
const structural = {
  rows: 4,
  cols: 5,
  grid: [
    [cell("panel"), cell("panel"), cell("panel"), cell("panel"), cell("panel")],
    [cell("panel"), cell("letter", { char: "А", slotIds: [22], directions: ["right"] }), cell("panel"), cell("letter", { char: "У", slotIds: [24], directions: ["right"] }), cell("panel")],
    [cell("panel"), cell("panel"), cell("panel"), cell("panel"), cell("letter", { char: "М", slotIds: [21], directions: ["down"] })],
    [cell("panel"), cell("letter", { char: "Р", slotIds: [23], directions: ["right"] }), cell("letter", { char: "А", slotIds: [23], directions: ["right"] }), cell("letter", { char: "Р", slotIds: [23], directions: ["right"] }), cell("panel")],
  ],
  placed: [victim, ...anchors],
  clueFootprints: [],
};
const rolled = {
  ...structural,
  grid: structural.grid.map((row) => row.map((item) => ({
    ...item,
    slotIds: [...item.slotIds],
    directions: [...item.directions],
    clues: [],
  }))),
  placed: [...anchors],
  clueFootprints: [],
};
rolled.grid[2][4] = cell("panel");

const bridgeLeft = {
  clueRow: 0,
  clueCol: 1,
  clueKey: "0:1",
  direction: "down",
  startRow: 1,
  startCol: 1,
  length: 3,
  cells: [{ row: 1, col: 1 }, { row: 2, col: 1 }, { row: 3, col: 1 }],
  regionLetterKeys: ["2:1"],
  regionLetterKeySet: new Set(["2:1"]),
  forbiddenLetterKeys: [],
  existingIntersections: 2,
  signature: "down:0,1:1,1:3",
  baseDomain: [{ answer: "АДР", clue: "Учебный адрес", hasExactClue: true, weakFill: false, lexicalQuality: 80 }],
};
const bridgeRight = {
  clueRow: 0,
  clueCol: 3,
  clueKey: "0:3",
  direction: "down",
  startRow: 1,
  startCol: 3,
  length: 3,
  cells: [{ row: 1, col: 3 }, { row: 2, col: 3 }, { row: 3, col: 3 }],
  regionLetterKeys: ["2:3"],
  regionLetterKeySet: new Set(["2:3"]),
  forbiddenLetterKeys: [],
  existingIntersections: 2,
  signature: "down:0,3:1,3:3",
  baseDomain: [{ answer: "УМР", clue: "Условная аббревиатура", hasExactClue: true, weakFill: false, lexicalQuality: 90 }],
};

window.ScanwordClosedFill = {
  extractResidualRegions: () => [{
    id: 2,
    size: 2,
    cells: [{ row: 2, col: 1 }, { row: 2, col: 3 }],
    boundaryWords: [21],
  }],
  buildPatternIndex: () => ({}),
  enumerateRegionSlots: () => [bridgeLeft, bridgeRight],
  measureCoverage: coverage,
};
window.ScanwordSolver = {
  generateTargetedVictimVariants: () => ({ states: [], telemetry: { statesAccepted: 0 } }),
  stripClueLayoutForTargetedVictim: () => structural,
  rollbackInlineWord: () => rolled,
  resultMetrics(state) {
    return {
      validation: { valid: true },
      components: state.placed.length >= 5 ? 1 : 3,
    };
  },
};
window.SCANWORD_TARGETED_SHORT_FILL = [];

require(path.resolve(__dirname, "..", "construction-victim-targeted-pair.js"));
const accepted = window.ScanwordSolver.generateTargetedVictimVariants(structural, [
  bridgeLeft.baseDomain[0],
  bridgeRight.baseDomain[0],
], {
  maxRegions: 1,
  maxVictimsPerRegion: 1,
  focusRadius: 2,
  maxFocusCells: 20,
  maxSlotCandidates: 20,
  maxDomainSize: 20,
  atomicMaxSlots: 4,
  atomicValuesPerSlot: 2,
  atomicMaxVariants: 2,
  atomicFinalists: 2,
  maxVariants: 4,
});

const atomic = accepted.states.find((state) => state.targetedVictimMeta?.atomicPairRelation === "disjoint");
assert.ok(atomic, "a component-connecting disjoint atomic repair must be preserved");
assert.deepEqual(atomic.targetedVictimMeta.pairAnswers, ["АДР", "УМР"]);
assert.equal(atomic.grid[2][1].type, "letter");
assert.equal(atomic.grid[2][3].type, "letter");
assert.equal(accepted.telemetry.atomicPair.disconnectedRollbackRelaxed, 1);
assert.equal(accepted.telemetry.atomicPair.maximumRollbackComponents, 3);
assert.equal(accepted.telemetry.atomicPair.componentPrunedPairs, 0);
assert.equal(accepted.telemetry.atomicPair.crossingSlotPairs, 0);
assert.equal(accepted.telemetry.atomicPair.disjointSlotPairs, 1);
assert.equal(window.ScanwordSolver.resultMetrics(atomic).components, 1);

const isolatedLeft = {
  ...bridgeLeft,
  length: 2,
  cells: [{ row: 1, col: 1 }, { row: 2, col: 1 }],
  existingIntersections: 1,
  signature: "down:0,1:1,1:2-pruned",
  baseDomain: [{ answer: "АД", clue: "Место мучений", hasExactClue: true, weakFill: false, lexicalQuality: 80 }],
};
const isolatedRight = {
  ...bridgeRight,
  length: 2,
  cells: [{ row: 1, col: 3 }, { row: 2, col: 3 }],
  existingIntersections: 1,
  signature: "down:0,3:1,3:2-pruned",
  baseDomain: [{ answer: "УМ", clue: "Способность мыслить", hasExactClue: true, weakFill: false, lexicalQuality: 90 }],
};
window.ScanwordClosedFill.enumerateRegionSlots = () => [isolatedLeft, isolatedRight];
const rejectedTelemetry = telemetry();
const rejected = window.ScanwordSolver.generateAtomicTargetedPairVariants(
  structural,
  [isolatedLeft.baseDomain[0], isolatedRight.baseDomain[0]],
  {
    maxRegions: 1,
    maxVictimsPerRegion: 1,
    focusRadius: 2,
    maxFocusCells: 20,
    maxSlotCandidates: 20,
    maxDomainSize: 20,
    atomicMaxSlots: 4,
    atomicValuesPerSlot: 2,
    atomicMaxVariants: 2,
  },
  rejectedTelemetry,
);
assert.equal(rejected.length, 0);
assert.equal(rejectedTelemetry.componentPrunedPairs, 1);
assert.equal(rejectedTelemetry.entryPairsConsidered, 0);

console.log(JSON.stringify({
  disjointAtomicPair: true,
  temporaryComponents: 3,
  finalComponents: window.ScanwordSolver.resultMetrics(atomic).components,
  pairAnswers: atomic.targetedVictimMeta.pairAnswers,
  componentLowerBound: true,
  prunedPairs: rejectedTelemetry.componentPrunedPairs,
  telemetry: accepted.telemetry.atomicPair,
}));
