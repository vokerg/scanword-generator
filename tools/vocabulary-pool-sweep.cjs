"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed-v3.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 3);
const limits = String(process.argv[3] || "2500,3500,5000,7500")
  .split(",")
  .map(Number)
  .filter((value) => Number.isFinite(value) && value > 0);
const prefix = process.argv[4] || "vocabulary-pool-sweep";

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

function runVariant(seed, bulkMode, activeLimit) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SCANWORD_BULK_LEXICON: bulkMode,
      SCANWORD_ACTIVE_POOL_LIMIT: activeLimit ? String(activeLimit) : "",
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
      reject(new Error(`Timed out: ${seed}/${bulkMode}/${activeLimit || "legacy"}`));
    }, 600_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${seed}/${bulkMode}/${activeLimit || "legacy"} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const sample = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
        if (!sample.validation?.valid || sample.components !== 1 || !sample.exactCluesOnly) {
          throw new Error("structural or clue validation failed");
        }
        resolve({
          dictionaryPool: sample.poolEntries,
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
          coverageCheckpointPassed: sample.coverageCheckpointPassed,
        });
      } catch (error) {
        reject(new Error(`${seed}/${bulkMode}/${activeLimit || "legacy"}: ${error.message}`));
      }
    });
  });
}

(async () => {
  try {
    const records = [];
    for (let index = 0; index < runCount; index += 1) {
      const seed = `${prefix}-${index}`;
      const baseline = await runVariant(seed, "off", null);
      const variants = {};
      for (const limit of limits) variants[limit] = await runVariant(seed, "on", limit);
      const record = { type: "seed", index, seed, baseline, variants };
      records.push(record);
      console.log(JSON.stringify(record));
    }

    const summary = {
      type: "summary",
      runs: records.length,
      baseline: {
        averagePanels: average(records.map((record) => record.baseline.panels)),
        averageAnswers: average(records.map((record) => record.baseline.answers)),
        averageCrossings: average(records.map((record) => record.baseline.crossings)),
        averageRawLetterPercent: average(records.map((record) => record.baseline.rawLetterPercent)),
        averageElapsedMs: average(records.map((record) => record.baseline.elapsedMs)),
      },
      variants: {},
    };

    for (const limit of limits) {
      const values = records.map((record) => record.variants[limit]);
      summary.variants[limit] = {
        averagePanels: average(values.map((value) => value.panels)),
        averageAnswers: average(values.map((value) => value.answers)),
        averageCrossings: average(values.map((value) => value.crossings)),
        averageRawLetterPercent: average(values.map((value) => value.rawLetterPercent)),
        averageShortAnswers: average(values.map((value) => value.shortAnswerCount)),
        averageTwoLetterCount: average(values.map((value) => value.twoLetterCount)),
        averageFormulaicShort: average(values.map((value) => value.formulaicShortCount)),
        averageEditorialPenalty: average(values.map((value) => value.editorialPenalty)),
        averageLexicalQuality: average(values.map((value) => value.averageLexicalQuality)),
        averageElapsedMs: average(values.map((value) => value.elapsedMs)),
        checkpointPasses: values.filter((value) => value.coverageCheckpointPassed).length,
        panelDelta: average(values.map((value, index) => value.panels - records[index].baseline.panels)),
        answerDelta: average(values.map((value, index) => value.answers - records[index].baseline.answers)),
        crossingDelta: average(values.map((value, index) => value.crossings - records[index].baseline.crossings)),
      };
    }
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
