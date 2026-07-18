"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
global.window = global;
process.env.SCANWORD_CLOSED_FILL = "diagnostic";

for (const file of [
  "words.js",
  "short-words.js",
  "clues.js",
  "extra-dictionary.js",
  "two-letter-words.js",
  "core.js",
  "dictionary-policy.js",
  "solver.js",
  "closed-fill.js",
]) {
  require(path.join(root, file));
}

const runCount = Math.max(1, Number(process.argv[2]) || 10);
const samples = [];
for (let index = 0; index < runCount; index += 1) {
  const seed = `closed-fill-probe-${index}`;
  const baseline = window.ScanwordSolver.generateBest(seed, window.RUSSIAN_WORDS.length, 17, 13, 30, 27);
  const beforeRegions = window.ScanwordClosedFill.extractResidualRegions(baseline);
  const closed = window.ScanwordClosedFill.closeResidualRegions(baseline, baseline.pool, {
    maxRegions: 64,
    maxSlotCandidates: 256,
    maxTopologies: 96,
    maxTopologyNodes: 8000,
    maxCspNodes: 12000,
  });
  const result = closed.result;
  assert.equal(result.validation?.valid, true, `${seed}: structural validation failed`);
  assert.equal(result.components, 1, `${seed}: disconnected answer graph`);
  assert.equal(result.placed.every((entry) => entry.hasExactClue), true, `${seed}: fallback clue used`);
  assert.ok(closed.telemetry.panelsAfter <= closed.telemetry.panelsBefore, `${seed}: panel regression`);
  samples.push({
    seed,
    panelsBefore: closed.telemetry.panelsBefore,
    panelsAfter: closed.telemetry.panelsAfter,
    regionSizes: beforeRegions.map((region) => region.size).sort((a, b) => b - a),
    regionsAttempted: closed.telemetry.regionsAttempted,
    regionsSolved: closed.telemetry.regionsSolved,
    slotsEnumerated: closed.telemetry.slotsEnumerated,
    topologiesEnumerated: closed.telemetry.topologiesEnumerated,
    topologiesTried: closed.telemetry.topologiesTried,
    cspNodes: closed.telemetry.cspNodes,
    patternChecks: closed.telemetry.patternChecks,
  });
}

console.log(JSON.stringify({
  runs: samples.length,
  improvedSeeds: samples.filter((sample) => sample.panelsAfter < sample.panelsBefore).length,
  totalRegionsAttempted: samples.reduce((sum, sample) => sum + sample.regionsAttempted, 0),
  totalRegionsSolved: samples.reduce((sum, sample) => sum + sample.regionsSolved, 0),
  totalSlotsEnumerated: samples.reduce((sum, sample) => sum + sample.slotsEnumerated, 0),
  totalTopologiesTried: samples.reduce((sum, sample) => sum + sample.topologiesTried, 0),
  totalCspNodes: samples.reduce((sum, sample) => sum + sample.cspNodes, 0),
  totalPatternChecks: samples.reduce((sum, sample) => sum + sample.patternChecks, 0),
  samples,
}));