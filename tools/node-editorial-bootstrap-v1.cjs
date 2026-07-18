"use strict";

const path = require("node:path");

if (path.basename(process.argv[1] || "") !== "benchmark-seed-v3.cjs") return;

require(path.resolve(__dirname, "..", "construction-vocabulary-editorial-tiebreak-v1.js"));

if (!global.ScanwordSolver?.__vocabularyEditorialTieBreakV1Installed) {
  throw new Error("Selected-grid editorial tie-break wrapper was not installed");
}
