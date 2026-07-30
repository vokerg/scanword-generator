"use strict";

const crypto = require("node:crypto");

const seed = process.argv[2];
if (!seed) throw new Error("A seed argument is required");

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
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

function selectedGridClueDebt(result) {
  return Number(
    result.selectedGridClueQuality?.clueDebt
    ?? result.selectedGridClueMetrics?.clueDebt
    ?? result.clueQuality?.selectedGridDebt
    ?? 0,
  );
}

function compactFilterTelemetry(telemetry) {
  if (!telemetry || typeof telemetry !== "object") return null;
  return {
    activePoolLimit: String(process.env.SCANWORD_ACTIVE_POOL_LIMIT || "default"),
    schemaVersion: telemetry.schemaVersion || null,
    mode: telemetry.mode || null,
    authoritative: Boolean(telemetry.authoritative),
    width: Number(telemetry.width || 0),
    exactAllocationCalls: Number(telemetry.exactAllocationCalls || 0),
    unrestrictedAllocationUpperBound: Number(telemetry.unrestrictedAllocationUpperBound || 0),
    callsSavedAgainstObservedSchedule: Number(telemetry.callsSavedAgainstObservedSchedule || 0),
    callReductionAgainstObservedSchedule: Number(telemetry.callReductionAgainstObservedSchedule || 0),
    fallbackUsed: Boolean(telemetry.fallbackUsed),
    fallbackReason: telemetry.fallbackReason || null,
    error: telemetry.error || null,
  };
}

const solver = global.ScanwordSolver;
const originalAssignClueTextCellsV2 = solver.assignClueTextCellsV2;
const originalExplicitCandidate = solver.generateExplicitSingleCandidateV2;
const originalGeneratePortfolio = solver.generatePortfolio;
let exactAllocationCalls = 0;
let exactAllocationElapsedMs = 0;
const preallocationFilterRuns = [];
const capturedFilterTelemetry = new Set();

function captureFilterRun(result) {
  const telemetry = result?.constructionV2?.preallocationFilter;
  if (!telemetry || capturedFilterTelemetry.has(telemetry)) return result;
  capturedFilterTelemetry.add(telemetry);
  preallocationFilterRuns.push(compactFilterTelemetry(telemetry));
  return result;
}

if (typeof originalAssignClueTextCellsV2 === "function") {
  solver.assignClueTextCellsV2 = function measuredAssignClueTextCellsV2(...args) {
    const started = now();
    try {
      return originalAssignClueTextCellsV2.apply(solver, args);
    } finally {
      exactAllocationCalls += 1;
      exactAllocationElapsedMs += now() - started;
    }
  };
}

if (typeof originalExplicitCandidate === "function") {
  solver.generateExplicitSingleCandidateV2 = function measuredExplicitCandidate(...args) {
    return captureFilterRun(originalExplicitCandidate.apply(solver, args));
  };
} else if (typeof originalGeneratePortfolio === "function") {
  solver.generatePortfolio = function measuredGeneratePortfolio(...args) {
    return captureFilterRun(originalGeneratePortfolio.apply(solver, args));
  };
}

const started = Date.now();
let result;
try {
  result = solver.generateBest(seed, global.RUSSIAN_WORDS.length, 17, 13, 30, 27);
} finally {
  if (typeof originalAssignClueTextCellsV2 === "function") solver.assignClueTextCellsV2 = originalAssignClueTextCellsV2;
  if (typeof originalExplicitCandidate === "function") solver.generateExplicitSingleCandidateV2 = originalExplicitCandidate;
  else if (typeof originalGeneratePortfolio === "function") solver.generatePortfolio = originalGeneratePortfolio;
}

