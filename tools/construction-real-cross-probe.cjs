"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const worker = path.join(__dirname, "benchmark-seed.cjs");
const seed = process.argv[2] || "construction-checkpoint-40";
const env = {
  ...process.env,
  SCANWORD_CONSTRUCTION_MODE: "portfolio",
  SCANWORD_CLOSED_FILL: "diagnostic",
  SCANWORD_ZERO_PANEL_PASS: "1",
  SCANWORD_PORTFOLIO_ATTEMPTS: process.env.SCANWORD_PORTFOLIO_ATTEMPTS || "240",
  SCANWORD_PORTFOLIO_CLUE_RESTARTS: process.env.SCANWORD_PORTFOLIO_CLUE_RESTARTS || "160",
  SCANWORD_VICTIM_BASES: process.env.SCANWORD_VICTIM_BASES || "8",
  SCANWORD_VICTIM_VARIANTS: process.env.SCANWORD_VICTIM_VARIANTS || "6",
  SCANWORD_VICTIM_SECONDARY_WORDS: process.env.SCANWORD_VICTIM_SECONDARY_WORDS || "3",
  SCANWORD_VICTIM_SECONDARY_VARIANTS: process.env.SCANWORD_VICTIM_SECONDARY_VARIANTS || "4",
  SCANWORD_VICTIM_SECONDARY_FINALISTS: process.env.SCANWORD_VICTIM_SECONDARY_FINALISTS || "6",
  SCANWORD_TARGETED_VICTIM_REGIONS: process.env.SCANWORD_TARGETED_VICTIM_REGIONS || "3",
  SCANWORD_TARGETED_VICTIM_WORDS: process.env.SCANWORD_TARGETED_VICTIM_WORDS || "4",
  SCANWORD_TARGETED_VICTIM_DEPTH: process.env.SCANWORD_TARGETED_VICTIM_DEPTH || "2",
  SCANWORD_TARGETED_EXACT_VARIANTS: process.env.SCANWORD_TARGETED_EXACT_VARIANTS || "4",
  SCANWORD_TARGETED_EXACT_REPACK_NODES: process.env.SCANWORD_TARGETED_EXACT_REPACK_NODES || "120000",
  SCANWORD_REPACK_NODES: process.env.SCANWORD_REPACK_NODES || "600000",
  SCANWORD_REPACK_BRANCH: process.env.SCANWORD_REPACK_BRANCH || "24",
};
const child = spawnSync(process.execPath, [worker, seed], {
  cwd: root,
  env,
  encoding: "utf8",
  timeout: 360_000,
  maxBuffer: 8 * 1024 * 1024,
});
if (child.error) throw child.error;
if (child.status !== 0) throw new Error(child.stderr || child.stdout || `${seed}: benchmark failed`);
const sample = JSON.parse(child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
const exact = sample.constructionV2?.targetedExactVictim || null;
console.log(JSON.stringify({
  seed,
  panels: sample.panelCells,
  answers: sample.answers,
  elapsedMs: sample.elapsedMs,
  validation: sample.validation,
  components: sample.components,
  exactAccepted: Boolean(exact?.accepted),
  selected: exact?.selected || null,
  relaxedRollbackCross: exact?.search?.relaxedRollbackCross || null,
}));
