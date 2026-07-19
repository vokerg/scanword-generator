"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const seed = process.argv[2] || "selected-grid-clues-sample";
const output = path.resolve(process.argv[3] || path.join(root, "research-output", "selected-grid-clues.svg"));

global.window = global;
Object.assign(process.env, {
  SCANWORD_BULK_LEXICON: "on",
  SCANWORD_CATEGORY_BALANCE: "off",
  SCANWORD_VOCABULARY_PORTFOLIO: "on",
  SCANWORD_VOCABULARY_PORTFOLIO_MODE: "full",
  SCANWORD_VOCABULARY_PORTFOLIO_LIMITS: "2500,3500",
  SCANWORD_CONSTRUCTION_MODE: "portfolio",
  SCANWORD_EDITORIAL_REPAIR: "on",
});

const originalArgv1 = process.argv[1];
process.argv[1] = path.join(__dirname, "benchmark-seed-v3.cjs");
require(path.join(__dirname, "node-benchmark-bootstrap-v1.cjs"));
process.argv[1] = originalArgv1;
require(path.join(root, "construction-selected-grid-clue-metrics-v1.js"));
require(path.join(root, "construction-clue-disambiguation-v1.js"));

const solver = window.ScanwordSolver;
process.env.SCANWORD_SELECTED_GRID_CLUE_DISAMBIGUATION = "off";
const baseline = solver.generateBest(seed, window.RUSSIAN_WORDS.length, 17, 13, 30, 27);
process.env.SCANWORD_SELECTED_GRID_CLUE_DISAMBIGUATION = "on";
const editorial = solver.generateBest(seed, window.RUSSIAN_WORDS.length, 17, 13, 30, 27);

if (!baseline?.validation?.valid || !editorial?.validation?.valid) throw new Error("Sample generation failed validation");
const baselineMetrics = baseline.constructionV2?.selectedGridClues || {};
const editorialMetrics = editorial.constructionV2?.selectedGridClues || {};
if (baselineMetrics.answerSignature !== editorialMetrics.answerSignature
    || baselineMetrics.geometrySignature !== editorialMetrics.geometrySignature) {
  throw new Error("Clue-only sample changed answers or geometry");
}

const changes = editorial.constructionV2?.clueDisambiguation?.changes || [];
const changedSlots = new Set(changes.map((change) => Number(change.slotId)));
const changedCells = new Set();
for (const word of editorial.placed || []) {
  if (changedSlots.has(Number(word.id))) changedCells.add(`${word.clueRow}:${word.clueCol}`);
}

const rows = editorial.grid.length;
const cols = Math.max(...editorial.grid.map((row) => row.length));
const cellSize = 40;
const margin = 34;
const header = 96;
const sideWidth = 710;
const width = margin * 2 + cols * cellSize + sideWidth;
const listLines = Math.max(8, changes.reduce((sum, change) => sum + Math.max(2, Math.ceil((String(change.from).length + String(change.to).length) / 48)), 0));
const height = Math.max(header + margin + rows * cellSize + 48, header + 70 + listLines * 22);

const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function arrowFor(direction) {
  const text = String(direction || "").toLowerCase();
  if (text.includes("right")) return "→";
  if (text.includes("down")) return "↓";
  if (text.includes("left")) return "←";
  if (text.includes("up")) return "↑";
  return "•";
}

function wrap(value, limit = 48) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= limit) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
svg.push(`<rect width="100%" height="100%" fill="#f8fafc"/>`);
svg.push(`<text x="${margin}" y="36" font-family="Arial, DejaVu Sans, sans-serif" font-size="24" font-weight="700" fill="#0f172a">Selected-grid clue disambiguation</text>`);
svg.push(`<text x="${margin}" y="66" font-family="Arial, DejaVu Sans, sans-serif" font-size="14" fill="#475569">seed: ${esc(seed)} · ответы и геометрия идентичны · повторные generic clues: ${baselineMetrics.repeatedGenericClueCount} → ${editorialMetrics.repeatedGenericClueCount}</text>`);

