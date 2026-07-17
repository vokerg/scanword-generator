"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed-v3.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 20);
const prefix = process.argv[3] || "lexical-frontier";
const concurrency = Math.max(1, Number(process.env.SCANWORD_LEXICAL_CONCURRENCY) || 2);
const panelSlack = Math.max(0, Number(process.env.SCANWORD_PORTFOLIO_PANEL_SLACK) || 1);
const enforce = process.env.SCANWORD_LEXICAL_FRONTIER_ENFORCE === "1";
const samples = new Array(runCount);
let cursor = 0;

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function runVariant(seed, selectionMode) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SCANWORD_CONSTRUCTION_MODE: "portfolio",
      SCANWORD_CLOSED_FILL: "diagnostic",
      SCANWORD_PORTFOLIO_SELECTION: selectionMode,
      SCANWORD_PORTFOLIO_PANEL_SLACK: String(panelSlack),
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
    const child = spawn(process.execPath, [workerPath, seed], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out: ${seed}/${selectionMode}`));
    }, 360_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${seed}/${selectionMode} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        const sample = JSON.parse(line);
        if (!sample.validation?.valid) throw new Error(`invalid grid: ${JSON.stringify(sample.validation)}`);
        if (sample.components !== 1) throw new Error("disconnected answer graph");
        if (!sample.exactCluesOnly) throw new Error("fallback clue detected");
        if (!sample.coverageCheckpointPassed) throw new Error("preserved production checkpoint failed");
        resolve(sample);
      } catch (error) {
        reject(new Error(`${seed}/${selectionMode}: ${error.message}`));
      }
    });
  });
}

async function runSeed(index) {
  const seed = `${prefix}-${index}`;
  const baseline = await runVariant(seed, "panel-first");
  const pareto = await runVariant(seed, "lexical-pareto");
  samples[index] = {
    type: "seed",
    index,
    seed,
    baseline: {
      panels: baseline.panelCells,
      weakFill: baseline.weakFillCount,
      twoLetter: baseline.twoLetterCount,
      lexicalPenalty: baseline.lexicalPenalty,
      answers: baseline.answers,
      rawLetterPercent: baseline.rawLetterPercent,
      elapsedMs: baseline.elapsedMs,
      weakAnswers: baseline.weakAnswers,
    },
    pareto: {
      panels: pareto.panelCells,
      weakFill: pareto.weakFillCount,
      twoLetter: pareto.twoLetterCount,
      lexicalPenalty: pareto.lexicalPenalty,
      answers: pareto.answers,
      rawLetterPercent: pareto.rawLetterPercent,
      elapsedMs: pareto.elapsedMs,
      weakAnswers: pareto.weakAnswers,
      selection: pareto.constructionV2?.selection || null,
    },
    delta: {
      panels: pareto.panelCells - baseline.panelCells,
      weakFill: pareto.weakFillCount - baseline.weakFillCount,
      twoLetter: pareto.twoLetterCount - baseline.twoLetterCount,
      lexicalPenalty: pareto.lexicalPenalty - baseline.lexicalPenalty,
      answers: pareto.answers - baseline.answers,
      rawLetterPercent: +(pareto.rawLetterPercent - baseline.rawLetterPercent).toFixed(1),
      elapsedMs: pareto.elapsedMs - baseline.elapsedMs,
    },
  };
  console.log(JSON.stringify(samples[index]));
}

async function workerLoop() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= runCount) return;
    await runSeed(index);
  }
}

(async () => {
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, runCount) }, () => workerLoop()));
    const panelDeltas = samples.map((sample) => sample.delta.panels);
    const weakDeltas = samples.map((sample) => sample.delta.weakFill);
    const summary = {
      type: "summary",
      runs: samples.length,
      panelSlack,
      baseline: {
        averagePanels: average(samples.map((sample) => sample.baseline.panels)),
        maximumPanels: Math.max(...samples.map((sample) => sample.baseline.panels)),
        averageWeakFill: average(samples.map((sample) => sample.baseline.weakFill)),
        maximumWeakFill: Math.max(...samples.map((sample) => sample.baseline.weakFill)),
        averageTwoLetter: average(samples.map((sample) => sample.baseline.twoLetter)),
        averageLexicalPenalty: average(samples.map((sample) => sample.baseline.lexicalPenalty)),
        averageAnswers: average(samples.map((sample) => sample.baseline.answers)),
        averageElapsedMs: average(samples.map((sample) => sample.baseline.elapsedMs)),
      },
      pareto: {
        averagePanels: average(samples.map((sample) => sample.pareto.panels)),
        maximumPanels: Math.max(...samples.map((sample) => sample.pareto.panels)),
        averageWeakFill: average(samples.map((sample) => sample.pareto.weakFill)),
        maximumWeakFill: Math.max(...samples.map((sample) => sample.pareto.weakFill)),
        averageTwoLetter: average(samples.map((sample) => sample.pareto.twoLetter)),
        averageLexicalPenalty: average(samples.map((sample) => sample.pareto.lexicalPenalty)),
        averageAnswers: average(samples.map((sample) => sample.pareto.answers)),
        averageElapsedMs: average(samples.map((sample) => sample.pareto.elapsedMs)),
      },
      comparison: {
        weakImprovedSeeds: samples.filter((sample) => sample.delta.weakFill < 0).length,
        weakRegressedSeeds: samples.filter((sample) => sample.delta.weakFill > 0).length,
        panelImprovedSeeds: samples.filter((sample) => sample.delta.panels < 0).length,
        panelRegressedSeeds: samples.filter((sample) => sample.delta.panels > 0).length,
        unchangedSeeds: samples.filter((sample) => sample.delta.panels === 0 && sample.delta.weakFill === 0).length,
        averagePanelDelta: average(panelDeltas),
        maximumPanelDelta: Math.max(...panelDeltas),
        p90PanelDelta: percentile(panelDeltas, 0.9),
        averageWeakFillDelta: average(weakDeltas),
        minimumWeakFillDelta: Math.min(...weakDeltas),
        averageLexicalPenaltyDelta: average(samples.map((sample) => sample.delta.lexicalPenalty)),
        tradeoffAppliedSeeds: samples.filter((sample) => sample.pareto.selection?.tradeoffApplied).length,
      },
    };
    console.log(JSON.stringify(summary));

    if (enforce) {
      if (summary.pareto.averageWeakFill >= summary.baseline.averageWeakFill) {
        throw new Error("lexical Pareto selection did not reduce average weak fill");
      }
      if (summary.pareto.averagePanels > summary.baseline.averagePanels + panelSlack) {
        throw new Error("average panel regression exceeded the configured slack");
      }
      if (summary.pareto.maximumPanels > 12) {
        throw new Error("maximum panels exceeded checkpoint A");
      }
    }
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
})();
