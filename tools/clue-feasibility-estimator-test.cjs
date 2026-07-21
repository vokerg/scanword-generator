"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;
window.ScanwordCore = {
  DIRECTIONS: {
    right: { dr: 0, dc: 1 },
    down: { dr: 1, dc: 0 },
  },
};
window.ScanwordSolver = {
  buildAttempt() { throw new Error("fixture buildAttempt should not run"); },
  buildPoolIndex() { return { byLetter: new Map(), byLength: new Map() }; },
};
require(path.resolve(__dirname, "..", "construction-clue-feasibility-v1.js"));

const estimator = window.ScanwordClueFeasibilityV1;
assert.ok(estimator, "estimator API must install");

function makeState(rows = 5, cols = 5, fill = "panel") {
  return {
    rows,
    cols,
    placed: [],
    usedAnswers: new Set(),
    grid: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({
      type: fill,
      char: null,
      slotIds: [],
      directions: [],
      clues: [],
    }))),
  };
}

function setClue(state, row, col, text, slotId = 1) {
  state.grid[row][col] = {
    type: "clue",
    char: null,
    slotIds: [],
    directions: [],
    clues: [{ slotId, direction: "right", text, answer: "ТЕСТ" }],
  };
}

function setLetter(state, row, col, char = "А") {
  state.grid[row][col] = {
    type: "letter",
    char,
    slotIds: [99],
    directions: ["right"],
    clues: [],
  };
}

{
  const state = makeState();
  setClue(state, 2, 2, "Короткая подсказка");
  const report = estimator.evaluateState(state, null, {
    candidateLimit: 8,
    footprintLimit: 24,
    minimumClueTextCells: 1,
    minimumExternalClues: 1,
    rankWeight: 1,
  });
  assert.equal(report.zeroDomainClues, 0);
  assert.ok(report.minimumDomainSize > 0);
  assert.ok(report.greedyExternalClues >= 1);
  assert.ok(report.greedyClueTextCells >= 1);
  assert.equal(report.completeNecessaryPass, true);
}

{
  const state = makeState(5, 5, "letter");
  setClue(state, 2, 2, "Очень длинная подсказка, которой нужно несколько клеток");
  state.grid[2][1] = { type: "panel", char: null, slotIds: [], directions: [], clues: [] };
  const report = estimator.evaluateState(state, null, {
    candidateLimit: 8,
    footprintLimit: 24,
    minimumClueTextCells: 1,
    minimumExternalClues: 1,
    rankWeight: 1,
  });
  assert.equal(report.zeroDomainClues, 0);
  assert.equal(report.longClueImpossible, 1);
  assert.equal(report.clueTextUpperBound, 1);
}

{
  const state = makeState(5, 5, "letter");
  setClue(state, 2, 2, "Подсказка");
  const report = estimator.evaluateState(state, null, {
    candidateLimit: 8,
    footprintLimit: 24,
    minimumClueTextCells: 1,
    minimumExternalClues: 1,
    rankWeight: 1,
  });
  assert.equal(report.zeroDomainClues, 1);
  assert.equal(report.externalUpperBound, 0);
  assert.equal(report.completeNecessaryPass, false);
}

{
  const state = makeState(5, 5, "letter");
  setClue(state, 2, 2, "Подсказка");
  state.grid[2][1] = { type: "panel", char: null, slotIds: [], directions: [], clues: [] };
  const base = estimator.evaluateState(state, null, {
    candidateLimit: 8,
    footprintLimit: 24,
    minimumClueTextCells: 1,
    minimumExternalClues: 1,
    rankWeight: 1,
  });
  const placement = estimator.evaluatePlacement(state, { answer: "АА", clue: "Новая" }, {
    startRow: 2,
    startCol: 1,
    direction: "right",
    clue: { row: 2, col: 0 },
  }, base, {
    candidateLimit: 8,
    footprintLimit: 24,
    minimumClueTextCells: 1,
    minimumExternalClues: 1,
    rankWeight: 1,
  });
  assert.equal(placement.newZeroDomainClues, 1);
  assert.equal(placement.panelCellsConsumed, 1);
}

{
  const state = makeState(3, 3, "letter");
  for (const [row, col] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    state.grid[row][col] = { type: "panel", char: null, slotIds: [], directions: [], clues: [] };
  }
  const report = estimator.evaluateState(state, null, {
    candidateLimit: 8,
    footprintLimit: 24,
    minimumClueTextCells: 5,
    minimumExternalClues: 1,
    rankWeight: 1,
  });
  assert.equal(report.panelCells, 4);
  assert.equal(report.hardImpossible, true);
  assert.deepEqual(report.hardFailures, ["panel-capacity"]);
}

{
  const items = [
    { row: 0, col: 0, preferredCells: 1, candidates: [{ keys: ["0:0"], size: 1 }] },
    { row: 0, col: 1, preferredCells: 1, candidates: [
      { keys: ["0:0"], size: 1 },
      { keys: ["0:1"], size: 1 },
    ] },
  ];
  const greedy = estimator.greedyFootprintEstimate(items);
  assert.equal(greedy.externalClues, 2);
  assert.equal(greedy.clueTextCells, 2);
}

console.log(JSON.stringify({
  status: "passed",
  tests: 6,
  estimatorVersion: estimator.version,
}));
