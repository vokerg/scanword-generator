"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const outputDir = path.resolve(process.argv[2] || path.join(root, "research-output", "bounded-partial-search"));
const requestedSeeds = Math.max(1, Number(process.argv[3] || 20));
const configPath = path.join(root, "research", "baselines", "v8-production-1.1", "config.json");
const seedPath = path.join(root, "research", "baselines", "seed-sets", "development-20.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const seedSet = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const seeds = seedSet.seeds.slice(0, requestedSeeds);
const worker = path.join(root, "tools", "bounded-partial-search-seed-v1.cjs");
const bootstrap = path.join(root, "tools", "node-benchmark-bootstrap-v1.cjs");
const concurrency = Math.max(1, Number(process.env.SCANWORD_PARTIAL_SEARCH_CONCURRENCY || 2));
const timeoutMs = Math.max(60_000, Number(process.env.SCANWORD_PARTIAL_SEARCH_SEED_TIMEOUT_MS || 1_200_000));
const enforce = String(process.env.SCANWORD_PARTIAL_SEARCH_ENFORCE || "0") === "1";
const modes = String(process.env.SCANWORD_PARTIAL_SEARCH_MODES || "off,shadow,beam")
  .split(",")
  .map((value) => value.trim())
  .filter((value, index, values) => ["off", "shadow", "beam"].includes(value) && values.indexOf(value) === index);
if (!modes.includes("off")) modes.unshift("off");

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
  const aggregateTelemetry = completed.map((record) => record.partialSearch?.aggregate).filter(Boolean);
  const selectedTelemetry = completed.map((record) => record.partialSearch?.selected).filter(Boolean);
  const sumTelemetry = (key) => aggregateTelemetry.reduce((sum, item) => sum + Number(item[key] || 0), 0);
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
    search: {
      attemptsObserved: sumTelemetry("attemptsObserved"),
      attemptsSampled: sumTelemetry("attemptsSampled"),
      branchRounds: sumTelemetry("branchRounds"),
      candidatesConsidered: sumTelemetry("candidatesConsidered"),
      nodes: sumTelemetry("nodes"),
      deduplicated: sumTelemetry("deduplicated"),
      weakFillPruned: sumTelemetry("weakFillPruned"),
      maximumDepthReached: aggregateTelemetry.reduce((maximum, item) => Math.max(maximum, Number(item.depthReached || 0)), 0),
      maximumBeamPeak: aggregateTelemetry.reduce((maximum, item) => Math.max(maximum, Number(item.beamPeak || 0)), 0),
      finalists: sumTelemetry("finalists"),
      beamPreferred: sumTelemetry("beamPreferred"),
      baselinePreferred: sumTelemetry("baselinePreferred"),
      beamReturned: sumTelemetry("beamReturned"),
      baselineReturned: sumTelemetry("baselineReturned"),
      selectedBeamSeeds: selectedTelemetry.filter((item) => item.selectedVariant === "beam").length,
      selectedSampledSeeds: selectedTelemetry.filter((item) => item.sampled).length,
      selectedWithBeamAncestry: selectedTelemetry.filter((item) => (item.ancestry || []).some((step) => step.kind === "beam")).length,
    },
  };
}

