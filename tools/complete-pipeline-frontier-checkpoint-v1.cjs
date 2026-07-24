"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const seedFile = path.resolve(process.argv[2] || path.join(root, "research/baselines/seed-sets/development-20.json"));
const outputFile = path.resolve(process.argv[3] || path.join(root, "research-output/complete-pipeline-frontier/development-20.jsonl"));
const baselineConfigFile = path.join(root, "research/baselines/v8-production-1.1/config.json");
const seedPayload = JSON.parse(fs.readFileSync(seedFile, "utf8"));
const baselineConfig = JSON.parse(fs.readFileSync(baselineConfigFile, "utf8"));
const canonicalEnvironment = baselineConfig.environment || {};
const seeds = Array.isArray(seedPayload) ? seedPayload : seedPayload.seeds;
if (!Array.isArray(seeds) || !seeds.length) throw new Error(`No seeds found in ${seedFile}`);
if (String(canonicalEnvironment.SCANWORD_CONSTRUCTION_MODE || "") !== "portfolio") {
  throw new Error(`Baseline config must select SCANWORD_CONSTRUCTION_MODE=portfolio: ${baselineConfigFile}`);
}

const concurrency = Math.max(1, Math.floor(Number(process.env.SCANWORD_FRONTIER_CONCURRENCY || 4)));
const timeoutMs = Math.max(60_000, Math.floor(Number(process.env.SCANWORD_FRONTIER_SEED_TIMEOUT_MS || 1_200_000)));
const runtimeCap = Math.max(1, Number(process.env.SCANWORD_FRONTIER_RUNTIME_RATIO || 2.5));
const width = Math.max(1, Math.floor(Number(process.env.SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH || 4)));
const requireWin = String(process.env.SCANWORD_FRONTIER_REQUIRE_WIN || "0") === "1";
const seedRunner = path.join(root, "tools/construction-pipeline-seed-v1.cjs");
const bootstrap = path.join(root, "tools/node-benchmark-bootstrap-v1.cjs");

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, "");

function runSeed(seed, frontierMode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [seedRunner, seed], {
      cwd: root,
      env: {
        ...process.env,
        ...canonicalEnvironment,
        NODE_OPTIONS: `--require=${bootstrap}`,
        SCANWORD_COMPLETE_PIPELINE_FRONTIER: frontierMode,
        SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH: String(width),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${seed}/${frontierMode} exceeded ${timeoutMs} ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${seed}/${frontierMode} failed (${code ?? signal}): ${stderr || stdout}`));
        return;
      }
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      try {
        resolve(JSON.parse(lines.at(-1)));
      } catch (error) {
        reject(new Error(`${seed}/${frontierMode} did not emit JSON: ${stdout}\n${stderr}\n${error}`));
      }
    });
  });
}

function canonicalCompare(first, second) {
  if (first.valid !== second.valid) return first.valid ? -1 : 1;
  if ((first.components === 1) !== (second.components === 1)) return first.components === 1 ? -1 : 1;
  if (first.exactCluesOnly !== second.exactCluesOnly) return first.exactCluesOnly ? -1 : 1;
  return first.panels - second.panels
    || second.answers - first.answers
    || second.crossings - first.crossings
    || second.rawLetterCoverage - first.rawLetterCoverage
    || first.formulaicShortCount - second.formulaicShortCount
    || first.editorialPenalty - second.editorialPenalty
    || first.clueDebt - second.clueDebt
    || second.score - first.score;
}

function compact(summary) {
  return {
    elapsedMs: summary.elapsedMs,
    valid: summary.valid,
    components: summary.components,
    exactCluesOnly: summary.exactCluesOnly,
    panels: summary.panels,
    answers: summary.answers,
    crossings: summary.crossings,
    rawLetterCoverage: summary.rawLetterCoverage,
    formulaicShortCount: summary.formulaicShortCount,
    editorialPenalty: summary.editorialPenalty,
    clueDebt: summary.clueDebt,
    score: summary.score,
    gridDigest: summary.gridDigest,
    placedDigest: summary.placedDigest,
    clueDigest: summary.clueDigest,
    geometryDigest: summary.geometryDigest,
  };
}

const results = new Array(seeds.length);
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= seeds.length) return;
    const seed = seeds[index];
    const baseline = await runSeed(seed, "off");
    const frontier = await runSeed(seed, "on");
    const comparison = canonicalCompare(frontier, baseline);
    const telemetry = frontier.completePipelineFrontier;
    const record = {
      schemaVersion: 2,
      seed,
      comparison,
      outcome: comparison < 0 ? "win" : comparison > 0 ? "regression" : "tie",
      baseline: compact(baseline),
      frontier: compact(frontier),
      outputChanged: frontier.gridDigest !== baseline.gridDigest,
      selectionChanged: Boolean(telemetry?.selectionChanged),
      selectedFrontierIndex: telemetry?.selectedFrontierIndex ?? null,
      frontierWidth: telemetry?.width ?? 0,
      retainedConstructionCandidates: telemetry?.constructionFrontier?.retained ?? 0,
      consideredConstructionCandidates: telemetry?.constructionFrontier?.considered ?? 0,
      frontierTelemetry: telemetry || null,
    };
    results[index] = record;
    const line = JSON.stringify({ type: "seed", ...record });
    fs.appendFileSync(outputFile, `${line}\n`);
    process.stdout.write(`${line}\n`);
  }
}

(async () => {
  await Promise.all(Array.from({ length: Math.min(concurrency, seeds.length) }, () => worker()));
  const invalid = results.filter((record) => !record.frontier.valid
    || record.frontier.components !== 1
    || !record.frontier.exactCluesOnly);
  const missingTelemetry = results.filter((record) => !record.frontierTelemetry
    || record.retainedConstructionCandidates < 1
    || record.consideredConstructionCandidates < 1);
  const regressions = results.filter((record) => record.comparison > 0);
  const wins = results.filter((record) => record.comparison < 0);
  const changes = results.filter((record) => record.outputChanged);
  const selectionChanges = results.filter((record) => record.selectionChanged);
  const baselineMs = results.reduce((sum, record) => sum + record.baseline.elapsedMs, 0);
  const frontierMs = results.reduce((sum, record) => sum + record.frontier.elapsedMs, 0);
  const runtimeRatio = frontierMs / Math.max(1, baselineMs);
  const passed = invalid.length === 0
    && missingTelemetry.length === 0
    && regressions.length === 0
    && runtimeRatio <= runtimeCap
    && (!requireWin || wins.length > 0);
  const summary = {
    type: "summary",
    schemaVersion: 2,
    baselineId: baselineConfig.baselineId,
    seedSet: seedPayload.name || path.basename(seedFile),
    seeds: results.length,
    width,
    invalid: invalid.length,
    missingTelemetry: missingTelemetry.length,
    regressions: regressions.length,
    wins: wins.length,
    ties: results.length - regressions.length - wins.length,
    outputChanges: changes.length,
    selectionChanges: selectionChanges.length,
    baselineElapsedMs: baselineMs,
    frontierElapsedMs: frontierMs,
    runtimeRatio: +runtimeRatio.toFixed(4),
    runtimeCap,
    requireWin,
    passed,
  };
  fs.appendFileSync(outputFile, `${JSON.stringify(summary)}\n`);
  console.log(JSON.stringify(summary));
  if (!passed) process.exitCode = 1;
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
