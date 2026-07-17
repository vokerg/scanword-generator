"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
global.window = global;

Object.assign(process.env, {
  SCANWORD_CONSTRUCTION_MODE: "portfolio",
  SCANWORD_CLOSED_FILL: "diagnostic",
  SCANWORD_PORTFOLIO_SELECTION: "panel-first",
  SCANWORD_LEXICAL_PLACEMENT: "off",
  SCANWORD_EDITORIAL_REPAIR: "on",
  SCANWORD_EDITORIAL_REPLACE: "off",
  SCANWORD_EDITORIAL_PAIR_REFIT: "off",
  SCANWORD_EDITORIAL_BUNDLE_REFIT: "off",
});

for (const file of [
  "words.js",
  "short-words.js",
  "clues.js",
  "extra-dictionary.js",
  "two-letter-words.js",
  "core.js",
  "dictionary-policy.js",
  "lexical-policy-v2.js",
  "editorial-lexical-policy-v3.js",
  "solver.js",
  "construction-lexical-placement-v3.js",
  "closed-fill.js",
  "closed-fill-rollback.js",
  "construction-v2-runtime.js",
  "construction-v2.js",
  "construction-victim.js",
  "construction-victim-depth2.js",
  "construction-portfolio-v3.js",
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
  "construction-editorial-replace-v3.js",
  "construction-editorial-pair-refit-v3.js",
  "construction-editorial-bundle-refit-v3.js",
  "construction-editorial-repair-v3.js",
]) require(path.join(root, file));

const seed = process.argv[2] || "editorial-replacement-1";
const output = path.resolve(process.argv[3] || path.join(root, "research-output", "filled-sample.svg"));
const solver = window.ScanwordSolver;
const result = solver.generateBest(seed, window.RUSSIAN_WORDS.length, 17, 13, 30, 27);

if (!result?.validation?.valid) throw new Error(`Generated grid is invalid: ${JSON.stringify(result?.validation)}`);

const repairedSlotIds = new Set();
const transitions = [];
const replacement = result.constructionV2?.editorialReplacement;
for (const item of replacement?.replacements || []) {
  repairedSlotIds.add(Number(item.slotId));
  transitions.push(`${item.from} → ${item.to}`);
}
const pair = result.constructionV2?.editorialPairRefit;
for (const item of pair?.replacements || []) {
  repairedSlotIds.add(Number(item.targetSlotId));
  repairedSlotIds.add(Number(item.partnerSlotId));
  transitions.push(`${item.targetFrom} → ${item.targetTo}`);
  transitions.push(`${item.partnerFrom} → ${item.partnerTo}`);
}
const bundle = result.constructionV2?.editorialBundleRefit;
for (const item of bundle?.replacements || []) {
  for (const id of item.slotIds || []) repairedSlotIds.add(Number(id));
  const from = item.from || [];
  const to = item.to || [];
  for (let index = 0; index < to.length; index += 1) transitions.push(`${from[index] || "?"} → ${to[index]}`);
}

const repairedCells = new Set();
for (const word of result.placed || []) {
  if (!repairedSlotIds.has(Number(word.id))) continue;
  for (const cell of word.cells || []) repairedCells.add(`${cell.row}:${cell.col}`);
}

const rows = result.grid.length;
const cols = Math.max(...result.grid.map((row) => row.length));
const cellSize = 46;
const margin = 38;
const header = 92;
const sideWidth = 340;
const width = margin * 2 + cols * cellSize + sideWidth;
const height = header + margin + rows * cellSize + 52;

const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const arrowFor = (direction) => {
  const text = String(direction || "").toLowerCase();
  if (text.includes("right") || text === "e") return "→";
  if (text.includes("left") || text === "w") return "←";
  if (text.includes("down-right") || text.includes("southeast") || text === "se") return "↘";
  if (text.includes("down-left") || text.includes("southwest") || text === "sw") return "↙";
  if (text.includes("up-right") || text.includes("northeast") || text === "ne") return "↗";
  if (text.includes("up-left") || text.includes("northwest") || text === "nw") return "↖";
  if (text.includes("down") || text === "s") return "↓";
  if (text.includes("up") || text === "n") return "↑";
  return "•";
};

