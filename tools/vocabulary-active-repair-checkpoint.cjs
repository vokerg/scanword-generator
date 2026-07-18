"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed-v3.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 10);
const prefix = process.argv[3] || "vocabulary-active-repair";
const concurrency = Math.max(1, Number(process.env.SCANWORD_ACTIVE_REPAIR_CONCURRENCY) || 2);
const limits = [2500, 3500];
const samples = new Array(runCount);
let cursor = 0;

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

function countBy(sample, field, fallback) {
  const counts = {};
  for (const entry of sample.lexicalEntries || []) {
    const value = entry[field] || fallback;
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function averageCounts(values, key) {
  const totals = {};
  for (const value of values) {
    for (const [name, count] of Object.entries(value[key] || {})) totals[name] = (totals[name] || 0) + count;
  }
  return Object.fromEntries(Object.entries(totals)
    .map(([name, count]) => [name, +(count / Math.max(1, values.length)).toFixed(2)])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function runVariant(seed, activeLimit) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SCANWORD_BULK_LEXICON: "on",
      SCANWORD_ACTIVE_POOL_LIMIT: String(activeLimit),
      SCANWORD_CATEGORY_BALANCE: "off",
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
      reject(new Error(`Timed out: ${seed}/${activeLimit}`));
    }, 600_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${seed}/${activeLimit} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const sample = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
        if (!sample.validation?.valid || sample.components !== 1 || !sample.exactCluesOnly) {
          throw new Error("structural or clue validation failed");
        }
        resolve(sample);
      } catch (error) {
        reject(new Error(`${seed}/${activeLimit}: ${error.message}`));
      }
    });
  });
}

function describe(sample) {
  return {
    sourceCorpusEntries: Number(sample.sourceCorpusEntries || 0),
    activePool: Number(sample.poolEntries || 0),
    panels: sample.panelCells,
    answers: sample.answers,
    crossings: sample.crossings,
    activePercent: sample.activePercent,
    answerPercent: sample.answerPercent,
    rawLetterPercent: sample.rawLetterPercent,
    shortAnswerCount: sample.shortAnswerCount,
    formulaicShortCount: sample.formulaicShortCount,
    editorialPenalty: sample.editorialPenalty,
    averageLexicalQuality: sample.averageLexicalQuality,
    elapsedMs: sample.elapsedMs,
    coverageCheckpointPassed: Boolean(sample.coverageCheckpointPassed),
    categories: countBy(sample, "lexicalCategory", "core-reviewed"),
  };
}

async function runSeed(index) {
  const seed = `${prefix}-${index}`;
  const variants = {};
  for (const limit of limits) variants[limit] = describe(await runVariant(seed, limit));
  const record = {
    type: "seed",
    index,
    seed,
    variants,
    delta3500Minus2500: {
      panels: variants[3500].panels - variants[2500].panels,
      answers: variants[3500].answers - variants[2500].answers,
      crossings: variants[3500].crossings - variants[2500].crossings,
      rawLetterPercent: +(variants[3500].rawLetterPercent - variants[2500].rawLetterPercent).toFixed(2),
      formulaicShortCount: variants[3500].formulaicShortCount - variants[2500].formulaicShortCount,
      editorialPenalty: variants[3500].editorialPenalty - variants[2500].editorialPenalty,
      elapsedMs: variants[3500].elapsedMs - variants[2500].elapsedMs,
    },
  };
  samples[index] = record;
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

function summarizeLimit(limit) {
  const values = samples.map((sample) => sample.variants[limit]);
  return {
    sourceCorpusEntries: Math.max(...values.map((value) => value.sourceCorpusEntries)),
    averageActivePool: average(values.map((value) => value.activePool)),
    averagePanels: average(values.map((value) => value.panels)),
    averageAnswers: average(values.map((value) => value.answers)),
    averageCrossings: average(values.map((value) => value.crossings)),
    averageActivePercent: average(values.map((value) => value.activePercent)),
    averageAnswerPercent: average(values.map((value) => value.answerPercent)),
    averageRawLetterPercent: average(values.map((value) => value.rawLetterPercent)),
    averageShortAnswers: average(values.map((value) => value.shortAnswerCount)),
    averageFormulaicShort: average(values.map((value) => value.formulaicShortCount)),
    averageEditorialPenalty: average(values.map((value) => value.editorialPenalty)),
    averageLexicalQuality: average(values.map((value) => value.averageLexicalQuality)),
    averageElapsedMs: average(values.map((value) => value.elapsedMs)),
    checkpointPasses: values.filter((value) => value.coverageCheckpointPassed).length,
    averageCategories: averageCounts(values, "categories"),
  };
}

(async () => {
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, runCount) }, () => workerLoop()));
    const summary = {
      type: "summary",
      runs: samples.length,
      repairMode: "on",
      variants: {
        2500: summarizeLimit(2500),
        3500: summarizeLimit(3500),
      },
      comparison3500Minus2500: {
        fewerPanelsAt3500: samples.filter((sample) => sample.delta3500Minus2500.panels < 0).length,
        moreAnswersAt3500: samples.filter((sample) => sample.delta3500Minus2500.answers > 0).length,
        moreCrossingsAt3500: samples.filter((sample) => sample.delta3500Minus2500.crossings > 0).length,
        lowerPenaltyAt3500: samples.filter((sample) => sample.delta3500Minus2500.editorialPenalty < 0).length,
        averagePanelDelta: average(samples.map((sample) => sample.delta3500Minus2500.panels)),
        averageAnswerDelta: average(samples.map((sample) => sample.delta3500Minus2500.answers)),
        averageCrossingDelta: average(samples.map((sample) => sample.delta3500Minus2500.crossings)),
        averageRawLetterDelta: average(samples.map((sample) => sample.delta3500Minus2500.rawLetterPercent)),
        averageFormulaicDelta: average(samples.map((sample) => sample.delta3500Minus2500.formulaicShortCount)),
        averageEditorialPenaltyDelta: average(samples.map((sample) => sample.delta3500Minus2500.editorialPenalty)),
        averageElapsedDeltaMs: average(samples.map((sample) => sample.delta3500Minus2500.elapsedMs)),
      },
    };
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
