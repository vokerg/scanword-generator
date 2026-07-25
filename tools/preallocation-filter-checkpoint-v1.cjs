"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const seedFile = path.resolve(process.argv[2] || path.join(root, "research/baselines/seed-sets/development-20.json"));
const outputFile = path.resolve(process.argv[3] || path.join(root, "research-output/preallocation-structural-frontier/filter-development-20.jsonl"));
const baselineConfigFile = path.join(root, "research/baselines/v8-production-1.1/config.json");
const seedPayload = JSON.parse(fs.readFileSync(seedFile, "utf8"));
const baselineConfig = JSON.parse(fs.readFileSync(baselineConfigFile, "utf8"));
const canonicalEnvironment = baselineConfig.environment || {};
const allSeeds = Array.isArray(seedPayload) ? seedPayload : seedPayload.seeds;
if (!Array.isArray(allSeeds) || !allSeeds.length) throw new Error(`No seeds found in ${seedFile}`);
const seedLimit = Math.max(1, Math.min(allSeeds.length, Math.floor(Number(
  process.env.SCANWORD_PREALLOCATION_SEED_LIMIT || allSeeds.length,
))));
const seeds = allSeeds.slice(0, seedLimit);

const concurrency = Math.max(1, Math.floor(Number(process.env.SCANWORD_PREALLOCATION_CONCURRENCY || 4)));
const timeoutMs = Math.max(60_000, Math.floor(Number(process.env.SCANWORD_PREALLOCATION_SEED_TIMEOUT_MS || 1_200_000)));
const runtimeCap = Math.max(0.1, Number(process.env.SCANWORD_PREALLOCATION_FILTER_RUNTIME_RATIO || 1.15));
const width = Math.max(1, Math.floor(Number(process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH || 96)));
const minimumCallReduction = Math.max(0, Number(process.env.SCANWORD_PREALLOCATION_MIN_CALL_REDUCTION || 0.25));
const expectedFilterRuns = [...new Set(String(
  canonicalEnvironment.SCANWORD_VOCABULARY_PORTFOLIO_LIMITS || "2500,3500",
).split(",").map(Number).filter((value) => Number.isFinite(value) && value > 0))].length;
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
        SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH: String(width),
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
    exactAllocationCalls: Number(summary.exactAllocationCalls || 0),
    exactAllocationElapsedMs: Number(summary.exactAllocationElapsedMs || 0),
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