const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
svg.push(`<rect width="100%" height="100%" fill="#f8fafc"/>`);
svg.push(`<text x="${margin}" y="38" font-family="Arial, DejaVu Sans, sans-serif" font-size="25" font-weight="700" fill="#0f172a">Заполненный пример после editorial repair</text>`);
svg.push(`<text x="${margin}" y="68" font-family="Arial, DejaVu Sans, sans-serif" font-size="15" fill="#475569">seed: ${esc(seed)} · ответов: ${result.placed.length} · панелей: ${result.panelCells} · формульных коротких: ${result.constructionV2?.editorialRepair?.after?.formulaicShortCount ?? "?"}</text>`);

for (let row = 0; row < rows; row += 1) {
  for (let col = 0; col < cols; col += 1) {
    const cell = result.grid[row]?.[col] || null;
    const x = margin + col * cellSize;
    const y = header + row * cellSize;
    const key = `${row}:${col}`;
    const char = String(cell?.char || "").trim();
    const clues = Array.isArray(cell?.clues) ? cell.clues : [];
    let fill = "#1e293b";
    let stroke = "#94a3b8";
    if (char) fill = repairedCells.has(key) ? "#d1fae5" : "#ffffff";
    else if (clues.length) fill = "#dbe4ee";
    else if (String(cell?.type || "").toLowerCase().includes("panel")) fill = "#cbd5e1";
    svg.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`);
    if (char) {
      svg.push(`<text x="${x + cellSize / 2}" y="${y + cellSize / 2 + 10}" text-anchor="middle" font-family="Arial, DejaVu Sans, sans-serif" font-size="28" font-weight="700" fill="#0f172a">${esc(char)}</text>`);
    } else if (clues.length) {
      const symbols = clues.slice(0, 3).map((clue) => arrowFor(clue.direction)).join("");
      svg.push(`<text x="${x + cellSize / 2}" y="${y + cellSize / 2 + 7}" text-anchor="middle" font-family="Arial, DejaVu Sans, sans-serif" font-size="18" font-weight="700" fill="#334155">${esc(symbols)}</text>`);
    }
  }
}

const sideX = margin + cols * cellSize + 34;
svg.push(`<text x="${sideX}" y="${header + 10}" font-family="Arial, DejaVu Sans, sans-serif" font-size="20" font-weight="700" fill="#0f172a">Что изменил repair</text>`);
svg.push(`<rect x="${sideX}" y="${header + 26}" width="18" height="18" rx="2" fill="#d1fae5" stroke="#94a3b8"/>`);
svg.push(`<text x="${sideX + 28}" y="${header + 41}" font-family="Arial, DejaVu Sans, sans-serif" font-size="14" fill="#475569">ячейки изменённых слов</text>`);

const uniqueTransitions = [...new Set(transitions)];
let ty = header + 82;
for (const transition of uniqueTransitions.slice(0, 16)) {
  svg.push(`<text x="${sideX}" y="${ty}" font-family="Arial, DejaVu Sans, sans-serif" font-size="18" fill="#0f172a">${esc(transition)}</text>`);
  ty += 29;
}
if (uniqueTransitions.length > 16) {
  svg.push(`<text x="${sideX}" y="${ty}" font-family="Arial, DejaVu Sans, sans-serif" font-size="15" fill="#64748b">…ещё ${uniqueTransitions.length - 16}</text>`);
  ty += 28;
}

const stages = result.constructionV2?.editorialRepair?.stages || [];
ty += 16;
svg.push(`<text x="${sideX}" y="${ty}" font-family="Arial, DejaVu Sans, sans-serif" font-size="18" font-weight="700" fill="#0f172a">Принятые операции</text>`);
ty += 28;
for (const stage of stages.filter((stage) => Number(stage.accepted || 0) > 0)) {
  svg.push(`<text x="${sideX}" y="${ty}" font-family="Arial, DejaVu Sans, sans-serif" font-size="15" fill="#475569">${esc(stage.name)}: ${Number(stage.accepted || 0)}</text>`);
  ty += 23;
}

svg.push(`<text x="${margin}" y="${height - 18}" font-family="Arial, DejaVu Sans, sans-serif" font-size="13" fill="#64748b">Белые клетки — буквы; зелёные — слова, заменённые без изменения геометрии; серые — служебные/стрелочные клетки.</text>`);
svg.push(`</svg>`);

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, svg.join("\n"), "utf8");
console.log(JSON.stringify({ seed, output, rows, cols, transitions: uniqueTransitions, valid: result.validation.valid }));
