"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 100);
const prefix = process.argv[3] || "construction-checkpoint";
const concurrency = Math.max(1, Number(process.env.SCANWORD_CHECKPOINT_CONCURRENCY) || 2);
const enforce = process.env.SCANWORD_CHECKPOINT_ENFORCE === "1";
const samples = new Array(runCount);
let cursor = 0;

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

function runSeed(index) {
  return new Promise((resolve, reject) => {
    const seed = `${prefix}-${index}`;
    const env = {
      ...process.env,
      SCANWORD_CONSTRUCTION_MODE: "portfolio",
      SCANWORD_CLOSED_FILL: "diagnostic",
      SCANWORD_PORTFOLIO_ATTEMPTS: process.env.SCANWORD_PORTFOLIO_ATTEMPTS || "240",
      SCANWORD_PORTFOLIO_CLUE_RESTARTS: process.env.SCANWORD_PORTFOLIO_CLUE_RESTARTS || "160",
      SCANWORD_VICTIM_BASES: process.env.SCANWORD_VICTIM_BASES || "8",
      SCANWORD_VICTIM_VARIANTS: process.env.SCANWORD_VICTIM_VARIANTS || "6",
      SCANWORD_VICTIM_SECONDARY_WORDS: process.env.SCANWORD_VICTIM_SECONDARY_WORDS || "3",
      SCANWORD_VICTIM_SECONDARY_VARIANTS: process.env.SCANWORD_VICTIM_SECONDARY_VARIANTS || "4",
      SCANWORD_VICTIM_SECONDARY_FINALISTS: process.env.SCANWORD_VICTIM_SECONDARY_FINALISTS || "6",
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
      reject(new Error(`Timed out: ${seed}`));
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
        reject(new Error(`${seed} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        const sample = JSON.parse(line);
        if (!sample.validation?.valid) throw new Error(`invalid grid: ${JSON.stringify(sample.validation)}`);
        if (sample.components !== 1) throw new Error("disconnected answer graph");
        if (!sample.exactCluesOnly) throw new Error("fallback clue detected");
        if (!sample.coverageCheckpointPassed) throw new Error("preserved production checkpoint failed");
        samples[index] = {
          type: "seed",
          index,
          seed,
          panels: sample.panelCells,
          rawLetterPercent: sample.rawLetterPercent,
          answers: sample.answers,
          clueTextCells: sample.clueTextCells,
          externalClues: sample.externalClues,
          elapsedMs: sample.elapsedMs,
          victimDepth: Number(sample.constructionV2?.selectedVictimReplacement?.depth || 0),
          clueRepackAccepted: Boolean(sample.constructionV2?.clueRepack?.accepted),
          adaptiveClueRepackAccepted: Boolean(sample.constructionV2?.adaptiveClueRepack?.accepted),
        };
        resolve();
      } catch (error) {
        reject(new Error(`${seed}: ${error.message}`));
      }
    });
  });
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
    for (const sample of samples) console.log(JSON.stringify(sample));
    const summary = {
      type: "summary",
      runs: samples.length,
      concurrency,
      averagePanels: average(samples.map((sample) => sample.panels)),
      maximumPanels: Math.max(...samples.map((sample) => sample.panels)),
      minimumPanels: Math.min(...samples.map((sample) => sample.panels)),
      averageRawLetterPercent: average(samples.map((sample) => sample.rawLetterPercent)),
      averageAnswers: average(samples.map((sample) => sample.answers)),
      averageElapsedMs: average(samples.map((sample) => sample.elapsedMs)),
      victimSelectedSeeds: samples.filter((sample) => sample.victimDepth > 0).length,
      clueRepackAcceptedSeeds: samples.filter((sample) => sample.clueRepackAccepted).length,
      adaptiveClueRepackAcceptedSeeds: samples.filter((sample) => sample.adaptiveClueRepackAccepted).length,
    };
    summary.checkpointPassed = summary.averagePanels <= 8 && summary.maximumPanels <= 12;
    summary.requirement = { averagePanelsAtMost: 8, maximumPanelsAtMost: 12 };
    console.log(JSON.stringify(summary));
    if (enforce && !summary.checkpointPassed) process.exitCode = 1;
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
})();
