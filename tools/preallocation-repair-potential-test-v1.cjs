"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

global.window = global;

function observation(id, allocationIndex, source, attempt, vector) {
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
      necessaryPass: false,
      hardImpossible: false,
      hardFailures: 0,
      zeroDomainClues: 0,
      longClueImpossible: 0,
      panels: 0,
      letters: 0,
      answers: 0,
      crossings: 0,
      clueTextUpperBound: 0,
      externalUpperBound: 0,
      greedyClueTextCells: 0,
      greedyExternalClues: 0,
      panelRegions: 0,
      isolatedPanels: 0,
      residualConcentration: 0,
      overlapPressure: 0,
      ...vector,
    },
    allocationElapsedMs: 10,
  };
}

function fixture() {
  const dense = observation("dense", 0, "build-attempt", 0, {
    necessaryPass: false,
    zeroDomainClues: 12,
    longClueImpossible: 15,
    panels: 3,
    letters: 12,
    answers: 6,
    crossings: 7,
    clueTextUpperBound: 45,
    externalUpperBound: 24,
    greedyClueTextCells: 38,
    greedyExternalClues: 20,
    panelRegions: 1,
    residualConcentration: 1,
  });
  const sparse = observation("sparse", 1, "build-attempt", 1, {
    necessaryPass: true,
    zeroDomainClues: 0,
    longClueImpossible: 0,
    panels: 9,
    letters: 5,
    answers: 3,
    crossings: 2,
    clueTextUpperBound: 60,
    externalUpperBound: 30,
    greedyClueTextCells: 55,
    greedyExternalClues: 28,
    panelRegions: 2,
    residualConcentration: 0.5,
  });
  const victim = observation("victim", 2, "victim-replacement", 0, {
    necessaryPass: false,
    zeroDomainClues: 10,
    longClueImpossible: 13,
    panels: 2,
    letters: 13,
    answers: 7,
    crossings: 8,
    clueTextUpperBound: 44,
    externalUpperBound: 24,
    greedyClueTextCells: 37,
    greedyExternalClues: 20,
    panelRegions: 1,
    residualConcentration: 1,
  });
  const observations = [dense, sparse, victim];
  const sourceTelemetry = { mode: "shadow" };
  Object.defineProperty(sourceTelemetry, "__observations", {
    value: observations,
    enumerable: false,
  });
  const result = {
    constructionV2: { preallocationStructuralFrontier: sourceTelemetry },
  };
  Object.defineProperty(result, "__completePipelineFrontierV1", {
    value: { candidates: [{ grid: victim.state.grid, placed: victim.state.placed }] },
    enumerable: false,
  });
  return { result, observations, dense, sparse, victim };
}

let latestFixture = null;
global.ScanwordSolver = {
  __preallocationStructuralFrontierV1Installed: true,
  preallocationStructuralVectorV1: (entry) => entry.vector,
  generatePortfolio() {
    latestFixture = fixture();
    return latestFixture.result;
  },
};

process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER = "shadow";
process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH = "1";
process.env.SCANWORD_PREALLOCATION_DIAGNOSTIC_WIDTHS = "1,2,3";

delete require.cache[require.resolve(path.join(root, "construction-preallocation-repair-potential-v1.js"))];
require(path.join(root, "construction-preallocation-repair-potential-v1.js"));

try {
  const direct = global.ScanwordSolver.selectPreallocationRepairPotentialFrontierV1(
    fixture().observations.slice(0, 2),
    1,
  );
  assert.equal(direct.members[0].id, "dense");

  process.env.SCANWORD_ACTIVE_POOL_LIMIT = "2500";
  const first = global.ScanwordSolver.generatePortfolio("fixture", 1, 1, 1, 1, 1);
  const telemetry = first.constructionV2.preallocationRepairPotentialFrontier;
  assert.equal(telemetry.ordering, "phase10-repair-potential-first-v1");
  assert.equal(telemetry.current.safeToFilterObservedPhase10Frontier, true);
  assert.equal(telemetry.current.phase10BaseRecall, 1);
  assert.equal(telemetry.current.phase10FrontierRecall, 1);
  assert.deepEqual(telemetry.current.memberAllocationIndexes, [2]);
  assert.equal(telemetry.sweep.find((entry) => entry.width === 1).projectedCallsSaved, 2);

  process.env.SCANWORD_ACTIVE_POOL_LIMIT = "3500";
  const second = global.ScanwordSolver.generatePortfolio("fixture", 1, 1, 1, 1, 1);
  const aggregate = second.constructionV2.preallocationRepairPotentialFrontierPortfolio;
  assert.equal(aggregate.runCount, 2);
  assert.equal(aggregate.safeToFilterObservedPhase10Frontier, true);
  assert.equal(aggregate.sweep.find((entry) => entry.width === 1).phase10FrontierRecall, 1);
  assert.equal(global.ScanwordPreallocationRepairPotentialV1.currentPortfolioAggregate(), aggregate);

  process.env.SCANWORD_ACTIVE_POOL_LIMIT = "2500";
  const reset = global.ScanwordSolver.generatePortfolio("fixture", 1, 1, 1, 1, 1);
  assert.equal(reset.constructionV2.preallocationRepairPotentialFrontierPortfolio.runCount, 1);

  process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER = "off";
  const off = global.ScanwordSolver.generatePortfolio("fixture-off", 1, 1, 1, 1, 1);
  assert.equal(off.constructionV2.preallocationRepairPotentialFrontier, undefined);
  console.log(JSON.stringify({ passed: true }));
} finally {
  delete process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER;
  delete process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH;
  delete process.env.SCANWORD_PREALLOCATION_DIAGNOSTIC_WIDTHS;
  delete process.env.SCANWORD_ACTIVE_POOL_LIMIT;
}