function compareModes(recordsByMode, summaries) {
  const offBySeed = new Map(recordsByMode.off.map((record) => [record.seed, record]));
  const comparisons = {};
  for (const mode of modes.filter((value) => value !== "off")) {
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
      answerRegressions: pairs.filter((pair) => pair.candidate.answers < pair.baseline.answers).map((pair) => ({
        seed: pair.candidate.seed,
        baseline: pair.baseline.answers,
        candidate: pair.candidate.answers,
      })),
      editorialRegressions: pairs.filter((pair) => pair.candidate.editorialPenalty > pair.baseline.editorialPenalty).map((pair) => ({
        seed: pair.candidate.seed,
        baseline: pair.baseline.editorialPenalty,
        candidate: pair.candidate.editorialPenalty,
      })),
      editorialImprovements: pairs.filter((pair) => pair.candidate.editorialPenalty < pair.baseline.editorialPenalty).map((pair) => ({
        seed: pair.candidate.seed,
        baseline: pair.baseline.editorialPenalty,
        candidate: pair.candidate.editorialPenalty,
      })),
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
        SCANWORD_CLUE_FEASIBILITY: "off",
        SCANWORD_PARTIAL_SEARCH: mode,
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

function gateFailures(summaries, comparisons) {
  const failures = [];
  for (const mode of modes) {
    const summary = summaries[mode];
    if (summary.completed !== seeds.length) failures.push(`${mode}: incomplete runs`);
    if (summary.validity.invalid) failures.push(`${mode}: invalid grids`);
    if (summary.validity.disconnected) failures.push(`${mode}: disconnected grids`);
    if (summary.validity.nonExactClues) failures.push(`${mode}: non-exact clues`);
    if (summary.validity.checkpointFailures) failures.push(`${mode}: checkpoint failures`);
  }
  if (summaries.shadow && comparisons.shadow) {
    if (comparisons.shadow.exactDigestParity !== comparisons.shadow.pairedSeeds) failures.push("shadow: exact output parity failed");
    if (summaries.shadow.search.nodes <= 0 || summaries.shadow.search.attemptsSampled <= 0) failures.push("shadow: search telemetry missing");
    if (comparisons.shadow.runtimeRatio > 1.80) failures.push(`shadow: runtime ratio ${comparisons.shadow.runtimeRatio.toFixed(4)} exceeds 1.80`);
  }
  if (summaries.beam) {
    if (summaries.beam.search.nodes <= 0 || summaries.beam.search.attemptsSampled <= 0) failures.push("beam: search telemetry missing");
    if (summaries.beam.search.maximumDepthReached <= 0) failures.push("beam: no search depth reached");
    if (summaries.beam.search.beamReturned > 0 && summaries.beam.search.selectedWithBeamAncestry <= 0) {
      failures.push("beam: selected beam outputs lack ancestry");
    }
  }
  return failures;
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
  const failures = gateFailures(summaries, comparisons);
  const aggregate = {
    schemaVersion: 1,
    phase: "phase-6-bounded-partial-search",
    sourceSha: process.env.GITHUB_SHA || null,
    seeds,
    modes: summaries,
    comparisons,
    gate: { enforce, passed: failures.length === 0, failures },
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
    modes,
    search: {
      rate: Number(process.env.SCANWORD_PARTIAL_SEARCH_RATE || 0.20),
      start: Number(process.env.SCANWORD_PARTIAL_SEARCH_START || 26),
      depth: Number(process.env.SCANWORD_PARTIAL_SEARCH_DEPTH || 4),
      beam: Number(process.env.SCANWORD_PARTIAL_SEARCH_BEAM || 4),
      branching: Number(process.env.SCANWORD_PARTIAL_SEARCH_BRANCHING || 3),
      nodes: Number(process.env.SCANWORD_PARTIAL_SEARCH_NODES || 48),
    },
    configPath: path.relative(root, configPath),
    seedPath: path.relative(root, seedPath),
    worker: path.relative(root, worker),
    bootstrap: path.relative(root, bootstrap),
    environment: config.environment,
  }, null, 2)}\n`);
  const manifestPath = path.join(outputDir, "run-manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    command: `node tools/bounded-partial-search-checkpoint.cjs ${path.relative(root, outputDir)} ${seeds.length}`,
    files: {
      perSeed: { path: "per-seed.jsonl", digest: `sha256:${sha256File(recordsPath)}` },
      aggregate: { path: "aggregate.json", digest: `sha256:${sha256File(aggregatePath)}` },
      environment: { path: "environment.json", digest: `sha256:${sha256File(environmentPath)}` },
    },
  }, null, 2)}\n`);
  console.log(JSON.stringify(aggregate));
  if (enforce && failures.length) throw new Error(`Bounded partial-search gate failed: ${failures.join(", ")}`);
}

runAll().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
