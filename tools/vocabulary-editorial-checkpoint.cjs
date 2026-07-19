"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed-v3.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 20);
const prefix = process.argv[3] || "selected-grid-clues";
const concurrency = Math.max(1, Number(process.env.SCANWORD_EDITORIAL_CONCURRENCY) || 1);
const enforce = String(process.env.SCANWORD_EDITORIAL_ENFORCE || "0") === "1";
const records = new Array(runCount);
let cursor = 0;

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

function quantile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return +sorted[index].toFixed(2);
}

function runtimeSummary(values) {
  return {
    average: average(values),
    median: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    maximum: values.length ? +Math.max(...values).toFixed(2) : 0,
  };
}

function runVariant(seed, editorialMode) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SCANWORD_BULK_LEXICON: "on",
      SCANWORD_CATEGORY_BALANCE: "off",
      SCANWORD_VOCABULARY_PORTFOLIO: "on",
      SCANWORD_VOCABULARY_PORTFOLIO_MODE: "full",
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
    const child = spawn(process.execPath, [workerPath, seed], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
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
  const selected = sample.constructionV2?.selectedGridClues || {};
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
    repeatedGenericClueCount: Number(selected.repeatedGenericClueCount || 0),
    repeatedGenericClueKinds: Number(selected.repeatedGenericClueKinds || 0),
    rewrittenClueCount: Number(selected.rewrittenClueCount || 0),
    overRevealingGeneratedClueCount: Number(selected.overRevealingGeneratedClueCount || 0),
    changedClues: Number(disambiguation.changedClues || 0),
    changedClueGroups: Number(disambiguation.changedGroups || 0),
    unresolvedWords: Number(disambiguation.unresolvedWords || 0),
    skippedUnsafeCandidates: Number(disambiguation.skippedUnsafeCandidates || 0),
    elapsedMs: Number(sample.elapsedMs || 0),
    sourceCorpusEntries: Number(sample.sourceCorpusEntries || 0),
    selectedLimit: sample.constructionV2?.vocabularyPortfolio?.selectedLimit || null,
    answerSignature: String(selected.answerSignature || ""),
    geometrySignature: String(selected.geometrySignature || ""),
    changes: (disambiguation.changes || []).slice(0, 12),
  };
}

function numericDelta(editorial, baseline) {
  const delta = {};
  for (const key of [
    "panels", "answers", "crossings", "rawLetterPercent", "formulaicShortCount", "editorialPenalty",
    "genericClueCount", "generatedClueCount", "factualTemplateCount", "properNameCount", "distinctCategories",
    "distinctSources", "repeatedClueCount", "repeatedClueKinds", "repeatedGenericClueCount",
    "repeatedGenericClueKinds", "rewrittenClueCount", "overRevealingGeneratedClueCount", "elapsedMs",
  ]) {
    delta[key] = +(editorial[key] - baseline[key]).toFixed(2);
  }
  return delta;
}

function assertStructuralIdentity(seed, baseline, editorial) {
  const failures = [];
  if (baseline.answerSignature !== editorial.answerSignature) failures.push("answer signature changed");
  if (baseline.geometrySignature !== editorial.geometrySignature) failures.push("geometry signature changed");
  for (const field of ["panels", "answers", "crossings", "rawLetterPercent", "formulaicShortCount", "editorialPenalty"]) {
    if (baseline[field] !== editorial[field]) failures.push(`${field} changed: ${baseline[field]} -> ${editorial[field]}`);
  }
  if (editorial.overRevealingGeneratedClueCount !== 0) failures.push("over-revealing generated clue admitted");
  if (failures.length) throw new Error(`${seed}: ${failures.join("; ")}`);
}

