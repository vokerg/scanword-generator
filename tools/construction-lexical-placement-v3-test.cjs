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

const strong = window.ScanwordSolver.lexicalPlacementAdjustmentV3({
  answer: "РЕКА",
  weakFill: false,
  lexicalQuality: 95,
});
const weakTwo = window.ScanwordSolver.lexicalPlacementAdjustmentV3({
  answer: "ИЛ",
  weakFill: true,
  lexicalQuality: 42,
});
const weakTwoDense = window.ScanwordSolver.lexicalPlacementAdjustmentV3({
  answer: "ИЛ",
  weakFill: true,
  lexicalQuality: 42,
}, "dense");
const shortThree = window.ScanwordSolver.lexicalPlacementAdjustmentV3({
  answer: "ЛЕС",
  weakFill: false,
  lexicalQuality: 75,
});

assert.ok(strong > shortThree, "strong common words should outrank short entries");
assert.ok(shortThree > weakTwo, "three-letter entries should outrank weak two-letter entries");
assert.ok(weakTwoDense > weakTwo, "dense fill should relax, but not remove, the lexical penalty");
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
  strongAdjustment: strong,
  shortThreeAdjustment: shortThree,
  weakTwoAdjustment: weakTwo,
  weakTwoDenseAdjustment: weakTwoDense,
  baselineDelegation: true,
}));
