"use strict";

const path = require("node:path");

if (path.basename(process.argv[1] || "") !== "benchmark-seed-v3.cjs") return;

const root = path.resolve(__dirname, "..");
require(path.join(root, "construction-vocabulary-editorial-tiebreak-v1.js"));
require(path.join(root, "construction-clue-disambiguation-v1.js"));

if (!global.ScanwordSolver?.__vocabularyEditorialTieBreakV1Installed) {
  throw new Error("Selected-grid editorial tie-break wrapper was not installed");
}
if (!global.ScanwordSolver?.__clueDisambiguationV1Installed) {
  throw new Error("Selected-grid clue disambiguation wrapper was not installed");
}
