"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const outputDir = path.resolve(process.argv[2] || path.join(root, "research-output", "clue-feasibility"));
const requestedSeeds = Math.max(1, Number(process.argv[3] || 20));
const configPath = path.join(root, "research", "baselines", "v8-production-1.1", "config.json");
const seedPath = path.join(root, "research", "baselines", "seed-sets", "development-20.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const seedSet = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const seeds = seedSet.seeds.slice(0, requestedSeeds);
const worker = path.join(root, "tools", "clue-feasibility-seed-v1.cjs");
const bootstrap = path.join(root, "tools", "node-benchmark-bootstrap-v1.cjs");
const concurrency = Math.max(1, Number(process.env.SCANWORD_CLUE_FEASIBILITY_CONCURRENCY || 2));
const timeoutMs = Math.max(60_000, Number(process.env.SCANWORD_CLUE_FEASIBILITY_SEED_TIMEOUT_MS || 900_000));
const enforce = String(process.env.SCANWORD_CLUE_FEASIBILITY_ENFORCE || "0") === "1";
const modes = ["off", "shadow", "guard"];

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function summarizeMode(mode, records) {
  const completed = records.filter((record) => record.status === "passed");
  const telemetry = completed.map((record) => record.clueFeasibility?.aggregate).filter(Boolean);
  const selected = completed.map((record) => record.clueFeasibility?.selected?.calibration).filter(Boolean);
  const sumTelemetry = (key) => telemetry.reduce((sum, item) => sum + Number(item[key] || 0), 0);
  return {
    mode,
    requested: seeds.length,
    completed: completed.length,
    failed: records.length - completed.length,
    validity: {
      invalid: completed.filter((record) => !record.valid).length,
      disconnected: completed.filter((record) => record.components !== 1).length,
      nonExactClues: completed.filter((record) => !record.exactCluesOnly).length,
      checkpointFailures: completed.filter((record) => !record.coverageCheckpointPassed).length,
    },
    runtime: {
      totalMs: completed.reduce((sum, record) => sum + record.elapsedMs, 0),
      averageMs: mean(completed.map((record) => record.elapsedMs)),
      medianMs: median(completed.map((record) => record.elapsedMs)),
      p95Ms: percentile(completed.map((record) => record.elapsedMs), 0.95),
      maximumMs: completed.length ? Math.max(...completed.map((record) => record.elapsedMs)) : 0,
    },
    output: {
      averagePanels: mean(completed.map((record) => record.panels)),
      maximumPanels: completed.length ? Math.max(...completed.map((record) => record.panels)) : 0,
      zeroPanelRate: completed.length ? completed.filter((record) => record.panels === 0).length / completed.length : 0,
      averageAnswers: mean(completed.map((record) => record.answers)),
      averageCrossings: mean(completed.map((record) => record.crossings)),
      averageClueTextCells: mean(completed.map((record) => record.clueTextCells)),
      averageExternalClues: mean(completed.map((record) => record.externalClues)),
      averageTwoLetterCount: mean(completed.map((record) => record.twoLetterCount)),
      averageFormulaicShortCount: mean(completed.map((record) => record.formulaicShortCount)),
      averageEditorialPenalty: mean(completed.map((record) => record.editorialPenalty)),
    },
    estimator: {
      attemptsBuilt: sumTelemetry("attemptsBuilt"),
      placementRounds: sumTelemetry("placementRounds"),
      candidateEvaluations: sumTelemetry("candidateEvaluations"),
      hardImpossibleCandidates: sumTelemetry("hardImpossibleCandidates"),
      candidatesPruned: sumTelemetry("candidatesPruned"),
      denseStops: sumTelemetry("denseStops"),
      newlyStrandedClues: sumTelemetry("newlyStrandedClues"),
      completeStates: sumTelemetry("completeStates"),
      predictedPasses: sumTelemetry("predictedPasses"),
      actualPasses: sumTelemetry("actualPasses"),
      falsePositives: sumTelemetry("falsePositives"),
      falseNegatives: sumTelemetry("falseNegatives"),
      meanClueTextAbsoluteError: sumTelemetry("completeStates")
        ? sumTelemetry("clueTextAbsoluteError") / sumTelemetry("completeStates")
        : 0,
      meanExternalAbsoluteError: sumTelemetry("completeStates")
        ? sumTelemetry("externalAbsoluteError") / sumTelemetry("completeStates")
        : 0,
      selectedFalsePositives: selected.filter((item) => item.falsePositive).length,
      selectedFalseNegatives: selected.filter((item) => item.falseNegative).length,
    },
  };
}

function compareModes(recordsByMode, summaries) {
  const offBySeed = new Map(recordsByMode.off.map((record) => [record.seed, record]));
  const comparisons = {};
  for (const mode of ["shadow", "guard"]) {
    const pairs = recordsByMode[mode]
      .filter((record) => record.status === "passed" && offBySeed.get(record.seed)?.status === "passed")
      .map((record) => ({ baseline: offBySeed.get(record.seed), candidate: record }));
    comparisons[mode] = {
      pairedSeeds: pairs.length,
      exactDigestParity: pairs.filter((pair) => pair.baseline.resultDigest === pair.candidate.resultDigest).length,
      panelRegressions: pairs.filter((pair) => pair.candidate.panels > pair.baseline.panels).map((pair) => ({
        seed: pair.candidate.seed,
        baseline: pair.baseline.panels,
        candidate: pair.candidate.panels,
      })),
      panelImprovements: pairs.filter((pair) => pair.candidate.panels < pair.baseline.panels).map((pair) => ({
        seed: pair.candidate.seed,
        baseline: pair.baseline.panels,
        candidate: pair.candidate.panels,
      })),
      editorialRegressions: pairs.filter((pair) => pair.candidate.editorialPenalty > pair.baseline.editorialPenalty).map((pair) => ({
        seed: pair.candidate.seed,
        baseline: pair.baseline.editorialPenalty,
        candidate: pair.candidate.editorialPenalty,
      })),
      clueTextImprovements: pairs.filter((pair) => pair.candidate.clueTextCells > pair.baseline.clueTextCells).length,
      runtimeRatio: summaries.off.runtime.totalMs
        ? summaries[mode].runtime.totalMs / summaries.off.runtime.totalMs
        : 0,
    };
  }
  return comparisons;
}

async function runWorker(mode, seed) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [worker, seed], {
      cwd: root,
      env: {
        ...process.env,
        ...config.environment,
        SCANWORD_CLUE_FEASIBILITY: mode,
        NODE_OPTIONS: [process.env.NODE_OPTIONS || "", `--require=${bootstrap}`].filter(Boolean).join(" "),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ mode, seed, status: "failed", elapsedMs: Date.now() - started, error: error.message });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw new Error(`worker exited ${code}${signal ? ` (${signal})` : ""}: ${stderr || stdout}`);
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        resolve({ ...JSON.parse(line), status: "passed" });
      } catch (error) {
        resolve({ mode, seed, status: "failed", elapsedMs: Date.now() - started, error: error.message });
      }
    });
  });
}

