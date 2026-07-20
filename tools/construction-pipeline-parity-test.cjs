"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

global.window = global;

global.ScanwordEditorialLexicalPolicyV3 = {
  summarize(placed) {
    return { answers: placed.length, editorialPenalty: 0 };
  },
};
global.ScanwordClosedFill = {
  extractResidualRegions() {
    return [{ id: 1, size: 1, cells: [{ row: 1, col: 1 }] }];
  },
};

function fixture() {
  return {
    rows: 2,
    cols: 3,
    grid: [
      [
        { type: "clue", char: null, slotIds: [], directions: [], clues: [{ slotId: 1, direction: "right", text: "Тест", answer: "АБ" }] },
        { type: "letter", char: "А", slotIds: [1], directions: ["right"], clues: [] },
        { type: "letter", char: "Б", slotIds: [1], directions: ["right"], clues: [] },
      ],
      [
        { type: "panel", char: null, slotIds: [], directions: [], clues: [] },
        { type: "panel", char: null, slotIds: [], directions: [], clues: [] },
        { type: "panel", char: null, slotIds: [], directions: [], clues: [] },
      ],
    ],
    placed: [{
      id: 1,
      answer: "АБ",
      clue: "Тест",
      hasExactClue: true,
      direction: "right",
      length: 2,
      clueRow: 0,
      clueCol: 0,
      startRow: 0,
      startCol: 1,
      cells: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
      intersections: 0,
    }],
    pool: [{ answer: "АБ", clue: "Тест" }],
    clueFootprints: [],
    validation: { valid: true },
    components: 1,
    panelCells: 3,
    intersections: 0,
    fillRatio: 0.5,
    answerCoverage: 0.4,
    rawLetterCoverage: 1 / 3,
    attemptBudget: 1,
    attempt: 0,
    constructionV2: {
      editorialRepair: { mode: "fixture-repair" },
      vocabularyPortfolio: { mode: "fixture-portfolio", selectedLimit: 2500 },
    },
  };
}

let calls = 0;
global.ScanwordSolver = {
  generateBest() {
    calls += 1;
    return fixture();
  },
  resultMetrics(result) {
    return {
      validation: result.validation,
      components: result.components,
      panelCells: result.panelCells,
      intersections: result.intersections,
    };
  },
};

for (const file of [
  "construction-candidate-state-v1.js",
  "construction-pipeline-telemetry-v1.js",
  "construction-pipeline-stages-v1.js",
  "construction-pipeline-v1.js",
]) require(path.join(root, file));

const solver = global.ScanwordSolver;
assert.equal(solver.__explicitPipelineV1Installed, true);

process.env.SCANWORD_EXPLICIT_PIPELINE = "off";
const legacy = solver.generateBest("fixture", 1, 2, 3, 1);
assert.equal(legacy.constructionPipelineV1, undefined);
assert.equal(calls, 1);

process.env.SCANWORD_EXPLICIT_PIPELINE = "on";
const explicit = solver.generateBest("fixture", 1, 2, 3, 1);
assert.equal(calls, 2);
assert.deepEqual(explicit.grid, legacy.grid);
assert.deepEqual(explicit.placed, legacy.placed);
assert.equal(explicit.panelCells, legacy.panelCells);
assert.equal(explicit.components, legacy.components);
assert.equal(explicit.constructionPipelineV1.mode, "explicit-pipeline-v1");
assert.deepEqual(
  explicit.constructionPipelineV1.stages.map((stage) => stage.name),
  ["legacy-source", "base-construction", "clue-allocation", "current-repair-chain", "validation", "comparison"],
);
assert.ok(explicit.constructionPipelineV1.stages.every((stage) => stage.status === "ok"));
assert.equal(explicit.constructionPipelineV1.stages[0].candidateCountBefore, 0);
assert.equal(explicit.constructionPipelineV1.stages[0].candidateCountAfter, 1);

const api = global.ScanwordCandidateStateV1;
const state = api.create(fixture(), { seed: "fixture" });
const next = api.transition(state, "test-transition", { lexicalMetrics: { changed: true } });
assert.notEqual(next, state);
assert.deepEqual(state.lexicalMetrics, { answers: 1, editorialPenalty: 0 });
assert.deepEqual(next.lexicalMetrics, { changed: true });
assert.equal(state.provenance.transitions.length, 0);
assert.equal(next.provenance.transitions.length, 1);
assert.match(api.signature(state), /^candidate-v1:[0-9a-f]{8}$/);

console.log(JSON.stringify({
  status: "ok",
  tests: 17,
  stages: explicit.constructionPipelineV1.stages.length,
  signature: explicit.constructionPipelineV1.selectedSignature,
}));
