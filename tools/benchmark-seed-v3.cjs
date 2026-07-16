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
  "editorial-lexical-policy-v3.js",
  "solver.js",
  "construction-lexical-placement-v3.js",
  "closed-fill.js",
  "closed-fill-rollback.js",
  "construction-v2-runtime.js",
  "construction-v2.js",
  "construction-victim.js",
  "construction-victim-depth2.js",
  "construction-portfolio-v3.js",
  "construction-polish.js",
  "construction-clue-repack.js",
  "construction-clue-adaptive.js",
  "construction-clue-tail.js",
  "construction-clue-reflow.js",
  "construction-clue-pair-reflow.js",
  "targeted-short-fill.js",
  "construction-victim-targeted.js",
  "construction-victim-targeted-demand.js",
  "construction-victim-targeted-pair.js",
  "construction-victim-targeted-cross.js",
  "construction-victim-targeted-cross-rollback.js",
  "construction-victim-targeted-cross-relaxed.js",
  "construction-victim-targeted-cross-budget.js",
  "construction-victim-targeted-exact.js",
  "construction-guard.js",
  "construction-editorial-replace-v3.js",
  "construction-editorial-pair-refit-v3.js",
]) {
  require(path.join(root, file));
}

const seed = process.argv[2];
if (!seed) throw new Error("A seed argument is required.");

const started = Date.now();
const result = window.ScanwordSolver.generateBest(seed, window.RUSSIAN_WORDS.length, 17, 13, 30, 27);
const placedById = new Map(result.placed.map((word) => [word.id, word]));
const poolByAnswer = new Map((result.pool || []).map((entry) => [entry.answer, entry]));
const extractedRegions = window.ScanwordClosedFill?.extractResidualRegions?.(result) || [];
const editorialPolicy = window.ScanwordEditorialLexicalPolicyV3;
const OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

function describeCell(row, col) {
  const cell = result.grid[row]?.[col];
  if (!cell) return { row, col, type: "edge" };
  return {
    row,
    col,
    type: cell.type,
    char: cell.char || null,
    slotIds: [...(cell.slotIds || [])],
    directions: [...(cell.directions || [])],
    clueDirections: (cell.clues || []).map((clue) => clue.direction).sort(),
  };
}

const residualRegionDetails = extractedRegions.map((region) => {
  const cells = (region.cells || []).map((cell) => [cell.row, cell.col]);
  const neighborhoods = (region.cells || []).map((cell) => ({
    row: cell.row,
    col: cell.col,
    neighbors: OFFSETS.map(([dr, dc]) => ({
      dr,
      dc,
      ...describeCell(cell.row + dr, cell.col + dc),
    })),
  }));
  const adjacentTypeCounts = {};
  for (const neighborhood of neighborhoods) {
    for (const neighbor of neighborhood.neighbors) {
      adjacentTypeCounts[neighbor.type] = (adjacentTypeCounts[neighbor.type] || 0) + 1;
    }
  }
  return {
    id: region.id,
    size: region.size,
    cells,
    boundingBox: region.boundingBox || null,
    perimeter: Number(region.perimeter || 0),
    touchesEdge: Boolean(region.touchesEdge),
    boundaryWordIds: [...(region.boundaryWords || [])],
    boundaryAnswers: (region.boundaryWords || [])
      .map((id) => placedById.get(id)?.answer)
      .filter(Boolean),
    neighboringClues: [...(region.neighboringClues || [])],
    adjacentTypeCounts,
    neighborhoods,
  };
});

const lexicalEntries = result.placed.map((word) => {
  const metadata = poolByAnswer.get(word.answer) || {};
  const answer = String(word.answer || "");
  const lexicalQuality = Number(word.lexicalQuality || metadata.lexicalQuality || (answer.length >= 4 ? 80 : 65));
  const weakFill = Boolean(word.weakFill || metadata.weakFill);
  const editorial = editorialPolicy.classify(answer, { ...metadata, ...word });
  return {
    answer,
    length: answer.length,
    weakFill,
    lexicalQuality,
    lexicalSource: word.lexicalSource || metadata.lexicalSource || null,
    placementAdjustment: Number(word.lexicalPlacementAdjustment || 0),
    editorialTier: editorial.editorialTier,
    editorialWeak: editorial.editorialWeak,
    editorialQuality: editorial.editorialQuality,
    editorialPenalty: editorial.editorialPenalty,
    formulaicShort: editorial.formulaicShort,
    specialistShort: editorial.specialistShort,
    commonShort: editorial.commonShort,
  };
});
const weakEntries = lexicalEntries.filter((entry) => entry.weakFill);
const lexicalPenalty = lexicalEntries.reduce(
  (total, entry) => total + Math.max(0, 80 - entry.lexicalQuality) + (entry.weakFill ? 20 : 0),
  0,
);
const averageLexicalQuality = lexicalEntries.length
  ? +(lexicalEntries.reduce((total, entry) => total + entry.lexicalQuality, 0) / lexicalEntries.length).toFixed(2)
  : 0;
const editorialSummary = editorialPolicy.summarize(result.placed);

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
  residualRegions: residualRegionDetails.length,
  residualRegionDetails,
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
  lexicalPlacementMode: process.env.SCANWORD_LEXICAL_PLACEMENT || "off",
  editorialReplacementMode: process.env.SCANWORD_EDITORIAL_REPLACE || "off",
  editorialPairRefitMode: process.env.SCANWORD_EDITORIAL_PAIR_REFIT || "off",
  cumulativePlacementAdjustment: lexicalEntries.reduce((total, entry) => total + entry.placementAdjustment, 0),
  weakFillCount: weakEntries.length,
  weakAnswers: weakEntries.map((entry) => entry.answer).sort(),
  twoLetterCount: editorialSummary.twoLetterCount,
  commonShortCount: editorialSummary.commonShortCount,
  specialistShortCount: editorialSummary.specialistShortCount,
  formulaicShortCount: editorialSummary.formulaicShortCount,
  editorialWeakCount: editorialSummary.editorialWeakCount,
  editorialPenalty: editorialSummary.editorialPenalty,
  formulaicAnswers: editorialSummary.formulaicAnswers,
  specialistAnswers: editorialSummary.specialistAnswers,
  shortAnswerCount: lexicalEntries.filter((entry) => entry.length <= 3).length,
  lexicalPenalty,
  averageLexicalQuality,
  minimumLexicalQuality: lexicalEntries.length
    ? Math.min(...lexicalEntries.map((entry) => entry.lexicalQuality))
    : 0,
  lexicalEntries,
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
