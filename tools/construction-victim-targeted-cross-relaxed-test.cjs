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
    clues: (item.clues || []).map((clue) => ({ ...clue })),
  })));
}

function coverage(grid) {
  const cells = grid.flat();
  return {
    totalCells: cells.length,
    panelCells: cells.filter((item) => item.type === "panel").length,
    letterCells: cells.filter((item) => item.type === "letter").length,
  };
}

const victim = {
  id: 1,
  answer: "СТАРТ",
  clue: "Начало",
  hasExactClue: true,
  direction: "right",
  clueRow: 2,
  clueCol: 0,
  startRow: 2,
  startCol: 1,
  cells: [{ row: 2, col: 1 }],
};
const horizontalAnchor = {
  id: 2,
  answer: "ЯР",
  clue: "Условная опора",
  hasExactClue: true,
  direction: "down",
  clueRow: 1,
  clueCol: 3,
  cells: [{ row: 2, col: 3 }],
};
const verticalAnchorA = {
  id: 3,
  answer: "КЛ",
  clue: "Условная опора",
  hasExactClue: true,
  direction: "right",
  clueRow: 1,
  clueCol: 1,
  cells: [{ row: 1, col: 2 }],
};
const verticalAnchorB = {
  id: 4,
  answer: "ТЛ",
  clue: "Условная опора",
  hasExactClue: true,
  direction: "right",
  clueRow: 3,
  clueCol: 1,
  cells: [{ row: 3, col: 2 }],
};

const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => cell("panel")));
grid[2][0] = cell("clue", { clues: [{ slotId: 1, direction: "right", text: victim.clue, answer: victim.answer }] });
grid[2][1] = cell("letter", { char: "С", slotIds: [1], directions: ["right"] });
grid[2][3] = cell("letter", { char: "Р", slotIds: [2], directions: ["down"] });
grid[1][2] = cell("letter", { char: "К", slotIds: [3], directions: ["right"] });
grid[3][2] = cell("letter", { char: "Т", slotIds: [4], directions: ["right"] });

const structural = {
  rows: 5,
  cols: 5,
  grid,
  placed: [victim, horizontalAnchor, verticalAnchorA, verticalAnchorB],
  usedAnswers: new Set([victim.answer, horizontalAnchor.answer, verticalAnchorA.answer, verticalAnchorB.answer]),
  clueFootprints: [],
};
const rolled = {
  ...structural,
  grid: cloneGrid(structural.grid),
  placed: [horizontalAnchor, verticalAnchorA, verticalAnchorB],
  usedAnswers: new Set([horizontalAnchor.answer, verticalAnchorA.answer, verticalAnchorB.answer]),
  clueFootprints: [],
};
rolled.grid[2][0] = cell("panel");
rolled.grid[2][1] = cell("panel");

const pool = [
  { answer: "МИР", clue: "Вселенная", hasExactClue: true, lexicalQuality: 95 },
  { answer: "КИТ", clue: "Морской гигант", hasExactClue: true, lexicalQuality: 95 },
];

window.ScanwordClosedFill = {
  extractResidualRegions(state) {
    if ((state.placed || []).some((word) => word.id === 1)) {
      return [{ id: 1, size: 1, cells: [{ row: 2, col: 2 }], boundaryWords: [1, 2, 3, 4] }];
    }
    return [{ id: 1, size: 3, cells: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }], boundaryWords: [2, 3, 4] }];
  },
  buildPatternIndex(entries) {
    return entries;
  },
  queryPattern(entries, pattern, usedAnswers, telemetry) {
    telemetry.lookups += 1;
    const matches = entries.filter((entry) => {
      telemetry.checks += 1;
      return entry.answer.length === pattern.length
        && !usedAnswers.has(entry.answer)
        && pattern.every((char, index) => !char || entry.answer[index] === char);
    });
    return matches;
  },
  measureCoverage: coverage,
};

window.ScanwordSolver = {
  generateTargetedVictimVariants: () => ({ states: [], telemetry: {} }),
  stripClueLayoutForTargetedVictim: () => structural,
  rollbackInlineWord: (state, victimId) => (victimId === 1 ? rolled : null),
  resultMetrics: () => ({ validation: { valid: true }, components: 1 }),
};

require(path.resolve(__dirname, "..", "construction-victim-targeted-cross-relaxed.js"));
const result = window.ScanwordSolver.generateTargetedVictimVariants(structural, pool, {
  relaxedCrossRegions: 1,
  relaxedCrossVictims: 1,
  relaxedCrossDomain: 8,
  relaxedCrossCandidateSlots: 8,
  relaxedCrossMaxLength: 4,
  relaxedCrossMaxNewPanels: 3,
  relaxedCrossMaxVariants: 4,
  relaxedCrossFinalists: 2,
});

const repaired = result.states.find((state) => state.targetedVictimMeta?.relaxedRollbackCross);
assert.ok(repaired, "rollback-aware search must build a real crossing pair through the freed cells");
assert.deepEqual(repaired.targetedVictimMeta.pairAnswers, ["КИТ", "МИР"]);
assert.equal(repaired.targetedVictimMeta.panelsAfter < repaired.targetedVictimMeta.panelsBefore, true);
assert.equal(repaired.placed.length >= structural.placed.length, true);
assert.equal(result.telemetry.relaxedRollbackCross.slotPairsBuilt > 0, true);
assert.equal(result.telemetry.relaxedRollbackCross.characterPairsMatched > 0, true);
assert.equal(result.telemetry.relaxedRollbackCross.statesAccepted, 1);
console.log(JSON.stringify({
  relaxedRollbackCross: true,
  victim: repaired.targetedVictimMeta.victimAnswer,
  pairAnswers: repaired.targetedVictimMeta.pairAnswers,
  panelsBefore: repaired.targetedVictimMeta.panelsBefore,
  panelsAfter: repaired.targetedVictimMeta.panelsAfter,
  telemetry: result.telemetry.relaxedRollbackCross,
}));
