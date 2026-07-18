"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed-v3.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 10);
const prefix = process.argv[3] || "vocabulary-adaptive";
const concurrency = Math.max(1, Number(process.env.SCANWORD_ADAPTIVE_CONCURRENCY) || 1);
const records = new Array(runCount);
let cursor = 0;

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

function runVariant(seed, mode) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SCANWORD_BULK_LEXICON: "on",
      SCANWORD_CATEGORY_BALANCE: "off",
      SCANWORD_VOCABULARY_PORTFOLIO: "on",
      SCANWORD_VOCABULARY_PORTFOLIO_MODE: mode,
      SCANWORD_VOCABULARY_PORTFOLIO_LIMITS: "2500,3500",
      SCANWORD_CONSTRUCTION_MODE: "portfolio",
      SCANWORD_CLOSED_FILL: "diagnostic",
      SCANWORD_PORTFOLIO_SELECTION: "panel-first",
      SCANWORD_LEXICAL_PLACEMENT: "off",
      SCANWORD_EDITORIAL_REPAIR: "on",
      SCANWORD_EDITORIAL_REPLACE: "off",
      SCANWORD_EDITORIAL_PAIR_REFIT: "off",
      SCANWORD_EDITORIAL_BUNDLE_REFIT: "off",
      SCANWORD_PORTFOLIO_ATTEMPTS: process.env.SCANWORD_PORTFOLIO_ATTEMPTS || "240",
      SCANWORD_PORTFOLIO_CLUE_RESTARTS: process.env.SCANWORD_PORTFOLIO_CLUE_RESTARTS || "160",
      SCANWORD_VICTIM_BASES: process.env.SCANWORD_VICTIM_BASES || "8",
      SCANWORD_VICTIM_VARIANTS: process.env.SCANWORD_VICTIM_VARIANTS || "6",
      SCANWORD_TARGETED_VICTIM_REGIONS: process.env.SCANWORD_TARGETED_VICTIM_REGIONS || "3",
      SCANWORD_TARGETED_VICTIM_WORDS: process.env.SCANWORD_TARGETED_VICTIM_WORDS || "4",
      SCANWORD_TARGETED_VICTIM_DEPTH: process.env.SCANWORD_TARGETED_VICTIM_DEPTH || "2",
      SCANWORD_TARGETED_EXACT_VARIANTS: process.env.SCANWORD_TARGETED_EXACT_VARIANTS || "4",
      SCANWORD_TARGETED_EXACT_REPACK_NODES: process.env.SCANWORD_TARGETED_EXACT_REPACK_NODES || "120000",
      SCANWORD_REPACK_NODES: process.env.SCANWORD_REPACK_NODES || "600000",
      SCANWORD_REPACK_BRANCH: process.env.SCANWORD_REPACK_BRANCH || "24",
      SCANWORD_EDITORIAL_PAIR_DOMAIN: process.env.SCANWORD_EDITORIAL_PAIR_DOMAIN || "80",
      SCANWORD_EDITORIAL_PAIR_CANDIDATES: process.env.SCANWORD_EDITORIAL_PAIR_CANDIDATES || "600",
      SCANWORD_EDITORIAL_BUNDLE_DOMAIN: process.env.SCANWORD_EDITORIAL_BUNDLE_DOMAIN || "100",
      SCANWORD_EDITORIAL_BUNDLE_NODES: process.env.SCANWORD_EDITORIAL_BUNDLE_NODES || "50000",
      SCANWORD_EDITORIAL_BUNDLE_SOLUTIONS: process.env.SCANWORD_EDITORIAL_BUNDLE_SOLUTIONS || "24",
      SCANWORD_EDITORIAL_BUNDLE_VARIANTS: process.env.SCANWORD_EDITORIAL_BUNDLE_VARIANTS || "24",
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
      reject(new Error(`Timed out: ${seed}/${mode}`));
    }, 900_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${seed}/${mode} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const sample = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
        if (!sample.validation?.valid || sample.components !== 1 || !sample.exactCluesOnly) {
          throw new Error("structural or clue validation failed");
        }
        resolve(sample);
      } catch (error) {
        reject(new Error(`${seed}/${mode}: ${error.message}`));
      }
    });
  });
}

