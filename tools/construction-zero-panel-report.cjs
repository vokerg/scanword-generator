"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const worker = path.join(__dirname, "benchmark-seed.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 20);
const prefix = process.argv[3] || "construction-checkpoint";
const samples = [];

function environment(zeroPanelPass) {
  const env = {
    ...process.env,
    SCANWORD_CONSTRUCTION_MODE: "portfolio",
    SCANWORD_CLOSED_FILL: "diagnostic",
    SCANWORD_PORTFOLIO_ATTEMPTS: process.env.SCANWORD_PORTFOLIO_ATTEMPTS || "240",
    SCANWORD_PORTFOLIO_CLUE_RESTARTS: process.env.SCANWORD_PORTFOLIO_CLUE_RESTARTS || "160",
    SCANWORD_VICTIM_BASES: process.env.SCANWORD_VICTIM_BASES || "8",
    SCANWORD_VICTIM_VARIANTS: process.env.SCANWORD_VICTIM_VARIANTS || "6",
    SCANWORD_VICTIM_SECONDARY_WORDS: process.env.SCANWORD_VICTIM_SECONDARY_WORDS || "3",
    SCANWORD_VICTIM_SECONDARY_VARIANTS: process.env.SCANWORD_VICTIM_SECONDARY_VARIANTS || "4",
    SCANWORD_VICTIM_SECONDARY_FINALISTS: process.env.SCANWORD_VICTIM_SECONDARY_FINALISTS || "6",
    SCANWORD_TARGETED_VICTIM_REGIONS: process.env.SCANWORD_TARGETED_VICTIM_REGIONS || "3",
    SCANWORD_TARGETED_VICTIM_WORDS: process.env.SCANWORD_TARGETED_VICTIM_WORDS || "4",
    SCANWORD_TARGETED_VICTIM_DEPTH: process.env.SCANWORD_TARGETED_VICTIM_DEPTH || "2",
    SCANWORD_TARGETED_VICTIM_BEAM: process.env.SCANWORD_TARGETED_VICTIM_BEAM || "5",
    SCANWORD_TARGETED_VICTIM_BRANCHING: process.env.SCANWORD_TARGETED_VICTIM_BRANCHING || "18",
    SCANWORD_TARGETED_VICTIM_VARIANTS: process.env.SCANWORD_TARGETED_VICTIM_VARIANTS || "8",
    SCANWORD_TARGETED_EXACT_VARIANTS: process.env.SCANWORD_TARGETED_EXACT_VARIANTS || "4",
    SCANWORD_TARGETED_EXACT_REPACK_NODES: process.env.SCANWORD_TARGETED_EXACT_REPACK_NODES || "120000",
    SCANWORD_TARGETED_EXACT_REPACK_CANDIDATES: process.env.SCANWORD_TARGETED_EXACT_REPACK_CANDIDATES || "20",
    SCANWORD_TARGETED_EXACT_REPACK_BRANCH: process.env.SCANWORD_TARGETED_EXACT_REPACK_BRANCH || "14",
    SCANWORD_REPACK_NODES: process.env.SCANWORD_REPACK_NODES || "600000",
    SCANWORD_REPACK_CANDIDATES: process.env.SCANWORD_REPACK_CANDIDATES || "24",
    SCANWORD_REPACK_BRANCH: process.env.SCANWORD_REPACK_BRANCH || "24",
  };
  if (zeroPanelPass) env.SCANWORD_ZERO_PANEL_PASS = "on";
  else delete env.SCANWORD_ZERO_PANEL_PASS;
  return env;
}

function run(seed, zeroPanelPass) {
  const child = spawnSync(process.execPath, [worker, seed], {
    cwd: root,
    encoding: "utf8",
    timeout: 360_000,
    maxBuffer: 8 * 1024 * 1024,
    env: environment(zeroPanelPass),
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`${seed} (${zeroPanelPass ? "zero" : "baseline"}) failed: ${child.stderr || child.stdout}`);
  }
  const line = child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  const sample = JSON.parse(line);
  if (!sample.validation?.valid) throw new Error(`${seed}: invalid grid`);
  if (sample.components !== 1) throw new Error(`${seed}: disconnected answer graph`);
  if (!sample.exactCluesOnly) throw new Error(`${seed}: fallback clue detected`);
  if (!sample.coverageCheckpointPassed) throw new Error(`${seed}: production checkpoint failed`);
  return sample;
}

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

for (let index = 0; index < runCount; index += 1) {
  const seed = `${prefix}-${index}`;
  const baseline = run(seed, false);
  const zero = run(seed, true);
  if (zero.panelCells > baseline.panelCells) {
    throw new Error(`${seed}: zero-panel pass regressed ${baseline.panelCells} -> ${zero.panelCells}`);
  }
  const exact = zero.constructionV2?.targetedExactVictim || null;
  const row = {
    type: "seed",
    seed,
    baselinePanels: baseline.panelCells,
    zeroPanels: zero.panelCells,
    panelGain: baseline.panelCells - zero.panelCells,
    baselineAnswers: baseline.answers,
    zeroAnswers: zero.answers,
    baselineMs: baseline.elapsedMs,
    zeroMs: zero.elapsedMs,
    zeroAttempted: Boolean(exact?.attempted),
    zeroAccepted: Boolean(exact?.accepted),
    zeroProfile: exact?.profile || null,
    structuralVariants: Number(exact?.structuralVariants || 0),
    finalistsPassingCheckpoint: Number(exact?.finalistsPassingCheckpoint || 0),
    selectedVictim: exact?.selected?.victimAnswer || null,
    selectedAtomicPair: Boolean(exact?.selected?.atomicPair),
    selectedPairAnswers: exact?.selected?.pairAnswers || [],
    atomicStates: Number(exact?.search?.atomicPair?.statesAccepted || 0),
    residualRegionSnapshot: zero.residualRegionSnapshot || [],
  };
  samples.push(row);
  console.log(JSON.stringify(row));
}

const summary = {
  type: "summary",
  runs: samples.length,
  averageBaselinePanels: average(samples.map((sample) => sample.baselinePanels)),
  averageZeroPanels: average(samples.map((sample) => sample.zeroPanels)),
  maximumBaselinePanels: Math.max(...samples.map((sample) => sample.baselinePanels)),
  maximumZeroPanels: Math.max(...samples.map((sample) => sample.zeroPanels)),
  improvedSeeds: samples.filter((sample) => sample.panelGain > 0).length,
  unchangedSeeds: samples.filter((sample) => sample.panelGain === 0).length,
  zeroPanelSeeds: samples.filter((sample) => sample.zeroPanels === 0).length,
  attemptedSeeds: samples.filter((sample) => sample.zeroAttempted).length,
  acceptedSeeds: samples.filter((sample) => sample.zeroAccepted).length,
  structuralVariantSeeds: samples.filter((sample) => sample.structuralVariants > 0).length,
  atomicStateSeeds: samples.filter((sample) => sample.atomicStates > 0).length,
  averageBaselineMs: average(samples.map((sample) => sample.baselineMs)),
  averageZeroMs: average(samples.map((sample) => sample.zeroMs)),
};
console.log(JSON.stringify(summary));
