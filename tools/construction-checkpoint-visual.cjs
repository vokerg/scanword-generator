"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const reportPath = path.resolve(process.argv[2] || "construction-checkpoint.jsonl");
const outputDir = path.resolve(process.argv[3] || "construction-checkpoint-visual");
if (!fs.existsSync(reportPath)) throw new Error(`Checkpoint report not found: ${reportPath}`);
fs.mkdirSync(outputDir, { recursive: true });

global.window = global;
for (const file of [
  "words.js", "short-words.js", "clues.js", "extra-dictionary.js", "two-letter-words.js",
  "core.js", "dictionary-policy.js", "lexical-policy-v2.js", "solver.js", "closed-fill.js",
  "closed-fill-rollback.js", "construction-v2-runtime.js", "construction-v2.js",
  "construction-victim.js", "construction-victim-depth2.js", "construction-portfolio.js",
  "construction-polish.js", "construction-clue-repack.js", "construction-clue-adaptive.js",
  "construction-clue-tail.js", "construction-clue-reflow.js", "construction-clue-pair-reflow.js",
  "targeted-short-fill.js", "construction-victim-targeted.js", "construction-victim-targeted-demand.js",
  "construction-victim-targeted-pair.js", "construction-victim-targeted-disconnected.js",
  "construction-victim-targeted-exact.js", "construction-guard.js", "renderer.js",
]) require(path.join(root, file));

const rows = fs.readFileSync(reportPath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map(JSON.parse);
const samples = rows.filter((row) => row.type === "seed");
const summary = rows.find((row) => row.type === "summary");
if (!samples.length || !summary) throw new Error("Checkpoint report has no samples or summary.");

const selected = [...samples].sort((a, b) => {
  const exactDelta = Number(Boolean(b.targetedExactVictimAccepted)) - Number(Boolean(a.targetedExactVictimAccepted));
  if (exactDelta) return exactDelta;
  const exactGain = Number(b.targetedExactVictimGain || 0) - Number(a.targetedExactVictimGain || 0);
  if (exactGain) return exactGain;
  const targetedDelta = Number(Boolean(b.targetedVictimAccepted)) - Number(Boolean(a.targetedVictimAccepted));
  if (targetedDelta) return targetedDelta;
  const targetedGain = Number(b.targetedVictimGain || 0) - Number(a.targetedVictimGain || 0);
  if (targetedGain) return targetedGain;
  return b.panels - a.panels || a.index - b.index;
})[0];
if (!selected) throw new Error("No checkpoint sample selected for visualization.");

const previousMode = process.env.SCANWORD_CONSTRUCTION_MODE;
const previousClosedFill = process.env.SCANWORD_CLOSED_FILL;
process.env.SCANWORD_CONSTRUCTION_MODE = "portfolio";
process.env.SCANWORD_CLOSED_FILL = "diagnostic";
let result;
try {
  result = window.ScanwordSolver.generateBest(selected.seed, window.RUSSIAN_WORDS.length, 17, 13, 30, 27);
} finally {
  if (previousMode === undefined) delete process.env.SCANWORD_CONSTRUCTION_MODE;
  else process.env.SCANWORD_CONSTRUCTION_MODE = previousMode;
  if (previousClosedFill === undefined) delete process.env.SCANWORD_CLOSED_FILL;
  else process.env.SCANWORD_CLOSED_FILL = previousClosedFill;
}

if (!result.validation?.valid) throw new Error(`Rendered checkpoint seed is invalid: ${selected.seed}`);
if (result.components !== 1) throw new Error(`Rendered checkpoint seed is disconnected: ${selected.seed}`);
if (!result.placed.every((entry) => entry.hasExactClue)) throw new Error(`Rendered checkpoint seed contains a fallback clue: ${selected.seed}`);
if (result.panelCells !== selected.panels) {
  throw new Error(`Checkpoint reproduction mismatch for ${selected.seed}: report=${selected.panels}, render=${result.panelCells}`);
}

const puzzleName = "checkpoint-puzzle.svg";
const answerName = "checkpoint-answers.svg";
fs.writeFileSync(path.join(outputDir, puzzleName), window.ScanwordRenderer.renderSvg(result, false));
fs.writeFileSync(path.join(outputDir, answerName), window.ScanwordRenderer.renderSvg(result, true));

const metadata = {
  seed: selected.seed,
  panels: result.panelCells,
  rawLetterPercent: selected.rawLetterPercent,
  answers: result.placed.length,
  exactTargetedAccepted: Boolean(selected.targetedExactVictimAccepted),
  exactTargetedGain: Number(selected.targetedExactVictimGain || 0),
  exactTargetedVictim: selected.targetedExactSelectedVictim || null,
  targetedAccepted: Boolean(selected.targetedVictimAccepted),
  targetedGain: Number(selected.targetedVictimGain || 0),
  targetedVictim: selected.targetedSelectedVictim || null,
  checkpoint: summary,
};
fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(metadata, null, 2));

const escaped = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>100-seed checkpoint scanword</title><style>body{font-family:Arial,sans-serif;background:#f2f4f7;color:#172033;margin:0;padding:24px}.shell{max-width:1320px;margin:auto}.hero,.card{background:white;border:1px solid #e4e7ec;border-radius:16px;padding:18px;margin-bottom:18px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pair img{width:100%;height:auto}.stats{display:flex;gap:12px;flex-wrap:wrap}.stat{background:#f8fafc;border-radius:10px;padding:10px 14px}@media(max-width:850px){.pair{grid-template-columns:1fr}}</style></head><body><main class="shell"><section class="hero"><h1>Готовый сканворд из enforced 100-seed checkpoint</h1><p>Seed <code>${escaped(selected.seed)}</code>. Панели: <strong>${result.panelCells}</strong>. Ответов: <strong>${result.placed.length}</strong>.</p><div class="stats"><div class="stat">Exact targeted: ${selected.targetedExactVictimAccepted ? `принят, gain ${Number(selected.targetedExactVictimGain || 0)}, victim ${escaped(selected.targetedExactSelectedVictim || "—")}` : "не принят"}</div><div class="stat">Среднее checkpoint: ${summary.averagePanels}</div><div class="stat">Максимум checkpoint: ${summary.maximumPanels}</div></div></section><section class="card pair"><div><h2>Игровая версия</h2><img src="${puzzleName}" alt="Сканворд без ответов"></div><div><h2>Контрольная версия</h2><img src="${answerName}" alt="Сканворд с ответами"></div></section></main></body></html>`;
fs.writeFileSync(path.join(outputDir, "index.html"), html);

console.log(JSON.stringify({ outputDir, puzzle: puzzleName, answers: answerName, metadata }));
