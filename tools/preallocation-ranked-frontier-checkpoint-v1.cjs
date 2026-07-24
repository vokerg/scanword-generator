"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const seedFile = path.resolve(process.argv[2] || path.join(root, "research/baselines/seed-sets/development-20.json"));
const outputFile = path.resolve(process.argv[3] || path.join(root, "research-output/preallocation-structural-frontier/ranked-development-20.jsonl"));
const baselineConfigFile = path.join(root, "research/baselines/v8-production-1.1/config.json");
const seedPayload = JSON.parse(fs.readFileSync(seedFile, "utf8"));
const baselineConfig = JSON.parse(fs.readFileSync(baselineConfigFile, "utf8"));
const canonicalEnvironment = baselineConfig.environment || {};
const seeds = Array.isArray(seedPayload) ? seedPayload : seedPayload.seeds;
if (!Array.isArray(seeds) || !seeds.length) throw new Error(`No seeds found in ${seedFile}`);

const concurrency = Math.max(1, Math.floor(Number(process.env.SCANWORD_PREALLOCATION_CONCURRENCY || 4)));
const timeoutMs = Math.max(60_000, Math.floor(Number(process.env.SCANWORD_PREALLOCATION_SEED_TIMEOUT_MS || 1_200_000)));
const runtimeCap = Math.max(1, Number(process.env.SCANWORD_PREALLOCATION_RUNTIME_RATIO || 1.12));
const structuralWidth = Math.max(1, Math.floor(Number(process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH || 16)));
const requireCurrentRecall = String(process.env.SCANWORD_PREALLOCATION_REQUIRE_PHASE10_RECALL || "0") === "1";
const seedRunner = path.join(root, "tools/construction-pipeline-seed-v1.cjs");
const bootstrap = path.join(root, "tools/node-benchmark-bootstrap-v1.cjs");

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, "");