function describe(sample) {
  const portfolio = sample.constructionV2?.vocabularyPortfolio || {};
  return {
    panels: Number(sample.panelCells || 0),
    answers: Number(sample.answers || 0),
    crossings: Number(sample.crossings || 0),
    rawLetterPercent: Number(sample.rawLetterPercent || 0),
    formulaicShortCount: Number(sample.formulaicShortCount || 0),
    editorialPenalty: Number(sample.editorialPenalty || 0),
    elapsedMs: Number(sample.elapsedMs || 0),
    sourceCorpusEntries: Number(sample.sourceCorpusEntries || 0),
    selectedLimit: portfolio.selectedLimit || null,
    evaluatedLimits: portfolio.evaluatedLimits || [],
    fastPathAccepted: Boolean(portfolio.fastPathAccepted),
    skippedLimits: portfolio.skippedLimits || [],
    candidates: portfolio.candidates || [],
    thresholds: portfolio.thresholds || null,
  };
}

async function runSeed(index) {
  const seed = `${prefix}-${index}`;
  const full = describe(await runVariant(seed, "full"));
  const adaptive = describe(await runVariant(seed, "adaptive"));
  const record = {
    type: "seed",
    index,
    seed,
    full,
    adaptive,
    delta: {
      panels: adaptive.panels - full.panels,
      answers: adaptive.answers - full.answers,
      crossings: adaptive.crossings - full.crossings,
      rawLetterPercent: +(adaptive.rawLetterPercent - full.rawLetterPercent).toFixed(2),
      formulaicShortCount: adaptive.formulaicShortCount - full.formulaicShortCount,
      editorialPenalty: adaptive.editorialPenalty - full.editorialPenalty,
      elapsedMs: adaptive.elapsedMs - full.elapsedMs,
    },
  };
  records[index] = record;
  console.log(JSON.stringify(record));
}

async function workerLoop() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= runCount) return;
    await runSeed(index);
  }
}

function summarize(key) {
  const values = records.map((record) => record[key]);
  return {
    sourceCorpusEntries: Math.max(...values.map((value) => value.sourceCorpusEntries)),
    averagePanels: average(values.map((value) => value.panels)),
    averageAnswers: average(values.map((value) => value.answers)),
    averageCrossings: average(values.map((value) => value.crossings)),
    averageRawLetterPercent: average(values.map((value) => value.rawLetterPercent)),
    averageFormulaicShort: average(values.map((value) => value.formulaicShortCount)),
    averageEditorialPenalty: average(values.map((value) => value.editorialPenalty)),
    averageElapsedMs: average(values.map((value) => value.elapsedMs)),
    fastPathAccepted: values.filter((value) => value.fastPathAccepted).length,
    selectedLimits: values.reduce((counts, value) => {
      const keyValue = String(value.selectedLimit || "none");
      counts[keyValue] = (counts[keyValue] || 0) + 1;
      return counts;
    }, {}),
  };
}

(async () => {
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, runCount) }, () => workerLoop()));
    const summary = {
      type: "summary",
      runs: records.length,
      full: summarize("full"),
      adaptive: summarize("adaptive"),
      comparison: {
        exactMatches: records.filter((record) => record.delta.panels === 0
          && record.delta.answers === 0
          && record.delta.crossings === 0
          && record.delta.editorialPenalty === 0).length,
        panelRegressions: records.filter((record) => record.delta.panels > 0).length,
        answerRegressions: records.filter((record) => record.delta.answers < 0).length,
        crossingRegressions: records.filter((record) => record.delta.crossings < 0).length,
        editorialRegressions: records.filter((record) => record.delta.editorialPenalty > 0).length,
        averagePanelDelta: average(records.map((record) => record.delta.panels)),
        averageAnswerDelta: average(records.map((record) => record.delta.answers)),
        averageCrossingDelta: average(records.map((record) => record.delta.crossings)),
        averageEditorialPenaltyDelta: average(records.map((record) => record.delta.editorialPenalty)),
        averageElapsedDeltaMs: average(records.map((record) => record.delta.elapsedMs)),
        elapsedReductionPercent: +((1 - summarize("adaptive").averageElapsedMs / Math.max(1, summarize("full").averageElapsedMs)) * 100).toFixed(2),
      },
    };
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
