"use strict";

const path = require("node:path");

const root = path.resolve(__dirname, "..");
global.window = global;

require(path.join(root, "words.js"));
require(path.join(root, "short-words.js"));
require(path.join(root, "clues.js"));
require(path.join(root, "core.js"));
require(path.join(root, "solver.js"));

const samples = [];
const started = Date.now();

for (let index = 0; index < 20; index += 1) {
  const result = window.ScanwordSolver.generateBest(`regression-${index}`, 500, 17, 13, 28, 27);
  const validation = result.validation;
  if (!validation.valid) {
    throw new Error(`Invalid grid for seed regression-${index}: ${JSON.stringify(validation)}`);
  }

  samples.push({
    seed: `regression-${index}`,
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
  runs: samples.length,
  valid: samples.length,
  minAnswers: Math.min(...answers),
  maxAnswers: Math.max(...answers),
  averageAnswers: +(answers.reduce((sum, value) => sum + value, 0) / answers.length).toFixed(2),
  minActivePercent: Math.min(...active),
  maxActivePercent: Math.max(...active),
  elapsedMs: Date.now() - started,
});