const grid = normalizedGrid(result);
const placed = normalizedPlaced(result);
const cluePayload = placed.map(({ answer, clue, hasExactClue }) => ({ answer, clue, hasExactClue }));
const editorial = global.ScanwordEditorialLexicalPolicyV3?.summarize?.(result.placed || []) || {};
const constructionV2 = result.constructionV2 || {};
const filterPortfolio = preallocationFilterRuns.length ? {
  schemaVersion: 1,
  runCount: preallocationFilterRuns.length,
  fallbackRuns: preallocationFilterRuns.filter((entry) => entry.fallbackUsed).length,
  exactAllocationCalls: preallocationFilterRuns.reduce((sum, entry) => sum + entry.exactAllocationCalls, 0),
  unrestrictedAllocationUpperBound: preallocationFilterRuns.reduce(
    (sum, entry) => sum + entry.unrestrictedAllocationUpperBound,
    0,
  ),
  callsSavedAgainstObservedSchedule: preallocationFilterRuns.reduce(
    (sum, entry) => sum + entry.callsSavedAgainstObservedSchedule,
    0,
  ),
  runs: preallocationFilterRuns,
} : null;
const exactAllocatorProfileEnabled = String(
  process.env.SCANWORD_EXACT_ALLOCATOR_PROFILE || "off",
).toLowerCase() === "shadow";
const exactAllocatorSelectorEnabled = String(
  process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR || "off",
).toLowerCase() === "linear-top-three";
const summary = {
  seed,
  mode: String(process.env.SCANWORD_EXPLICIT_PIPELINE || "off").toLowerCase(),
  frontierMode: String(process.env.SCANWORD_COMPLETE_PIPELINE_FRONTIER || "off").toLowerCase(),
  preallocationMode: String(process.env.SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER || "off").toLowerCase(),
  elapsedMs: Date.now() - started,
  exactAllocationCalls,
  exactAllocationElapsedMs: +exactAllocationElapsedMs.toFixed(3),
  valid: Boolean(result.validation?.valid),
  components: Number(result.components || 0),
  panels: Number(result.panelCells || 0),
  answers: placed.length,
  crossings: Number(result.intersections || 0),
  rawLetterCoverage: Number(result.rawLetterCoverage || 0),
  formulaicShortCount: Number(editorial.formulaicShortCount || 0),
  editorialPenalty: Number(editorial.editorialPenalty || 0),
  clueDebt: selectedGridClueDebt(result),
  score: Number(result.score || 0),
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
  constructionV2Mode: constructionV2.mode || null,
  constructionV2Error: constructionV2.error || constructionV2.explicitStageRuntimeError || null,
  pipeline: result.constructionPipelineV1 || null,
  stageRuntime: constructionV2.explicitStageRuntime || null,
  completePipelineFrontier: constructionV2.completePipelineFrontier || null,
  preallocationStructuralFrontier: constructionV2.preallocationStructuralFrontier || null,
  preallocationStructuralFrontierPortfolio: global.ScanwordPreallocationStructuralFrontierV1?.currentPortfolioAggregate?.()
    || constructionV2.preallocationStructuralFrontierPortfolio
    || null,
  preallocationRepairPotentialFrontier: constructionV2.preallocationRepairPotentialFrontier || null,
  preallocationRepairPotentialFrontierPortfolio: global.ScanwordPreallocationRepairPotentialV1?.currentPortfolioAggregate?.()
    || constructionV2.preallocationRepairPotentialFrontierPortfolio
    || null,
  preallocationRankedFrontier: constructionV2.preallocationRankedFrontier || null,
  preallocationRankedFrontierPortfolio: global.ScanwordPreallocationRankedFrontierV1?.currentPortfolioAggregate?.()
    || constructionV2.preallocationRankedFrontierPortfolio
    || null,
  preallocationFilter: constructionV2.preallocationFilter || null,
  preallocationFilterPortfolio: filterPortfolio,
  ...(exactAllocatorSelectorEnabled ? {
    exactAllocatorSelector: global.ScanwordExactAllocatorTopThreeV1?.current?.() || null,
  } : {}),
  ...(exactAllocatorProfileEnabled ? {
    exactAllocatorProfile: global.ScanwordExactAllocatorProfileV1?.current?.() || null,
  } : {}),
  preallocationInstallation: {
    structural: Boolean(global.ScanwordSolver.__preallocationStructuralFrontierV1Installed),
    repairPotential: Boolean(global.ScanwordSolver.__preallocationRepairPotentialV1Installed),
    ranked: Boolean(global.ScanwordSolver.__preallocationRankedFrontierV1Installed),
    filter: Boolean(global.ScanwordSolver.__preallocationFilterV1Installed),
  },
  retirementAudit: global.ScanwordWrapperRetirementAuditV1?.snapshot?.() || null,
};
console.log(JSON.stringify(summary));