function exactDifferences(baseline, filtered) {
  const fields = [
    "valid", "components", "exactCluesOnly", "panels", "answers", "crossings",
    "rawLetterCoverage", "formulaicShortCount", "editorialPenalty", "clueDebt", "score",
    "gridDigest", "placedDigest", "clueDigest", "geometryDigest",
  ];
  return fields
    .filter((field) => baseline[field] !== filtered[field])
    .map((field) => ({ field, baseline: baseline[field], filtered: filtered[field] }));
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
      const filtered = await runSeed(seed, "filter");
      const telemetry = filtered.preallocationFilter;
      const portfolio = filtered.preallocationFilterPortfolio;
      const differences = exactDifferences(baseline, filtered);
      const outputValid = Boolean(filtered.valid && filtered.components === 1 && filtered.exactCluesOnly);
      const exactParity = outputValid && differences.length === 0;
      const baselineAllocationCalls = Number(baseline.exactAllocationCalls || 0);
      const filteredAllocationCalls = Number(filtered.exactAllocationCalls || 0);
      const actualCallsSaved = Math.max(0, baselineAllocationCalls - filteredAllocationCalls);
      const actualCallReduction = baselineAllocationCalls
        ? +(actualCallsSaved / baselineAllocationCalls).toFixed(4)
        : null;
      const unrestrictedBoundaryCalls = Number(portfolio?.unrestrictedAllocationUpperBound || 0);
      const filteredBoundaryCalls = Number(portfolio?.exactAllocationCalls || 0);
      const baselineOutsideBoundaryCalls = baselineAllocationCalls - unrestrictedBoundaryCalls;
      const filteredOutsideBoundaryCalls = filteredAllocationCalls - filteredBoundaryCalls;
      const outsideBoundaryParity = baselineOutsideBoundaryCalls >= 0
        && filteredOutsideBoundaryCalls >= 0
        && baselineOutsideBoundaryCalls === filteredOutsideBoundaryCalls;
      const runTelemetryValid = Array.isArray(portfolio?.runs)
        && portfolio.runs.length === expectedFilterRuns
        && portfolio.runs.every((entry) => entry
          && entry.mode === "filter"
          && entry.authoritative === true
          && entry.width === width
          && entry.fallbackUsed === false);
      const telemetryValid = Boolean(
        telemetry
        && telemetry.mode === "filter"
        && telemetry.authoritative === true
        && telemetry.width === width
        && telemetry.fallbackUsed === false
        && portfolio
        && portfolio.runCount === expectedFilterRuns
        && portfolio.fallbackRuns === 0
        && runTelemetryValid
        && unrestrictedBoundaryCalls > 0
        && filteredBoundaryCalls > 0
        && filteredBoundaryCalls <= unrestrictedBoundaryCalls
        && outsideBoundaryParity
        && baselineAllocationCalls > 0
        && filteredAllocationCalls > 0
        && filteredAllocationCalls <= baselineAllocationCalls
        && actualCallReduction >= minimumCallReduction
      );
      results[index] = {
        schemaVersion: 2,
        seed,
        status: exactParity && telemetryValid ? "ok" : "failed",
        baseline: compact(baseline),
        filtered: compact(filtered),
        runtimeRatio: baseline.elapsedMs ? +(filtered.elapsedMs / baseline.elapsedMs).toFixed(4) : null,
        baselineAllocationCalls,
        filteredAllocationCalls,
        actualCallsSaved,
        actualCallReduction,
        unrestrictedBoundaryCalls,
        filteredBoundaryCalls,
        baselineOutsideBoundaryCalls,
        filteredOutsideBoundaryCalls,
        outsideBoundaryParity,
        differences,
        outputValid,
        exactParity,
        telemetryValid,
        selectedTelemetry: telemetry || null,
        filterPortfolio: portfolio || null,
      };
    } catch (error) {
      results[index] = {
        schemaVersion: 2,
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
  const executed = results.filter((record) => record?.baseline && record?.filtered);
  const parity = executed.filter((record) => record.exactParity);
  const baselineMs = executed.reduce((sum, record) => sum + record.baseline.elapsedMs, 0);
  const filteredMs = executed.reduce((sum, record) => sum + record.filtered.elapsedMs, 0);
  const runtimeRatio = baselineMs ? filteredMs / baselineMs : Infinity;
  const baselineAllocationCalls = executed.reduce((sum, record) => sum + record.baselineAllocationCalls, 0);
  const filteredAllocationCalls = executed.reduce((sum, record) => sum + record.filteredAllocationCalls, 0);
  const callsSaved = Math.max(0, baselineAllocationCalls - filteredAllocationCalls);
  const callReduction = baselineAllocationCalls ? callsSaved / baselineAllocationCalls : 0;
  const fallbackRuns = executed.reduce((sum, record) => sum + Number(record.filterPortfolio?.fallbackRuns || 0), 0);
  const fallbackSeeds = executed.filter((record) => Number(record.filterPortfolio?.fallbackRuns || 0) > 0).length;
  const unrestrictedBoundaryCalls = executed.reduce((sum, record) => sum + record.unrestrictedBoundaryCalls, 0);
  const filteredBoundaryCalls = executed.reduce((sum, record) => sum + record.filteredBoundaryCalls, 0);
  const boundaryCallsSaved = Math.max(0, unrestrictedBoundaryCalls - filteredBoundaryCalls);
  const boundaryCallReduction = unrestrictedBoundaryCalls ? boundaryCallsSaved / unrestrictedBoundaryCalls : 0;
  const outsideBoundaryCalls = executed.reduce((sum, record) => sum + record.baselineOutsideBoundaryCalls, 0);
  const passed = failures.length === 0
    && runtimeRatio <= runtimeCap
    && callReduction >= minimumCallReduction
    && fallbackRuns === 0;
  const summary = {
    type: "summary",
    schemaVersion: 2,
    phase: "preallocation-filter-v1",
    baselineId: baselineConfig.baselineId,
    seedSet: seedPayload.name || path.basename(seedFile),
    availableSeeds: allSeeds.length,
    seeds: results.length,
    seedLimit,
    width,
    expectedFilterRunsPerSeed: expectedFilterRuns,
    passedSeeds: results.length - failures.length,
    failures: failures.length,
    executedSeeds: executed.length,
    exactParitySeeds: parity.length,
    exactParityRate: results.length ? +(parity.length / results.length).toFixed(4) : 0,
    fallbackSeeds,
    fallbackRuns,
    baselineExactAllocationCalls: baselineAllocationCalls,
    filteredExactAllocationCalls: filteredAllocationCalls,
    callsSaved,
    callReduction: +callReduction.toFixed(4),
    minimumCallReduction,
    unrestrictedBoundaryCalls,
    filteredBoundaryCalls,
    boundaryCallsSaved,
    boundaryCallReduction: +boundaryCallReduction.toFixed(4),
    unchangedOutsideBoundaryCalls: outsideBoundaryCalls,
    baselineElapsedMs: baselineMs,
    filteredElapsedMs: filteredMs,
    runtimeRatio: +runtimeRatio.toFixed(4),
    runtimeCap,
    passed,
  };
  fs.appendFileSync(outputFile, `${JSON.stringify(summary)}\n`);
  console.log(JSON.stringify(summary));
  if (!passed) process.exitCode = 1;
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
