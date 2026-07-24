"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function state(id, panels, answers, estimate) {
  const grid = [[
    ...Array.from({ length: panels }, () => ({ type: "panel", slotIds: [] })),
    { type: "clue", clues: [{ slotId: id, text: "Fixture" }], slotIds: [] },
    ...Array.from({ length: 5 - panels }, (_, index) => ({
      type: "letter",
      char: "А",
      slotIds: index === 0 ? [1, 2] : [1],
    })),
  ]];
  return {
    id,
    rows: 1,
    cols: grid[0].length,
    grid,
    placed: Array.from({ length: answers }, (_, index) => ({ answer: `${id}-${index}` })),
    estimate,
  };
}

function install() {
  global.window = global;
  const calls = [];
  let build = 0;
  const states = [
    state("a", 1, 4, { completeNecessaryPass: true, panelCells: 1, greedyClueTextCells: 3, greedyExternalClues: 3, panelRegions: 1, largestPanelRegion: 1 }),
    state("b", 2, 5, { completeNecessaryPass: true, panelCells: 2, greedyClueTextCells: 5, greedyExternalClues: 4, panelRegions: 1, largestPanelRegion: 2 }),
  ];
  global.ScanwordSolver = {
    buildAttempt() {
      return states[build++ % states.length];
    },
    cloneVictimState(input) {
      return input;
    },
    generateVictimReplacementVariants(input) {
      const victim = state("v", 3, 6, { completeNecessaryPass: true, panelCells: 3, greedyClueTextCells: 6, greedyExternalClues: 5, panelRegions: 1, largestPanelRegion: 3 });
      return { states: [victim], telemetry: {}, input };
    },
    evaluateClueFeasibilityV1(input) {
      return input.estimate;
    },
    assignClueTextCellsV2(input) {
      calls.push(input.id);
      input.allocated = true;
      return { clueTextCells: 45, externalClueTexts: 24 };
    },
    generatePortfolio() {
      const first = this.buildAttempt();
      this.cloneVictimState(first);
      this.assignClueTextCellsV2(first, () => 0.5, 1);
      const second = this.buildAttempt();
      const structural = this.cloneVictimState(second);
      this.assignClueTextCellsV2(second, () => 0.5, 1);
      const victim = this.generateVictimReplacementVariants(structural).states[0];
      this.assignClueTextCellsV2(victim, () => 0.5, 1);
      const result = { id: "result", constructionV2: {} };
      Object.defineProperty(result, "__completePipelineFrontierV1", {
        value: { candidates: [{ grid: second.grid, placed: second.placed }, { grid: victim.grid, placed: victim.placed }] },
      });
      return result;
    },
  };
  delete require.cache[require.resolve(path.join(root, "construction-preallocation-frontier-v1.js"))];
  require(path.join(root, "construction-preallocation-frontier-v1.js"));
  return { calls };
}

try {
  process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER = "shadow";
  process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH = "3";
  const { calls } = install();
  process.env.SCANWORD_ACTIVE_POOL_LIMIT = "2500";
  const result = global.ScanwordSolver.generatePortfolio("fixture", 1, 1, 1, 1);
  const telemetry = result.constructionV2.preallocationStructuralFrontier;
  assert.deepEqual(calls, ["a", "b", "v"]);
  assert.equal(telemetry.mode, "shadow");
  assert.equal(telemetry.authoritative, false);
  assert.equal(telemetry.stageModel, "base-frontier-then-victim-frontier-v1");
  assert.equal(telemetry.baseFrontier.retained, 2);
  assert.equal(telemetry.allocationCalls, 3);
  assert.equal(telemetry.retained, 3);
  assert.equal(telemetry.phase10FrontierRecall, 1);
  assert.equal(telemetry.safeToFilterObservedPhase10Frontier, true);
  assert.equal(telemetry.members.some((entry) => entry.provenance.source.startsWith("build-attempt")), true);
  assert.equal(telemetry.members.some((entry) => entry.provenance.source === "victim-replacement"), true);
  assert.equal(global.ScanwordSolver.selectPreallocationStructuralFrontierV1(telemetry.__observations, 1).members.length, 1);
  const firstAggregate = result.constructionV2.preallocationStructuralFrontierPortfolio;
  assert.equal(firstAggregate.runCount, 1);
  process.env.SCANWORD_ACTIVE_POOL_LIMIT = "3500";
  const second = global.ScanwordSolver.generatePortfolio("fixture", 1, 1, 1, 1);
  assert.equal(firstAggregate.runCount, 2);
  assert.equal(second.constructionV2.preallocationStructuralFrontierPortfolio, firstAggregate);
  assert.equal(firstAggregate.allocationCalls, 6);
  assert.equal(firstAggregate.safeToFilterObservedPhase10Frontier, true);
  process.env.SCANWORD_ACTIVE_POOL_LIMIT = "2500";
  const reset = global.ScanwordSolver.generatePortfolio("fixture", 1, 1, 1, 1);
  assert.equal(reset.constructionV2.preallocationStructuralFrontierPortfolio.runCount, 1);

  process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER = "off";
  install();
  const off = global.ScanwordSolver.generatePortfolio("fixture-off", 1, 1, 1, 1);
  assert.equal(off.constructionV2.preallocationStructuralFrontier, undefined);
  console.log(JSON.stringify({ passed: true }));
} finally {
  delete process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER;
  delete process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH;
  delete process.env.SCANWORD_ACTIVE_POOL_LIMIT;
}
