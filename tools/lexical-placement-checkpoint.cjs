"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed-v3.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 20);
const prefix = process.argv[3] || "lexical-placement";
const concurrency = Math.max(1, Number(process.env.SCANWORD_LEXICAL_CONCURRENCY) || 2);
const enforce = process.env.SCANWORD_LEXICAL_PLACEMENT_ENFORCE === "1";
const samples = new Array(runCount);
let cursor = 0;

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

function runVariant(seed, placementMode) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SCANWORD_CONSTRUCTION_MODE: "portfolio",
      SCANWORD_CLOSED_FILL: "diagnostic",
      SCANWORD_PORTFOLIO_SELECTION: "panel-first",
      SCANWORD_LEXICAL_PLACEMENT: placementMode,
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
      reject(new Error(`Timed out: ${seed}/${placementMode}`));
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
        reject(new Error(`${seed}/${placementMode} exited ${code}: ${stderr || stdout}`));
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
        reject(new Error(`${seed}/${placementMode}: ${error.message}`));
      }
    });
  });
}

async function runSeed(index) {
  const seed = `${prefix}-${index}`;
  const baseline = await runVariant(seed, "off");
  const lexical = await runVariant(seed, "on");
  samples[index] = {
    type: "seed",
    index,
    seed,
    baseline: {
      panels: baseline.panelCells,
      weakFill: baseline.weakFillCount,
      twoLetter: baseline.twoLetterCount,
      shortAnswers: baseline.shortAnswerCount,
      lexicalPenalty: baseline.lexicalPenalty,
      answers: baseline.answers,
      rawLetterPercent: baseline.rawLetterPercent,
      elapsedMs: baseline.elapsedMs,
      weakAnswers: baseline.weakAnswers,
    },
    lexical: {
      panels: lexical.panelCells,
      weakFill: lexical.weakFillCount,
      twoLetter: lexical.twoLetterCount,
      shortAnswers: lexical.shortAnswerCount,
      lexicalPenalty: lexical.lexicalPenalty,
      answers: lexical.answers,
      rawLetterPercent: lexical.rawLetterPercent,
      elapsedMs: lexical.elapsedMs,
      weakAnswers: lexical.weakAnswers,
      cumulativePlacementAdjustment: lexical.cumulativePlacementAdjustment,
    },
    delta: {
      panels: lexical.panelCells - baseline.panelCells,
      weakFill: lexical.weakFillCount - baseline.weakFillCount,
      twoLetter: lexical.twoLetterCount - baseline.twoLetterCount,
      shortAnswers: lexical.shortAnswerCount - baseline.shortAnswerCount,
      lexicalPenalty: lexical.lexicalPenalty - baseline.lexicalPenalty,
      answers: lexical.answers - baseline.answers,
      rawLetterPercent: +(lexical.rawLetterPercent - baseline.rawLetterPercent).toFixed(1),
      elapsedMs: lexical.elapsedMs - baseline.elapsedMs,
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
    const summary = {
      type: "summary",
      runs: samples.length,
      penalties: {
        weak: Number(process.env.SCANWORD_WEAK_PLACEMENT_PENALTY || 70),
        twoLetter: Number(process.env.SCANWORD_TWO_LETTER_PLACEMENT_PENALTY || 70),
        threeLetter: Number(process.env.SCANWORD_THREE_LETTER_PLACEMENT_PENALTY || 18),
        qualityWeight: Number(process.env.SCANWORD_LEXICAL_QUALITY_PENALTY || 1),
        denseMultiplier: Number(process.env.SCANWORD_DENSE_LEXICAL_MULTIPLIER || 0.75),
      },
      baseline: {
        averagePanels: average(samples.map((sample) => sample.baseline.panels)),
        maximumPanels: Math.max(...samples.map((sample) => sample.baseline.panels)),
        averageWeakFill: average(samples.map((sample) => sample.baseline.weakFill)),
        maximumWeakFill: Math.max(...samples.map((sample) => sample.baseline.weakFill)),
        averageTwoLetter: average(samples.map((sample) => sample.baseline.twoLetter)),
        averageShortAnswers: average(samples.map((sample) => sample.baseline.shortAnswers)),
        averageLexicalPenalty: average(samples.map((sample) => sample.baseline.lexicalPenalty)),
        averageAnswers: average(samples.map((sample) => sample.baseline.answers)),
        averageElapsedMs: average(samples.map((sample) => sample.baseline.elapsedMs)),
      },
      lexical: {
        averagePanels: average(samples.map((sample) => sample.lexical.panels)),
        maximumPanels: Math.max(...samples.map((sample) => sample.lexical.panels)),
        averageWeakFill: average(samples.map((sample) => sample.lexical.weakFill)),
        maximumWeakFill: Math.max(...samples.map((sample) => sample.lexical.weakFill)),
        averageTwoLetter: average(samples.map((sample) => sample.lexical.twoLetter)),
        averageShortAnswers: average(samples.map((sample) => sample.lexical.shortAnswers)),
        averageLexicalPenalty: average(samples.map((sample) => sample.lexical.lexicalPenalty)),
        averageAnswers: average(samples.map((sample) => sample.lexical.answers)),
        averageElapsedMs: average(samples.map((sample) => sample.lexical.elapsedMs)),
      },
      comparison: {
        weakImprovedSeeds: samples.filter((sample) => sample.delta.weakFill < 0).length,
        weakRegressedSeeds: samples.filter((sample) => sample.delta.weakFill > 0).length,
        panelImprovedSeeds: samples.filter((sample) => sample.delta.panels < 0).length,
        panelRegressedSeeds: samples.filter((sample) => sample.delta.panels > 0).length,
        bothImprovedSeeds: samples.filter((sample) => sample.delta.weakFill < 0 && sample.delta.panels <= 0).length,
        bothRegressedSeeds: samples.filter((sample) => sample.delta.weakFill > 0 && sample.delta.panels > 0).length,
        averagePanelDelta: average(samples.map((sample) => sample.delta.panels)),
        maximumPanelDelta: Math.max(...samples.map((sample) => sample.delta.panels)),
        averageWeakFillDelta: average(samples.map((sample) => sample.delta.weakFill)),
        minimumWeakFillDelta: Math.min(...samples.map((sample) => sample.delta.weakFill)),
        averageShortAnswerDelta: average(samples.map((sample) => sample.delta.shortAnswers)),
        averageLexicalPenaltyDelta: average(samples.map((sample) => sample.delta.lexicalPenalty)),
        averageAnswerDelta: average(samples.map((sample) => sample.delta.answers)),
      },
    };
    console.log(JSON.stringify(summary));

    if (enforce) {
      if (summary.lexical.averageWeakFill >= summary.baseline.averageWeakFill) {
        throw new Error("lexical placement did not reduce average weak fill");
      }
      if (summary.lexical.maximumPanels > 12) {
        throw new Error("maximum panels exceeded checkpoint A");
      }
      if (summary.comparison.bothRegressedSeeds > 0) {
        throw new Error("at least one seed regressed in both panels and weak fill");
      }
    }
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
})();
