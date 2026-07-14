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
      SCANWORD_VICTIM_SECONDARY_WORDS: process.env.SCANWORD_VICTIM_SECONDARY_WORDS || "3",
      SCANWORD_VICTIM_SECONDARY_VARIANTS: process.env.SCANWORD_VICTIM_SECONDARY_VARIANTS || "4",
      SCANWORD_VICTIM_SECONDARY_FINALISTS: process.env.SCANWORD_VICTIM_SECONDARY_FINALISTS || "6",
      SCANWORD_REPACK_NODES: process.env.SCANWORD_REPACK_NODES || "60000",
      SCANWORD_REPACK_CANDIDATES: process.env.SCANWORD_REPACK_CANDIDATES || "24",
      SCANWORD_REPACK_BRANCH: process.env.SCANWORD_REPACK_BRANCH || "10",
    });
  }
  const child = spawnSync(process.execPath, [worker, seed], {
    cwd: root,
    encoding: "utf8",
    timeout: 300_000,
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
  const repack = v2.constructionV2?.clueRepack || null;
  const adaptive = v2.constructionV2?.adaptiveClueRepack || null;
  const guardSelected = v2.constructionV2?.baselineGuard?.selected || "portfolio";
  const selectedVictim = guardSelected !== "legacy" ? v2.constructionV2?.selectedVictimReplacement : null;
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
    legacyClueTextCells: legacy.clueTextCells,
    v2ClueTextCells: v2.clueTextCells,
    v2Mode: v2.constructionMode,
    v2Fallback: v2.constructionV2?.mode === "portfolio-fallback",
    victimSelected: Boolean(selectedVictim),
    selectedVictimDepth: Number(selectedVictim?.depth || 0),
    victimBasesExpanded: victim?.basesExpanded || victim?.baseCandidatesTried || 0,
    victimStatesAccepted: victim?.statesAccepted || 0,
    victimFinalists: victim?.finalistsEvaluated || victim?.variantsFinalized || 0,
    victimCheckpointValid: victim?.finalistsPassingCheckpoint || victim?.variantsCheckpointValid || 0,
    victimBundlesTried: victim?.bundlesTried || 0,
    secondaryVictimsRemoved: victim?.secondaryVictimsRemoved || 0,
    secondaryStatesAccepted: victim?.secondaryStatesAccepted || 0,
    secondaryFinalists: victim?.secondaryFinalists || 0,
    clueRepackAccepted: Boolean(repack?.accepted && guardSelected !== "legacy"),
    clueRepackNodes: repack?.nodes || 0,
    clueRepackGain: Number(repack?.baselineClueTextCells != null && repack?.optimizedClueTextCells != null
      ? repack.optimizedClueTextCells - repack.baselineClueTextCells
      : 0),
    adaptiveClueRepackAttempted: Boolean(adaptive?.attempted && guardSelected !== "legacy"),
    adaptiveClueRepackAccepted: Boolean(adaptive?.accepted && guardSelected !== "legacy"),
    adaptiveEligibleClues: adaptive?.eligibleClues || 0,
    adaptivePanelGain: Number(adaptive?.panelsBefore != null && adaptive?.panelsAfter != null
      ? adaptive.panelsBefore - adaptive.panelsAfter
      : 0),
    adaptiveNodes: adaptive?.inner?.nodes || 0,
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
  diagnostic: "identical attempt seeds; victim replacement, exact component clue packing, adaptive four-cell footprint pass and exact legacy guard",
  runs: samples.length,
  validLegacy: samples.length,
  validV2: samples.length,
  averageLegacyPanels: average(samples.map((sample) => sample.legacyPanels)),
  averageV2Panels: average(samples.map((sample) => sample.v2Panels)),
  maximumLegacyPanels: Math.max(...samples.map((sample) => sample.legacyPanels)),
  maximumV2Panels: Math.max(...samples.map((sample) => sample.v2Panels)),
  averageLegacyRaw: average(samples.map((sample) => sample.legacyRaw)),
  averageV2Raw: average(samples.map((sample) => sample.v2Raw)),
  averageLegacyClueTextCells: average(samples.map((sample) => sample.legacyClueTextCells)),
  averageV2ClueTextCells: average(samples.map((sample) => sample.v2ClueTextCells)),
  improvedSeeds: improved,
  regressedSeeds: regressed,
  unchangedSeeds: samples.length - improved - regressed,
  v2Fallbacks: fallbacks,
  victimSelectedSeeds: samples.filter((sample) => sample.victimSelected).length,
  depthTwoSelectedSeeds: samples.filter((sample) => sample.selectedVictimDepth === 2).length,
  clueRepackAcceptedSeeds: samples.filter((sample) => sample.clueRepackAccepted).length,
  averageClueRepackGain: average(samples.map((sample) => sample.clueRepackGain)),
  averageClueRepackNodes: average(samples.map((sample) => sample.clueRepackNodes)),
  adaptiveClueRepackAttemptedSeeds: samples.filter((sample) => sample.adaptiveClueRepackAttempted).length,
  adaptiveClueRepackAcceptedSeeds: samples.filter((sample) => sample.adaptiveClueRepackAccepted).length,
  averageAdaptivePanelGain: average(samples.map((sample) => sample.adaptivePanelGain)),
  averageAdaptiveNodes: average(samples.map((sample) => sample.adaptiveNodes)),
  averageVictimBasesExpanded: average(samples.map((sample) => sample.victimBasesExpanded)),
  averageVictimStatesAccepted: average(samples.map((sample) => sample.victimStatesAccepted)),
  averageVictimFinalists: average(samples.map((sample) => sample.victimFinalists)),
  averageVictimCheckpointValid: average(samples.map((sample) => sample.victimCheckpointValid)),
  averageVictimBundlesTried: average(samples.map((sample) => sample.victimBundlesTried)),
  averageSecondaryVictimsRemoved: average(samples.map((sample) => sample.secondaryVictimsRemoved)),
  averageSecondaryStatesAccepted: average(samples.map((sample) => sample.secondaryStatesAccepted)),
  averageSecondaryFinalists: average(samples.map((sample) => sample.secondaryFinalists)),
  averageLegacyMs: average(samples.map((sample) => sample.legacyMs)),
  averageV2Ms: average(samples.map((sample) => sample.v2Ms)),
}));
