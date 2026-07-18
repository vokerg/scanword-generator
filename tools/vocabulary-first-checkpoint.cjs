"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed-v3.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 10);
const prefix = process.argv[3] || "vocabulary-first";
const concurrency = Math.max(1, Number(process.env.SCANWORD_VOCABULARY_CONCURRENCY) || 1);
const enforce = process.env.SCANWORD_VOCABULARY_ENFORCE === "1";
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

function mergeAverageCounts(samplesToMerge, field) {
  const totals = {};
  for (const sample of samplesToMerge) {
    for (const [key, value] of Object.entries(sample[field] || {})) totals[key] = (totals[key] || 0) + value;
  }
  return Object.fromEntries(Object.entries(totals)
    .map(([key, value]) => [key, +(value / Math.max(1, samplesToMerge.length)).toFixed(2)])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function runVariant(seed, bulkMode) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SCANWORD_BULK_LEXICON: bulkMode,
      SCANWORD_CONSTRUCTION_MODE: "portfolio",
      SCANWORD_CLOSED_FILL: "diagnostic",
      SCANWORD_PORTFOLIO_SELECTION: "panel-first",
      SCANWORD_LEXICAL_PLACEMENT: "off",
      SCANWORD_EDITORIAL_REPAIR: "off",
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
      reject(new Error(`Timed out: ${seed}/${bulkMode}`));
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
        reject(new Error(`${seed}/${bulkMode} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        const sample = JSON.parse(line);
        if (!sample.validation?.valid) throw new Error(`invalid grid: ${JSON.stringify(sample.validation)}`);
        if (sample.components !== 1) throw new Error("disconnected answer graph");
        if (!sample.exactCluesOnly) throw new Error("fallback clue detected");
        resolve(sample);
      } catch (error) {
        reject(new Error(`${seed}/${bulkMode}: ${error.message}`));
      }
    });
  });
}

function describe(sample) {
  return {
    dictionaryPool: Number(sample.poolEntries || 0),
    sourceCorpusEntries: Number(sample.sourceCorpusEntries || 0),
    poolSelection: sample.poolSelection || null,
    panels: sample.panelCells,
    answers: sample.answers,
    crossings: sample.crossings,
    activePercent: sample.activePercent,
    answerPercent: sample.answerPercent,
    rawLetterPercent: sample.rawLetterPercent,
    shortAnswerCount: sample.shortAnswerCount,
    twoLetterCount: sample.twoLetterCount,
    formulaicShortCount: sample.formulaicShortCount,
    editorialPenalty: sample.editorialPenalty,
    averageLexicalQuality: sample.averageLexicalQuality,
    elapsedMs: sample.elapsedMs,
    candidateChecks: Number(sample.candidateChecks || 0),
    candidateLookups: Number(sample.candidateLookups || 0),
    coverageCheckpointPassed: Boolean(sample.coverageCheckpointPassed),
    lexicalSources: countBy(sample, "lexicalSource", "unknown"),
    lexicalCategories: countBy(sample, "lexicalCategory", "core-reviewed"),
  };
}

async function runSeed(index) {
  const seed = `${prefix}-${index}`;
  const baseline = describe(await runVariant(seed, "off"));
  const expanded = describe(await runVariant(seed, "on"));
  samples[index] = {
    type: "seed",
    index,
    seed,
    baseline,
    expanded,
    delta: {
      dictionaryPool: expanded.dictionaryPool - baseline.dictionaryPool,
      panels: expanded.panels - baseline.panels,
      answers: expanded.answers - baseline.answers,
      crossings: expanded.crossings - baseline.crossings,
      activePercent: +(expanded.activePercent - baseline.activePercent).toFixed(2),
      answerPercent: +(expanded.answerPercent - baseline.answerPercent).toFixed(2),
      rawLetterPercent: +(expanded.rawLetterPercent - baseline.rawLetterPercent).toFixed(2),
      shortAnswerCount: expanded.shortAnswerCount - baseline.shortAnswerCount,
      formulaicShortCount: expanded.formulaicShortCount - baseline.formulaicShortCount,
      editorialPenalty: expanded.editorialPenalty - baseline.editorialPenalty,
      elapsedMs: expanded.elapsedMs - baseline.elapsedMs,
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
      baseline: {
        averageDictionaryPool: average(samples.map((sample) => sample.baseline.dictionaryPool)),
        averagePanels: average(samples.map((sample) => sample.baseline.panels)),
        averageAnswers: average(samples.map((sample) => sample.baseline.answers)),
        averageCrossings: average(samples.map((sample) => sample.baseline.crossings)),
        averageActivePercent: average(samples.map((sample) => sample.baseline.activePercent)),
        averageAnswerPercent: average(samples.map((sample) => sample.baseline.answerPercent)),
        averageRawLetterPercent: average(samples.map((sample) => sample.baseline.rawLetterPercent)),
        averageShortAnswers: average(samples.map((sample) => sample.baseline.shortAnswerCount)),
        averageFormulaicShort: average(samples.map((sample) => sample.baseline.formulaicShortCount)),
        averageEditorialPenalty: average(samples.map((sample) => sample.baseline.editorialPenalty)),
        averageElapsedMs: average(samples.map((sample) => sample.baseline.elapsedMs)),
        averageLexicalSources: mergeAverageCounts(samples.map((sample) => sample.baseline), "lexicalSources"),
        averageLexicalCategories: mergeAverageCounts(samples.map((sample) => sample.baseline), "lexicalCategories"),
      },
      expanded: {
        sourceCorpusEntries: Math.max(...samples.map((sample) => sample.expanded.sourceCorpusEntries)),
        averageDictionaryPool: average(samples.map((sample) => sample.expanded.dictionaryPool)),
        averagePanels: average(samples.map((sample) => sample.expanded.panels)),
        averageAnswers: average(samples.map((sample) => sample.expanded.answers)),
        averageCrossings: average(samples.map((sample) => sample.expanded.crossings)),
        averageActivePercent: average(samples.map((sample) => sample.expanded.activePercent)),
        averageAnswerPercent: average(samples.map((sample) => sample.expanded.answerPercent)),
        averageRawLetterPercent: average(samples.map((sample) => sample.expanded.rawLetterPercent)),
        averageShortAnswers: average(samples.map((sample) => sample.expanded.shortAnswerCount)),
        averageFormulaicShort: average(samples.map((sample) => sample.expanded.formulaicShortCount)),
        averageEditorialPenalty: average(samples.map((sample) => sample.expanded.editorialPenalty)),
        averageElapsedMs: average(samples.map((sample) => sample.expanded.elapsedMs)),
        averageLexicalSources: mergeAverageCounts(samples.map((sample) => sample.expanded), "lexicalSources"),
        averageLexicalCategories: mergeAverageCounts(samples.map((sample) => sample.expanded), "lexicalCategories"),
      },
      comparison: {
        fewerPanels: samples.filter((sample) => sample.delta.panels < 0).length,
        moreAnswers: samples.filter((sample) => sample.delta.answers > 0).length,
        moreCrossings: samples.filter((sample) => sample.delta.crossings > 0).length,
        higherRawLetterCoverage: samples.filter((sample) => sample.delta.rawLetterPercent > 0).length,
        panelRegressions: samples.filter((sample) => sample.delta.panels > 0).length,
        answerRegressions: samples.filter((sample) => sample.delta.answers < 0).length,
        expandedCheckpointPasses: samples.filter((sample) => sample.expanded.coverageCheckpointPassed).length,
        averagePanelDelta: average(samples.map((sample) => sample.delta.panels)),
        averageAnswerDelta: average(samples.map((sample) => sample.delta.answers)),
        averageCrossingDelta: average(samples.map((sample) => sample.delta.crossings)),
        averageRawLetterDelta: average(samples.map((sample) => sample.delta.rawLetterPercent)),
        averageElapsedDeltaMs: average(samples.map((sample) => sample.delta.elapsedMs)),
      },
    };
    console.log(JSON.stringify(summary));

    if (enforce) {
      if (summary.comparison.expandedCheckpointPasses !== samples.length) {
        throw new Error("not every expanded-corpus seed passed the preserved coverage checkpoint");
      }
      if (summary.comparison.answerRegressions > Math.ceil(samples.length * 0.2)) {
        throw new Error("expanded corpus regressed answer count on too many seeds");
      }
    }
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
