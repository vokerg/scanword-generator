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
  "closed-fill.js",
  "closed-fill-rollback.js",
  "construction-v2-runtime.js",
  "construction-v2.js",
  "construction-portfolio.js",
  "construction-polish.js",
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
  validationReport: result.validationReport,
  answers: result.placed.length,
  crossings: result.intersections,
  activePercent: +(result.fillRatio * 100).toFixed(1),
  answerPercent: +(result.answerCoverage * 100).toFixed(1),
  rawLetterPercent: +(result.rawLetterCoverage * 100).toFixed(1),
  letterCells: result.letterCells,
  panelCells: result.panelCells,
  residualRegions: result.residualRegions?.length || 0,
  components: result.components,
  clueTextCells: result.clueTextCells,
  externalClues: result.externalClueTexts,
  selectedAttempt: result.attempt + 1,
  attemptsUsed: result.attemptBudget,
  candidateMode: result.candidateMode,
  candidateChecks: result.candidateChecks,
  candidateLookups: result.candidateLookups,
  poolEntries: result.poolEntries,
  exactCluesOnly: result.placed.every((entry) => entry.hasExactClue),
  coverageCheckpointPassed: Boolean(result.coverageCheckpoint?.passed),
  constructionMode: result.mode || result.constructionV2?.mode || "legacy",
  constructionV2: result.constructionV2 || null,
  closedFillMode: result.closedFill?.mode || "unavailable",
  closedFillError: result.closedFill?.error || result.closedFill?.rollbackError || null,
  closedFillRegionsAttempted: result.closedFill?.regionsAttempted || 0,
  closedFillRegionsSolved: result.closedFill?.regionsSolved || 0,
  closedFillSlotsEnumerated: result.closedFill?.slotsEnumerated || 0,
  closedFillTopologiesTried: result.closedFill?.topologiesTried || 0,
  closedFillCspNodes: result.closedFill?.cspNodes || 0,
  closedFillForwardPrunes: result.closedFill?.forwardPrunes || 0,
  closedFillPatternChecks: result.closedFill?.patternChecks || 0,
  rollbackDepthUsed: result.closedFill?.rollbackDepthUsed || 0,
  rollbackWordsTried: result.closedFill?.rollbackWordsTried || 0,
  rollbackCandidatesAccepted: result.closedFill?.rollbackCandidatesAccepted || 0,
  rollbackSlotsEnumerated: result.closedFill?.rollbackSlotsEnumerated || 0,
  rollbackTopologiesTried: result.closedFill?.rollbackTopologiesTried || 0,
  rollbackCspNodes: result.closedFill?.rollbackCspNodes || 0,
  rollbackPatternChecks: result.closedFill?.rollbackPatternChecks || 0,
  panelsBeforeClosedFill: result.closedFill?.panelsBefore ?? result.panelCells,
  panelsAfterClosedFill: result.closedFill?.panelsAfter ?? result.panelCells,
}));