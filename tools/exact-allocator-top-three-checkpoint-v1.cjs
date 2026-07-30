"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { validate: validateSeedManifest } = require("./phase-12-seed-manifest-v1.cjs");

const root = path.resolve(__dirname, "..");
const requestedSplit = process.argv[2] || "development";
const outputFile = path.resolve(
  process.argv[3]
    || path.join(root, "research-output", "exact-allocator-acceleration", `${requestedSplit}-top-three-v1.jsonl`),
);
const baselineConfig = JSON.parse(fs.readFileSync(
  path.join(root, "research", "baselines", "v8-production-1.1", "config.json"),
  "utf8",
));
const canonicalEnvironment = baselineConfig.environment || {};
const seedManifest = validateSeedManifest();
const allSeeds = seedManifest.splits[requestedSplit];
if (!Array.isArray(allSeeds) || !allSeeds.length) throw new Error(`Unknown or empty Phase 12 seed split: ${requestedSplit}`);

const seedLimit = Math.max(1, Math.min(allSeeds.length, Math.floor(Number(
  process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR_SEED_LIMIT || allSeeds.length,
))));
const seeds = allSeeds.slice(0, seedLimit);
const concurrency = Math.max(1, Math.floor(Number(process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR_CONCURRENCY || 2)));
const timeoutMs = Math.max(
  60_000,
  Math.floor(Number(process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR_SEED_TIMEOUT_MS || 1_800_000)),
);
const seedRunner = path.join(root, "tools", "construction-pipeline-seed-v1.cjs");
const bootstrap = path.join(root, "tools", "node-benchmark-bootstrap-v1.cjs");

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, "");

