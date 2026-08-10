"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "index.html");
const bootstrapPath = path.join(root, "tools", "node-benchmark-bootstrap-v1.cjs");
const uiPath = path.join(root, "ui.js");
const rendererPath = path.join(root, "renderer.js");

const DEFAULT_RELEASE_SMOKE = Object.freeze({
  seed: "release-smoke-v1",
  gridDigest: "85bc32d1dd4be3b511ee73a91d0b66ada9c26cb7e32f140fc1a7fbce868d34ef",
  placedDigest: "0d2971716aaadeced6a2b93459bc45b93b5271f9f921fa59e7009b7de7208d11",
});

function fail(message) {
  throw new Error(`Production release smoke failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function parseLastJsonLine(output, label) {
  const lines = String(output).trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch (_) {
      // Keep scanning in case a dependency emitted diagnostic text before the final JSON report.
    }
  }
  fail(`${label} did not emit a JSON report`);
}

function canonicalEnv() {
  return {
    ...process.env,
    SCANWORD_CONSTRUCTION_MODE: "portfolio",
    SCANWORD_CLOSED_FILL: "diagnostic",
    SCANWORD_PORTFOLIO_SELECTION: "panel-first",
    SCANWORD_CATEGORY_BALANCE: "off",
    SCANWORD_EDITORIAL_REPAIR: "on",
    SCANWORD_VOCABULARY_PORTFOLIO: "on",
    SCANWORD_VOCABULARY_PORTFOLIO_LIMITS: "2500,3500",
    SCANWORD_VOCABULARY_PORTFOLIO_MODE: "full",
    SCANWORD_EXPLICIT_PIPELINE: "on",
    SCANWORD_PIPELINE_STAGE_RUNTIME: "explicit",
    SCANWORD_WRAPPER_INSTALLATION_LOCK: "explicit-pipeline-v1",
    SCANWORD_COMPLETE_PIPELINE_FRONTIER: "on",
    SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH: "4",
    SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER: "off",
    SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH: "96",
    SCANWORD_FULL_CORPUS_RETRIEVAL: "off",
    SCANWORD_FULL_CORPUS_RETRIEVAL_MODE: "empty",
    SCANWORD_CLUE_FEASIBILITY: "off",
    SCANWORD_PARTIAL_SEARCH: "off",
    SCANWORD_EXACT_ALLOCATOR_SELECTOR: "linear-top-three",
    SCANWORD_EXACT_ALLOCATOR_OCCUPANCY: "off",
    SCANWORD_EXACT_ALLOCATOR_PROFILE: "off",
    SCANWORD_EXACT_ALLOCATOR_PROFILE_DETAIL: "summary",
    NODE_OPTIONS: `--require=${bootstrapPath}`,
  };
}

const html = read(htmlPath);
const bootstrap = read(bootstrapPath);
const ui = read(uiPath);
const renderer = read(rendererPath);

const browserScripts = [...html.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/g)]
  .map((match) => match[1]);
assert(browserScripts.length > 0, "index.html has no local script dependencies");
assert(new Set(browserScripts).size === browserScripts.length, "index.html contains duplicate script dependencies");
assert(!browserScripts.includes("app.js"), "legacy app.js must not be loaded by the production page");

for (const script of browserScripts) {
  assert(!/^(?:https?:)?\/\//i.test(script), `remote script dependency is not release-pinned: ${script}`);
  assert(fs.existsSync(path.join(root, script)), `missing browser dependency: ${script}`);
}

assert(browserScripts.at(-2) === "renderer.js", "renderer.js must be the penultimate browser module");
assert(browserScripts.at(-1) === "ui.js", "ui.js must be the final browser module");

const scriptsBlock = bootstrap.match(/const scripts = \[([\s\S]*?)\n\];/);
assert(scriptsBlock, "unable to locate canonical Node bootstrap script list");
const nodeRuntimeScripts = [...scriptsBlock[1].matchAll(/["']([^"']+\.js)["']/g)].map((match) => match[1]);
const browserRuntimeScripts = browserScripts.slice(0, -2);
assert(
  JSON.stringify(nodeRuntimeScripts) === JSON.stringify(browserRuntimeScripts),
  `browser/Node runtime load order drifted\nBrowser: ${JSON.stringify(browserRuntimeScripts)}\nNode: ${JSON.stringify(nodeRuntimeScripts)}`,
);

const requiredDefaults = [
  'window.SCANWORD_CONSTRUCTION_MODE = "portfolio"',
  'window.SCANWORD_CLOSED_FILL = "diagnostic"',
  'window.SCANWORD_PORTFOLIO_SELECTION = "panel-first"',
  'window.SCANWORD_CATEGORY_BALANCE = "off"',
  'window.SCANWORD_EDITORIAL_REPAIR = "on"',
  'window.SCANWORD_VOCABULARY_PORTFOLIO = "on"',
  'window.SCANWORD_VOCABULARY_PORTFOLIO_LIMITS = "2500,3500"',
  'window.SCANWORD_VOCABULARY_PORTFOLIO_MODE = "full"',
  'window.SCANWORD_EXPLICIT_PIPELINE = "on"',
  'window.SCANWORD_PIPELINE_STAGE_RUNTIME = "explicit"',
  'window.SCANWORD_WRAPPER_INSTALLATION_LOCK = "explicit-pipeline-v1"',
  'window.SCANWORD_COMPLETE_PIPELINE_FRONTIER = "on"',
  'window.SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH = 4',
  'window.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER = "off"',
  'window.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH = 96',
  'window.SCANWORD_FULL_CORPUS_RETRIEVAL = "off"',
  'window.SCANWORD_FULL_CORPUS_RETRIEVAL_MODE = "empty"',
  'window.SCANWORD_CLUE_FEASIBILITY = "off"',
  'window.SCANWORD_PARTIAL_SEARCH = "off"',
  'window.SCANWORD_EXACT_ALLOCATOR_SELECTOR = "linear-top-three"',
  'window.SCANWORD_EXACT_ALLOCATOR_OCCUPANCY = "off"',
  'window.SCANWORD_EXACT_ALLOCATOR_PROFILE = "off"',
  'window.SCANWORD_EXACT_ALLOCATOR_PROFILE_DETAIL = "summary"',
];
for (const expected of requiredDefaults) {
  assert(html.includes(expected), `missing canonical browser default: ${expected}`);
}

for (const id of [
  "seed",
  "cols",
  "rows",
  "poolSize",
  "targetWords",
  "clueDensity",
  "showAnswers",
  "generate",
  "downloadSvg",
  "downloadJson",
  "stats",
  "preview",
  "wordsTable",
  "generationStatus",
]) {
  assert(new RegExp(`id=["']${id}["']`).test(html), `missing required UI control #${id}`);
}

const catchBlock = ui.match(/catch \(error\) \{([\s\S]*?)\n\s*\} finally \{/);
assert(catchBlock, "ui.js must keep an explicit generation failure boundary");
for (const expected of [
  "currentResult = null;",
  "Generation failed.",
  'els.generationStatus.textContent = "no valid grid";',
  'els.stats.innerHTML = "";',
  'els.wordsTable.innerHTML = "";',
]) {
  assert(catchBlock[1].includes(expected), `generation failure path lost: ${expected}`);
}
assert(/finally \{[\s\S]*?els\.generate\.disabled = false;[\s\S]*?\}/.test(ui), "Generate button is not restored after failure");
assert(/if \(currentResult\) download\("arrowword-a5\.svg"/.test(ui), "SVG export is not guarded by a valid current result");
assert(/if \(currentResult\) download\("arrowword-project\.json"/.test(ui), "JSON export is not guarded by a valid current result");
assert(ui.includes("window.ScanwordGenerator = {"), "public browser generator surface is missing");
assert(ui.includes("getCurrentResult: () => currentResult"), "current-result inspection hook is missing");

for (const expected of [
  "const pageWidth = 148;",
  "const pageHeight = 210;",
  'width="148mm"',
  'height="210mm"',
  'viewBox="0 0 148 210"',
]) {
  assert(renderer.includes(expected), `A5 renderer contract drifted: ${expected}`);
}

const env = canonicalEnv();
const wrapperOutput = execFileSync(
  process.execPath,
  [path.join(root, "tools", "wrapper-retirement-test-v1.cjs")],
  { cwd: root, env, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
);
const wrapperReport = parseLastJsonLine(wrapperOutput, "wrapper retirement test");
assert(wrapperReport.passed === true, "wrapper retirement test did not pass");
assert(wrapperReport.report?.activeGenerateBestOwner === "construction-pipeline-v1", "unexpected production generateBest owner");
assert(wrapperReport.report?.executionOwner === "direct-production-stage-runtime-v2", "unexpected production execution owner");
assert(wrapperReport.report?.rollbackOwner === "legacy-wrapper-chain", "legacy rollback owner is unavailable");

const seed = process.env.SCANWORD_RELEASE_SMOKE_SEED || DEFAULT_RELEASE_SMOKE.seed;
const seedOutput = execFileSync(
  process.execPath,
  [path.join(root, "tools", "construction-pipeline-seed-v1.cjs"), seed],
  { cwd: root, env, encoding: "utf8", timeout: 900000, maxBuffer: 32 * 1024 * 1024 },
);
const result = parseLastJsonLine(seedOutput, "canonical seed smoke");
assert(result.seed === seed, `unexpected smoke seed: ${result.seed}`);
assert(result.mode === "on", `explicit pipeline is not active: ${result.mode}`);
assert(result.frontierMode === "on", `complete frontier is not active: ${result.frontierMode}`);
assert(result.preallocationMode === "off", `Phase 11 research path became active: ${result.preallocationMode}`);
assert(result.valid === true, "canonical smoke seed produced an invalid grid");
assert(result.components === 1, `canonical smoke seed produced ${result.components} answer components`);
assert(result.exactCluesOnly === true, "canonical smoke seed contains a non-exact clue");
assert(!result.constructionV2Error, `canonical smoke seed reported construction error: ${result.constructionV2Error}`);
assert(Number(result.answers) > 0, "canonical smoke seed placed no answers");
assert(Number(result.exactAllocationCalls) > 0, "canonical smoke seed did not exercise exact clue allocation");
assert(result.retirementAudit?.passed === true, "canonical smoke seed lost production ownership audit");

const baselinePinned = seed === DEFAULT_RELEASE_SMOKE.seed;
if (baselinePinned) {
  assert(
    result.gridDigest === DEFAULT_RELEASE_SMOKE.gridDigest,
    `default smoke grid digest drifted: expected ${DEFAULT_RELEASE_SMOKE.gridDigest}, got ${result.gridDigest}`,
  );
  assert(
    result.placedDigest === DEFAULT_RELEASE_SMOKE.placedDigest,
    `default smoke placed digest drifted: expected ${DEFAULT_RELEASE_SMOKE.placedDigest}, got ${result.placedDigest}`,
  );
}

console.log(JSON.stringify({
  passed: true,
  browserScripts: browserScripts.length,
  browserNodeOrderParity: true,
  productionDefaults: requiredDefaults.length,
  uiFailureBoundary: true,
  exportGuards: true,
  renderer: "A5-148x210",
  owners: {
    generateBest: wrapperReport.report.activeGenerateBestOwner,
    execution: wrapperReport.report.executionOwner,
    rollback: wrapperReport.report.rollbackOwner,
  },
  seed: {
    name: result.seed,
    baselinePinned,
    valid: result.valid,
    components: result.components,
    answers: result.answers,
    panels: result.panels,
    exactCluesOnly: result.exactCluesOnly,
    gridDigest: result.gridDigest,
    placedDigest: result.placedDigest,
  },
}));