async function runAll() {
  const queue = modes.flatMap((mode) => seeds.map((seed) => ({ mode, seed })));
  const records = [];
  let cursor = 0;
  async function workerLoop() {
    while (true) {
      const index = cursor++;
      if (index >= queue.length) return;
      const task = queue[index];
      const record = await runWorker(task.mode, task.seed);
      records.push(record);
      console.log(JSON.stringify(record));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => workerLoop()));
  records.sort((a, b) => modes.indexOf(a.mode) - modes.indexOf(b.mode) || seeds.indexOf(a.seed) - seeds.indexOf(b.seed));
  const recordsByMode = Object.fromEntries(modes.map((mode) => [mode, records.filter((record) => record.mode === mode)]));
  const summaries = Object.fromEntries(modes.map((mode) => [mode, summarizeMode(mode, recordsByMode[mode])]));
  const comparisons = compareModes(recordsByMode, summaries);
  const aggregate = {
    schemaVersion: 1,
    phase: "phase-5-clue-feasibility",
    sourceSha: process.env.GITHUB_SHA || null,
    seeds,
    modes: summaries,
    comparisons,
  };
  fs.mkdirSync(outputDir, { recursive: true });
  const recordsPath = path.join(outputDir, "per-seed.jsonl");
  const aggregatePath = path.join(outputDir, "aggregate.json");
  const environmentPath = path.join(outputDir, "environment.json");
  fs.writeFileSync(recordsPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`);
  fs.writeFileSync(environmentPath, `${JSON.stringify({
    schemaVersion: 1,
    sourceSha: process.env.GITHUB_SHA || null,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    concurrency,
    timeoutMs,
    configPath: path.relative(root, configPath),
    seedPath: path.relative(root, seedPath),
    worker: path.relative(root, worker),
    bootstrap: path.relative(root, bootstrap),
    environment: config.environment,
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "run-manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    command: `node tools/clue-feasibility-checkpoint.cjs ${path.relative(root, outputDir)} ${seeds.length}`,
    files: {
      perSeed: { path: "per-seed.jsonl", digest: `sha256:${sha256File(recordsPath)}` },
      aggregate: { path: "aggregate.json", digest: `sha256:${sha256File(aggregatePath)}` },
      environment: { path: "environment.json", digest: `sha256:${sha256File(environmentPath)}` },
    },
  }, null, 2)}\n`);
  console.log(JSON.stringify(aggregate));

  const failures = [];
  for (const mode of modes) {
    const summary = summaries[mode];
    if (summary.completed !== seeds.length) failures.push(`${mode}: incomplete runs`);
    if (summary.validity.invalid) failures.push(`${mode}: invalid grids`);
    if (summary.validity.disconnected) failures.push(`${mode}: disconnected grids`);
    if (summary.validity.nonExactClues) failures.push(`${mode}: non-exact clues`);
    if (summary.validity.checkpointFailures) failures.push(`${mode}: checkpoint failures`);
  }
  if (comparisons.shadow.exactDigestParity !== comparisons.shadow.pairedSeeds) failures.push("shadow: exact output parity failed");
  if (summaries.shadow.estimator.falseNegatives) failures.push("shadow: dangerous complete-state false negatives");
  if (summaries.guard.estimator.falseNegatives) failures.push("guard: dangerous complete-state false negatives");
  if (comparisons.guard.panelRegressions.length) failures.push("guard: panel regressions");
  if (comparisons.guard.editorialRegressions.length) failures.push("guard: editorial regressions");
  if (comparisons.guard.runtimeRatio > 1.15) failures.push(`guard: runtime ratio ${comparisons.guard.runtimeRatio.toFixed(4)} exceeds 1.15`);
  if (summaries.guard.estimator.candidatesPruned <= 0 || summaries.guard.estimator.denseStops <= 0) failures.push("guard: no clearly impossible dense states rejected");
  const improved = comparisons.guard.runtimeRatio <= 0.98
    || comparisons.guard.panelImprovements.length > 0
    || comparisons.guard.clueTextImprovements > 0;
  if (!improved) failures.push("guard: no runtime or downstream quality improvement");
  if (enforce && failures.length) throw new Error(`Clue-feasibility gate failed: ${failures.join(", ")}`);
  aggregate.gate = { enforce, passed: failures.length === 0, failures };
  fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`);
}

runAll().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
