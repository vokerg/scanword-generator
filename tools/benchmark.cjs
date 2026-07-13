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

const samples = [];
const started = Date.now();
const poolSize = window.RUSSIAN_WORDS.length;
const runCount = 40;

for (let index = 0; index < runCount; index += 1) {
  const seed = `regression-${index}`;
  const result = window.ScanwordSolver.generateBest(seed, poolSize, 17, 13, 30, 27);
  const validation = result.validation;

  if (!validation.valid) {
    throw new Error(`Invalid grid for seed ${seed}: ${JSON.stringify(validation)}`);
  }
  if (result.placed.length < 40) {
    throw new Error(`Answer coverage missed for seed ${seed}: ${result.placed.length}/40`);
  }
  if (result.components > 6) {
    throw new Error(`Too many answer components for seed ${seed}: ${result.components}`);
  }
  if (result.fillRatio < 0.65) {
    throw new Error(`Active-cell coverage missed for seed ${seed}: ${Math.round(result.fillRatio * 100)}%`);
  }
  if (result.placed.some((entry) => !entry.hasExactClue)) {
    throw new Error(`Fallback clue used for seed ${seed}`);
  }

  samples.push({
    seed,
    answers: result.placed.length,
    crossings: result.intersections,
    activePercent: Math.round(result.fillRatio * 100),
    panelCells: result.panelCells,
    components: result.components,
    attempt: result.attempt + 1,
  });
}

console.table(samples);
const answers = samples.map((sample) => sample.answers);
const active = samples.map((sample) => sample.activePercent);
const crossings = samples.map((sample) => sample.crossings);
console.log({
  dictionarySize: poolSize,
  runs: samples.length,
  valid: samples.length,
  exactCluesOnly: true,
  maxComponentsAllowed: 6,
  minAnswers: Math.min(...answers),
  maxAnswers: Math.max(...answers),
  averageAnswers: +(answers.reduce((sum, value) => sum + value, 0) / answers.length).toFixed(2),
  minActivePercent: Math.min(...active),
  maxActivePercent: Math.max(...active),
  averageActivePercent: +(active.reduce((sum, value) => sum + value, 0) / active.length).toFixed(2),
  averageCrossings: +(crossings.reduce((sum, value) => sum + value, 0) / crossings.length).toFixed(2),
  elapsedMs: Date.now() - started,
});
