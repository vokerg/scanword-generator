"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { validate: validateSeedManifest } = require("./phase-12-seed-manifest-v1.cjs");

const root = path.resolve(__dirname, "..");
const requestedSplit = process.argv[2] || "development";
const outputFile = path.resolve(
  process.argv[3]
    || path.join(root, "research-output", "exact-allocator-acceleration", `${requestedSplit}-occupancy-index-v1.jsonl`),
);
const baselineConfig = JSON.parse(fs.readFileSync(
  path.join(root, "research", "baselines", "v8-production-1.1", "config.json"),
  "utf8",
));
const canonicalEnvironment = baselineConfig.environment || {};
const seedManifest = validateSeedManifest();
const allSeeds = seedManifest.splits[requestedSplit];
if (!Array.isArray(allSeeds) || !allSeeds.length) {
  throw new Error(`Unknown or empty Phase 12 seed split: ${requestedSplit}`);
}

const seedLimit = Math.max(1, Math.min(allSeeds.length, Math.floor(Number(
  process.env.SCANWORD_EXACT_ALLOCATOR_OCCUPANCY_SEED_LIMIT || allSeeds.length,
))));
const seeds = allSeeds.slice(0, seedLimit);
const concurrency = Math.max(1, Math.floor(Number(
  process.env.SCANWORD_EXACT_ALLOCATOR_OCCUPANCY_CONCURRENCY || 2,
)));
const timeoutMs = Math.max(
  60_000,
  Math.floor(Number(process.env.SCANWORD_EXACT_ALLOCATOR_OCCUPANCY_SEED_TIMEOUT_MS || 1_800_000)),
);
const maximumRuntimeRatio = Math.max(
  0.1,
  Number(process.env.SCANWORD_EXACT_ALLOCATOR_OCCUPANCY_RUNTIME_RATIO || 1.10),
);
const seedRunner = path.join(root, "tools", "construction-pipeline-seed-v1.cjs");
const bootstrap = path.join(root, "tools", "node-benchmark-bootstrap-v1.cjs");

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, "");

function childEnvironment(occupancyMode, profileMode) {
  return {
    ...process.env,
    ...canonicalEnvironment,
    NODE_OPTIONS: `--require=${bootstrap}`,
    SCANWORD_COMPLETE_PIPELINE_FRONTIER: "on",
    SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH: "4",
    SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER: "off",
    SCANWORD_EXACT_ALLOCATOR_SELECTOR: "linear-top-three",
    SCANWORD_EXACT_ALLOCATOR_SELECTOR_DETAIL: "summary",
    SCANWORD_EXACT_ALLOCATOR_OCCUPANCY: occupancyMode,
    SCANWORD_EXACT_ALLOCATOR_OCCUPANCY_DETAIL: "summary",
    SCANWORD_EXACT_ALLOCATOR_PROFILE: profileMode,
    SCANWORD_EXACT_ALLOCATOR_PROFILE_DETAIL: "summary",
  };
}