function runSeed(seed, selectorMode, profileMode) {
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
        SCANWORD_EXACT_ALLOCATOR_SELECTOR: selectorMode,
        SCANWORD_EXACT_ALLOCATOR_SELECTOR_DETAIL: "summary",
        SCANWORD_EXACT_ALLOCATOR_PROFILE: profileMode,
        SCANWORD_EXACT_ALLOCATOR_PROFILE_DETAIL: "summary",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${seed}/${selectorMode}/${profileMode} exceeded ${timeoutMs} ms`));
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
        reject(new Error(`${seed}/${selectorMode}/${profileMode} failed (${code ?? signal}): ${stderr || stdout}`));
        return;
      }
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      try {
        resolve(JSON.parse(lines.at(-1)));
      } catch (error) {
        reject(new Error(`${seed}/${selectorMode}/${profileMode} did not emit JSON: ${stdout}\n${stderr}\n${error}`));
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

const parityFields = [
  "valid", "components", "exactCluesOnly", "panels", "answers", "crossings",
  "rawLetterCoverage", "formulaicShortCount", "editorialPenalty", "clueDebt", "score",
  "gridDigest", "placedDigest", "clueDigest", "geometryDigest",
];

function exactDifferences(first, second, firstLabel = "first", secondLabel = "second") {
  return parityFields
    .filter((field) => first[field] !== second[field])
    .map((field) => ({ field, [firstLabel]: first[field], [secondLabel]: second[field] }));
}

function compactSelector(selector) {
  if (!selector || typeof selector !== "object") return null;
  return {
    schemaVersion: Number(selector.schemaVersion || 0),
    mode: selector.mode || null,
    detail: selector.detail || null,
    calls: Number(selector.calls || 0),
    fallbacks: Number(selector.fallbacks || 0),
    errors: Number(selector.errors || 0),
    elapsedMs: Number(selector.elapsedMs || 0),
    rankedDomains: Number(selector.rankedDomains || 0),
    rankedCandidates: Number(selector.rankedCandidates || 0),
    comparatorCalls: Number(selector.comparatorCalls || 0),
    maximumDomainSize: Number(selector.maximumDomainSize || 0),
  };
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
    rankedCandidates: Number(profile.rankedCandidates || 0),
    randomDraws: Number(profile.randomDraws || 0),
  };
}

function validSelector(selector, allocationCalls) {
  return Boolean(
    selector
    && selector.schemaVersion === 1
    && selector.mode === "linear-top-three"
    && selector.detail === "summary"
    && selector.calls === allocationCalls
    && selector.fallbacks === 0
    && selector.errors === 0
  );
}

function roundedRatio(numerator, denominator) {
  return denominator ? +(numerator / denominator).toFixed(4) : null;
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
      const baselineSummary = await runSeed(seed, "off", "off");
      const candidateSummary = await runSeed(seed, "linear-top-three", "off");
      const auditSummary = await runSeed(seed, "linear-top-three", "shadow");
      const baseline = compact(baselineSummary);
      const candidate = compact(candidateSummary);
      const audit = compact(auditSummary);
      const selector = compactSelector(candidateSummary.exactAllocatorSelector);
      const auditSelector = compactSelector(auditSummary.exactAllocatorSelector);
      const profile = compactProfile(auditSummary.exactAllocatorProfile);
      const differences = exactDifferences(baseline, candidate, "baseline", "candidate");
      const auditDifferences = exactDifferences(candidate, audit, "candidate", "audit");
      const exactOutputParity = Boolean(
        candidate.valid
        && candidate.components === 1
        && candidate.exactCluesOnly
        && differences.length === 0
      );
      const auditOutputParity = auditDifferences.length === 0;
      const selectorValid = validSelector(selector, candidate.exactAllocationCalls)
        && validSelector(auditSelector, audit.exactAllocationCalls);
      const profileValid = Boolean(
        profile
        && profile.schemaVersion === 1
        && profile.mode === "shadow"
        && profile.calls === audit.exactAllocationCalls
        && profile.parityFailures === 0
        && profile.randomDrawMismatches === 0
        && profile.errors === 0
        && profile.originalElapsedMs > 0
        && profile.replayElapsedMs > 0
      );
      results[index] = {
        schemaVersion: 2,
        seed,
        status: exactOutputParity && auditOutputParity && selectorValid && profileValid ? "ok" : "failed",
        baseline,
        candidate,
        audit,
        differences,
        auditDifferences,
        exactOutputParity,
        auditOutputParity,
        selectorValid,
        profileValid,
        selector,
        auditSelector,
        profile,
        allocatorRuntimeRatio: roundedRatio(candidate.exactAllocationElapsedMs, baseline.exactAllocationElapsedMs),
        totalRuntimeRatio: roundedRatio(candidate.elapsedMs, baseline.elapsedMs),
        auditShadowReplayRatio: roundedRatio(profile?.originalElapsedMs, profile?.replayElapsedMs),
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

function sum(executed, getter) {
  return executed.reduce((total, record) => total + Number(getter(record) || 0), 0);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function roundedMedian(values) {
  const value = median(values);
  return value == null ? null : +value.toFixed(4);
}

(async () => {
  await Promise.all(Array.from({ length: Math.min(concurrency, seeds.length) }, () => worker()));
  const failures = results.filter((record) => record?.status !== "ok");
  const executed = results.filter((record) => (
    record?.baseline && record?.candidate && record?.audit && record?.selector && record?.auditSelector && record?.profile
  ));
  const baselineAllocatorElapsedMs = sum(executed, (record) => record.baseline.exactAllocationElapsedMs);
  const candidateAllocatorElapsedMs = sum(executed, (record) => record.candidate.exactAllocationElapsedMs);
  const baselineElapsedMs = sum(executed, (record) => record.baseline.elapsedMs);
  const candidateElapsedMs = sum(executed, (record) => record.candidate.elapsedMs);
  const auditAuthoritativeElapsedMs = sum(executed, (record) => record.profile.originalElapsedMs);
  const canonicalReplayElapsedMs = sum(executed, (record) => record.profile.replayElapsedMs);
  const summary = {
    type: "summary",
    schemaVersion: 2,
    phase: "exact-allocator-linear-top-three-v1",
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
    exactOutputParitySeeds: executed.filter((record) => record.exactOutputParity).length,
    auditOutputParitySeeds: executed.filter((record) => record.auditOutputParity).length,
    selectorValidSeeds: executed.filter((record) => record.selectorValid).length,
    profileValidSeeds: executed.filter((record) => record.profileValid).length,
    exactAllocationCalls: sum(executed, (record) => record.candidate.exactAllocationCalls),
    baselineAllocatorElapsedMs: +baselineAllocatorElapsedMs.toFixed(3),
    candidateAllocatorElapsedMs: +candidateAllocatorElapsedMs.toFixed(3),
    aggregateAllocatorRuntimeRatio: roundedRatio(candidateAllocatorElapsedMs, baselineAllocatorElapsedMs),
    medianAllocatorRuntimeRatio: roundedMedian(executed.map((record) => record.allocatorRuntimeRatio)),
    baselineElapsedMs,
    candidateElapsedMs,
    aggregateTotalRuntimeRatio: roundedRatio(candidateElapsedMs, baselineElapsedMs),
    medianTotalRuntimeRatio: roundedMedian(executed.map((record) => record.totalRuntimeRatio)),
    auditAuthoritativeElapsedMs: +auditAuthoritativeElapsedMs.toFixed(3),
    canonicalReplayElapsedMs: +canonicalReplayElapsedMs.toFixed(3),
    aggregateAuditShadowReplayRatio: roundedRatio(auditAuthoritativeElapsedMs, canonicalReplayElapsedMs),
    medianAuditShadowReplayRatio: roundedMedian(executed.map((record) => record.auditShadowReplayRatio)),
    passed: failures.length === 0 && executed.length === results.length,
  };
  fs.appendFileSync(outputFile, `${JSON.stringify(summary)}\n`);
  console.log(JSON.stringify(summary));
  if (!summary.passed) process.exitCode = 1;
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
