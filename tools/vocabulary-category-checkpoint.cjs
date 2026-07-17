"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed-v3.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 5);
const prefix = process.argv[3] || "vocabulary-category-balance";
const concurrency = Math.max(1, Number(process.env.SCANWORD_CATEGORY_CONCURRENCY) || 1);
const repairMode = String(process.env.SCANWORD_CATEGORY_REPAIR || "off").toLowerCase() === "on" ? "on" : "off";
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

function averageCounts(records, key) {
  const totals = {};
  for (const record of records) {
    for (const [category, count] of Object.entries(record[key] || {})) {
      totals[category] = (totals[category] || 0) + count;
    }
  }
  return Object.fromEntries(Object.entries(totals)
    .map(([category, count]) => [category, +(count / Math.max(1, records.length)).toFixed(2)])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function runVariant(seed, categoryBalance) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SCANWORD_BULK_LEXICON: "on",
      SCANWORD_ACTIVE_POOL_LIMIT: process.env.SCANWORD_ACTIVE_POOL_LIMIT || "3500",
      SCANWORD_CATEGORY_BALANCE: categoryBalance,
      SCANWORD_CONSTRUCTION_MODE: "portfolio",
      SCANWORD_CLOSED_FILL: "diagnostic",
      SCANWORD_PORTFOLIO_SELECTION: "panel-first",
      SCANWORD_LEXICAL_PLACEMENT: "off",
      SCANWORD_EDITORIAL_REPAIR: repairMode,
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
      reject(new Error(`Timed out: ${seed}/${categoryBalance}`));
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
        reject(new Error(`${seed}/${categoryBalance} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const sample = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
        if (!sample.validation?.valid) throw new Error("invalid grid");
        if (sample.components !== 1) throw new Error("disconnected answer graph");
        if (!sample.exactCluesOnly) throw new Error("fallback clue detected");
        resolve(sample);
      } catch (error) {
        reject(new Error(`${seed}/${categoryBalance}: ${error.message}`));
      }
    });
  });
}

function describe(sample) {
  return {
    sourceCorpusEntries: Number(sample.sourceCorpusEntries || 0),
    activePool: Number(sample.poolEntries || 0),
    poolSelection: sample.poolSelection || null,
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
  const unbounded = describe(await runVariant(seed, "off"));
  const balanced = describe(await runVariant(seed, "on"));
  const record = {
    type: "seed",
    index,
    seed,
    repairMode,
    unbounded,
    balanced,
    delta: {
      panels: balanced.panels - unbounded.panels,
      answers: balanced.answers - unbounded.answers,
      crossings: balanced.crossings - unbounded.crossings,
      rawLetterPercent: +(balanced.rawLetterPercent - unbounded.rawLetterPercent).toFixed(2),
      formulaicShortCount: balanced.formulaicShortCount - unbounded.formulaicShortCount,
      editorialPenalty: balanced.editorialPenalty - unbounded.editorialPenalty,
      elapsedMs: balanced.elapsedMs - unbounded.elapsedMs,
      cities: Number(balanced.categories.city || 0) - Number(unbounded.categories.city || 0),
      givenNames: Number(balanced.categories["given-name"] || 0) - Number(unbounded.categories["given-name"] || 0),
      surnames: Number(balanced.categories.surname || 0) - Number(unbounded.categories.surname || 0),
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

function summarizeVariant(records, key) {
  const values = records.map((record) => record[key]);
  return {
    sourceCorpusEntries: Math.max(...values.map((value) => value.sourceCorpusEntries)),
    averageActivePool: average(values.map((value) => value.activePool)),
    averagePanels: average(values.map((value) => value.panels)),
    averageAnswers: average(values.map((value) => value.answers)),
    averageCrossings: average(values.map((value) => value.crossings)),
    averageActivePercent: average(values.map((value) => value.activePercent)),
    averageAnswerPercent: average(values.map((value) => value.answerPercent)),
    averageRawLetterPercent: average(values.map((value) => value.rawLetterPercent)),
    averageFormulaicShort: average(values.map((value) => value.formulaicShortCount)),
    averageEditorialPenalty: average(values.map((value) => value.editorialPenalty)),
    averageLexicalQuality: average(values.map((value) => value.averageLexicalQuality)),
    averageElapsedMs: average(values.map((value) => value.elapsedMs)),
    checkpointPasses: values.filter((value) => value.coverageCheckpointPassed).length,
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
      repairMode,
      unbounded: summarizeVariant(samples, "unbounded"),
      balanced: summarizeVariant(samples, "balanced"),
      comparison: {
        fewerPanels: samples.filter((sample) => sample.delta.panels < 0).length,
        moreAnswers: samples.filter((sample) => sample.delta.answers > 0).length,
        moreCrossings: samples.filter((sample) => sample.delta.crossings > 0).length,
        lowerEditorialPenalty: samples.filter((sample) => sample.delta.editorialPenalty < 0).length,
        fewerCities: samples.filter((sample) => sample.delta.cities < 0).length,
        fewerGivenNames: samples.filter((sample) => sample.delta.givenNames < 0).length,
        averagePanelDelta: average(samples.map((sample) => sample.delta.panels)),
        averageAnswerDelta: average(samples.map((sample) => sample.delta.answers)),
        averageCrossingDelta: average(samples.map((sample) => sample.delta.crossings)),
        averageRawLetterDelta: average(samples.map((sample) => sample.delta.rawLetterPercent)),
        averageEditorialPenaltyDelta: average(samples.map((sample) => sample.delta.editorialPenalty)),
        averageCityDelta: average(samples.map((sample) => sample.delta.cities)),
        averageGivenNameDelta: average(samples.map((sample) => sample.delta.givenNames)),
        averageSurnameDelta: average(samples.map((sample) => sample.delta.surnames)),
      },
    };
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
