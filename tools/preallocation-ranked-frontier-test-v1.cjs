"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

global.window = global;

function observation(id, allocationIndex, panels) {
  return {
    id,
    allocationIndex,
    provenance: {
      source: "build-attempt",
      attempt: allocationIndex,
      partialSearchVariant: "default",
    },
    vector: { panels },
  };
}

global.ScanwordSolver = {
  __preallocationRepairPotentialV1Installed: true,
  comparePreallocationRepairPotentialV1(first, second) {
    return first.vector.panels - second.vector.panels || first.allocationIndex - second.allocationIndex;
  },
  generatePortfolio() {
    return { constructionV2: {} };
  },
};

process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER = "shadow";
process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH = "2";
process.env.SCANWORD_PREALLOCATION_DIAGNOSTIC_WIDTHS = "1,2,4";

delete require.cache[require.resolve(path.join(root, "construction-preallocation-ranked-frontier-v1.js"))];
require(path.join(root, "construction-preallocation-ranked-frontier-v1.js"));

try {
  const observations = [
    observation("third", 2, 4),
    observation("first", 0, 2),
    observation("best", 3, 1),
    observation("second", 1, 3),
  ];
  const widthTwo = global.ScanwordSolver.selectPreallocationRankedFrontierV1(observations, 2);
  assert.deepEqual(widthTwo.members.map((entry) => entry.id), ["best", "first"]);
  assert.equal(widthTwo.considered, 4);
  assert.equal(widthTwo.retained, 2);
  assert.equal(widthTwo.width, 2);

  const widthFour = global.ScanwordSolver.selectPreallocationRankedFrontierV1(observations, 4);
  assert.deepEqual(widthFour.members.map((entry) => entry.id), ["best", "first", "second", "third"]);
  assert.equal(widthFour.retained, 4);

  assert.equal(global.ScanwordSolver.__preallocationRankedFrontierV1Installed, true);
  assert.equal(global.ScanwordPreallocationRankedFrontierV1.mode(), "shadow");
  assert.equal(global.ScanwordPreallocationRankedFrontierV1.width(), 2);
  assert.deepEqual(global.ScanwordPreallocationRankedFrontierV1.diagnosticWidths(), [1, 2, 4]);
  console.log(JSON.stringify({ passed: true }));
} finally {
  delete process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER;
  delete process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH;
  delete process.env.SCANWORD_PREALLOCATION_DIAGNOSTIC_WIDTHS;
}