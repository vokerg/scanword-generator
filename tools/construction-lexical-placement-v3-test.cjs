"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;
window.ScanwordCore = {
  DIRECTIONS: {
    right: { dr: 0, dc: 1 },
    down: { dr: 1, dc: 0 },
  },
};
let delegated = 0;
window.ScanwordSolver = {
  buildAttempt(...args) {
    delegated += 1;
    return { delegated: true, args };
  },
};

require(path.resolve(__dirname, "..", "construction-lexical-placement-v3.js"));

Object.assign(process.env, {
  SCANWORD_WEAK_PLACEMENT_PENALTY: "12",
  SCANWORD_TWO_LETTER_PLACEMENT_PENALTY: "8",
  SCANWORD_THREE_LETTER_PLACEMENT_PENALTY: "4",
  SCANWORD_LEXICAL_QUALITY_PENALTY: "0.25",
  SCANWORD_GROWTH_LEXICAL_MULTIPLIER: "0",
  SCANWORD_DENSE_LEXICAL_MULTIPLIER: "0.65",
  SCANWORD_LENGTH_PLACEMENT_BONUS: "0",
});

const strongEntry = { answer: "РЕКА", weakFill: false, lexicalQuality: 95 };
const shortThreeEntry = { answer: "ЛЕС", weakFill: false, lexicalQuality: 75 };
const weakTwoEntry = { answer: "ИЛ", weakFill: true, lexicalQuality: 42 };

const strongGrowth = window.ScanwordSolver.lexicalPlacementAdjustmentV3(strongEntry, "growth");
const shortThreeGrowth = window.ScanwordSolver.lexicalPlacementAdjustmentV3(shortThreeEntry, "growth");
const weakTwoGrowth = window.ScanwordSolver.lexicalPlacementAdjustmentV3(weakTwoEntry, "growth");
const strongDense = window.ScanwordSolver.lexicalPlacementAdjustmentV3(strongEntry, "dense");
const shortThreeDense = window.ScanwordSolver.lexicalPlacementAdjustmentV3(shortThreeEntry, "dense");
const weakTwoDense = window.ScanwordSolver.lexicalPlacementAdjustmentV3(weakTwoEntry, "dense");

assert.equal(strongGrowth, 0, "growth scaffold must preserve original scoring");
assert.equal(shortThreeGrowth, 0, "growth scaffold must not reject short entries");
assert.equal(weakTwoGrowth, 0, "growth scaffold must remain reachable");
assert.equal(strongDense, 0, "strong words need no dense-fill penalty");
assert.ok(strongDense > shortThreeDense, "strong words should outrank short entries during dense fill");
assert.ok(shortThreeDense > weakTwoDense, "three-letter entries should outrank weak two-letter entries");
assert.ok(weakTwoDense < 0, "weak two-letter entries must remain penalized in dense fill");

process.env.SCANWORD_LEXICAL_PLACEMENT = "off";
const off = window.ScanwordSolver.buildAttempt("pool", 1, 1, 1, Math.random, {}, "indexed");
assert.equal(off.delegated, true);
assert.equal(delegated, 1);

process.env.SCANWORD_LEXICAL_PLACEMENT = "on";
const legacy = window.ScanwordSolver.buildAttempt("pool", 1, 1, 1, Math.random, {}, "legacy");
assert.equal(legacy.delegated, true, "legacy candidate mode must preserve the original builder");
assert.equal(delegated, 2);

console.log(JSON.stringify({
  lexicalPlacementStrategy: true,
  growthPreserved: true,
  strongDenseAdjustment: strongDense,
  shortThreeDenseAdjustment: shortThreeDense,
  weakTwoDenseAdjustment: weakTwoDense,
  baselineDelegation: true,
}));
