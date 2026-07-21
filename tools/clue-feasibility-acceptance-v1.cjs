"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const outputDir = path.resolve(process.argv[2] || "research-output/clue-feasibility");
const aggregatePath = path.join(outputDir, "aggregate.json");
const manifestPath = path.join(outputDir, "run-manifest.json");
const aggregate = JSON.parse(fs.readFileSync(aggregatePath, "utf8"));
const failures = [];

function requireMode(name) {
  const summary = aggregate.modes?.[name];
  if (!summary) {
    failures.push(`${name}: missing summary`);
    return null;
  }
  if (summary.completed !== aggregate.seeds.length) failures.push(`${name}: incomplete runs`);
  if (summary.validity.invalid) failures.push(`${name}: invalid grids`);
  if (summary.validity.disconnected) failures.push(`${name}: disconnected grids`);
  if (summary.validity.nonExactClues) failures.push(`${name}: non-exact clues`);
  if (summary.validity.checkpointFailures) failures.push(`${name}: checkpoint failures`);
  return summary;
}

const baseline = requireMode("off");
const shadow = requireMode("shadow");
const comparison = aggregate.comparisons?.shadow;
if (!comparison) failures.push("shadow: missing comparison");
if (comparison && comparison.exactDigestParity !== comparison.pairedSeeds) failures.push("shadow: exact output parity failed");
if (comparison?.panelRegressions?.length) failures.push("shadow: panel regressions");
if (comparison?.editorialRegressions?.length) failures.push("shadow: editorial regressions");
if (comparison && comparison.runtimeRatio > 1.15) {
  failures.push(`shadow: runtime ratio ${comparison.runtimeRatio.toFixed(4)} exceeds 1.15`);
}
if (shadow) {
  if (shadow.estimator.falseNegatives) failures.push("shadow: dangerous complete-state false negatives");
  if (shadow.estimator.falsePositiveRate > 0.12) failures.push("shadow: false-positive rate exceeds 12%");
  if (shadow.estimator.meanClueTextAbsoluteError > 6) failures.push("shadow: clue-text mean absolute error exceeds 6");
  if (shadow.estimator.meanExternalAbsoluteError > 3) failures.push("shadow: external-clue mean absolute error exceeds 3");
  if (shadow.estimator.candidateEvaluations <= 0) failures.push("shadow: no incremental candidate evaluations");
  if (shadow.estimator.completeStates <= 0) failures.push("shadow: no complete-state calibration");
  if (shadow.estimator.selectedFalseNegatives) failures.push("shadow: selected-grid false negatives");
}
if (!baseline) failures.push("off: baseline unavailable");

aggregate.gate = {
  schemaVersion: 1,
  name: "phase-5-shadow-calibration-v1",
  passed: failures.length === 0,
  failures,
  limits: {
    runtimeRatioMaximum: 1.15,
    falsePositiveRateMaximum: 0.12,
    clueTextMeanAbsoluteErrorMaximum: 6,
    externalClueMeanAbsoluteErrorMaximum: 3,
    falseNegativesMaximum: 0,
    exactOutputParityRequired: true,
  },
};
fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`);

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.files.aggregate.digest = `sha256:${crypto.createHash("sha256").update(fs.readFileSync(aggregatePath)).digest("hex")}`;
  manifest.acceptance = {
    gate: aggregate.gate.name,
    passed: aggregate.gate.passed,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(JSON.stringify({
  type: "clue-feasibility-acceptance",
  gate: aggregate.gate,
  baselineRuntimeMs: baseline?.runtime?.totalMs || 0,
  shadowRuntimeMs: shadow?.runtime?.totalMs || 0,
  runtimeRatio: comparison?.runtimeRatio || 0,
}));
if (failures.length) throw new Error(`Clue-feasibility acceptance failed: ${failures.join(", ")}`);
