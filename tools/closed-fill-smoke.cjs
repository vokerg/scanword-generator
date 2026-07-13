"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
global.window = global;
process.env.SCANWORD_CLOSED_FILL = "on";

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

const samples = [];
for (const seed of ["closed-fill-smoke-0", "closed-fill-smoke-1", "closed-fill-smoke-2"]) {
  const result = window.ScanwordSolver.generateBest(seed, window.RUSSIAN_WORDS.length, 17, 13, 30, 27);
  assert.equal(result.validation?.valid, true, `${seed}: structural validation failed`);
  assert.equal(result.components, 1, `${seed}: disconnected answer graph`);
  assert.equal(result.placed.every((entry) => entry.hasExactClue), true, `${seed}: fallback clue used`);
  assert.ok(result.validationReport, `${seed}: validation report missing`);
  assert.ok(Number.isFinite(result.rawLetterCoverage), `${seed}: raw letter coverage missing`);
  assert.equal(result.closedFill?.mode, "local-indexed-csp", `${seed}: active CSP mode not reached`);
  assert.equal(result.closedFill?.error, undefined, `${seed}: ${result.closedFill?.error}`);
  assert.ok(result.closedFill.panelsAfter <= result.closedFill.panelsBefore, `${seed}: panel regression`);
  samples.push({
    seed,
    panelsBefore: result.closedFill.panelsBefore,
    panelsAfter: result.closedFill.panelsAfter,
    regionsSolved: result.closedFill.regionsSolved,
    rawLetterPercent: +(result.rawLetterCoverage * 100).toFixed(1),
    cspNodes: result.closedFill.cspNodes,
  });
}

console.log(JSON.stringify({ valid: samples.length, samples }));