for (let row = 0; row < rows; row += 1) {
  for (let col = 0; col < cols; col += 1) {
    const cell = editorial.grid[row]?.[col] || null;
    const x = margin + col * cellSize;
    const y = header + row * cellSize;
    const key = `${row}:${col}`;
    const char = String(cell?.char || "").trim();
    const clues = Array.isArray(cell?.clues) ? cell.clues : [];
    let fill = "#cbd5e1";
    if (char) fill = "#ffffff";
    else if (clues.length) fill = changedCells.has(key) ? "#fef3c7" : "#dbe4ee";
    svg.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${fill}" stroke="#94a3b8" stroke-width="1"/>`);
    if (char) {
      svg.push(`<text x="${x + cellSize / 2}" y="${y + cellSize / 2 + 9}" text-anchor="middle" font-family="Arial, DejaVu Sans, sans-serif" font-size="25" font-weight="700" fill="#0f172a">${esc(char)}</text>`);
    } else if (clues.length) {
      const symbols = clues.slice(0, 3).map((clue) => arrowFor(clue.direction)).join("");
      svg.push(`<text x="${x + cellSize / 2}" y="${y + cellSize / 2 + 6}" text-anchor="middle" font-family="Arial, DejaVu Sans, sans-serif" font-size="17" font-weight="700" fill="#334155">${esc(symbols)}</text>`);
    }
  }
}

const sideX = margin + cols * cellSize + 32;
let ty = header + 4;
svg.push(`<text x="${sideX}" y="${ty}" font-family="Arial, DejaVu Sans, sans-serif" font-size="20" font-weight="700" fill="#0f172a">Изменённые подсказки (${changes.length})</text>`);
ty += 32;
if (!changes.length) {
  svg.push(`<text x="${sideX}" y="${ty}" font-family="Arial, DejaVu Sans, sans-serif" font-size="15" fill="#64748b">На этом seed повторных generic-подсказок нет.</text>`);
} else {
  for (const change of changes) {
    svg.push(`<text x="${sideX}" y="${ty}" font-family="Arial, DejaVu Sans, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${esc(change.answer)} · ${esc(change.kind)}</text>`);
    ty += 21;
    for (const line of wrap(`Было: ${change.from}`)) {
      svg.push(`<text x="${sideX + 12}" y="${ty}" font-family="Arial, DejaVu Sans, sans-serif" font-size="14" fill="#64748b">${esc(line)}</text>`);
      ty += 19;
    }
    for (const line of wrap(`Стало: ${change.to}`)) {
      svg.push(`<text x="${sideX + 12}" y="${ty}" font-family="Arial, DejaVu Sans, sans-serif" font-size="14" fill="#334155">${esc(line)}</text>`);
      ty += 19;
    }
    svg.push(`<text x="${sideX + 12}" y="${ty}" font-family="Arial, DejaVu Sans, sans-serif" font-size="12" fill="#64748b">раскрыто букв: ${change.revealedLetters}; доля: ${change.revealFraction}</text>`);
    ty += 27;
  }
}

svg.push(`<text x="${margin}" y="${height - 18}" font-family="Arial, DejaVu Sans, sans-serif" font-size="12" fill="#64748b">Жёлтые стрелочные клетки получили новую подсказку; буквы, ответы, панели и пересечения не менялись.</text>`);
svg.push("</svg>");

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, svg.join("\n"), "utf8");
console.log(JSON.stringify({
  seed,
  output,
  valid: editorial.validation.valid,
  changedClues: changes.length,
  repeatedGenericBefore: baselineMetrics.repeatedGenericClueCount,
  repeatedGenericAfter: editorialMetrics.repeatedGenericClueCount,
  answerSignatureStable: baselineMetrics.answerSignature === editorialMetrics.answerSignature,
  geometrySignatureStable: baselineMetrics.geometrySignature === editorialMetrics.geometrySignature,
}));
