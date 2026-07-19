"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const properCategories = new Set(["given-name", "surname", "patronymic", "city", "capital"]);
const seedFiles = {
  development: "development-20.json",
  promotion: "promotion-50.json",
  stability: "stability-100.json",
};

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
}

function nearestRank(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].map(Number).sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].map(Number).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function numericSummary(values) {
  const normalized = values.map(Number);
  return {
    average: round(average(normalized)),
    median: round(median(normalized)),
    p95: round(nearestRank(normalized, 0.95)),
    minimum: normalized.length ? Math.min(...normalized) : 0,
    maximum: normalized.length ? Math.max(...normalized) : 0,
  };
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function distribution(values) {
  const result = {};
  for (const value of values) {
    const key = String(value);
    result[key] = (result[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort((a, b) => Number(a[0]) - Number(b[0])));
}

function concentration(entries, field) {
  const counts = new Map();
  for (const entry of entries || []) {
    const key = String(entry?.[field] || "unknown");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const dominant = ordered[0] || ["unknown", 0];
  return {
    distinct: counts.size,
    dominant: dominant[0],
    dominantCount: dominant[1],
    dominantShare: entries?.length ? round(dominant[1] / entries.length, 4) : 0,
    counts: Object.fromEntries(ordered),
  };
}

function compactSample(sample, setName, index, seed) {
  const lexicalEntries = Array.isArray(sample.lexicalEntries) ? sample.lexicalEntries : [];
  const categories = concentration(lexicalEntries, "lexicalCategory");
  const sources = concentration(lexicalEntries, "lexicalSource");
  const clueMetrics = sample.constructionV2?.selectedGridClues
    || sample.constructionV2?.vocabularyPortfolio?.selected
    || {};
  const properNameCount = lexicalEntries.filter((entry) => properCategories.has(String(entry.lexicalCategory || ""))).length;
  const genericClueCount = Number(clueMetrics.genericClueCount || 0);
  const repeatedClueCount = Number(clueMetrics.repeatedClueCount || 0);
  const overRevealingGeneratedClueCount = Number(clueMetrics.overRevealingGeneratedClueCount || 0);

  return {
    type: "seed",
    set: setName,
    index,
    seed,
    status: "ok",
    valid: Boolean(sample.validation?.valid),
    components: Number(sample.components || 0),
    exactCluesOnly: Boolean(sample.exactCluesOnly),
    coverageCheckpointPassed: Boolean(sample.coverageCheckpointPassed),
    sourceCorpusEntries: Number(sample.sourceCorpusEntries || 0),
    elapsedMs: Number(sample.elapsedMs || 0),
    panels: Number(sample.panelCells || 0),
    zeroPanel: Number(sample.panelCells || 0) === 0,
    answers: Number(sample.answers || 0),
    crossings: Number(sample.crossings || 0),
    activePercent: Number(sample.activePercent || 0),
    answerPercent: Number(sample.answerPercent || 0),
    rawLetterPercent: Number(sample.rawLetterPercent || 0),
    letterCells: Number(sample.letterCells || 0),
    twoLetterCount: Number(sample.twoLetterCount || 0),
    formulaicShortCount: Number(sample.formulaicShortCount || 0),
    editorialPenalty: Number(sample.editorialPenalty || 0),
    selectedGridClueDebt: genericClueCount + repeatedClueCount + overRevealingGeneratedClueCount,
    genericClueCount,
    generatedClueCount: Number(clueMetrics.generatedClueCount || 0),
    factualTemplateCount: Number(clueMetrics.factualTemplateCount || 0),
    repeatedClueCount,
    repeatedClueKinds: Number(clueMetrics.repeatedClueKinds || 0),
    repeatedGenericClueCount: Number(clueMetrics.repeatedGenericClueCount || 0),
    repeatedGenericClueKinds: Number(clueMetrics.repeatedGenericClueKinds || 0),
    overRevealingGeneratedClueCount,
    properNameCount,
    properNameShare: lexicalEntries.length ? round(properNameCount / lexicalEntries.length, 4) : 0,
    distinctCategories: categories.distinct,
    dominantCategory: categories.dominant,
    dominantCategoryShare: categories.dominantShare,
    categoryCounts: categories.counts,
    distinctSources: sources.distinct,
    dominantSource: sources.dominant,
    dominantSourceShare: sources.dominantShare,
    sourceCounts: sources.counts,
    selectedLimit: sample.constructionV2?.vocabularyPortfolio?.selectedLimit || null,
  };
}

function summarize(setName, seedSet, records, environment) {
  const successful = records.filter((record) => record.status === "ok");
  const failed = records.filter((record) => record.status !== "ok");
  const invalid = successful.filter((record) => !record.valid);
  const disconnected = successful.filter((record) => record.components !== 1);
  const fallback = successful.filter((record) => !record.exactCluesOnly);
  const checkpointFailures = successful.filter((record) => !record.coverageCheckpointPassed);
  const zeroPanelSeeds = successful.filter((record) => record.zeroPanel).length;

  return {
    schemaVersion: 1,
    type: "aggregate",
    baselineId: "v8-production-1.1-browser-equivalent",
    set: setName,
    seedSet: seedSet.name,
    role: seedSet.role,
    runsRequested: seedSet.seeds.length,
    runsCompleted: successful.length,
    environmentDigest: environment.environmentDigest,
    validity: {
      validSeeds: successful.filter((record) => record.valid && record.components === 1 && record.exactCluesOnly).length,
      invalidSeeds: invalid.length,
      disconnectedSeeds: disconnected.length,
      fallbackClueSeeds: fallback.length,
      coverageCheckpointFailureSeeds: checkpointFailures.length,
      failedSeeds: failed.length,
      validRate: seedSet.seeds.length
        ? round(successful.filter((record) => record.valid && record.components === 1 && record.exactCluesOnly).length / seedSet.seeds.length, 4)
        : 0,
      failures: failed,
    },
    runtimeMs: numericSummary(successful.map((record) => record.elapsedMs)),
    panels: {
      ...numericSummary(successful.map((record) => record.panels)),
      distribution: distribution(successful.map((record) => record.panels)),
      zeroPanelSeeds,
      zeroPanelRate: successful.length ? round(zeroPanelSeeds / successful.length, 4) : 0,
    },
    answers: numericSummary(successful.map((record) => record.answers)),
    crossings: numericSummary(successful.map((record) => record.crossings)),
    coverage: {
      activePercent: numericSummary(successful.map((record) => record.activePercent)),
      answerPercent: numericSummary(successful.map((record) => record.answerPercent)),
      rawLetterPercent: numericSummary(successful.map((record) => record.rawLetterPercent)),
    },
    editorial: {
      twoLetterCount: numericSummary(successful.map((record) => record.twoLetterCount)),
      formulaicShortCount: numericSummary(successful.map((record) => record.formulaicShortCount)),
      editorialPenalty: numericSummary(successful.map((record) => record.editorialPenalty)),
      selectedGridClueDebt: numericSummary(successful.map((record) => record.selectedGridClueDebt)),
      genericClueCount: numericSummary(successful.map((record) => record.genericClueCount)),
      repeatedClueCount: numericSummary(successful.map((record) => record.repeatedClueCount)),
      repeatedGenericClueCount: numericSummary(successful.map((record) => record.repeatedGenericClueCount)),
      overRevealingGeneratedClueCount: numericSummary(successful.map((record) => record.overRevealingGeneratedClueCount)),
    },
    concentration: {
      properNameCount: numericSummary(successful.map((record) => record.properNameCount)),
      properNameShare: numericSummary(successful.map((record) => record.properNameShare)),
      distinctCategories: numericSummary(successful.map((record) => record.distinctCategories)),
      dominantCategoryShare: numericSummary(successful.map((record) => record.dominantCategoryShare)),
      distinctSources: numericSummary(successful.map((record) => record.distinctSources)),
      dominantSourceShare: numericSummary(successful.map((record) => record.dominantSourceShare)),
    },
  };
}

function exactCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function buildEnvironment(setName, config, configPath, corpusManifestPath, seedSetPath, concurrency) {
  const payload = {
    schemaVersion: 1,
    baselineId: config.baselineId,
    set: setName,
    exactCommit: exactCommit(),
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    osRelease: os.release(),
    cpuCount: os.cpus().length,
    runnerName: process.env.RUNNER_NAME || null,
    concurrency,
    configPath: path.relative(root, configPath),
    configDigest: `sha256:${sha256File(configPath)}`,
    seedSetPath: path.relative(root, seedSetPath),
    seedSetDigest: `sha256:${sha256File(seedSetPath)}`,
    corpusManifestPath: path.relative(root, corpusManifestPath),
    corpusManifestDigest: `sha256:${sha256File(corpusManifestPath)}`,
    corpus: config.corpus,
    grid: config.grid,
    bootstrap: config.bootstrap,
    environment: config.environment,
    percentileMethod: "nearest-rank",
    selectedGridClueDebtDefinition: "genericClueCount + repeatedClueCount + overRevealingGeneratedClueCount",
  };
  payload.environmentDigest = `sha256:${crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
  return payload;
}

async function runCheckpoint() {
  const setName = String(process.argv[2] || "development").toLowerCase();
  if (!seedFiles[setName]) throw new Error(`Unknown seed set: ${setName}`);
  const outputDir = path.resolve(process.argv[3] || path.join(root, "research-output", "v8-baseline", setName));
  const configPath = path.join(root, "research", "baselines", "v8-production-1.1", "config.json");
  const seedSetPath = path.join(root, "research", "baselines", "seed-sets", seedFiles[setName]);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const seedSet = JSON.parse(fs.readFileSync(seedSetPath, "utf8"));
  const corpusManifestPath = path.join(root, config.corpus.manifest);
  const corpusManifest = JSON.parse(fs.readFileSync(corpusManifestPath, "utf8"));
  const concurrency = Math.max(1, Number(process.env.SCANWORD_BASELINE_CONCURRENCY || 4));
  const enforce = String(process.env.SCANWORD_BASELINE_ENFORCE || "0") === "1";
  const timeoutMs = Math.max(60_000, Number(process.env.SCANWORD_BASELINE_SEED_TIMEOUT_MS || 900_000));
  const workerPath = path.join(root, config.bootstrap.worker);
  const productionBootstrap = path.join(root, config.bootstrap.production);
  const telemetryBootstrap = path.join(root, config.bootstrap.telemetry);
  const nodeOptions = [
    process.env.NODE_OPTIONS || "",
    `--require=${productionBootstrap}`,
    `--require=${telemetryBootstrap}`,
  ].filter(Boolean).join(" ");
  const records = new Array(seedSet.seeds.length);
  let cursor = 0;

  if (corpusManifest.version !== config.corpus.expectedVersion
      || corpusManifest.actual?.total?.entries !== config.corpus.expectedEntries) {
    throw new Error(`Corpus manifest mismatch: version=${corpusManifest.version}, entries=${corpusManifest.actual?.total?.entries}`);
  }
  if (new Set(seedSet.seeds).size !== seedSet.seeds.length) throw new Error("Seed set contains duplicates");

  const runSeed = (index) => new Promise((resolve) => {
    const seed = seedSet.seeds[index];
    const started = Date.now();
    const child = spawn(process.execPath, [workerPath, seed], {
      cwd: root,
      env: {
        ...process.env,
        ...config.environment,
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
      records[index] = {
        type: "seed",
        set: setName,
        index,
        seed,
        status: "failed",
        elapsedMs: Date.now() - started,
        error: error.message,
      };
      resolve();
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (records[index]) return;
      try {
        if (code !== 0) throw new Error(`worker exited ${code}${signal ? ` (${signal})` : ""}: ${stderr || stdout}`);
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        const sample = JSON.parse(line);
        const record = compactSample(sample, setName, index, seed);
        if (record.sourceCorpusEntries !== config.corpus.expectedEntries) {
          throw new Error(`source corpus mismatch: ${record.sourceCorpusEntries}`);
        }
        records[index] = record;
      } catch (error) {
        records[index] = {
          type: "seed",
          set: setName,
          index,
          seed,
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
      const index = cursor++;
      if (index >= seedSet.seeds.length) return;
      await runSeed(index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, seedSet.seeds.length) }, () => workerLoop()));

  fs.mkdirSync(outputDir, { recursive: true });
  const environment = buildEnvironment(setName, config, configPath, corpusManifestPath, seedSetPath, concurrency);
  const aggregate = summarize(setName, seedSet, records, environment);
  const perSeedPath = path.join(outputDir, "per-seed.jsonl");
  const aggregatePath = path.join(outputDir, "aggregate.json");
  const environmentPath = path.join(outputDir, "environment.json");
  fs.writeFileSync(perSeedPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`);
  fs.writeFileSync(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);
  const runManifest = {
    schemaVersion: 1,
    baselineId: config.baselineId,
    set: setName,
    command: `node tools/v8-baseline-checkpoint.cjs ${setName} ${path.relative(root, outputDir)}`,
    files: {
      perSeed: { path: "per-seed.jsonl", digest: `sha256:${sha256File(perSeedPath)}` },
      aggregate: { path: "aggregate.json", digest: `sha256:${sha256File(aggregatePath)}` },
      environment: { path: "environment.json", digest: `sha256:${sha256File(environmentPath)}` },
    },
  };
  fs.writeFileSync(path.join(outputDir, "run-manifest.json"), `${JSON.stringify(runManifest, null, 2)}\n`);

  for (const record of records) console.log(JSON.stringify(record));
  console.log(JSON.stringify(aggregate));

  const gateFailures = [
    aggregate.runsCompleted !== seedSet.seeds.length && "not all seeds completed",
    aggregate.validity.invalidSeeds > 0 && "invalid grids",
    aggregate.validity.disconnectedSeeds > 0 && "disconnected grids",
    aggregate.validity.fallbackClueSeeds > 0 && "fallback clues",
    aggregate.validity.coverageCheckpointFailureSeeds > 0 && "coverage checkpoint failures",
    aggregate.validity.failedSeeds > 0 && "worker failures",
  ].filter(Boolean);
  if (enforce && gateFailures.length) {
    throw new Error(`Baseline gate failed: ${gateFailures.join(", ")}`);
  }
}

if (require.main === module) {
  runCheckpoint().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  compactSample,
  concentration,
  median,
  nearestRank,
  numericSummary,
  summarize,
};
