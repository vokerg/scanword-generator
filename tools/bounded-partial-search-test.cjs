"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

if (!global.window?.ScanwordSolver || !global.window?.ScanwordCore || !global.window?.RUSSIAN_WORDS) {
  throw new Error("Run with tools/node-benchmark-bootstrap-v1.cjs preloaded through NODE_OPTIONS");
}

function digestState(state) {
  const payload = {
    grid: state.grid.map((row) => row.map((cell) => ({
      type: cell.type,
      char: cell.char || null,
      slotIds: [...(cell.slotIds || [])],
      directions: [...(cell.directions || [])],
      clues: (cell.clues || []).map((clue) => [clue.slotId, clue.direction, clue.answer]),
    }))),
    placed: state.placed.map((word) => [
      word.answer,
      word.direction,
      word.clueRow,
      word.clueCol,
      word.startRow,
      word.startCol,
    ]),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

const core = window.ScanwordCore;
const solver = window.ScanwordSolver;
const pool = core.generateWordPool(2500, core.makeRandom("phase6-test:pool"));
const poolIndex = solver.buildPoolIndex(pool);

process.env.SCANWORD_CLUE_FEASIBILITY = "off";
process.env.SCANWORD_PARTIAL_SEARCH = "off";
const off = solver.buildAttempt(pool, 17, 13, 30, core.makeRandom("phase6-test:attempt"), poolIndex, "indexed");
assert.equal(off.partialSearch, undefined, "off mode must delegate without Phase 6 telemetry");
assert.equal(solver.validateGrid(off.grid, off.placed).valid, true, "off state must remain valid");

process.env.SCANWORD_PARTIAL_SEARCH = "shadow";
process.env.SCANWORD_PARTIAL_SEARCH_RATE = "1";
process.env.SCANWORD_PARTIAL_SEARCH_START = "24";
process.env.SCANWORD_PARTIAL_SEARCH_DEPTH = "3";
process.env.SCANWORD_PARTIAL_SEARCH_BEAM = "3";
process.env.SCANWORD_PARTIAL_SEARCH_BRANCHING = "3";
process.env.SCANWORD_PARTIAL_SEARCH_NODES = "24";
const shadow = solver.buildAttempt(pool, 17, 13, 30, core.makeRandom("phase6-test:attempt"), poolIndex, "indexed");
assert.equal(digestState(shadow), digestState(off), "shadow mode must return the exact greedy state");
assert.equal(shadow.partialSearch?.sampled, true, "shadow test must execute the bounded search");
assert.equal(shadow.partialSearch?.selectedVariant, "baseline", "shadow mode must preserve baseline output");
assert.ok(shadow.partialSearch.nodes <= 24, "node budget must be enforced");
assert.ok(shadow.partialSearch.finalists <= 3, "finalist count must be bounded by beam width");

process.env.SCANWORD_PARTIAL_SEARCH = "beam";
const beamA = solver.buildAttempt(pool, 17, 13, 30, core.makeRandom("phase6-test:attempt"), poolIndex, "indexed");
const beamB = solver.buildAttempt(pool, 17, 13, 30, core.makeRandom("phase6-test:attempt"), poolIndex, "indexed");
assert.equal(digestState(beamA), digestState(beamB), "beam search must be deterministic for an identical attempt seed");
assert.equal(solver.validateGrid(beamA.grid, beamA.placed).valid, true, "beam-selected state must remain structurally valid");
assert.equal(solver.resultMetrics(beamA).components, 1, "beam-selected state must remain connected");
assert.ok(beamA.partialSearch?.nodes <= 24, "beam mode must enforce node budget");
assert.ok(["baseline", "beam"].includes(beamA.partialSearch?.selectedVariant), "selection provenance must be explicit");
if (beamA.partialSearch?.selectedVariant === "beam") {
  assert.ok((beamA.partialSearch.ancestry || []).some((step) => step.kind === "beam"), "beam selection must retain ancestry");
}

console.log(JSON.stringify({
  schemaVersion: 1,
  offDigest: digestState(off),
  shadowDigest: digestState(shadow),
  beamDigest: digestState(beamA),
  selectedVariant: beamA.partialSearch?.selectedVariant,
  nodes: beamA.partialSearch?.nodes,
  depthReached: beamA.partialSearch?.depthReached,
  finalists: beamA.partialSearch?.finalists,
}));
