"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error(`CI lifecycle contract failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function pullRequestBlock(relativePath) {
  const source = read(relativePath);
  const match = source.match(/(?:^|\n)  pull_request:\n([\s\S]*?)(?=\n  [A-Za-z_][A-Za-z0-9_-]*:|\nconcurrency:|\npermissions:|\njobs:|$)/);
  assert(match, `${relativePath}: pull_request block not found`);
  return match[0];
}

function hasIndexTrigger(relativePath) {
  return /(?:^|\n)\s*-\s*["']?index\.html["']?\s*$/m.test(pullRequestBlock(relativePath));
}

function jobBlock(relativePath, jobName) {
  const lines = read(relativePath).split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  assert(start >= 0, `${relativePath}: job ${jobName} not found`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

const productionWorkflow = ".github/workflows/production-release-smoke.yml";
assert(hasIndexTrigger(productionWorkflow), "Production release smoke must own index.html PR changes");

const defaultOffResearchWorkflows = [
  ".github/workflows/preallocation-structural-frontier.yml",
  ".github/workflows/full-corpus-retrieval.yml",
  ".github/workflows/clue-feasibility.yml",
  ".github/workflows/bounded-partial-search.yml",
  ".github/workflows/adaptive-partial-search.yml",
  ".github/workflows/phase-12-exact-allocator-occupancy-index.yml",
  ".github/workflows/phase-12-exact-allocator-profile.yml",
];

for (const workflow of defaultOffResearchWorkflows) {
  assert(!hasIndexTrigger(workflow), `${workflow}: closed/default-off research must not own index-only PRs`);
}

const manualResearchJobs = [
  [".github/workflows/complete-pipeline-frontier.yml", "development"],
  [".github/workflows/complete-pipeline-frontier.yml", "promotion"],
  [".github/workflows/complete-pipeline-frontier.yml", "stability"],
  [".github/workflows/preallocation-structural-frontier.yml", "development-filter-diagnostic"],
  [".github/workflows/preallocation-structural-frontier.yml", "promotion-filter-diagnostic"],
  [".github/workflows/preallocation-structural-frontier.yml", "stability-filter-diagnostic"],
  [".github/workflows/full-corpus-retrieval.yml", "development"],
  [".github/workflows/clue-feasibility.yml", "development"],
  [".github/workflows/bounded-partial-search.yml", "development"],
  [".github/workflows/adaptive-partial-search.yml", "development"],
  [".github/workflows/phase-12-exact-allocator-occupancy-index.yml", "promotion"],
  [".github/workflows/phase-12-exact-allocator-occupancy-index.yml", "stability"],
  [".github/workflows/phase-12-exact-allocator-profile.yml", "development-profile"],
];

for (const [workflow, job] of manualResearchJobs) {
  assert(
    jobBlock(workflow, job).includes("github.event_name == 'workflow_dispatch'"),
    `${workflow}:${job} must remain workflow_dispatch-only`,
  );
}

const releaseSmoke = read("tools/production-release-smoke-v1.cjs");
const centralizedDefaults = [
  'window.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER = "off"',
  'window.SCANWORD_FULL_CORPUS_RETRIEVAL = "off"',
  'window.SCANWORD_CLUE_FEASIBILITY = "off"',
  'window.SCANWORD_PARTIAL_SEARCH = "off"',
  'window.SCANWORD_EXACT_ALLOCATOR_OCCUPANCY = "off"',
  'window.SCANWORD_EXACT_ALLOCATOR_PROFILE = "off"',
];
for (const expected of centralizedDefaults) {
  assert(releaseSmoke.includes(expected), `Production release smoke lost centralized default check: ${expected}`);
}

console.log(JSON.stringify({
  passed: true,
  productionIndexOwner: productionWorkflow,
  defaultOffResearchWorkflows: defaultOffResearchWorkflows.length,
  manualResearchJobs: manualResearchJobs.length,
  centralizedDefaultChecks: centralizedDefaults.length,
}));