async function runSeed(index) {
  const seed = `${prefix}-${index}`;
  const baseline = describe(await runVariant(seed, false));
  const editorial = describe(await runVariant(seed, true));
  if (enforce) assertStructuralIdentity(seed, baseline, editorial);
  const record = { type: "seed", index, seed, baseline, editorial, delta: numericDelta(editorial, baseline) };
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
  const result = {
    sourceCorpusEntries: Math.max(...values.map((value) => value.sourceCorpusEntries)),
    runtimeMs: runtimeSummary(values.map((value) => value.elapsedMs)),
  };
  for (const field of [
    "panels", "answers", "crossings", "rawLetterPercent", "formulaicShortCount", "editorialPenalty",
    "genericClueCount", "generatedClueCount", "factualTemplateCount", "properNameCount", "distinctCategories",
    "distinctSources", "repeatedClueCount", "repeatedClueKinds", "repeatedGenericClueCount",
    "repeatedGenericClueKinds", "rewrittenClueCount", "overRevealingGeneratedClueCount", "changedClues",
    "changedClueGroups", "unresolvedWords", "skippedUnsafeCandidates",
  ]) {
    result[`average${field[0].toUpperCase()}${field.slice(1)}`] = average(values.map((value) => value[field]));
    result[`total${field[0].toUpperCase()}${field.slice(1)}`] = values.reduce((sum, value) => sum + value[field], 0);
  }
  return result;
}

function enforceSummary(summary) {
  const comparison = summary.comparison;
  const failures = [];
  if (comparison.changedAnswerSets !== 0) failures.push("answer sets changed");
  if (comparison.changedGeometries !== 0) failures.push("grid geometries changed");
  if (comparison.structuralRegressions !== 0) failures.push("structural metrics changed");
  if (summary.editorial.totalOverRevealingGeneratedClueCount !== 0) failures.push("over-revealing clues generated");
  if (summary.editorial.totalRepeatedClueCount > summary.baseline.totalRepeatedClueCount) {
    failures.push("overall repeated clues increased");
  }
  if (summary.baseline.totalRepeatedGenericClueCount > 0
      && summary.editorial.totalRepeatedGenericClueCount >= summary.baseline.totalRepeatedGenericClueCount) {
    failures.push("repeated generic clues did not decrease");
  }
  if (failures.length) throw new Error(`Editorial checkpoint failed: ${failures.join("; ")}`);
}

(async () => {
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, runCount) }, () => workerLoop()));
    const baseline = summarize("baseline");
    const editorial = summarize("editorial");
    const allChanges = records.flatMap((record) => record.editorial.changes.map((change) => ({ seed: record.seed, ...change })));
    const summary = {
      type: "summary",
      runs: records.length,
      enforce,
      baseline,
      editorial,
      comparison: {
        changedAnswerSets: records.filter((record) => record.baseline.answerSignature !== record.editorial.answerSignature).length,
        changedGeometries: records.filter((record) => record.baseline.geometrySignature !== record.editorial.geometrySignature).length,
        structuralRegressions: records.filter((record) => [
          "panels", "answers", "crossings", "rawLetterPercent", "formulaicShortCount", "editorialPenalty",
        ].some((field) => record.baseline[field] !== record.editorial[field])).length,
        fewerRepeatedClues: records.filter((record) => record.delta.repeatedClueCount < 0).length,
        fewerRepeatedGenericClues: records.filter((record) => record.delta.repeatedGenericClueCount < 0).length,
        averageRepeatedClueDelta: average(records.map((record) => record.delta.repeatedClueCount)),
        averageRepeatedGenericClueDelta: average(records.map((record) => record.delta.repeatedGenericClueCount)),
        averageElapsedDeltaMs: average(records.map((record) => record.delta.elapsedMs)),
        rewrittenClues: editorial.totalChangedClues,
        rewrittenGroups: editorial.totalChangedClueGroups,
        unresolvedWords: editorial.totalUnresolvedWords,
        skippedUnsafeCandidates: editorial.totalSkippedUnsafeCandidates,
      },
      examples: allChanges.slice(0, 30),
    };
    if (enforce) enforceSummary(summary);
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
