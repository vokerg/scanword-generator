"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "research/baselines/v8-production-1.1/config.json"), "utf8"));
const seedSetPath = path.resolve(process.argv[2] || path.join(root, "research/baselines/seed-sets/promotion-50.json"));
const seedSet = JSON.parse(fs.readFileSync(seedSetPath, "utf8"));
const outputPath = path.resolve(process.argv[3] || path.join(root, `research-output/explicit-default/${seedSet.name}.jsonl`));
const concurrency = Math.max(1, Number(process.env.SCANWORD_EXPLICIT_DEFAULT_CONCURRENCY || 4));
const timeoutMs = Math.max(60_000, Number(process.env.SCANWORD_EXPLICIT_DEFAULT_SEED_TIMEOUT_MS || 1_200_000));
const runtimeLimit = Number(process.env.SCANWORD_EXPLICIT_DEFAULT_RUNTIME_RATIO || 1.10);
const worker = path.join(root, "tools/construction-pipeline-seed-v1.cjs");
const bootstrap = path.join(root, config.bootstrap.production);
const seeds = seedSet.seeds;
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

function comparePair(seed, rollback, explicit) {
  const fields = [
    "valid", "components", "panels", "answers", "crossings", "exactCluesOnly",
    "gridDigest", "placedDigest", "clueDigest", "geometryDigest",
  ];
  const differences = fields
    .filter((field) => rollback[field] !== explicit[field])
    .map((field) => ({ field, rollback: rollback[field], explicit: explicit[field] }));
  const stageNames = explicit.pipeline?.stages?.map((stage) => stage.name) || [];
  if (JSON.stringify(stageNames) !== JSON.stringify(expectedStages)) {
    differences.push({ field: "pipelineStages", rollback: null, explicit: stageNames });
  }
  if (explicit.pipeline?.executionOwner !== "direct-production-stage-runtime-v2") {
    differences.push({ field: "executionOwner", rollback: null, explicit: explicit.pipeline?.executionOwner || null });
  }
  if (!explicit.retirementAudit?.passed || explicit.retirementAudit?.rollbackMode) {
    differences.push({ field: "explicitRetirementAudit", rollback: null, explicit: explicit.retirementAudit || null });
  }
  if (!rollback.retirementAudit?.passed || !rollback.retirementAudit?.rollbackMode) {
    differences.push({ field: "rollbackAudit", rollback: rollback.retirementAudit || null, explicit: null });
  }
  return {
    type: "seed",
    seed,
    status: differences.length ? "mismatch" : "ok",
    rollback,
    explicit,
    runtimeRatio: rollback.elapsedMs ? +(explicit.elapsedMs / rollback.elapsedMs).toFixed(4) : null,
    differences,
  };
}

async function runPair(seed) {
  const rollback = await runWorker(seed, "off");
  const explicit = await runWorker(seed, "on");
  return comparePair(seed, rollback, explicit);
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

  const passed = records.filter((record) => record?.status === "ok");
  const failures = records.filter((record) => record?.status !== "ok");
  const rollbackRuntime = passed.reduce((sum, record) => sum + record.rollback.elapsedMs, 0);
  const explicitRuntime = passed.reduce((sum, record) => sum + record.explicit.elapsedMs, 0);
  const runtimeRatio = rollbackRuntime ? explicitRuntime / rollbackRuntime : Infinity;
  const aggregate = {
    type: "aggregate",
    schemaVersion: 1,
    phase: "phase-9-explicit-default-parity",
    seedSet: seedSet.name,
    role: seedSet.role,
    requested: seeds.length,
    passed: passed.length,
    failures: failures.length,
    exactParityRate: seeds.length ? +(passed.length / seeds.length).toFixed(4) : 0,
    rollbackRuntimeMs: rollbackRuntime,
    explicitRuntimeMs: explicitRuntime,
    runtimeRatio: +runtimeRatio.toFixed(4),
    maximumRuntimeRatio: runtimeLimit,
    runtimeGatePassed: runtimeRatio <= runtimeLimit,
    activeGenerateBestOwner: "construction-pipeline-v1",
    executionOwner: "direct-production-stage-runtime-v2",
    rollbackOwner: "legacy-wrapper-chain",
    stageContract: expectedStages,
  };
  process.stdout.write(`${JSON.stringify(aggregate)}\n`);
  fs.writeFileSync(outputPath, `${records.map(JSON.stringify).join("\n")}\n${JSON.stringify(aggregate)}\n`);

  if (failures.length || runtimeRatio > runtimeLimit) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
