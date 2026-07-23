"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "research/baselines/v8-production-1.1/config.json"), "utf8"));
const seedSet = JSON.parse(fs.readFileSync(path.join(root, "research/baselines/seed-sets/development-20.json"), "utf8"));
const requested = Math.max(1, Math.min(seedSet.seeds.length, Number(process.argv[2] || seedSet.seeds.length)));
const outputPath = path.resolve(process.argv[3] || path.join(root, "research-output/explicit-pipeline/development-parity.jsonl"));
const concurrency = Math.max(1, Number(process.env.SCANWORD_PIPELINE_CONCURRENCY || 2));
const timeoutMs = Math.max(60_000, Number(process.env.SCANWORD_PIPELINE_SEED_TIMEOUT_MS || 900_000));
const runtimeLimit = Number(process.env.SCANWORD_PIPELINE_RUNTIME_RATIO || 1.15);
const worker = path.join(root, "tools/construction-pipeline-seed-v1.cjs");
const bootstrap = path.join(root, config.bootstrap.production);
const seeds = seedSet.seeds.slice(0, requested);
const expectedStages = [
  "production-stage-source",
  "base-construction",
  "clue-allocation",
  "current-repair-chain",
  "validation",
  "comparison",
];

function runWorker(seed, mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, seed], {
      cwd: root,
      env: {
        ...process.env,
        ...config.environment,
        SCANWORD_EXPLICIT_PIPELINE: mode,
        NODE_OPTIONS: `--require=${bootstrap}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${seed} ${mode} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${seed} ${mode} exited ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      try {
        resolve(JSON.parse(line));
      } catch (error) {
        reject(new Error(`${seed} ${mode} returned invalid JSON: ${error.message}\n${stdout}`));
      }
    });
  });
}

function comparePair(seed, legacy, explicit) {
  const fields = [
    "valid", "components", "panels", "answers", "crossings", "exactCluesOnly",
    "gridDigest", "placedDigest", "clueDigest", "geometryDigest",
  ];
  const differences = fields
    .filter((field) => legacy[field] !== explicit[field])
    .map((field) => ({ field, legacy: legacy[field], explicit: explicit[field] }));
  const stageNames = explicit.pipeline?.stages?.map((stage) => stage.name) || [];
  if (JSON.stringify(stageNames) !== JSON.stringify(expectedStages)) {
    differences.push({ field: "pipelineStages", legacy: null, explicit: stageNames });
  }
  if (explicit.pipeline?.stages?.some((stage) => stage.status !== "ok")) {
    differences.push({ field: "pipelineStageStatus", legacy: null, explicit: explicit.pipeline.stages });
  }
  if (explicit.pipeline?.executionOwner !== "direct-production-stage-runtime-v2") {
    differences.push({
      field: "pipelineExecutionOwner",
      legacy: null,
      explicit: explicit.pipeline?.executionOwner || null,
    });
  }
  return {
    type: "seed",
    seed,
    status: differences.length ? "mismatch" : "ok",
    legacy,
    explicit,
    runtimeRatio: legacy.elapsedMs ? +(explicit.elapsedMs / legacy.elapsedMs).toFixed(4) : null,
    differences,
  };
}

async function runPair(seed) {
  const legacy = await runWorker(seed, "off");
  const explicit = await runWorker(seed, "on");
  return comparePair(seed, legacy, explicit);
}

async function main() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const records = new Array(seeds.length);
  let cursor = 0;
  async function consume() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= seeds.length) return;
      try {
        records[index] = await runPair(seeds[index]);
      } catch (error) {
        records[index] = {
          type: "seed",
          seed: seeds[index],
          status: "error",
          error: String(error?.stack || error),
        };
      }
      process.stdout.write(`${JSON.stringify(records[index])}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, seeds.length) }, consume));

  const completed = records.filter((record) => record?.status === "ok");
  const mismatches = records.filter((record) => record?.status !== "ok");
  const legacyRuntime = completed.reduce((sum, record) => sum + record.legacy.elapsedMs, 0);
  const explicitRuntime = completed.reduce((sum, record) => sum + record.explicit.elapsedMs, 0);
  const runtimeRatio = legacyRuntime ? explicitRuntime / legacyRuntime : Infinity;
  const aggregate = {
    type: "aggregate",
    schemaVersion: 2,
    phase: "direct-stage-runtime-parity-v2",
    seedSet: seedSet.name,
    requested: seeds.length,
    passed: completed.length,
    mismatches: mismatches.length,
    exactParityRate: seeds.length ? +(completed.length / seeds.length).toFixed(4) : 0,
    legacyRuntimeMs: legacyRuntime,
    explicitRuntimeMs: explicitRuntime,
    runtimeRatio: +runtimeRatio.toFixed(4),
    maximumRuntimeRatio: runtimeLimit,
    runtimeGatePassed: runtimeRatio <= runtimeLimit,
    executionOwner: "direct-production-stage-runtime-v2",
    stageContract: expectedStages,
  };
  process.stdout.write(`${JSON.stringify(aggregate)}\n`);
  fs.writeFileSync(outputPath, `${records.map(JSON.stringify).join("\n")}\n${JSON.stringify(aggregate)}\n`);

  if (mismatches.length || runtimeRatio > runtimeLimit) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
