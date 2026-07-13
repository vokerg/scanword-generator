"use strict";

const path = require("node:path");
const root = path.resolve(__dirname, "..");
global.window = global;

for (const file of [
  "words.js",
  "short-words.js",
  "clues.js",
  "extra-dictionary.js",
  "two-letter-words.js",
  "core.js",
  "dictionary-policy.js",
  "solver.js",
]) require(path.join(root, file));

const seed = process.argv[2];
if (!seed) throw new Error("A seed argument is required.");

const result = window.ScanwordSolver.generateBest(seed, window.RUSSIAN_WORDS.length, 17, 13, 30, 27);
const poolIndex = window.ScanwordSolver.buildPoolIndex(result.pool);
const directions = {
  right: { dr: 0, dc: 1, sides: [[-1, 0], [1, 0]] },
  down: { dr: 1, dc: 0, sides: [[0, -1], [0, 1]] },
};
const inBounds = (row, col) => row >= 0 && row < result.rows && col >= 0 && col < result.cols;
const used = new Set(result.placed.map((entry) => entry.answer));
const demands = [];

for (const [direction, vector] of Object.entries(directions)) {
  const { dr, dc, sides } = vector;
  for (let startRow = 0; startRow < result.rows; startRow += 1) {
    for (let startCol = 0; startCol < result.cols; startCol += 1) {
      const clueRow = startRow - dr;
      const clueCol = startCol - dc;
      if (!inBounds(clueRow, clueCol)) continue;
      const clueCell = result.grid[clueRow][clueCol];
      if (clueCell.type === "letter" || clueCell.type === "clueText" || clueCell.type === "clueTextContinuation") continue;
      if (clueCell.type === "clue" && (clueCell.clues.length >= 2 || clueCell.clues.some((clue) => clue.direction === direction))) continue;

      for (let length = 2; length <= 12; length += 1) {
        const endRow = startRow + dr * (length - 1);
        const endCol = startCol + dc * (length - 1);
        if (!inBounds(endRow, endCol)) break;
        const afterRow = endRow + dr;
        const afterCol = endCol + dc;
        if (inBounds(afterRow, afterCol) && result.grid[afterRow][afterCol].type === "letter") continue;

        const cells = [];
        let blocked = false;
        let panelCount = 0;
        let fixedCount = 0;
        let pattern = "";
        for (let index = 0; index < length; index += 1) {
          const row = startRow + dr * index;
          const col = startCol + dc * index;
          const cell = result.grid[row][col];
          if (cell.type === "letter") {
            if (cell.directions.includes(direction) || cell.directions.length >= 2) { blocked = true; break; }
            pattern += cell.char;
            fixedCount += 1;
          } else if (cell.type === "panel") {
            for (const [sideDr, sideDc] of sides) {
              const sideRow = row + sideDr;
              const sideCol = col + sideDc;
              if (inBounds(sideRow, sideCol) && result.grid[sideRow][sideCol].type === "letter") { blocked = true; break; }
            }
            if (blocked) break;
            pattern += "?";
            panelCount += 1;
          } else { blocked = true; break; }
          cells.push({ row, col });
        }
        if (blocked || panelCount === 0 || fixedCount === 0) continue;

        const matches = (poolIndex.byLength.get(length) || []).filter((entry) => {
          if (used.has(entry.answer)) return false;
          for (let index = 0; index < length; index += 1) {
            if (pattern[index] !== "?" && pattern[index] !== entry.answer[index]) return false;
          }
          return true;
        });
        if (matches.length > 5) continue;
        demands.push({
          direction,
          pattern,
          length,
          panels: panelCount,
          fixed: fixedCount,
          matches: matches.length,
          examples: matches.slice(0, 5).map((entry) => entry.answer),
          clueRow,
          clueCol,
          startRow,
          startCol,
          cells,
        });
      }
    }
  }
}

console.log(JSON.stringify({
  seed,
  panelCells: result.panelCells,
  activePercent: +(result.fillRatio * 100).toFixed(1),
  demands,
}));
