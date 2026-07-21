"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
global.window = global;
for (const file of [
  "words.js",
  "short-words.js",
  "clues.js",
  "extra-dictionary.js",
  "two-letter-words.js",
  "core.js",
  "dictionary-policy.js",
  "lexical-policy-v2.js",
  "editorial-lexical-policy-v3.js",
  "solver.js",
  "closed-fill.js",
  "closed-fill-rollback.js",
  "construction-v2-runtime.js",
  "construction-v2.js",
  "construction-clue-feasibility-v1.js",
]) require(path.join(root, file));

function digestState(state) {
  const payload = {
    grid: state.grid.map((row) => row.map((cell) => ({
      type: cell.type,
      char: cell.char,
      slotIds: cell.slotIds,
      directions: cell.directions,
      clues: (cell.clues || []).map((clue) => ({
        slotId: clue.slotId,
        direction: clue.direction,
        text: clue.text,
        answer: clue.answer,
      })),
    }))),
    placed: state.placed,
    usedAnswers: [...state.usedAnswers].sort(),
    componentsStarted: state.componentsStarted,
    candidateChecks: state.candidateChecks,
    candidateLookups: state.candidateLookups,
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

const pool = window.ScanwordCore.generateWordPool(900, window.ScanwordCore.makeRandom("phase5-parity:pool"));
const poolIndex = window.ScanwordSolver.buildPoolIndex(pool);
process.env.SCANWORD_CLUE_FEASIBILITY = "off";
const baseline = window.ScanwordSolver.buildAttempt(
  pool,
  17,
  13,
  30,
  window.ScanwordCore.makeRandom("phase5-parity:placement"),
  poolIndex,
  "indexed",
);
process.env.SCANWORD_CLUE_FEASIBILITY = "shadow";
const shadow = window.ScanwordSolver.buildAttempt(
  pool,
  17,
  13,
  30,
  window.ScanwordCore.makeRandom("phase5-parity:placement"),
  poolIndex,
  "indexed",
);

const baselineDigest = digestState(baseline);
const shadowDigest = digestState(shadow);
assert.equal(shadowDigest, baselineDigest, "shadow estimator must preserve the exact placement stream");
assert.equal(shadow.placed.length, baseline.placed.length);
assert.ok(shadow.clueFeasibility?.placement?.candidateEvaluations > 0, "shadow mode must record candidate evaluations");

console.log(JSON.stringify({
  status: "passed",
  baselineDigest,
  shadowDigest,
  answers: shadow.placed.length,
  candidateEvaluations: shadow.clueFeasibility.placement.candidateEvaluations,
}));
