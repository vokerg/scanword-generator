"use strict";

const path = require("node:path");

if (path.basename(process.argv[1] || "") !== "benchmark-seed-v3.cjs") return;

const root = path.resolve(__dirname, "..");
require(path.join(root, "construction-selected-grid-clue-metrics-v1.js"));

if (!global.ScanwordSolver?.__selectedGridClueMetricsV1Installed) {
  throw new Error("Selected-grid clue telemetry is unavailable");
}

global.SCANWORD_V8_BASELINE_BOOTSTRAP = {
  version: 1,
  productionBootstrap: "node-benchmark-bootstrap-v1",
  telemetry: "selected-grid-clue-metrics-v1",
  clueDisambiguation: "off",
};
