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
  const triple = exact?.search?.atomicTriple || null;
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
    selectedAtomicTriple: Boolean(exact?.selected?.atomicTriple),
    atomicStates: Number(atomic?.statesAccepted || 0),
    atomicCompatiblePairs: Number(atomic?.compatibleSlotPairs || 0),
    atomicComponentPrunedPairs: Number(atomic?.componentPrunedPairs || 0),
    maximumRollbackComponents: Number(atomic?.maximumRollbackComponents || 0),
    tripleRegions: Number(triple?.regionsConsidered || 0),
    tripleVictimPairs: Number(triple?.victimPairsConsidered || 0),
    tripleVictimPairsRolledBack: Number(triple?.victimPairsRolledBack || 0),
    tripleRollbackRejected: Number(triple?.rollbackRejected || 0),
    tripleRollbackInvalid: Number(triple?.rollbackInvalid || 0),
    tripleSlots: Number(triple?.slotsEnumerated || 0),
    tripleSlotTriples: Number(triple?.slotTriplesConsidered || 0),
    tripleComponentPruned: Number(triple?.componentPrunedTriples || 0),
    tripleCompatible: Number(triple?.compatibleSlotTriples || 0),
    tripleEntryTriples: Number(triple?.entryTriplesConsidered || 0),
    tripleApplyRejected: Number(triple?.applyRejected || 0),
    tripleValidationRejected: Number(triple?.validationRejected || 0),
    tripleWeakRejected: Number(triple?.weakBudgetRejected || 0),
    tripleStates: Number(triple?.statesAccepted || 0),
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
  tripleStateSeeds: rows.filter((row) => row.tripleStates > 0).length,
  totalTripleVictimPairs: rows.reduce((sum, row) => sum + row.tripleVictimPairs, 0),
  totalTripleVictimPairsRolledBack: rows.reduce((sum, row) => sum + row.tripleVictimPairsRolledBack, 0),
  totalTripleRollbackRejected: rows.reduce((sum, row) => sum + row.tripleRollbackRejected, 0),
  totalTripleSlots: rows.reduce((sum, row) => sum + row.tripleSlots, 0),
  totalTripleSlotTriples: rows.reduce((sum, row) => sum + row.tripleSlotTriples, 0),
  totalTripleComponentPruned: rows.reduce((sum, row) => sum + row.tripleComponentPruned, 0),
  totalTripleCompatible: rows.reduce((sum, row) => sum + row.tripleCompatible, 0),
  totalTripleEntryTriples: rows.reduce((sum, row) => sum + row.tripleEntryTriples, 0),
  totalTripleApplyRejected: rows.reduce((sum, row) => sum + row.tripleApplyRejected, 0),
  totalTripleValidationRejected: rows.reduce((sum, row) => sum + row.tripleValidationRejected, 0),
  totalTripleWeakRejected: rows.reduce((sum, row) => sum + row.tripleWeakRejected, 0),
}));
