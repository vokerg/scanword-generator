"use strict";

const fs = require("node:fs");
const path = require("node:path");

const outputDir = path.resolve(process.argv[2] || "research-output/adaptive-partial-search");
const recordsPath = path.join(outputDir, "per-seed.jsonl");
const aggregatePath = path.join(outputDir, "aggregate.json");
if (!fs.existsSync(recordsPath) || !fs.existsSync(aggregatePath)) {
  throw new Error(`Missing adaptive-search evidence in ${outputDir}`);
}

const records = fs.readFileSync(recordsPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const aggregate = JSON.parse(fs.readFileSync(aggregatePath, "utf8"));
const requested = aggregate.seeds.length;
const byMode = Object.fromEntries(["off", "shadow", "beam"].map((mode) => [
  mode,
  new Map(records.filter((record) => record.mode === mode).map((record) => [record.seed, record])),
]));
const failures = [];

function compareObjective(candidate, baseline) {
  return candidate.panels - baseline.panels
    || baseline.answers - candidate.answers
    || baseline.crossings - candidate.crossings
    || baseline.rawLetterPercent - candidate.rawLetterPercent
    || candidate.formulaicShortCount - baseline.formulaicShortCount
    || candidate.editorialPenalty - baseline.editorialPenalty
    || candidate.twoLetterCount - baseline.twoLetterCount;
}

for (const mode of ["off", "shadow", "beam"]) {
  const summary = aggregate.modes?.[mode];
  if (!summary || summary.completed !== requested) failures.push(`${mode}: incomplete evidence`);
  if (summary?.validity?.invalid) failures.push(`${mode}: invalid grids`);
  if (summary?.validity?.disconnected) failures.push(`${mode}: disconnected grids`);
  if (summary?.validity?.nonExactClues) failures.push(`${mode}: non-exact clues`);
  if (summary?.validity?.checkpointFailures) failures.push(`${mode}: checkpoint failures`);
}

let objectiveImprovements = 0;
let panelImprovements = 0;
let selectedBeamSeeds = 0;
let selectedBeamWithAncestry = 0;
let totalProbedLimits = 0;
let totalSkippedLimits = 0;
const objectiveRegressions = [];
for (const seed of aggregate.seeds) {
  const baseline = byMode.off.get(seed);
  const shadow = byMode.shadow.get(seed);
  const beam = byMode.beam.get(seed);
  if (!baseline || !shadow || !beam) continue;
  if (shadow.resultDigest !== baseline.resultDigest) failures.push(`shadow: digest mismatch on ${seed}`);
  const comparison = compareObjective(beam, baseline);
  if (comparison > 0) objectiveRegressions.push({ seed, baseline, beam });
  if (comparison < 0) objectiveImprovements += 1;
  if (beam.panels < baseline.panels) panelImprovements += 1;
  const selected = beam.partialSearch?.selected || null;
  if (selected?.selectedVariant === "beam") {
    selectedBeamSeeds += 1;
    if ((selected.ancestry || []).some((step) => step.kind === "beam")) selectedBeamWithAncestry += 1;
  }
  const portfolio = beam.partialSearch?.portfolio || {};
  if (portfolio.policy !== "adaptive") failures.push(`beam: missing adaptive policy on ${seed}`);
  totalProbedLimits += Number(portfolio.probedLimits?.length || 0);
  totalSkippedLimits += Number(portfolio.skippedLimits?.length || 0);
}

if (objectiveRegressions.length) failures.push(`beam: ${objectiveRegressions.length} complete-objective regressions`);
if (panelImprovements <= 0) failures.push("beam: no panel improvement");
if (objectiveImprovements <= 0) failures.push("beam: no complete-objective improvement");
if (selectedBeamSeeds <= 0) failures.push("beam: no selected beam output");
if (selectedBeamWithAncestry !== selectedBeamSeeds) failures.push("beam: selected beam ancestry incomplete");
if (Number(aggregate.modes?.beam?.search?.nodes || 0) <= 0) failures.push("beam: no expanded nodes");
if (Number(aggregate.modes?.beam?.search?.maximumDepthReached || 0) <= 0) failures.push("beam: no search depth reached");
if (totalSkippedLimits <= 0) failures.push("beam: adaptive policy skipped no active-set probes");
if (totalProbedLimits >= requested * 2) failures.push("beam: adaptive policy did not reduce probe count");
const shadowRatio = Number(aggregate.comparisons?.shadow?.runtimeRatio || 0);
const beamRatio = Number(aggregate.comparisons?.beam?.runtimeRatio || 0);
const maxShadowRatio = Number(process.env.SCANWORD_ADAPTIVE_SEARCH_MAX_SHADOW_RUNTIME_RATIO || 1.65);
const maxBeamRatio = Number(process.env.SCANWORD_ADAPTIVE_SEARCH_MAX_RUNTIME_RATIO || 1.45);
if (shadowRatio > maxShadowRatio) failures.push(`shadow: runtime ratio ${shadowRatio.toFixed(4)} exceeds ${maxShadowRatio.toFixed(2)}`);
if (beamRatio > maxBeamRatio) failures.push(`beam: runtime ratio ${beamRatio.toFixed(4)} exceeds ${maxBeamRatio.toFixed(2)}`);
if (beamRatio >= 1.6484) failures.push(`beam: runtime ratio ${beamRatio.toFixed(4)} did not improve on Phase 6`);

const acceptance = {
  schemaVersion: 1,
  phase: "phase-7-adaptive-partial-search",
  requested,
  passed: failures.length === 0,
  failures,
  objectiveImprovements,
  panelImprovements,
  selectedBeamSeeds,
  selectedBeamWithAncestry,
  totalProbedLimits,
  totalSkippedLimits,
  shadowRuntimeRatio: shadowRatio,
  maximumShadowRuntimeRatio: maxShadowRatio,
  beamRuntimeRatio: beamRatio,
  maximumBeamRuntimeRatio: maxBeamRatio,
  objectiveRegressions: objectiveRegressions.map(({ seed, baseline, beam }) => ({
    seed,
    baseline: { panels: baseline.panels, answers: baseline.answers, crossings: baseline.crossings },
    beam: { panels: beam.panels, answers: beam.answers, crossings: beam.crossings },
  })),
};
fs.writeFileSync(path.join(outputDir, "adaptive-acceptance.json"), `${JSON.stringify(acceptance, null, 2)}\n`);
console.log(JSON.stringify(acceptance));
if (failures.length) throw new Error(`Adaptive partial-search acceptance failed: ${failures.join(", ")}`);