function runSeed(seed, occupancyMode, profileMode, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [seedRunner, seed], {
      cwd: root,
      env: childEnvironment(occupancyMode, profileMode),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${seed}/${label} exceeded ${timeoutMs} ms`));
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
        reject(new Error(`${seed}/${label} failed (${code ?? signal}): ${stderr || stdout}`));
        return;
      }
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      try {
        resolve(JSON.parse(lines.at(-1)));
      } catch (error) {
        reject(new Error(`${seed}/${label} did not emit JSON: ${stdout}\n${stderr}\n${error}`));
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

function exactDifferences(first, second, firstLabel, secondLabel) {
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
  };
}

function compactOccupancy(occupancy) {
  if (!occupancy || typeof occupancy !== "object") return null;
  return {
    schemaVersion: Number(occupancy.schemaVersion || 0),
    mode: occupancy.mode || null,
    detail: occupancy.detail || null,
    calls: Number(occupancy.calls || 0),
    fallbacks: Number(occupancy.fallbacks || 0),
    errors: Number(occupancy.errors || 0),
    elapsedMs: Number(occupancy.elapsedMs || 0),
    setupElapsedMs: Number(occupancy.setupElapsedMs || 0),
    indexBuildElapsedMs: Number(occupancy.indexBuildElapsedMs || 0),
    restartElapsedMs: Number(occupancy.restartElapsedMs || 0),
    applyElapsedMs: Number(occupancy.applyElapsedMs || 0),
    candidateReferences: Number(occupancy.candidateReferences || 0),
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
  };
}

function validCanonicalSelector(selector, allocationCalls) {
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

function validIndexedSelector(selector) {
  return Boolean(
    selector
    && selector.schemaVersion === 1
    && selector.mode === "linear-top-three"
    && selector.detail === "summary"
    && selector.calls === 0
    && selector.fallbacks === 0
    && selector.errors === 0
  );
}

function validOccupancy(occupancy, allocationCalls) {
  return Boolean(
    occupancy
    && occupancy.schemaVersion === 1
    && occupancy.mode === "indexed"
    && occupancy.detail === "summary"
    && occupancy.calls === allocationCalls
    && occupancy.fallbacks === 0
    && occupancy.errors === 0
    && occupancy.elapsedMs > 0
    && occupancy.candidateReferences > 0
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
      const canonicalSummary = await runSeed(seed, "off", "off", "canonical");
      const indexedSummary = await runSeed(seed, "indexed", "off", "indexed");
      const auditSummary = await runSeed(seed, "indexed", "shadow", "audit");
      const canonical = compact(canonicalSummary);
      const indexed = compact(indexedSummary);
      const audit = compact(auditSummary);
      const canonicalSelector = compactSelector(canonicalSummary.exactAllocatorSelector);
      const indexedSelector = compactSelector(indexedSummary.exactAllocatorSelector);
      const auditSelector = compactSelector(auditSummary.exactAllocatorSelector);
      const occupancy = compactOccupancy(indexedSummary.exactAllocatorOccupancy);
      const auditOccupancy = compactOccupancy(auditSummary.exactAllocatorOccupancy);
      const profile = compactProfile(auditSummary.exactAllocatorProfile);
      const differences = exactDifferences(canonical, indexed, "canonical", "indexed");
      const auditDifferences = exactDifferences(indexed, audit, "indexed", "audit");
      const exactOutputParity = Boolean(
        indexed.valid
        && indexed.components === 1
        && indexed.exactCluesOnly
        && differences.length === 0
      );
      const auditOutputParity = auditDifferences.length === 0;
      const selectorValid = validCanonicalSelector(canonicalSelector, canonical.exactAllocationCalls)
        && validIndexedSelector(indexedSelector)
        && validIndexedSelector(auditSelector);
      const occupancyValid = validOccupancy(occupancy, indexed.exactAllocationCalls)
        && validOccupancy(auditOccupancy, audit.exactAllocationCalls);
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
      const canonicalOccupancyAbsent = canonicalSummary.exactAllocatorOccupancy == null;
      results[index] = {
        schemaVersion: 1,
        seed,
        status: exactOutputParity && auditOutputParity && selectorValid
          && occupancyValid && profileValid && canonicalOccupancyAbsent
          ? "ok"
          : "failed",
        canonical,
        indexed,
        audit,
        differences,
        auditDifferences,
        exactOutputParity,
        auditOutputParity,
        selectorValid,
        occupancyValid,
        profileValid,
        canonicalOccupancyAbsent,
        canonicalSelector,
        indexedSelector,
        occupancy,
        auditOccupancy,
        profile,
        allocatorRuntimeRatio: roundedRatio(indexed.exactAllocationElapsedMs, canonical.exactAllocationElapsedMs),
        totalRuntimeRatio: roundedRatio(indexed.elapsedMs, canonical.elapsedMs),
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
    record?.canonical && record?.indexed && record?.audit && record?.occupancy && record?.profile
  ));
  const canonicalAllocatorElapsedMs = sum(executed, (record) => record.canonical.exactAllocationElapsedMs);
  const indexedAllocatorElapsedMs = sum(executed, (record) => record.indexed.exactAllocationElapsedMs);
  const canonicalElapsedMs = sum(executed, (record) => record.canonical.elapsedMs);
  const indexedElapsedMs = sum(executed, (record) => record.indexed.elapsedMs);
  const aggregateAllocatorRuntimeRatio = roundedRatio(indexedAllocatorElapsedMs, canonicalAllocatorElapsedMs);
  const aggregateTotalRuntimeRatio = roundedRatio(indexedElapsedMs, canonicalElapsedMs);
  const runtimeGatePassed = Boolean(
    aggregateAllocatorRuntimeRatio != null
    && aggregateTotalRuntimeRatio != null
    && aggregateAllocatorRuntimeRatio <= maximumRuntimeRatio
    && aggregateTotalRuntimeRatio <= maximumRuntimeRatio
  );
  const summary = {
    type: "summary",
    schemaVersion: 1,
    phase: "exact-allocator-occupancy-index-v1",
    baselineId: baselineConfig.baselineId,
    sourceBaseline: seedManifest.manifest.sourceBaseline,
    manifestDigestSha256: seedManifest.digest,
    split: requestedSplit,
    availableSeeds: allSeeds.length,
    seeds: results.length,
    seedLimit,
    concurrency,
    maximumRuntimeRatio,
    passedSeeds: results.length - failures.length,
    failures: failures.length,
    exactOutputParitySeeds: executed.filter((record) => record.exactOutputParity).length,
    auditOutputParitySeeds: executed.filter((record) => record.auditOutputParity).length,
    selectorValidSeeds: executed.filter((record) => record.selectorValid).length,
    occupancyValidSeeds: executed.filter((record) => record.occupancyValid).length,
    profileValidSeeds: executed.filter((record) => record.profileValid).length,
    canonicalOccupancyAbsentSeeds: executed.filter((record) => record.canonicalOccupancyAbsent).length,
    exactAllocationCalls: sum(executed, (record) => record.indexed.exactAllocationCalls),
    canonicalAllocatorElapsedMs: +canonicalAllocatorElapsedMs.toFixed(3),
    indexedAllocatorElapsedMs: +indexedAllocatorElapsedMs.toFixed(3),
    aggregateAllocatorRuntimeRatio,
    medianAllocatorRuntimeRatio: roundedMedian(executed.map((record) => record.allocatorRuntimeRatio)),
    canonicalElapsedMs,
    indexedElapsedMs,
    aggregateTotalRuntimeRatio,
    medianTotalRuntimeRatio: roundedMedian(executed.map((record) => record.totalRuntimeRatio)),
    occupancyFallbacks: sum(executed, (record) => record.occupancy.fallbacks),
    occupancyErrors: sum(executed, (record) => record.occupancy.errors),
    candidateReferences: sum(executed, (record) => record.occupancy.candidateReferences),
    auditParityFailures: sum(executed, (record) => record.profile.parityFailures),
    auditRandomDrawMismatches: sum(executed, (record) => record.profile.randomDrawMismatches),
    auditErrors: sum(executed, (record) => record.profile.errors),
    runtimeGatePassed,
    passed: failures.length === 0 && executed.length === results.length && runtimeGatePassed,
  };
  fs.appendFileSync(outputFile, `${JSON.stringify(summary)}\n`);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (!summary.passed) process.exitCode = 1;
})();
