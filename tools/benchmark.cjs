"use strict";

const path = require("node:path");

const root = path.resolve(__dirname, "..");
global.window = global;

require(path.join(root, "words.js"));
require(path.join(root, "short-words.js"));
require(path.join(root, "clues.js"));
require(path.join(root, "extra-dictionary.js"));
require(path.join(root, "core.js"));
require(path.join(root, "dictionary-policy.js"));
require(path.join(root, "solver.js"));

const samples = [];
const started = Date.now();
const poolSize = window.RUSSIAN_WORDS.length;
const runCount = 40;

for (let index = 0; index < runCount; index += 1) {
  const seed = `regression-${index}`;
  const result = window.ScanwordSolver.generateBest(seed, poolSize, 17, 13, 28, 27);
  const validation = result.validation;
  if (!validation.valid) {
    throw new Error(`Invalid grid for seed ${seed}: ${JSON.stringify(validation)}`);
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
console.log({
  dictionarySize: poolSize,
  runs: samples.length,
  valid: samples.length,
  exactCluesOnly: true,
  minAnswers: Math.min(...answers),
  maxAnswers: Math.max(...answers),
  averageAnswers: +(answers.reduce((sum, value) => sum + value, 0) / answers.length).toFixed(2),
  minActivePercent: Math.min(...active),
  maxActivePercent: Math.max(...active),
  elapsedMs: Date.now() - started,
});
