"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed-v3.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 10);
const prefix = process.argv[3] || "vocabulary-editorial";
const concurrency = Math.max(1, Number(process.env.SCANWORD_EDITORIAL_CONCURRENCY) || 1);
const variantSearch = String(process.env.SCANWORD_EDITORIAL_VARIANT_SEARCH || "off").toLowerCase() === "on";
const records = new Array(runCount);
let cursor = 0;

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

function runVariant(seed, editorialMode) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SCANWORD_BULK_LEXICON: "on",
      SCANWORD_CATEGORY_BALANCE: "off",
      SCANWORD_VOCABULARY_PORTFOLIO: "on",
      SCANWORD_VOCABULARY_PORTFOLIO_MODE: "full",
      SCANWORD_VOCABULARY_EDITORIAL_TIEBREAK: editorialMode && variantSearch ? "on" : "off",
      SCANWORD_SELECTED_GRID_CLUE_DISAMBIGUATION: editorialMode ? "on" : "off",
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
    };
    const child = spawn(process.execPath, [workerPath, seed], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out: ${seed}/${editorialMode ? "editorial" : "baseline"}`));
    }, 900_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`${seed} exited ${code}: ${stderr || stdout}`));
      try {
        const sample = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
        if (!sample.validation?.valid || sample.components !== 1 || !sample.exactCluesOnly) {
          throw new Error("structural or clue validation failed");
        }
        resolve(sample);
      } catch (error) {
        reject(new Error(`${seed}: ${error.message}`));
      }
    });
  });
}

function describe(sample) {
  const portfolio = sample.constructionV2?.vocabularyPortfolio || {};
  const selected = portfolio.selected || {};
  const disambiguation = sample.constructionV2?.clueDisambiguation || {};
  return {
    panels: Number(sample.panelCells || 0),
    answers: Number(sample.answers || 0),
    crossings: Number(sample.crossings || 0),
    rawLetterPercent: Number(sample.rawLetterPercent || 0),
    formulaicShortCount: Number(sample.formulaicShortCount || 0),
    editorialPenalty: Number(sample.editorialPenalty || 0),
    genericClueCount: Number(selected.genericClueCount || 0),
    generatedClueCount: Number(selected.generatedClueCount || 0),
    factualTemplateCount: Number(selected.factualTemplateCount || 0),
    properNameCount: Number(selected.properNameCount || 0),
    distinctCategories: Number(selected.distinctCategories || 0),
    distinctSources: Number(selected.distinctSources || 0),
    repeatedClueCount: Number(selected.repeatedClueCount || 0),
    repeatedClueKinds: Number(selected.repeatedClueKinds || 0),
    changedClues: Number(disambiguation.changedClues || 0),
    changedClueGroups: Number(disambiguation.changedGroups || 0),
    elapsedMs: Number(sample.elapsedMs || 0),
    sourceCorpusEntries: Number(sample.sourceCorpusEntries || 0),
    selectedLimit: portfolio.selectedLimit || null,
    answerSignature: (sample.lexicalEntries || []).map((entry) => entry.answer).sort().join("|"),
  };
}

async function runSeed(index) {
  const seed = `${prefix}-${index}`;
  const baseline = describe(await runVariant(seed, false));
  const editorial = describe(await runVariant(seed, true));
  const delta = {};
  for (const key of ["panels", "answers", "crossings", "rawLetterPercent", "formulaicShortCount", "editorialPenalty",
    "genericClueCount", "generatedClueCount", "factualTemplateCount", "properNameCount", "distinctCategories",
    "distinctSources", "repeatedClueCount", "repeatedClueKinds", "elapsedMs"]) {
    delta[key] = +(editorial[key] - baseline[key]).toFixed(2);
  }
  const record = { type: "seed", index, seed, baseline, editorial, delta };
  records[index] = record;
  console.log(JSON.stringify(record));
}

async function workerLoop() {
  while (true) {
    const index = cursor++;
    if (index >= runCount) return;
    await runSeed(index);
  }
}

function summarize(key) {
  const values = records.map((record) => record[key]);
  const result = { sourceCorpusEntries: Math.max(...values.map((value) => value.sourceCorpusEntries)) };
  for (const field of ["panels", "answers", "crossings", "rawLetterPercent", "formulaicShortCount", "editorialPenalty",
    "genericClueCount", "generatedClueCount", "factualTemplateCount", "properNameCount", "distinctCategories",
    "distinctSources", "repeatedClueCount", "repeatedClueKinds", "changedClues", "changedClueGroups", "elapsedMs"]) {
    result[`average${field[0].toUpperCase()}${field.slice(1)}`] = average(values.map((value) => value[field]));
  }
  return result;
}

(async () => {
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, runCount) }, () => workerLoop()));
    const baseline = summarize("baseline");
    const editorial = summarize("editorial");
    console.log(JSON.stringify({
      type: "summary",
      runs: records.length,
      variantSearch,
      baseline,
      editorial,
      comparison: {
        changedSelections: records.filter((record) => record.baseline.answerSignature !== record.editorial.answerSignature).length,
        panelRegressions: records.filter((record) => record.delta.panels > 0).length,
        answerRegressions: records.filter((record) => record.delta.answers < 0).length,
        crossingRegressions: records.filter((record) => record.delta.crossings < 0).length,
        coverageRegressions: records.filter((record) => record.delta.rawLetterPercent < 0).length,
        shortEditorialRegressions: records.filter((record) => record.delta.editorialPenalty > 0 || record.delta.formulaicShortCount > 0).length,
        fewerRepeatedClues: records.filter((record) => record.delta.repeatedClueCount < 0).length,
        fewerGenericClues: records.filter((record) => record.delta.genericClueCount < 0).length,
        fewerProperNames: records.filter((record) => record.delta.properNameCount < 0).length,
        broaderCategories: records.filter((record) => record.delta.distinctCategories > 0).length,
        averageRepeatedClueDelta: average(records.map((record) => record.delta.repeatedClueCount)),
        averageGenericClueDelta: average(records.map((record) => record.delta.genericClueCount)),
        averageProperNameDelta: average(records.map((record) => record.delta.properNameCount)),
        averageElapsedDeltaMs: average(records.map((record) => record.delta.elapsedMs)),
      },
    }));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
