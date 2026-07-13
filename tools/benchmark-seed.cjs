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
]) {
  require(path.join(root, file));
}

const seed = process.argv[2];
if (!seed) throw new Error("A seed argument is required.");

const started = Date.now();
const result = window.ScanwordSolver.generateBest(seed, window.RUSSIAN_WORDS.length, 17, 13, 30, 27);
console.log(JSON.stringify({
  seed,
  elapsedMs: Date.now() - started,
  validation: result.validation,
  answers: result.placed.length,
  crossings: result.intersections,
  activePercent: +(result.fillRatio * 100).toFixed(1),
  answerPercent: +(result.answerCoverage * 100).toFixed(1),
  panelCells: result.panelCells,
  components: result.components,
  clueTextCells: result.clueTextCells,
  externalClues: result.externalClueTexts,
  selectedAttempt: result.attempt + 1,
  attemptsUsed: result.attemptBudget,
  exactCluesOnly: result.placed.every((entry) => entry.hasExactClue),
  coverageCheckpointPassed: Boolean(result.coverageCheckpoint?.passed),
}));
