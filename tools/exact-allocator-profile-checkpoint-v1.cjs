"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { validate: validateSeedManifest } = require("./phase-12-seed-manifest-v1.cjs");

const root = path.resolve(__dirname, "..");
const requestedSplit = process.argv[2] || "development";
const outputFile = path.resolve(
  process.argv[3]
    || path.join(root, "research-output", "exact-allocator-acceleration", `${requestedSplit}-profile-v1.jsonl`),
);
const baselineConfigFile = path.join(root, "research", "baselines", "v8-production-1.1", "config.json");
const baselineConfig = JSON.parse(fs.readFileSync(baselineConfigFile, "utf8"));
const canonicalEnvironment = baselineConfig.environment || {};
const seedManifest = validateSeedManifest();
const allSeeds = seedManifest.splits[requestedSplit];
if (!Array.isArray(allSeeds) || !allSeeds.length) throw new Error(`Unknown or empty Phase 12 seed split: ${requestedSplit}`);

const seedLimit = Math.max(1, Math.min(allSeeds.length, Math.floor(Number(
  process.env.SCANWORD_EXACT_ALLOCATOR_PROFILE_SEED_LIMIT || allSeeds.length,
))));
const seeds = allSeeds.slice(0, seedLimit);
const concurrency = Math.max(1, Math.floor(Number(process.env.SCANWORD_EXACT_ALLOCATOR_PROFILE_CONCURRENCY || 2)));
const timeoutMs = Math.max(
  60_000,
  Math.floor(Number(process.env.SCANWORD_EXACT_ALLOCATOR_PROFILE_SEED_TIMEOUT_MS || 1_800_000)),
);
const seedRunner = path.join(root, "tools", "construction-pipeline-seed-v1.cjs");
const bootstrap = path.join(root, "tools", "node-benchmark-bootstrap-v1.cjs");

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, "");

