"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const worker = path.join(__dirname, "benchmark-seed.cjs");
const defaultIndices = [14, 21, 24, 28, 40, 43, 53, 62, 65, 67, 69, 70, 71, 83, 89];
const indices = (process.env.SCANWORD_TAIL_SEEDS || defaultIndices.join(","))
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 0);
const prefix = process.env.SCANWORD_TAIL_PREFIX || "construction-checkpoint";
const rows = [];

function run(seed) {
  const env = {
    ...process.env,
    SCANWORD_CONSTRUCTION_MODE: "portfolio",
    SCANWORD_CLOSED_FILL: "diagnostic",
    SCANWORD_ZERO_PANEL_PASS: "1",
    SCANWORD_PORTFOLIO_ATTEMPTS: process.env.SCANWORD_PORTFOLIO_ATTEMPTS || "240",
    SCANWORD_PORTFOLIO_CLUE_RESTARTS: process.env.SCANWORD_PORTFOLIO_CLUE_RESTARTS || "160",
    SCANWORD_VICTIM_BASES: process.env.SCANWORD_VICTIM_BASES || "8",
    SCANWORD_VICTIM_VARIANTS: process.env.SCANWORD_VICTIM_VARIANTS || "6",
    SCANWORD_VICTIM_SECONDARY_WORDS: process.env.SCANWORD_VICTIM_SECONDARY_WORDS || "3",
    SCANWORD_VICTIM_SECONDARY_VARIANTS: process.env.SCANWORD_VICTIM_SECONDARY_VARIANTS || "4",
    SCANWORD_VICTIM_SECONDARY_FINALISTS: process.env.SCANWORD_VICTIM_SECONDARY_FINALISTS || "6",
    SCANWORD_TARGETED_VICTIM_REGIONS: process.env.SCANWORD_TARGETED_VICTIM_REGIONS || "3",
    SCANWORD_TARGETED_VICTIM_WORDS: process.env.SCANWORD_TARGETED_VICTIM_WORDS || "4",
    SCANWORD_TARGETED_VICTIM_DEPTH: process.env.SCANWORD_TARGETED_VICTIM_DEPTH || "2",
    SCANWORD_TARGETED_EXACT_VARIANTS: process.env.SCANWORD_TARGETED_EXACT_VARIANTS || "4",
    SCANWORD_TARGETED_EXACT_REPACK_NODES: process.env.SCANWORD_TARGETED_EXACT_REPACK_NODES || "120000",
    SCANWORD_REPACK_NODES: process.env.SCANWORD_REPACK_NODES || "600000",
    SCANWORD_REPACK_BRANCH: process.env.SCANWORD_REPACK_BRANCH || "24",
  };
  const child = spawnSync(process.execPath, [worker, seed], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 360_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${seed}: ${child.stderr || child.stdout}`);
  const sample = JSON.parse(child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
  if (!sample.validation?.valid || sample.components !== 1 || !sample.exactCluesOnly || !sample.coverageCheckpointPassed) {
    throw new Error(`${seed}: invalid production result`);
  }
  return sample;
}

for (const index of indices) {
  const seed = `${prefix}-${index}`;
  const sample = run(seed);
  const exact = sample.constructionV2?.targetedExactVictim || null;
  const atomic = exact?.search?.atomicPair || null;
  const direct = exact?.search?.directCross || null;
  const rollbackCross = exact?.search?.rollbackAssistedCross || null;
  const rollbackDirect = rollbackCross?.direct || null;
  const row = {
    type: "seed",
    index,
    seed,
    panels: sample.panelCells,
    answers: sample.answers,
    elapsedMs: sample.elapsedMs,
    regions: sample.residualRegionDetails || [],
    exactAttempted: Boolean(exact?.attempted),
    exactAccepted: Boolean(exact?.accepted),
    structuralVariants: Number(exact?.structuralVariants || 0),
    selectedVictim: exact?.selected?.victimAnswer || null,
    selectedAtomicPair: Boolean(exact?.selected?.atomicPair),
    selectedDirectCross: Boolean(exact?.selected?.directCross),
    selectedRollbackCross: Boolean(exact?.selected?.rollbackAssistedCross),
    atomicStates: Number(atomic?.statesAccepted || 0),
    atomicCompatiblePairs: Number(atomic?.compatibleSlotPairs || 0),
    atomicComponentPrunedPairs: Number(atomic?.componentPrunedPairs || 0),
    maximumRollbackComponents: Number(atomic?.maximumRollbackComponents || 0),
    directRegions: Number(direct?.regionsConsidered || 0),
    directJunctions: Number(direct?.junctionRegions || 0),
    directHorizontalUnavailable: Number(direct?.horizontalUnavailable || 0),
    directVerticalUnavailable: Number(direct?.verticalUnavailable || 0),
    directSlotPairs: Number(direct?.slotPairsBuilt || 0),
    directEntryPairs: Number(direct?.entryPairsConsidered || 0),
    directCharacterPairs: Number(direct?.characterPairsMatched || 0),
    directApplyRejected: Number(direct?.applyRejected || 0),
    directValidationRejected: Number(direct?.validationRejected || 0),
    directWeakRejected: Number(direct?.weakBudgetRejected || 0),
    directStates: Number(direct?.statesAccepted || 0),
    directEmptyPatterns: direct?.emptyPatterns || [],
    rollbackCrossRegions: Number(rollbackCross?.regionsConsidered || 0),
    rollbackCrossVictimsConsidered: Number(rollbackCross?.victimsConsidered || 0),
    rollbackCrossVictimsRolledBack: Number(rollbackCross?.victimsRolledBack || 0),
    rollbackCrossDisconnectedRollbacks: Number(rollbackCross?.disconnectedRollbacks || 0),
    rollbackCrossDirectSearches: Number(rollbackCross?.directSearches || 0),
    rollbackCrossCandidateStates: Number(rollbackCross?.candidateStates || 0),
    rollbackCrossValidationRejected: Number(rollbackCross?.validationRejected || 0),
    rollbackCrossAnswerCountRejected: Number(rollbackCross?.answerCountRejected || 0),
    rollbackCrossNonImprovingRejected: Number(rollbackCross?.nonImprovingRejected || 0),
    rollbackCrossStates: Number(rollbackCross?.statesAccepted || 0),
    rollbackCrossFinalistsReserved: Number(rollbackCross?.finalistsReserved || 0),
    rollbackDirectJunctions: Number(rollbackDirect?.junctionRegions || 0),
    rollbackDirectHorizontalUnavailable: Number(rollbackDirect?.horizontalUnavailable || 0),
    rollbackDirectVerticalUnavailable: Number(rollbackDirect?.verticalUnavailable || 0),
    rollbackDirectSlotPairs: Number(rollbackDirect?.slotPairsBuilt || 0),
    rollbackDirectEntryPairs: Number(rollbackDirect?.entryPairsConsidered || 0),
    rollbackDirectCharacterPairs: Number(rollbackDirect?.characterPairsMatched || 0),
    rollbackDirectStates: Number(rollbackDirect?.statesAccepted || 0),
    rollbackDirectEmptyPatterns: rollbackDirect?.emptyPatterns || [],
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}

const regionSizes = rows.flatMap((row) => row.regions.map((region) => region.size));
const boundaryFrequency = new Map();
for (const row of rows) {
  for (const region of row.regions) {
    for (const answer of region.boundaryAnswers || []) {
      boundaryFrequency.set(answer, (boundaryFrequency.get(answer) || 0) + 1);
    }
  }
}
console.log(JSON.stringify({
  type: "summary",
  runs: rows.length,
  averagePanels: +(rows.reduce((sum, row) => sum + row.panels, 0) / Math.max(1, rows.length)).toFixed(2),
  totalRegions: regionSizes.length,
  isolatedRegions: regionSizes.filter((size) => size === 1).length,
  maximumRegionSize: Math.max(0, ...regionSizes),
  regionSizeDistribution: Object.fromEntries([...new Set(regionSizes)].sort((a, b) => a - b).map((size) => [size, regionSizes.filter((value) => value === size).length])),
  edgeRegions: rows.flatMap((row) => row.regions).filter((region) => region.touchesEdge).length,
  commonBoundaryAnswers: [...boundaryFrequency.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru")).slice(0, 20),
  directStateSeeds: rows.filter((row) => row.directStates > 0).length,
  directSelectedSeeds: rows.filter((row) => row.selectedDirectCross).length,
  totalDirectJunctions: rows.reduce((sum, row) => sum + row.directJunctions, 0),
  totalDirectHorizontalUnavailable: rows.reduce((sum, row) => sum + row.directHorizontalUnavailable, 0),
  totalDirectVerticalUnavailable: rows.reduce((sum, row) => sum + row.directVerticalUnavailable, 0),
  totalDirectSlotPairs: rows.reduce((sum, row) => sum + row.directSlotPairs, 0),
  totalDirectEntryPairs: rows.reduce((sum, row) => sum + row.directEntryPairs, 0),
  totalDirectCharacterPairs: rows.reduce((sum, row) => sum + row.directCharacterPairs, 0),
  totalDirectApplyRejected: rows.reduce((sum, row) => sum + row.directApplyRejected, 0),
  totalDirectValidationRejected: rows.reduce((sum, row) => sum + row.directValidationRejected, 0),
  totalDirectWeakRejected: rows.reduce((sum, row) => sum + row.directWeakRejected, 0),
  directEmptyPatterns: [...new Set(rows.flatMap((row) => row.directEmptyPatterns))].sort(),
  rollbackCrossStateSeeds: rows.filter((row) => row.rollbackCrossStates > 0).length,
  rollbackCrossSelectedSeeds: rows.filter((row) => row.selectedRollbackCross).length,
  totalRollbackCrossRegions: rows.reduce((sum, row) => sum + row.rollbackCrossRegions, 0),
  totalRollbackCrossVictimsConsidered: rows.reduce((sum, row) => sum + row.rollbackCrossVictimsConsidered, 0),
  totalRollbackCrossVictimsRolledBack: rows.reduce((sum, row) => sum + row.rollbackCrossVictimsRolledBack, 0),
  totalRollbackCrossDisconnectedRollbacks: rows.reduce((sum, row) => sum + row.rollbackCrossDisconnectedRollbacks, 0),
  totalRollbackCrossDirectSearches: rows.reduce((sum, row) => sum + row.rollbackCrossDirectSearches, 0),
  totalRollbackCrossCandidateStates: rows.reduce((sum, row) => sum + row.rollbackCrossCandidateStates, 0),
  totalRollbackCrossValidationRejected: rows.reduce((sum, row) => sum + row.rollbackCrossValidationRejected, 0),
  totalRollbackCrossAnswerCountRejected: rows.reduce((sum, row) => sum + row.rollbackCrossAnswerCountRejected, 0),
  totalRollbackCrossNonImprovingRejected: rows.reduce((sum, row) => sum + row.rollbackCrossNonImprovingRejected, 0),
  totalRollbackCrossStates: rows.reduce((sum, row) => sum + row.rollbackCrossStates, 0),
  totalRollbackCrossFinalistsReserved: rows.reduce((sum, row) => sum + row.rollbackCrossFinalistsReserved, 0),
  totalRollbackDirectJunctions: rows.reduce((sum, row) => sum + row.rollbackDirectJunctions, 0),
  totalRollbackDirectHorizontalUnavailable: rows.reduce((sum, row) => sum + row.rollbackDirectHorizontalUnavailable, 0),
  totalRollbackDirectVerticalUnavailable: rows.reduce((sum, row) => sum + row.rollbackDirectVerticalUnavailable, 0),
  totalRollbackDirectSlotPairs: rows.reduce((sum, row) => sum + row.rollbackDirectSlotPairs, 0),
  totalRollbackDirectEntryPairs: rows.reduce((sum, row) => sum + row.rollbackDirectEntryPairs, 0),
  totalRollbackDirectCharacterPairs: rows.reduce((sum, row) => sum + row.rollbackDirectCharacterPairs, 0),
  totalRollbackDirectStates: rows.reduce((sum, row) => sum + row.rollbackDirectStates, 0),
  rollbackDirectEmptyPatterns: [...new Set(rows.flatMap((row) => row.rollbackDirectEmptyPatterns))].sort(),
}));
