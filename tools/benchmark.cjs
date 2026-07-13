"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const seedRunner = path.join(__dirname, "benchmark-seed.cjs");
const samples = [];
const started = Date.now();
const runCount = 40;

for (let index = 0; index < runCount; index += 1) {
  const seed = `regression-${index}`;
  const child = spawnSync(process.execPath, [seedRunner, seed], {
    cwd: root,
    encoding: "utf8",
    timeout: 90_000,
    maxBuffer: 1024 * 1024,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`Seed runner failed for ${seed}: ${child.stderr || child.stdout}`);
  }
  const lines = child.stdout.trim().split(/\r?\n/).filter(Boolean);
  const sample = JSON.parse(lines.at(-1));
  const validation = sample.validation;

  if (!validation.valid) throw new Error(`Invalid grid for seed ${seed}: ${JSON.stringify(validation)}`);
  if (sample.answers < 40) throw new Error(`Answer count missed for seed ${seed}: ${sample.answers}/40`);
  if (sample.components !== 1) throw new Error(`Grid is not one connected answer component for seed ${seed}: ${sample.components}`);
  if (sample.activePercent < 90) throw new Error(`Active-cell coverage missed for seed ${seed}: ${sample.activePercent}%`);
  if (sample.answerPercent < 65) throw new Error(`Answer-space coverage missed for seed ${seed}: ${sample.answerPercent}%`);
  if (sample.panelCells > 20) throw new Error(`Too many residual panel cells for seed ${seed}: ${sample.panelCells}/20`);
  if (sample.externalClues < 24) throw new Error(`Too few external clue footprints for seed ${seed}: ${sample.externalClues}`);
  if (sample.clueTextCells < 45) throw new Error(`Too few clue-footprint cells for seed ${seed}: ${sample.clueTextCells}`);
  if (!sample.exactCluesOnly) throw new Error(`Fallback clue used for seed ${seed}`);
  if (!sample.coverageCheckpointPassed) throw new Error(`Coverage checkpoint flag is false for seed ${seed}`);

  samples.push(sample);
  console.log(`${seed}: ${sample.activePercent}% active, ${sample.panelCells} panels, ${sample.answers} answers, ${sample.elapsedMs} ms`);
}

console.table(samples.map(({ validation, exactCluesOnly, coverageCheckpointPassed, ...sample }) => sample));
const metric = (key) => samples.map((sample) => sample[key]);
const average = (values) => +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
console.log({
  runs: samples.length,
  valid: samples.length,
  exactCluesOnly: true,
  requiredComponents: 1,
  minAnswers: Math.min(...metric("answers")),
  maxAnswers: Math.max(...metric("answers")),
  averageAnswers: average(metric("answers")),
  minActivePercent: Math.min(...metric("activePercent")),
  maxActivePercent: Math.max(...metric("activePercent")),
  averageActivePercent: average(metric("activePercent")),
  minAnswerPercent: Math.min(...metric("answerPercent")),
  maxAnswerPercent: Math.max(...metric("answerPercent")),
  averageAnswerPercent: average(metric("answerPercent")),
  minPanelCells: Math.min(...metric("panelCells")),
  maxPanelCells: Math.max(...metric("panelCells")),
  averagePanelCells: average(metric("panelCells")),
  averageCrossings: average(metric("crossings")),
  averageAttemptsUsed: average(metric("attemptsUsed")),
  averageSeedMs: average(metric("elapsedMs")),
  elapsedMs: Date.now() - started,
});
