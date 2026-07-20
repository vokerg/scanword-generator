"use strict";

const crypto = require("node:crypto");

const seed = process.argv[2];
if (!seed) throw new Error("A seed argument is required");

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedGrid(result) {
  return result.grid.map((row) => row.map((cell) => ({
    type: cell.type,
    char: cell.char || null,
    slotIds: [...(cell.slotIds || [])],
    directions: [...(cell.directions || [])],
    footprintId: cell.footprintId || null,
    clues: (cell.clues || []).map((clue) => ({
      slotId: clue.slotId,
      direction: clue.direction,
      text: clue.text,
      answer: clue.answer,
      textRow: clue.textRow ?? null,
      textCol: clue.textCol ?? null,
      externalText: Boolean(clue.externalText),
      textCells: (clue.textCells || []).map(({ row: clueRow, col: clueCol }) => ({ row: clueRow, col: clueCol })),
    })),
  })));
}

function normalizedPlaced(result) {
  return result.placed.map((word) => ({
    id: word.id,
    answer: word.answer,
    clue: word.clue,
    hasExactClue: Boolean(word.hasExactClue),
    direction: word.direction,
    length: word.length,
    clueRow: word.clueRow,
    clueCol: word.clueCol,
    startRow: word.startRow,
    startCol: word.startCol,
    cells: (word.cells || []).map(({ row, col }) => ({ row, col })),
    intersections: word.intersections,
  }));
}

const started = Date.now();
const result = global.ScanwordSolver.generateBest(seed, global.RUSSIAN_WORDS.length, 17, 13, 30, 27);
const grid = normalizedGrid(result);
const placed = normalizedPlaced(result);
const cluePayload = placed.map(({ answer, clue, hasExactClue }) => ({ answer, clue, hasExactClue }));
const summary = {
  seed,
  mode: String(process.env.SCANWORD_EXPLICIT_PIPELINE || "off").toLowerCase(),
  elapsedMs: Date.now() - started,
  valid: Boolean(result.validation?.valid),
  components: Number(result.components || 0),
  panels: Number(result.panelCells || 0),
  answers: placed.length,
  crossings: Number(result.intersections || 0),
  exactCluesOnly: placed.every((entry) => entry.hasExactClue),
  gridDigest: digest(grid),
  placedDigest: digest(placed),
  clueDigest: digest(cluePayload),
  geometryDigest: digest({
    grid: grid.map((row) => row.map((cell) => ({
      type: cell.type,
      char: cell.char,
      slotIds: cell.slotIds,
      directions: cell.directions,
      footprintId: cell.footprintId,
    }))),
    placed: placed.map(({ id, answer, direction, clueRow, clueCol, startRow, startCol, cells }) => ({
      id, answer, direction, clueRow, clueCol, startRow, startCol, cells,
    })),
  }),
  pipeline: result.constructionPipelineV1 || null,
};
console.log(JSON.stringify(summary));
