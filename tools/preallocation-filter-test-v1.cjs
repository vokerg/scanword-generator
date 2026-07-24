"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

global.window = global;
let phase10Calls = 0;

global.ScanwordClosedFill = {};
global.ScanwordCore = {
  generateWordPool() {
    throw new Error("fixture-filter-failure");
  },
};
global.ScanwordSolver = {
  generatePortfolio() {
    phase10Calls += 1;
    return {
      constructionV2: { mode: "phase10-fixture" },
      placed: [],
    };
  },
};

process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER = "off";
process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH = "96";

delete require.cache[require.resolve(path.join(root, "construction-preallocation-filter-v1.js"))];
require(path.join(root, "construction-preallocation-filter-v1.js"));

try {
  assert.equal(global.ScanwordSolver.__preallocationFilterV1Installed, true);
  assert.equal(global.ScanwordPreallocationFilterV1.mode(), "off");
  assert.equal(global.ScanwordPreallocationFilterV1.width(), 96);

  const off = global.ScanwordSolver.generatePortfolio("off-fixture", 1, 1, 1, 1);
  assert.equal(phase10Calls, 1);
  assert.equal(off.constructionV2.preallocationFilter, undefined);

  process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER = "filter";
  const fallback = global.ScanwordSolver.generatePortfolio("filter-fixture", 1, 1, 1, 1);
  assert.equal(phase10Calls, 2);
  assert.equal(fallback.constructionV2.mode, "phase10-fixture");
  assert.equal(fallback.constructionV2.preallocationFilter.mode, "filter");
  assert.equal(fallback.constructionV2.preallocationFilter.authoritative, true);
  assert.equal(fallback.constructionV2.preallocationFilter.fallbackUsed, true);
  assert.equal(fallback.constructionV2.preallocationFilter.fallbackReason, "filter-error");
  assert.match(fallback.constructionV2.preallocationFilter.error, /fixture-filter-failure/);
  assert.equal(fallback.constructionV2.preallocationFilter.rollback, "SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off");

  console.log(JSON.stringify({ passed: true }));
} finally {
  delete process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER;
  delete process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH;
}