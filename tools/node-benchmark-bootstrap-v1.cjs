"use strict";

const path = require("node:path");
const Module = require("node:module");

const entry = path.basename(process.argv[1] || "");
const supportedEntries = new Set([
  "benchmark-seed-v3.cjs",
  "construction-pipeline-seed-v1.cjs",
  "clue-feasibility-seed-v1.cjs",
  "bounded-partial-search-test.cjs",
  "bounded-partial-search-seed-v1.cjs",
  "adaptive-partial-search-test.cjs",
  "construction-stage-runtime-test-v2.cjs",
  "wrapper-retirement-test-v1.cjs",
]);
if (!supportedEntries.has(entry)) return;

const root = path.resolve(__dirname, "..");
global.window = global;
if (process.env.SCANWORD_WRAPPER_INSTALLATION_LOCK) {
  window.SCANWORD_WRAPPER_INSTALLATION_LOCK = process.env.SCANWORD_WRAPPER_INSTALLATION_LOCK;
}

const bulkEnabled = String(process.env.SCANWORD_BULK_LEXICON || "on").toLowerCase() !== "off";
const scripts = [
  "words.js",
  "short-words.js",
  "clues.js",
  "extra-dictionary.js",
  "two-letter-words.js",
  ...(bulkEnabled ? ["bulk-lexicon-runtime.js", "bulk-lexicon/loader.js"] : []),
  "core.js",
  "dictionary-policy.js",
  "lexical-policy-v2.js",
  "editorial-lexical-policy-v3.js",
  "full-corpus-pattern-index-v1.js",
  "solver.js",
  "closed-fill.js",
  "closed-fill-rollback.js",
  "construction-v2-runtime.js",
  "construction-v2.js",
  "construction-clue-feasibility-v1.js",
  "construction-bounded-partial-search-v1.js",
  "construction-bounded-partial-search-fallback-v1.js",
  "construction-victim.js",
  "construction-victim-depth2.js",
  "construction-stage-source-anchor-v2.js",
  "construction-portfolio.js",
  "construction-polish.js",
  "construction-clue-repack.js",
  "construction-clue-adaptive.js",
  "construction-clue-tail.js",
  "construction-clue-reflow.js",
  "construction-clue-pair-reflow.js",
  "targeted-short-fill.js",
  "construction-victim-targeted.js",
  "construction-victim-targeted-demand.js",
  "construction-victim-targeted-pair.js",
  "construction-victim-targeted-cross.js",
  "construction-victim-targeted-cross-rollback.js",
  "construction-victim-targeted-cross-relaxed.js",
  "construction-victim-targeted-cross-budget.js",
  "construction-victim-targeted-exact.js",
  "construction-guard.js",
  "editorial-demand-lexicon-v3.js",
  "editorial-demand-lexicon-supplement-v3.js",
  "editorial-demand-short-lexicon-v3.js",
  "editorial-demand-tail-lexicon-v3.js",
  "construction-editorial-replace-v3.js",
  "construction-editorial-pair-refit-v3.js",
  "construction-editorial-bundle-refit-v3.js",
  "construction-editorial-repair-v3.js",
  "construction-stage-runtime-v2.js",
  "construction-vocabulary-portfolio-v1.js",
  "construction-candidate-state-v1.js",
  "construction-pipeline-telemetry-v1.js",
  "construction-pipeline-stages-v1.js",
  "construction-pipeline-v1.js",
  "construction-wrapper-retirement-audit-v1.js",
];

for (const file of scripts) require(path.join(root, file));

// benchmark-seed-v3 predates the production script order. Its own require loop
// is allowed to hit modules already cached above, but research-only wrappers
// must not be installed after the canonical browser runtime.
const blocked = new Set([
  "construction-lexical-placement-v3.js",
  "construction-portfolio-v3.js",
]);
const benchmarkEntrypoints = new Set([
  path.join(__dirname, "benchmark-seed-v3.cjs"),
  path.join(__dirname, "construction-pipeline-seed-v1.cjs"),
  path.join(__dirname, "clue-feasibility-seed-v1.cjs"),
  path.join(__dirname, "bounded-partial-search-test.cjs"),
  path.join(__dirname, "bounded-partial-search-seed-v1.cjs"),
  path.join(__dirname, "adaptive-partial-search-test.cjs"),
  path.join(__dirname, "construction-stage-runtime-test-v2.cjs"),
  path.join(__dirname, "wrapper-retirement-test-v1.cjs"),
]);
const originalLoad = Module._load;
Module._load = function loadCanonicalBenchmarkDependency(request, parent, isMain) {
  if (benchmarkEntrypoints.has(parent?.filename) && blocked.has(path.basename(request))) return {};
  return originalLoad.call(this, request, parent, isMain);
};

window.SCANWORD_NODE_BENCHMARK_BOOTSTRAP = {
  version: 3,
  bulkEnabled,
  entry,
  scripts,
  blocked: [...blocked],
  explicitPipeline: "construction-pipeline-v1",
  fullCorpusRetrieval: "full-corpus-pattern-index-v1",
  clueFeasibility: "construction-clue-feasibility-v1",
  boundedPartialSearch: "construction-bounded-partial-search-v1",
  boundedPartialSearchFallback: "construction-bounded-partial-search-fallback-v1",
  adaptivePartialSearch: "construction-vocabulary-portfolio-v1",
  stageSourceAnchor: "construction-stage-source-anchor-v2",
  stageRuntime: "construction-stage-runtime-v2",
  wrapperRetirementAudit: "construction-wrapper-retirement-audit-v1",
};
