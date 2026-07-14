"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const worker = path.join(__dirname, "benchmark-seed.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 8);
const prefix = process.argv[3] || "construction-portfolio";
const samples = [];

function run(seed, mode) {
  const env = {
    ...process.env,
    SCANWORD_CONSTRUCTION_MODE: mode,
    SCANWORD_CLOSED_FILL: "diagnostic",
  };
  if (mode === "portfolio") {
    Object.assign(env, {
      SCANWORD_PORTFOLIO_ATTEMPTS: process.env.SCANWORD_PORTFOLIO_ATTEMPTS || "120",
      SCANWORD_PORTFOLIO_CLUE_RESTARTS: process.env.SCANWORD_PORTFOLIO_CLUE_RESTARTS || "160",
      SCANWORD_VICTIM_BASES: process.env.SCANWORD_VICTIM_BASES || "8",
      SCANWORD_VICTIM_VARIANTS: process.env.SCANWORD_VICTIM_VARIANTS || "6",
    });
  }
  const child = spawnSync(process.execPath, [worker, seed], {
    cwd: root,
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 4 * 1024 * 1024,
    env,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${mode} failed for ${seed}: ${child.stderr || child.stdout}`);
  const sample = JSON.parse(child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
  if (!sample.validation?.valid) throw new Error(`${mode} invalid for ${seed}: ${JSON.stringify(sample.validation)}`);
  if (sample.components !== 1) throw new Error(`${mode} disconnected for ${seed}`);
  if (!sample.exactCluesOnly) throw new Error(`${mode} fallback clue for ${seed}`);
  if (!sample.coverageCheckpointPassed) throw new Error(`${mode} missed preserved checkpoint for ${seed}`);
  return sample;
}

for (let index = 0; index < runCount; index += 1) {
  const seed = `${prefix}-${index}`;
  const legacy = run(seed, "legacy");
  const v2 = run(seed, "portfolio");
  const victim = v2.constructionV2?.victimReplacement || v2.constructionV2?.victim || null;
  const row = {
    seed,
    legacyPanels: legacy.panelCells,
    v2Panels: v2.panelCells,
    panelDelta: v2.panelCells - legacy.panelCells,
    legacyRaw: legacy.rawLetterPercent,
    v2Raw: v2.rawLetterPercent,
    rawDelta: +(v2.rawLetterPercent - legacy.rawLetterPercent).toFixed(1),
    legacyAnswers: legacy.answers,
    v2Answers: v2.answers,
    v2Mode: v2.constructionMode,
    v2Fallback: v2.constructionV2?.mode === "portfolio-fallback",
    victimSelected: Boolean(v2.constructionV2?.selectedVictimReplacement),
    victimBasesExpanded: victim?.basesExpanded || victim?.baseCandidatesTried || 0,
    victimStatesAccepted: victim?.statesAccepted || 0,
    victimFinalists: victim?.finalistsEvaluated || victim?.variantsFinalized || 0,
    victimCheckpointValid: victim?.finalistsPassingCheckpoint || victim?.variantsCheckpointValid || 0,
    victimBundlesTried: victim?.bundlesTried || 0,
    v2Telemetry: v2.constructionV2,
    legacyMs: legacy.elapsedMs,
    v2Ms: v2.elapsedMs,
  };
  samples.push(row);
  console.log(JSON.stringify({ type: "seed", ...row }));
}

const average = (values) => +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
const improved = samples.filter((sample) => sample.panelDelta < 0).length;
const regressed = samples.filter((sample) => sample.panelDelta > 0).length;
const fallbacks = samples.filter((sample) => sample.v2Fallback).length;
console.log(JSON.stringify({
  type: "summary",
  diagnostic: "identical attempt seeds; panel-first portfolio plus bounded pre-layout victim replacement; exact legacy baseline guard",
  runs: samples.length,
  validLegacy: samples.length,
  validV2: samples.length,
  averageLegacyPanels: average(samples.map((sample) => sample.legacyPanels)),
  averageV2Panels: average(samples.map((sample) => sample.v2Panels)),
  maximumLegacyPanels: Math.max(...samples.map((sample) => sample.legacyPanels)),
  maximumV2Panels: Math.max(...samples.map((sample) => sample.v2Panels)),
  averageLegacyRaw: average(samples.map((sample) => sample.legacyRaw)),
  averageV2Raw: average(samples.map((sample) => sample.v2Raw)),
  improvedSeeds: improved,
  regressedSeeds: regressed,
  unchangedSeeds: samples.length - improved - regressed,
  v2Fallbacks: fallbacks,
  victimSelectedSeeds: samples.filter((sample) => sample.victimSelected).length,
  averageVictimBasesExpanded: average(samples.map((sample) => sample.victimBasesExpanded)),
  averageVictimStatesAccepted: average(samples.map((sample) => sample.victimStatesAccepted)),
  averageVictimFinalists: average(samples.map((sample) => sample.victimFinalists)),
  averageVictimCheckpointValid: average(samples.map((sample) => sample.victimCheckpointValid)),
  averageVictimBundlesTried: average(samples.map((sample) => sample.victimBundlesTried)),
  averageLegacyMs: average(samples.map((sample) => sample.legacyMs)),
  averageV2Ms: average(samples.map((sample) => sample.v2Ms)),
}));