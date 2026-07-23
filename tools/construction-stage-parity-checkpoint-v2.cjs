"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const seedSet = JSON.parse(fs.readFileSync(path.join(root, "research/baselines/seed-sets/development-20.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(root, "research/baselines/v8-production-1.1/config.json"), "utf8"));
const requested = Math.max(1, Math.min(seedSet.seeds.length, Number(process.argv[2] || 20)));
const outputPath = path.resolve(process.argv[3] || path.join(root, "research-output/explicit-stage-migration/development-parity.jsonl"));
const concurrency = Math.max(1, Number(process.env.SCANWORD_STAGE_PARITY_CONCURRENCY || 2));
const timeoutMs = Math.max(60_000, Number(process.env.SCANWORD_STAGE_PARITY_TIMEOUT_MS || 1_200_000));
const runtimeLimit = Number(process.env.SCANWORD_STAGE_PARITY_RUNTIME_RATIO || 1.10);
const worker = path.join(root, "tools/bounded-partial-search-seed-v1.cjs");
const bootstrap = path.join(root, "tools/node-benchmark-bootstrap-v1.cjs");
const seeds = seedSet.seeds.slice(0, requested);

function run(seed, source) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, seed], {
      cwd: root,
      env: {
        ...process.env,
        ...config.environment,
        SCANWORD_PARTIAL_SEARCH: "off",
        SCANWORD_SINGLE_CANDIDATE_SOURCE: source,
        NODE_OPTIONS: `--require=${bootstrap}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${seed} ${source} exited ${code}${signal ? ` (${signal})` : ""}: ${stderr || stdout}`));
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        resolve(JSON.parse(line));
      } catch (error) {
        reject(new Error(`${seed} ${source} returned invalid JSON: ${error.message}`));
      }
    });
  });
}

function compare(seed, legacy, explicit) {
  const fields = [
    "resultDigest", "valid", "components", "exactCluesOnly", "coverageCheckpointPassed",
    "panels", "answers", "crossings", "clueTextCells", "externalClues",
    "twoLetterCount", "formulaicShortCount", "editorialPenalty", "selectedLimit",
  ];
  const differences = fields
    .filter((field) => legacy[field] !== explicit[field])
    .map((field) => ({ field, legacy: legacy[field], explicit: explicit[field] }));
  const stages = explicit.partialSearch?.portfolio?.candidates || null;
  return {
    type: "seed",
    seed,
    status: differences.length ? "mismatch" : "ok",
    runtimeRatio: legacy.elapsedMs ? explicit.elapsedMs / legacy.elapsedMs : null,
    legacy,
    explicit,
    explicitStageRuntimePresent: Boolean(explicit.explicitStageRuntime || stages),
    differences,
  };
}

async function main() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const records = new Array(seeds.length);
  let cursor = 0;
  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= seeds.length) return;
      const seed = seeds[index];
      try {
        const legacy = await run(seed, "legacy-wrappers");
        const explicit = await run(seed, "explicit-stages");
        records[index] = compare(seed, legacy, explicit);
      } catch (error) {
        records[index] = { type: "seed", seed, status: "error", error: String(error?.stack || error) };
      }
      process.stdout.write(`${JSON.stringify(records[index])}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, seeds.length) }, consume));
  const passed = records.filter((record) => record.status === "ok");
  const mismatches = records.filter((record) => record.status !== "ok");
  const legacyRuntimeMs = passed.reduce((sum, record) => sum + record.legacy.elapsedMs, 0);
  const explicitRuntimeMs = passed.reduce((sum, record) => sum + record.explicit.elapsedMs, 0);
  const runtimeRatio = legacyRuntimeMs ? explicitRuntimeMs / legacyRuntimeMs : Infinity;
  const aggregate = {
    type: "aggregate",
    schemaVersion: 2,
    phase: "phase-8-explicit-stage-migration",
    sourceSha: process.env.GITHUB_SHA || null,
    requested: seeds.length,
    passed: passed.length,
    mismatches: mismatches.length,
    exactParityRate: seeds.length ? passed.length / seeds.length : 0,
    legacyRuntimeMs,
    explicitRuntimeMs,
    runtimeRatio,
    maximumRuntimeRatio: runtimeLimit,
    runtimeGatePassed: runtimeRatio <= runtimeLimit,
  };
  process.stdout.write(`${JSON.stringify(aggregate)}\n`);
  fs.writeFileSync(outputPath, `${records.map(JSON.stringify).join("\n")}\n${JSON.stringify(aggregate)}\n`);
  if (mismatches.length || runtimeRatio > runtimeLimit) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