function runSeed(seed, profileMode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [seedRunner, seed], {
      cwd: root,
      env: {
        ...process.env,
        ...canonicalEnvironment,
        NODE_OPTIONS: `--require=${bootstrap}`,
        SCANWORD_COMPLETE_PIPELINE_FRONTIER: "on",
        SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH: "4",
        SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER: "off",
        SCANWORD_EXACT_ALLOCATOR_PROFILE: profileMode,
        SCANWORD_EXACT_ALLOCATOR_PROFILE_DETAIL: "summary",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${seed}/${profileMode} exceeded ${timeoutMs} ms`));
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
        reject(new Error(`${seed}/${profileMode} failed (${code ?? signal}): ${stderr || stdout}`));
        return;
      }
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      try {
        resolve(JSON.parse(lines.at(-1)));
      } catch (error) {
        reject(new Error(`${seed}/${profileMode} did not emit JSON: ${stdout}\n${stderr}\n${error}`));
      }
    });
  });
}

function compact(summary) {
  return {
    elapsedMs: Number(summary.elapsedMs || 0),
    exactAllocationCalls: Number(summary.exactAllocationCalls || 0),
    exactAllocationElapsedMs: Number(summary.exactAllocationElapsedMs || 0),
    valid: Boolean(summary.valid),
    components: Number(summary.components || 0),
    exactCluesOnly: Boolean(summary.exactCluesOnly),
    panels: Number(summary.panels || 0),
    answers: Number(summary.answers || 0),
    crossings: Number(summary.crossings || 0),
    rawLetterCoverage: Number(summary.rawLetterCoverage || 0),
    formulaicShortCount: Number(summary.formulaicShortCount || 0),
    editorialPenalty: Number(summary.editorialPenalty || 0),
    clueDebt: Number(summary.clueDebt || 0),
    score: Number(summary.score || 0),
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

function compactProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  return {
    schemaVersion: Number(profile.schemaVersion || 0),
    mode: profile.mode || null,
    calls: Number(profile.calls || 0),
    parityFailures: Number(profile.parityFailures || 0),
    randomDrawMismatches: Number(profile.randomDrawMismatches || 0),
    errors: Number(profile.errors || 0),
    originalElapsedMs: Number(profile.originalElapsedMs || 0),
    replayElapsedMs: Number(profile.replayElapsedMs || 0),
    setupElapsedMs: Number(profile.setupElapsedMs || 0),
    restartElapsedMs: Number(profile.restartElapsedMs || 0),
    applyElapsedMs: Number(profile.applyElapsedMs || 0),
    clueItems: Number(profile.clueItems || 0),
    footprintCandidates: Number(profile.footprintCandidates || 0),
    candidateAvailabilityChecks: Number(profile.candidateAvailabilityChecks || 0),
    availableCandidates: Number(profile.availableCandidates || 0),
    rankedCandidates: Number(profile.rankedCandidates || 0),
    assignments: Number(profile.assignments || 0),
    randomDraws: Number(profile.randomDraws || 0),
    last: profile.last || null,
  };
}

function dominantBucket(profile) {
  const buckets = [
    ["setup", Number(profile?.setupElapsedMs || 0)],
    ["restarts", Number(profile?.restartElapsedMs || 0)],
    ["apply", Number(profile?.applyElapsedMs || 0)],
  ].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { name: buckets[0][0], elapsedMs: +buckets[0][1].toFixed(3) };
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
      const baselineSummary = await runSeed(seed, "off");
      const shadowSummary = await runSeed(seed, "shadow");
      const baseline = compact(baselineSummary);
      const shadow = compact(shadowSummary);
      const profile = compactProfile(shadowSummary.exactAllocatorProfile);
      const differences = exactDifferences(baseline, shadow);
      const outputValid = Boolean(shadow.valid && shadow.components === 1 && shadow.exactCluesOnly);
      const exactOutputParity = outputValid && differences.length === 0;
      const profileValid = Boolean(
        profile
        && profile.schemaVersion === 1
        && profile.mode === "shadow"
        && profile.calls > 0
        && profile.calls === shadow.exactAllocationCalls
        && profile.parityFailures === 0
        && profile.randomDrawMismatches === 0
        && profile.errors === 0
        && profile.originalElapsedMs > 0
        && profile.replayElapsedMs > 0
        && profile.restartElapsedMs > 0
        && profile.candidateAvailabilityChecks > 0
        && profile.randomDraws > 0
      );
      results[index] = {
        schemaVersion: 1,
        seed,
        status: exactOutputParity && profileValid ? "ok" : "failed",
        baseline,
        shadow,
        shadowRuntimeRatio: baseline.elapsedMs ? +(shadow.elapsedMs / baseline.elapsedMs).toFixed(4) : null,
        differences,
        outputValid,
        exactOutputParity,
        profileValid,
        dominantBucket: dominantBucket(profile),
        profile,
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

function sumProfile(executed, field) {
  return executed.reduce((sum, record) => sum + Number(record.profile?.[field] || 0), 0);
}

(async () => {
  await Promise.all(Array.from({ length: Math.min(concurrency, seeds.length) }, () => worker()));
  const failures = results.filter((record) => record?.status !== "ok");
  const executed = results.filter((record) => record?.baseline && record?.shadow && record?.profile);
  const baselineElapsedMs = executed.reduce((sum, record) => sum + record.baseline.elapsedMs, 0);
  const shadowElapsedMs = executed.reduce((sum, record) => sum + record.shadow.elapsedMs, 0);
  const aggregateProfile = {
    calls: sumProfile(executed, "calls"),
    parityFailures: sumProfile(executed, "parityFailures"),
    randomDrawMismatches: sumProfile(executed, "randomDrawMismatches"),
    errors: sumProfile(executed, "errors"),
    originalElapsedMs: +sumProfile(executed, "originalElapsedMs").toFixed(3),
    replayElapsedMs: +sumProfile(executed, "replayElapsedMs").toFixed(3),
    setupElapsedMs: +sumProfile(executed, "setupElapsedMs").toFixed(3),
    restartElapsedMs: +sumProfile(executed, "restartElapsedMs").toFixed(3),
    applyElapsedMs: +sumProfile(executed, "applyElapsedMs").toFixed(3),
    clueItems: sumProfile(executed, "clueItems"),
    footprintCandidates: sumProfile(executed, "footprintCandidates"),
    candidateAvailabilityChecks: sumProfile(executed, "candidateAvailabilityChecks"),
    availableCandidates: sumProfile(executed, "availableCandidates"),
    rankedCandidates: sumProfile(executed, "rankedCandidates"),
    assignments: sumProfile(executed, "assignments"),
    randomDraws: sumProfile(executed, "randomDraws"),
  };
  const measuredCoreElapsedMs = aggregateProfile.setupElapsedMs
    + aggregateProfile.restartElapsedMs
    + aggregateProfile.applyElapsedMs;
  const summary = {
    type: "summary",
    schemaVersion: 1,
    phase: "exact-allocator-profile-v1",
    baselineId: baselineConfig.baselineId,
    sourceBaseline: seedManifest.manifest.sourceBaseline,
    manifestDigestSha256: seedManifest.digest,
    split: requestedSplit,
    availableSeeds: allSeeds.length,
    seeds: results.length,
    seedLimit,
    concurrency,
    passedSeeds: results.length - failures.length,
    failures: failures.length,
    executedSeeds: executed.length,
    exactOutputParitySeeds: executed.filter((record) => record.exactOutputParity).length,
    profileValidSeeds: executed.filter((record) => record.profileValid).length,
    baselineElapsedMs,
    shadowElapsedMs,
    shadowRuntimeRatio: baselineElapsedMs ? +(shadowElapsedMs / baselineElapsedMs).toFixed(4) : null,
    profile: aggregateProfile,
    setupShare: measuredCoreElapsedMs ? +(aggregateProfile.setupElapsedMs / measuredCoreElapsedMs).toFixed(4) : null,
    restartShare: measuredCoreElapsedMs ? +(aggregateProfile.restartElapsedMs / measuredCoreElapsedMs).toFixed(4) : null,
    applyShare: measuredCoreElapsedMs ? +(aggregateProfile.applyElapsedMs / measuredCoreElapsedMs).toFixed(4) : null,
    dominantBucket: dominantBucket(aggregateProfile),
    passed: failures.length === 0 && executed.length === results.length,
  };
  fs.appendFileSync(outputFile, `${JSON.stringify(summary)}\n`);
  console.log(JSON.stringify(summary));
  if (!summary.passed) process.exitCode = 1;
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
