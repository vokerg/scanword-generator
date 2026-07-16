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
  "lexical-policy-v2.js",
  "solver.js",
  "construction-lexical-placement-v3.js",
  "closed-fill.js",
  "closed-fill-rollback.js",
  "construction-v2-runtime.js",
  "construction-v2.js",
]) require(path.join(root, file));

const seed = process.argv[2] || "lexical-build-probe";
const attempts = Math.max(1, Number(process.argv[3]) || 40);
const solver = window.ScanwordSolver;
const core = window.ScanwordCore;
const pool = core.generateWordPool(window.RUSSIAN_WORDS.length, core.makeRandom(`${seed}:pool`));
const poolIndex = solver.buildPoolIndex(pool);
const poolByAnswer = new Map(pool.map((entry) => [entry.answer, entry]));
const assignClues = solver.assignClueTextCellsV2;
if (typeof assignClues !== "function") throw new Error("assignClueTextCellsV2 is unavailable");

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

function weakCount(placed) {
  return placed.filter((word) => Boolean(word.weakFill || poolByAnswer.get(word.answer)?.weakFill)).length;
}

function run(mode) {
  process.env.SCANWORD_LEXICAL_PLACEMENT = mode;
  const samples = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = solver.buildAttempt(
      pool,
      17,
      13,
      30,
      core.makeRandom(`${seed}:placement:${attempt}`),
      poolIndex,
      "indexed",
    );
    const placedBeforeClues = state.placed.length;
    const weakBeforeClues = weakCount(state.placed);
    const structuralMetrics = solver.resultMetrics(state);
    const clueLayout = assignClues(
      state,
      core.makeRandom(`${seed}:clues:${attempt}`),
      160,
    );
    const metrics = solver.resultMetrics(state);
    const answerCoverage = metrics.letterCells / Math.max(1, 17 * 13 - metrics.clueCells - metrics.clueTextCells);
    const checks = {
      answers: state.placed.length >= 40,
      active: metrics.fillRatio >= 0.90,
      answerCoverage: answerCoverage >= 0.65,
      clueTextCells: clueLayout.clueTextCells >= 45,
      externalClues: clueLayout.externalClueTexts >= 24,
      panels: metrics.panelCells <= 20,
      components: metrics.components === 1,
      valid: metrics.validation.valid,
      exactClues: state.placed.every((entry) => entry.hasExactClue),
    };
    samples.push({
      attempt,
      placedBeforeClues,
      weakBeforeClues,
      structuralPanels: structuralMetrics.panelCells,
      finalPanels: metrics.panelCells,
      active: +metrics.fillRatio.toFixed(4),
      answerCoverage: +answerCoverage.toFixed(4),
      clueTextCells: clueLayout.clueTextCells,
      externalClues: clueLayout.externalClueTexts,
      checks,
      passed: Object.values(checks).every(Boolean),
    });
  }

  const failureCounts = {};
  for (const key of Object.keys(samples[0].checks)) {
    failureCounts[key] = samples.filter((sample) => !sample.checks[key]).length;
  }
  return {
    mode,
    attempts,
    passed: samples.filter((sample) => sample.passed).length,
    averageAnswers: average(samples.map((sample) => sample.placedBeforeClues)),
    minimumAnswers: Math.min(...samples.map((sample) => sample.placedBeforeClues)),
    maximumAnswers: Math.max(...samples.map((sample) => sample.placedBeforeClues)),
    averageWeak: average(samples.map((sample) => sample.weakBeforeClues)),
    minimumWeak: Math.min(...samples.map((sample) => sample.weakBeforeClues)),
    averageFinalPanels: average(samples.map((sample) => sample.finalPanels)),
    minimumFinalPanels: Math.min(...samples.map((sample) => sample.finalPanels)),
    maximumActive: Math.max(...samples.map((sample) => sample.active)),
    maximumClueTextCells: Math.max(...samples.map((sample) => sample.clueTextCells)),
    maximumExternalClues: Math.max(...samples.map((sample) => sample.externalClues)),
    failureCounts,
    bestByAnswers: [...samples].sort((a, b) => b.placedBeforeClues - a.placedBeforeClues || a.finalPanels - b.finalPanels)[0],
    bestByPanels: [...samples].sort((a, b) => a.finalPanels - b.finalPanels || b.placedBeforeClues - a.placedBeforeClues)[0],
  };
}

console.log(JSON.stringify({
  seed,
  penalties: {
    weak: Number(process.env.SCANWORD_WEAK_PLACEMENT_PENALTY || 70),
    twoLetter: Number(process.env.SCANWORD_TWO_LETTER_PLACEMENT_PENALTY || 70),
    threeLetter: Number(process.env.SCANWORD_THREE_LETTER_PLACEMENT_PENALTY || 18),
    qualityWeight: Number(process.env.SCANWORD_LEXICAL_QUALITY_PENALTY || 1),
    denseMultiplier: Number(process.env.SCANWORD_DENSE_LEXICAL_MULTIPLIER || 0.75),
  },
  baseline: run("off"),
  lexical: run("on"),
}));
