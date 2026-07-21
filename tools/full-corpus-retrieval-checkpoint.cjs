"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const modes = [
  {
    id: "hard-active-set",
    environment: {
      SCANWORD_FULL_CORPUS_RETRIEVAL: "off",
      SCANWORD_FULL_CORPUS_RETRIEVAL_MODE: "empty",
    },
  },
  {
    id: "empty-domain",
    environment: {
      SCANWORD_FULL_CORPUS_RETRIEVAL: "on",
      SCANWORD_FULL_CORPUS_RETRIEVAL_MODE: "empty",
    },
  },
  {
    id: "small-poor-domain",
    environment: {
      SCANWORD_FULL_CORPUS_RETRIEVAL: "on",
      SCANWORD_FULL_CORPUS_RETRIEVAL_MODE: "small-poor",
    },
  },
];

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].map(Number).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function nearestRank(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].map(Number).sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

function numericSummary(values) {
  const normalized = values.map(Number);
  return {
    average: round(average(normalized), 2),
    median: round(median(normalized), 2),
    p95: round(nearestRank(normalized, 0.95), 2),
    minimum: normalized.length ? Math.min(...normalized) : 0,
    maximum: normalized.length ? Math.max(...normalized) : 0,
  };
}

function sha256File(filePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function exactCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function compactSample(sample, seed, mode) {
  const retrieval = sample.constructionV2?.fullCorpusRetrieval || {};
  const totals = retrieval.totals || {};
  const pipelineStages = sample.constructionV2?.explicitPipeline?.stages || [];
  return {
    type: "seed-mode",
    seed,
    mode,
    status: "ok",
    elapsedMs: Number(sample.elapsedMs || 0),
    valid: Boolean(sample.validation?.valid),
    components: Number(sample.components || 0),
    exactCluesOnly: Boolean(sample.exactCluesOnly),
    coverageCheckpointPassed: Boolean(sample.coverageCheckpointPassed),
    sourceCorpusEntries: Number(sample.sourceCorpusEntries || 0),
    panels: Number(sample.panelCells || 0),
    answers: Number(sample.answers || 0),
    crossings: Number(sample.crossings || 0),
    activePercent: Number(sample.activePercent || 0),
    answerPercent: Number(sample.answerPercent || 0),
    rawLetterPercent: Number(sample.rawLetterPercent || 0),
    twoLetterCount: Number(sample.twoLetterCount || 0),
    formulaicShortCount: Number(sample.formulaicShortCount || 0),
    editorialPenalty: Number(sample.editorialPenalty || 0),
    selectedLimit: sample.constructionV2?.vocabularyPortfolio?.selectedLimit || null,
    retrievalEnabled: Boolean(retrieval.enabled),
    retrievalMode: retrieval.mode || null,
    indexedEntries: Number(retrieval.indexedEntries || 0),
    hotLookups: Number(totals.hotLookups || 0),
    fallbackLookups: Number(totals.fallbackLookups || 0),
    fullCorpusChecks: Number(totals.fullCorpusChecks || 0),
    emptyDomainRescues: Number(totals.emptyDomainRescues || 0),
    smallDomainRescues: Number(totals.smallDomainRescues || 0),
    poorDomainRescues: Number(totals.poorDomainRescues || 0),
    returnedFallbackEntries: Number(totals.returnedFallbackEntries || 0),
    selectedFallbackEntries: Number(totals.selectedFallbackEntries || 0),
    selectedFallbackAnswers: totals.selectedFallbackAnswers || [],
    pipelineStageNames: pipelineStages.map((stage) => stage.name),
  };
}

function summarizeMode(mode, records) {
  const successful = records.filter((record) => record.status === "ok");
  const selectedAnswers = successful.flatMap((record) => record.selectedFallbackAnswers || []);
  return {
    mode,
    runsCompleted: successful.length,
    failures: records.filter((record) => record.status !== "ok"),
    validSeeds: successful.filter((record) => record.valid && record.components === 1 && record.exactCluesOnly).length,
    runtimeMs: numericSummary(successful.map((record) => record.elapsedMs)),
    panels: numericSummary(successful.map((record) => record.panels)),
    answers: numericSummary(successful.map((record) => record.answers)),
    crossings: numericSummary(successful.map((record) => record.crossings)),
    editorialPenalty: numericSummary(successful.map((record) => record.editorialPenalty)),
    formulaicShortCount: numericSummary(successful.map((record) => record.formulaicShortCount)),
    retrieval: {
      indexedEntries: Math.max(0, ...successful.map((record) => record.indexedEntries)),
      hotLookups: successful.reduce((sum, record) => sum + record.hotLookups, 0),
      fallbackLookups: successful.reduce((sum, record) => sum + record.fallbackLookups, 0),
      fullCorpusChecks: successful.reduce((sum, record) => sum + record.fullCorpusChecks, 0),
      emptyDomainRescues: successful.reduce((sum, record) => sum + record.emptyDomainRescues, 0),
      smallDomainRescues: successful.reduce((sum, record) => sum + record.smallDomainRescues, 0),
      poorDomainRescues: successful.reduce((sum, record) => sum + record.poorDomainRescues, 0),
      returnedFallbackEntries: successful.reduce((sum, record) => sum + record.returnedFallbackEntries, 0),
      selectedFallbackEntries: successful.reduce((sum, record) => sum + record.selectedFallbackEntries, 0),
      selectedFallbackAnswers: selectedAnswers,
    },
  };
}

function compareModes(seedSet, recordsByMode) {
  const baselineBySeed = new Map(recordsByMode["hard-active-set"].map((record) => [record.seed, record]));
  const comparisons = {};
  for (const mode of ["empty-domain", "small-poor-domain"]) {
    const rows = recordsByMode[mode].map((record) => {
      const baseline = baselineBySeed.get(record.seed);
      if (!baseline || baseline.status !== "ok" || record.status !== "ok") {
        return { seed: record.seed, comparable: false };
      }
      const structuralEqual = ["panels", "answers", "crossings", "activePercent", "answerPercent", "rawLetterPercent"]
        .every((key) => record[key] === baseline[key]);
      return {
        seed: record.seed,
        comparable: true,
        structuralEqual,
        validityEqual: record.valid === baseline.valid
          && record.components === baseline.components
          && record.exactCluesOnly === baseline.exactCluesOnly,
        editorialPenaltyDelta: record.editorialPenalty - baseline.editorialPenalty,
        formulaicShortDelta: record.formulaicShortCount - baseline.formulaicShortCount,
        runtimeDeltaMs: record.elapsedMs - baseline.elapsedMs,
        selectedFallbackEntries: record.selectedFallbackEntries,
        selectedFallbackAnswers: record.selectedFallbackAnswers,
      };
    });
    const comparable = rows.filter((row) => row.comparable);
    const candidateTotalRuntime = recordsByMode[mode]
      .filter((record) => record.status === "ok")
      .reduce((sum, record) => sum + record.elapsedMs, 0);
    const baselineTotalRuntime = recordsByMode["hard-active-set"]
      .filter((record) => record.status === "ok")
      .reduce((sum, record) => sum + record.elapsedMs, 0);
    comparisons[mode] = {
      seeds: rows,
      structuralParitySeeds: comparable.filter((row) => row.structuralEqual).length,
      validityParitySeeds: comparable.filter((row) => row.validityEqual).length,
      editorialRegressionSeeds: comparable.filter((row) => row.editorialPenaltyDelta > 0 || row.formulaicShortDelta > 0).length,
      editorialImprovementSeeds: comparable.filter((row) => row.editorialPenaltyDelta < 0 || row.formulaicShortDelta < 0).length,
      selectedFallbackSeeds: comparable.filter((row) => row.selectedFallbackEntries > 0).length,
      totalEditorialPenaltyDelta: comparable.reduce((sum, row) => sum + row.editorialPenaltyDelta, 0),
      totalFormulaicShortDelta: comparable.reduce((sum, row) => sum + row.formulaicShortDelta, 0),
      runtimeRatio: baselineTotalRuntime ? round(candidateTotalRuntime / baselineTotalRuntime, 4) : null,
      requestedSeeds: seedSet.length,
    };
  }
  return comparisons;
}

async function runCheckpoint() {
  const requestedCount = Math.max(1, Math.min(20, Number(process.argv[2] || 20)));
  const outputDir = path.resolve(process.argv[3] || path.join(root, "research-output", "full-corpus-retrieval"));
  const configPath = path.join(root, "research", "baselines", "v8-production-1.1", "config.json");
  const seedSetPath = path.join(root, "research", "baselines", "seed-sets", "development-20.json");
  const corpusManifestPath = path.join(root, "bulk-lexicon", "manifest.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const seedSetFile = JSON.parse(fs.readFileSync(seedSetPath, "utf8"));
  const corpusManifest = JSON.parse(fs.readFileSync(corpusManifestPath, "utf8"));
  const seeds = seedSetFile.seeds.slice(0, requestedCount);
  const concurrency = Math.max(1, Number(process.env.SCANWORD_RETRIEVAL_CONCURRENCY || 2));
  const timeoutMs = Math.max(60_000, Number(process.env.SCANWORD_RETRIEVAL_SEED_TIMEOUT_MS || 900_000));
  const enforce = String(process.env.SCANWORD_RETRIEVAL_ENFORCE || "0") === "1";
  const workerPath = path.join(root, config.bootstrap.worker);
  const productionBootstrap = path.join(root, config.bootstrap.production);
  const telemetryBootstrap = path.join(root, config.bootstrap.telemetry);
  const nodeOptions = [
    process.env.NODE_OPTIONS || "",
    `--require=${productionBootstrap}`,
    `--require=${telemetryBootstrap}`,
  ].filter(Boolean).join(" ");

  if (corpusManifest.version !== config.corpus.expectedVersion
      || corpusManifest.actual?.total?.entries !== config.corpus.expectedEntries) {
    throw new Error("Committed corpus does not match the locked Phase 2 baseline");
  }

  const jobs = modes.flatMap((mode) => seeds.map((seed, seedIndex) => ({ mode, seed, seedIndex })));
  const records = new Array(jobs.length);
  let cursor = 0;

  const runJob = (jobIndex) => new Promise((resolve) => {
    const job = jobs[jobIndex];
    const started = Date.now();
    const child = spawn(process.execPath, [workerPath, job.seed], {
      cwd: root,
      env: {
        ...process.env,
        ...config.environment,
        ...job.mode.environment,
        SCANWORD_EXPLICIT_PIPELINE: "on",
        NODE_OPTIONS: nodeOptions,
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
      records[jobIndex] = {
        type: "seed-mode",
        seed: job.seed,
        mode: job.mode.id,
        status: "failed",
        elapsedMs: Date.now() - started,
        error: error.message,
      };
      resolve();
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (records[jobIndex]) return;
      try {
        if (code !== 0) throw new Error(`worker exited ${code}${signal ? ` (${signal})` : ""}: ${stderr || stdout}`);
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        const sample = JSON.parse(line);
        const record = compactSample(sample, job.seed, job.mode.id);
        if (record.sourceCorpusEntries !== config.corpus.expectedEntries) {
          throw new Error(`source corpus mismatch: ${record.sourceCorpusEntries}`);
        }
        records[jobIndex] = record;
      } catch (error) {
        records[jobIndex] = {
          type: "seed-mode",
          seed: job.seed,
          mode: job.mode.id,
          status: "failed",
          elapsedMs: Date.now() - started,
          error: error.message,
        };
      }
      resolve();
    });
  });

  const workerLoop = async () => {
    while (true) {
      const jobIndex = cursor++;
      if (jobIndex >= jobs.length) return;
      await runJob(jobIndex);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => workerLoop()));

  const recordsByMode = Object.fromEntries(modes.map((mode) => [
    mode.id,
    records.filter((record) => record.mode === mode.id).sort((a, b) => seeds.indexOf(a.seed) - seeds.indexOf(b.seed)),
  ]));
  const modeSummaries = Object.fromEntries(modes.map((mode) => [mode.id, summarizeMode(mode.id, recordsByMode[mode.id])]));
  const comparisons = compareModes(seeds, recordsByMode);
  const gateFailures = [];
  for (const mode of modes) {
    const summary = modeSummaries[mode.id];
    if (summary.runsCompleted !== seeds.length) gateFailures.push(`${mode.id}: incomplete runs`);
    if (summary.validSeeds !== seeds.length) gateFailures.push(`${mode.id}: validity or exact-clue regression`);
  }
  for (const mode of ["empty-domain", "small-poor-domain"]) {
    const comparison = comparisons[mode];
    if (comparison.structuralParitySeeds !== seeds.length) gateFailures.push(`${mode}: structural parity failure`);
    if (comparison.validityParitySeeds !== seeds.length) gateFailures.push(`${mode}: validity parity failure`);
    if (comparison.editorialRegressionSeeds > 0) gateFailures.push(`${mode}: editorial regression`);
  }
  if ((comparisons["empty-domain"].runtimeRatio || Infinity) > 1.20) gateFailures.push("empty-domain: runtime ratio above 1.20");
  if ((comparisons["small-poor-domain"].runtimeRatio || Infinity) > 1.35) gateFailures.push("small-poor-domain: runtime ratio above 1.35");
  const totalRescues = modeSummaries["empty-domain"].retrieval.emptyDomainRescues
    + modeSummaries["small-poor-domain"].retrieval.emptyDomainRescues
    + modeSummaries["small-poor-domain"].retrieval.smallDomainRescues
    + modeSummaries["small-poor-domain"].retrieval.poorDomainRescues;
  if (totalRescues === 0) gateFailures.push("no constrained domain was rescued");

  const environment = {
    schemaVersion: 1,
    phase: 4,
    exactCommit: exactCommit(),
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    osRelease: os.release(),
    cpuCount: os.cpus().length,
    concurrency,
    requestedSeeds: seeds.length,
    seedSet: seedSetFile.name,
    seedSetPath: path.relative(root, seedSetPath),
    seedSetDigest: sha256File(seedSetPath),
    configPath: path.relative(root, configPath),
    configDigest: sha256File(configPath),
    corpusManifestPath: path.relative(root, corpusManifestPath),
    corpusManifestDigest: sha256File(corpusManifestPath),
    modes,
  };
  const aggregate = {
    schemaVersion: 1,
    phase: 4,
    experiment: "two-level-full-corpus-pattern-retrieval",
    seedSet: seedSetFile.name,
    requestedSeeds: seeds.length,
    modeSummaries,
    comparisons,
    gate: {
      passed: gateFailures.length === 0,
      failures: gateFailures,
      totalRescues,
      limits: {
        emptyDomainRuntimeRatio: 1.20,
        smallPoorRuntimeRatio: 1.35,
      },
    },
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const perSeedPath = path.join(outputDir, "per-seed.jsonl");
  const aggregatePath = path.join(outputDir, "aggregate.json");
  const environmentPath = path.join(outputDir, "environment.json");
  fs.writeFileSync(perSeedPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`);
  fs.writeFileSync(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);
  const manifest = {
    schemaVersion: 1,
    exactCommit: environment.exactCommit,
    command: `node tools/full-corpus-retrieval-checkpoint.cjs ${requestedCount} ${path.relative(root, outputDir)}`,
    files: {
      perSeed: { path: "per-seed.jsonl", digest: sha256File(perSeedPath) },
      aggregate: { path: "aggregate.json", digest: sha256File(aggregatePath) },
      environment: { path: "environment.json", digest: sha256File(environmentPath) },
    },
  };
  fs.writeFileSync(path.join(outputDir, "run-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  for (const record of records) console.log(JSON.stringify(record));
  console.log(JSON.stringify(aggregate));
  if (enforce && gateFailures.length) throw new Error(`Full-corpus retrieval gate failed: ${gateFailures.join(", ")}`);
}

if (require.main === module) {
  runCheckpoint().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  compactSample,
  compareModes,
  median,
  nearestRank,
  numericSummary,
  summarizeMode,
};
