"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed-v3.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 10);
const prefix = process.argv[3] || "vocabulary-release";
const concurrency = Math.max(1, Number(process.env.SCANWORD_RELEASE_CONCURRENCY) || 2);
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

function runVariant(seed, mode) {
  return new Promise((resolve, reject) => {
    const expanded = mode === "expanded";
    const env = {
      ...process.env,
      SCANWORD_BULK_LEXICON: expanded ? "on" : "off",
      SCANWORD_ACTIVE_POOL_LIMIT: expanded ? "3500" : "",
      SCANWORD_CATEGORY_BALANCE: "off",
      SCANWORD_VOCABULARY_PORTFOLIO: expanded ? "on" : "off",
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
  const portfolio = sample.constructionV2?.vocabularyPortfolio || null;
  return {
    sourceCorpusEntries: Number(sample.sourceCorpusEntries || 0),
    activePool: Number(sample.poolEntries || 0),
    selectedActiveLimit: portfolio?.selectedLimit || null,
    portfolioCandidates: portfolio?.candidates || null,
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
    sources: countBy(sample, "lexicalSource", "unknown"),
  };
}

async function runSeed(index) {
  const seed = `${prefix}-${index}`;
  const baseline = describe(await runVariant(seed, "baseline"));
  const expanded = describe(await runVariant(seed, "expanded"));
  const record = {
    type: "seed",
    index,
    seed,
    baseline,
    expanded,
    delta: {
      panels: expanded.panels - baseline.panels,
      answers: expanded.answers - baseline.answers,
      crossings: expanded.crossings - baseline.crossings,
      rawLetterPercent: +(expanded.rawLetterPercent - baseline.rawLetterPercent).toFixed(2),
      formulaicShortCount: expanded.formulaicShortCount - baseline.formulaicShortCount,
      editorialPenalty: expanded.editorialPenalty - baseline.editorialPenalty,
      elapsedMs: expanded.elapsedMs - baseline.elapsedMs,
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

function summarizeVariant(key) {
  const values = samples.map((sample) => sample[key]);
  const selectedLimits = {};
  for (const value of values) {
    if (value.selectedActiveLimit != null) {
      selectedLimits[value.selectedActiveLimit] = (selectedLimits[value.selectedActiveLimit] || 0) + 1;
    }
  }
  return {
    sourceCorpusEntries: Math.max(...values.map((value) => value.sourceCorpusEntries)),
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
    selectedActiveLimits: selectedLimits,
    averageCategories: averageCounts(values, "categories"),
    averageSources: averageCounts(values, "sources"),
  };
}

(async () => {
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, runCount) }, () => workerLoop()));
    const summary = {
      type: "summary",
      runs: samples.length,
      baseline: summarizeVariant("baseline"),
      expanded: summarizeVariant("expanded"),
      comparison: {
        fewerPanels: samples.filter((sample) => sample.delta.panels < 0).length,
        moreAnswers: samples.filter((sample) => sample.delta.answers > 0).length,
        moreCrossings: samples.filter((sample) => sample.delta.crossings > 0).length,
        higherRawLetterCoverage: samples.filter((sample) => sample.delta.rawLetterPercent > 0).length,
        lowerEditorialPenalty: samples.filter((sample) => sample.delta.editorialPenalty < 0).length,
        panelRegressions: samples.filter((sample) => sample.delta.panels > 0).length,
        answerRegressions: samples.filter((sample) => sample.delta.answers < 0).length,
        averagePanelDelta: average(samples.map((sample) => sample.delta.panels)),
        averageAnswerDelta: average(samples.map((sample) => sample.delta.answers)),
        averageCrossingDelta: average(samples.map((sample) => sample.delta.crossings)),
        averageRawLetterDelta: average(samples.map((sample) => sample.delta.rawLetterPercent)),
        averageFormulaicDelta: average(samples.map((sample) => sample.delta.formulaicShortCount)),
        averageEditorialPenaltyDelta: average(samples.map((sample) => sample.delta.editorialPenalty)),
        averageElapsedDeltaMs: average(samples.map((sample) => sample.delta.elapsedMs)),
      },
    };
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
