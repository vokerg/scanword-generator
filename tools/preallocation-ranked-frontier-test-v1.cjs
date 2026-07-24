"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

global.window = global;

function observation(id, allocationIndex, source, attempt, panels) {
  const state = {
    id,
    grid: [[{ type: "panel" }]],
    placed: [{ answer: id }],
  };
  return {
    id,
    allocationIndex,
    state,
    provenance: {
      source,
      buildIndex: attempt,
      attempt,
      attemptNumber: attempt + 1,
      partialSearchVariant: "default",
      victimVariantIndex: source === "victim-replacement" ? 0 : null,
      allocationIndex,
    },
    vector: {
      necessaryPass: true,
      hardImpossible: false,
      hardFailures: 0,
      zeroDomainClues: 0,
      longClueImpossible: 0,
      panels,
      letters: 20 - panels,
      answers: 10 - panels,
      crossings: 12 - panels,
      clueTextUpperBound: 50,
      externalUpperBound: 25,
      greedyClueTextCells: 45,
      greedyExternalClues: 24,
      panelRegions: 1,
      isolatedPanels: 0,
      residualConcentration: 1,
      overlapPressure: 0,
    },
    allocationElapsedMs: 10,
  };
}

function fixture() {
  const first = observation("first", 0, "build-attempt", 0, 2);
  const second = observation("second", 1, "build-attempt", 1, 3);
  const third = observation("third", 2, "build-attempt", 2, 4);
  const victim = observation("victim", 3, "victim-replacement", 1, 1);
  const observations = [first, second, third, victim];
  const sourceTelemetry = { mode: "shadow" };
  Object.defineProperty(sourceTelemetry, "__observations", {
    value: observations,
    enumerable: false,
  });
  const result = {
    constructionV2: { preallocationStructuralFrontier: sourceTelemetry },
  };
  Object.defineProperty(result, "__completePipelineFrontierV1", {
    value: {
      candidates: [
        { grid: first.state.grid, placed: first.state.placed },
        { grid: victim.state.grid, placed: victim.state.placed },
      ],
    },
    enumerable: false,
  });
  return { result, observations };
}

let latest = null;
global.ScanwordSolver = {
  __preallocationRepairPotentialV1Installed: true,
  comparePreallocationRepairPotentialV1(first, second) {
    return first.vector.panels - second.vector.panels || first.allocationIndex - second.allocationIndex;
  },
  generatePortfolio() {
    latest = fixture();
    return latest.result;
  },
};

process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER = "shadow";
process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH = "2";
process.env.SCANWORD_PREALLOCATION_DIAGNOSTIC_WIDTHS = "1,2,3,4";

delete require.cache[require.resolve(path.join(root, "construction-preallocation-ranked-frontier-v1.js"))];
require(path.join(root, "construction-preallocation-ranked-frontier-v1.js"));

try {
  const ranked = global.ScanwordSolver.selectPreallocationRankedFrontierV1(fixture().observations, 2);
  assert.deepEqual(ranked.members.map((entry) => entry.id), ["victim", "first"]);
  assert.equal(ranked.considered, 4);
  assert.equal(ranked.retained, 2);

  process.env.SCANWORD_ACTIVE_POOL_LIMIT = "2500";
  const firstResult = global.ScanwordSolver.generatePortfolio("fixture", 1, 1, 1, 1, 1);
  const telemetry = firstResult.constructionV2.preallocationRankedFrontier;
  assert.equal(telemetry.ordering, "phase10-repair-potential-ranked-no-dominance-v1");
  assert.equal(telemetry.stageModel, "base-rank-then-victim-rank-v1");
  assert.equal(telemetry.current.phase10BaseRecall, 1);
  assert.equal(telemetry.current.phase10FrontierRecall, 1);
  assert.equal(telemetry.current.safeToFilterObservedPhase10Frontier, true);
  assert.deepEqual(telemetry.current.memberAllocationIndexes, [3, 0]);
  assert.equal(telemetry.sweep.find((entry) => entry.width === 1).safeToFilterObservedPhase10Frontier, false);
  assert.equal(telemetry.sweep.find((entry) => entry.width === 2).safeToFilterObservedPhase10Frontier, true);

  process.env.SCANWORD_ACTIVE_POOL_LIMIT = "3500";
  const secondResult = global.ScanwordSolver.generatePortfolio("fixture", 1, 1, 1, 1, 1);
  const aggregate = secondResult.constructionV2.preallocationRankedFrontierPortfolio;
  assert.equal(aggregate.runCount, 2);
  assert.equal(aggregate.safeToFilterObservedPhase10Frontier, true);
  assert.equal(aggregate.sweep.find((entry) => entry.width === 2).phase10FrontierRecall, 1);
  assert.equal(global.ScanwordPreallocationRankedFrontierV1.currentPortfolioAggregate(), aggregate);

  process.env.SCANWORD_ACTIVE_POOL_LIMIT = "2500";
  const reset = global.ScanwordSolver.generatePortfolio("fixture", 1, 1, 1, 1, 1);
  assert.equal(reset.constructionV2.preallocationRankedFrontierPortfolio.runCount, 1);

  process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER = "off";
  const off = global.ScanwordSolver.generatePortfolio("fixture-off", 1, 1, 1, 1, 1);
  assert.equal(off.constructionV2.preallocationRankedFrontier, undefined);
  console.log(JSON.stringify({ passed: true }));
} finally {
  delete process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER;
  delete process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH;
  delete process.env.SCANWORD_PREALLOCATION_DIAGNOSTIC_WIDTHS;
  delete process.env.SCANWORD_ACTIVE_POOL_LIMIT;
}