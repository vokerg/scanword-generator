"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const seedRunner = path.join(__dirname, "benchmark-seed.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 100);
const prefix = process.argv[3] || "closed-fill";
const samples = [];

for (let index = 0; index < runCount; index += 1) {
  const seed = `${prefix}-${index}`;
  const child = spawnSync(process.execPath, [seedRunner, seed], {
    cwd: root,
    encoding: "utf8",
    timeout: 90_000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, SCANWORD_CLOSED_FILL: "on" },
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Seed runner failed for ${seed}: ${child.stderr || child.stdout}`);
  const sample = JSON.parse(child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
  if (!sample.validation?.valid) throw new Error(`Invalid grid for ${seed}: ${JSON.stringify(sample.validation)}`);
  if (sample.components !== 1) throw new Error(`Disconnected answer graph for ${seed}: ${sample.components}`);
  if (!sample.exactCluesOnly) throw new Error(`Fallback clue used for ${seed}`);
  if (!sample.validationReport) throw new Error(`Validation report missing for ${seed}`);
  if (sample.closedFillMode !== "local-indexed-csp") throw new Error(`Active closed-fill path failed for ${seed}: ${sample.closedFillError || sample.closedFillMode}`);
  if (sample.panelsAfterClosedFill > sample.panelsBeforeClosedFill) {
    throw new Error(`Panel regression for ${seed}: ${sample.panelsBeforeClosedFill} -> ${sample.panelsAfterClosedFill}`);
  }
  samples.push(sample);
  console.log(JSON.stringify({
    type: "seed",
    seed,
    panelsBefore: sample.panelsBeforeClosedFill,
    panelsAfter: sample.panelsAfterClosedFill,
    rawLetterPercent: sample.rawLetterPercent,
    residualRegions: sample.residualRegions,
    regionsAttempted: sample.closedFillRegionsAttempted,
    regionsSolved: sample.closedFillRegionsSolved,
    slotsEnumerated: sample.closedFillSlotsEnumerated,
    topologiesTried: sample.closedFillTopologiesTried,
    cspNodes: sample.closedFillCspNodes,
    forwardPrunes: sample.closedFillForwardPrunes,
    patternChecks: sample.closedFillPatternChecks,
    elapsedMs: sample.elapsedMs,
  }));
}

const values = (key) => samples.map((sample) => sample[key]);
const sum = (items) => items.reduce((total, value) => total + value, 0);
const average = (items) => +(sum(items) / items.length).toFixed(2);
const zeroPanelSeeds = samples.filter((sample) => sample.panelCells === 0).length;
const improvedSeeds = samples.filter((sample) => sample.panelsAfterClosedFill < sample.panelsBeforeClosedFill).length;
const summary = {
  type: "summary",
  runs: samples.length,
  valid: samples.length,
  structuralRegressions: 0,
  lexicalRegressions: 0,
  averagePanelsBefore: average(values("panelsBeforeClosedFill")),
  averagePanelsAfter: average(values("panelsAfterClosedFill")),
  minimumPanelsAfter: Math.min(...values("panelsAfterClosedFill")),
  maximumPanelsAfter: Math.max(...values("panelsAfterClosedFill")),
  improvedSeeds,
  improvedPercent: +(improvedSeeds * 100 / samples.length).toFixed(1),
  zeroPanelSeeds,
  zeroPanelPercent: +(zeroPanelSeeds * 100 / samples.length).toFixed(1),
  averageRawLetterPercent: average(values("rawLetterPercent")),
  totalRegionsAttempted: sum(values("closedFillRegionsAttempted")),
  totalRegionsSolved: sum(values("closedFillRegionsSolved")),
  totalSlotsEnumerated: sum(values("closedFillSlotsEnumerated")),
  totalTopologiesTried: sum(values("closedFillTopologiesTried")),
  totalCspNodes: sum(values("closedFillCspNodes")),
  totalForwardPrunes: sum(values("closedFillForwardPrunes")),
  totalPatternChecks: sum(values("closedFillPatternChecks")),
  averageSeedMs: average(values("elapsedMs")),
  checkpointA: {
    averagePanelsAtMost8: average(values("panelsAfterClosedFill")) <= 8,
    maximumPanelsAtMost12: Math.max(...values("panelsAfterClosedFill")) <= 12,
    passed: average(values("panelsAfterClosedFill")) <= 8 && Math.max(...values("panelsAfterClosedFill")) <= 12,
  },
};
console.log(JSON.stringify(summary));