function runSeed(seed, preallocationMode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [seedRunner, seed], {
      cwd: root,
      env: {
        ...process.env,
        ...canonicalEnvironment,
        NODE_OPTIONS: `--require=${bootstrap}`,
        SCANWORD_COMPLETE_PIPELINE_FRONTIER: "on",
        SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH: "4",
        SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER: preallocationMode,
        SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH: String(structuralWidth),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${seed}/${preallocationMode} exceeded ${timeoutMs} ms`));
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
        reject(new Error(`${seed}/${preallocationMode} failed (${code ?? signal}): ${stderr || stdout}`));
        return;
      }
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      try {
        resolve(JSON.parse(lines.at(-1)));
      } catch (error) {
        reject(new Error(`${seed}/${preallocationMode} did not emit JSON: ${stdout}\n${stderr}\n${error}`));
      }
    });
  });
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

function exactDifferences(baseline, shadow) {
  const fields = [
    "valid", "components", "exactCluesOnly", "panels", "answers", "crossings",
    "rawLetterCoverage", "formulaicShortCount", "editorialPenalty", "clueDebt", "score",
    "gridDigest", "placedDigest", "clueDigest", "geometryDigest",
  ];
  return fields
    .filter((field) => baseline[field] !== shadow[field])
    .map((field) => ({ field, baseline: baseline[field], shadow: shadow[field] }));
}

const results = new Array(seeds.length);
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= seeds.length) return;
    const seed = seeds[index];
    try {
      const baseline = await runSeed(seed, "off");
      const shadow = await runSeed(seed, "shadow");
      const selectedTelemetry = shadow.preallocationRankedFrontier;
      const telemetry = shadow.preallocationRankedFrontierPortfolio;
      const differences = exactDifferences(baseline, shadow);
      const outputValid = Boolean(shadow.valid && shadow.components === 1 && shadow.exactCluesOnly);
      const exactParity = differences.length === 0 && outputValid;
      const telemetryValid = Boolean(
        selectedTelemetry
        && selectedTelemetry.mode === "shadow"
        && selectedTelemetry.authoritative === false
        && selectedTelemetry.ordering === "phase10-repair-potential-ranked-no-dominance-v1"
        && selectedTelemetry.stageModel === "base-rank-then-victim-rank-v1"
        && telemetry
        && telemetry.mode === "shadow"
        && telemetry.authoritative === false
        && telemetry.ordering === "phase10-repair-potential-ranked-no-dominance-v1"
        && telemetry.stageModel === "base-rank-then-victim-rank-v1"
        && telemetry.runCount >= 2
        && telemetry.allocationCalls > 0
        && telemetry.retainedAllocations >= telemetry.runCount
        && Array.isArray(telemetry.sweep)
        && telemetry.sweep.length > 0
        && telemetry.sweep.some((entry) => entry.width === structuralWidth)
      );
      const recallValid = !requireCurrentRecall || telemetry?.safeToFilterObservedPhase10Frontier === true;
      results[index] = {
        schemaVersion: 1,
        seed,
        status: exactParity && telemetryValid && recallValid ? "ok" : "failed",
        baseline: compact(baseline),
        shadow: compact(shadow),
        runtimeRatio: baseline.elapsedMs ? +(shadow.elapsedMs / baseline.elapsedMs).toFixed(4) : null,
        differences,
        outputValid,
        exactParity,
        telemetryValid,
        recallValid,
        selectedTelemetry: selectedTelemetry || null,
        telemetry: telemetry || null,
      };
    } catch (error) {
      results[index] = {
        schemaVersion: 1,
        seed,
        status: "error",
        error: String(error?.stack || error),
      };
    }
    const line = JSON.stringify({ type: "seed", ...results[index] });
    fs.appendFileSync(outputFile, `${line}\n`);
    process.stdout.write(`${line}\n`);
  }
}

(async () => {
  await Promise.all(Array.from({ length: Math.min(concurrency, seeds.length) }, () => worker()));
  const failures = results.filter((record) => record?.status !== "ok");
  const executed = results.filter((record) => record?.baseline && record?.shadow);
  const exactParity = executed.filter((record) => record.exactParity);
  const telemetryRecords = executed.filter((record) => record.telemetryValid).map((record) => record.telemetry);
  const baselineMs = executed.reduce((sum, record) => sum + record.baseline.elapsedMs, 0);
  const shadowMs = executed.reduce((sum, record) => sum + record.shadow.elapsedMs, 0);
  const runtimeRatio = baselineMs ? shadowMs / baselineMs : Infinity;
  const widths = [...new Set(telemetryRecords.flatMap((telemetry) => telemetry.sweep.map((entry) => entry.width)))].sort((a, b) => a - b);
  const widthSweep = widths.map((width) => {
    const entries = telemetryRecords.map((telemetry) => telemetry.sweep.find((entry) => entry.width === width)).filter(Boolean);
    const calls = entries.reduce((sum, entry) => sum + entry.allocationCalls, 0);
    const saved = entries.reduce((sum, entry) => sum + entry.projectedCallsSaved, 0);
    const frontierCount = entries.reduce((sum, entry) => sum + entry.phase10FrontierAllocationCount, 0);
    const frontierRetained = entries.reduce((sum, entry) => sum + entry.phase10FrontierRetained, 0);
    const baseCount = entries.reduce((sum, entry) => sum + entry.phase10RequiredBaseCount, 0);
    const basesRetained = entries.reduce((sum, entry) => sum + entry.phase10RequiredBasesRetained, 0);
    return {
      width,
      seedCount: entries.length,
      allocationCalls: calls,
      retainedAllocations: entries.reduce((sum, entry) => sum + entry.retainedAllocations, 0),
      projectedCallsSaved: saved,
      projectedCallReduction: calls ? +(saved / calls).toFixed(4) : 0,
      phase10FrontierAllocationCount: frontierCount,
      phase10FrontierRetained: frontierRetained,
      phase10FrontierRecall: frontierCount ? +(frontierRetained / frontierCount).toFixed(4) : null,
      phase10RequiredBaseCount: baseCount,
      phase10RequiredBasesRetained: basesRetained,
      phase10BaseRecall: baseCount ? +(basesRetained / baseCount).toFixed(4) : null,
      fullRecallSeeds: entries.filter((entry) => entry.safeToFilterObservedPhase10Frontier).length,
      allSeedsFullRecall: entries.length === seeds.length
        && entries.every((entry) => entry.safeToFilterObservedPhase10Frontier),
    };
  });
  const safeWidths = widthSweep.filter((entry) => entry.allSeedsFullRecall);
  const smallestSafeWidth = safeWidths[0] || null;
  const passed = failures.length === 0 && runtimeRatio <= runtimeCap;
  const summary = {
    type: "summary",
    schemaVersion: 1,
    phase: "preallocation-ranked-frontier-shadow-v1",
    baselineId: baselineConfig.baselineId,
    seedSet: seedPayload.name || path.basename(seedFile),
    seeds: results.length,
    passedSeeds: results.length - failures.length,
    failures: failures.length,
    executedSeeds: executed.length,
    exactParitySeeds: exactParity.length,
    exactParityRate: results.length ? +(exactParity.length / results.length).toFixed(4) : 0,
    structuralWidth,
    requireCurrentRecall,
    baselineElapsedMs: baselineMs,
    shadowElapsedMs: shadowMs,
    runtimeRatio: +runtimeRatio.toFixed(4),
    runtimeCap,
    smallestSafeWidth,
    widthSweep,
    passed,
  };
  fs.appendFileSync(outputFile, `${JSON.stringify(summary)}\n`);
  console.log(JSON.stringify(summary));
  if (!passed) process.exitCode = 1;
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});