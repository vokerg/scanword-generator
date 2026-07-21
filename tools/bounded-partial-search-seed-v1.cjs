"use strict";

const crypto = require("node:crypto");

if (!global.window?.ScanwordSolver || !global.window?.RUSSIAN_WORDS) {
  throw new Error("Run with tools/node-benchmark-bootstrap-v1.cjs preloaded through NODE_OPTIONS");
}

const seed = process.argv[2];
if (!seed) throw new Error("A seed argument is required");

function resultDigest(result) {
  const payload = {
    rows: result.rows,
    cols: result.cols,
    grid: result.grid.map((row) => row.map((cell) => ({
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
        textCells: (clue.textCells || []).map((target) => [target.row, target.col]),
      })),
    }))),
    placed: result.placed.map((word) => ({
      id: word.id,
      answer: word.answer,
      clue: word.clue,
      hasExactClue: Boolean(word.hasExactClue),
      direction: word.direction,
      clueRow: word.clueRow,
      clueCol: word.clueCol,
      startRow: word.startRow,
      startCol: word.startCol,
      cells: word.cells.map((cell) => [cell.row, cell.col]),
    })),
    clueFootprints: (result.clueFootprints || []).map((footprint) => ({
      slotId: footprint.slotId,
      arrowRow: footprint.arrowRow,
      arrowCol: footprint.arrowCol,
      cells: footprint.cells.map((cell) => [cell.row, cell.col]),
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

const started = Date.now();
const result = window.ScanwordSolver.generateBest(seed, window.RUSSIAN_WORDS.length, 17, 13, 30, 27);
const editorial = window.ScanwordEditorialLexicalPolicyV3.summarize(result.placed);
const metrics = window.ScanwordSolver.resultMetrics(result);

console.log(JSON.stringify({
  schemaVersion: 1,
  seed,
  mode: process.env.SCANWORD_PARTIAL_SEARCH || "off",
  elapsedMs: Date.now() - started,
  resultDigest: resultDigest(result),
  valid: Boolean(result.validation?.valid && metrics.validation?.valid),
  components: Number(result.components || metrics.components || 0),
  exactCluesOnly: result.placed.every((entry) => entry.hasExactClue),
  coverageCheckpointPassed: Boolean(result.coverageCheckpoint?.passed),
  panels: Number(result.panelCells || metrics.panelCells || 0),
  answers: result.placed.length,
  crossings: Number(result.intersections || metrics.intersections || 0),
  rawLetterPercent: +(Number(result.rawLetterCoverage || 0) * 100).toFixed(4),
  answerCoveragePercent: +(Number(result.answerCoverage || 0) * 100).toFixed(4),
  clueTextCells: Number(result.clueTextCells || metrics.clueTextCells || 0),
  externalClues: Number(result.externalClueTexts || 0),
  twoLetterCount: Number(editorial.twoLetterCount || 0),
  formulaicShortCount: Number(editorial.formulaicShortCount || 0),
  editorialPenalty: Number(editorial.editorialPenalty || 0),
  selectedLimit: Number(result.constructionV2?.vocabularyPortfolio?.selectedLimit || 0),
  partialSearch: result.partialSearch || null,
}));
