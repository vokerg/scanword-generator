"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const worker = path.join(__dirname, "benchmark-seed.cjs");
const defaultIndices = [14, 17, 21, 24, 28, 40, 43, 53, 62, 65, 67, 69, 70, 71, 83, 89, 97];
const indices = (process.argv[2] || defaultIndices.join(","))
  .split(",")
  .map((value) => Number(value.trim()))
  .filter(Number.isInteger);
const prefix = process.argv[3] || "construction-checkpoint";
const concurrency = Math.max(1, Number(process.env.SCANWORD_TAIL_CONCURRENCY) || 2);
const results = new Array(indices.length);
let cursor = 0;

function runOne(position) {
  return new Promise((resolve, reject) => {
    const index = indices[position];
    const seed = `${prefix}-${index}`;
    const env = {
      ...process.env,
      SCANWORD_CONSTRUCTION_MODE: "portfolio",
      SCANWORD_CLOSED_FILL: "diagnostic",
      SCANWORD_PORTFOLIO_ATTEMPTS: process.env.SCANWORD_PORTFOLIO_ATTEMPTS || "240",
      SCANWORD_PORTFOLIO_CLUE_RESTARTS: process.env.SCANWORD_PORTFOLIO_CLUE_RESTARTS || "160",
      SCANWORD_REPACK_NODES: process.env.SCANWORD_REPACK_NODES || "600000",
      SCANWORD_REPACK_CANDIDATES: process.env.SCANWORD_REPACK_CANDIDATES || "24",
      SCANWORD_REPACK_BRANCH: process.env.SCANWORD_REPACK_BRANCH || "24",
      SCANWORD_TARGETED_EXACT_VARIANTS: process.env.SCANWORD_TARGETED_EXACT_VARIANTS || "4",
      SCANWORD_TARGETED_EXACT_REPACK_NODES: process.env.SCANWORD_TARGETED_EXACT_REPACK_NODES || "120000",
    };
    const child = spawn(process.execPath, [worker, seed], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out: ${seed}`));
    }, 360_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${seed} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const sample = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
        if (!sample.validation?.valid || sample.components !== 1 || !sample.exactCluesOnly) {
          throw new Error("invalid final grid");
        }
        const exact = sample.constructionV2?.targetedExactVictim || null;
        const atomic = exact?.search?.atomicPair || null;
        results[position] = {
          type: "seed",
          index,
          seed,
          panels: sample.panelCells,
          answers: sample.answers,
          rawLetterPercent: sample.rawLetterPercent,
          elapsedMs: sample.elapsedMs,
          residualRegionDetails: sample.residualRegionDetails || [],
          targetedAccepted: Boolean(exact?.accepted),
          selected: exact?.selected || null,
          structuralVariants: Number(exact?.structuralVariants || 0),
          atomic: atomic ? {
            mode: atomic.mode,
            disconnectedRollbackRelaxed: Number(atomic.disconnectedRollbackRelaxed || 0),
            maximumRollbackComponents: Number(atomic.maximumRollbackComponents || 0),
            maximumSlotComponentSpan: Number(atomic.maximumSlotComponentSpan || 0),
            slotsEnumerated: Number(atomic.slotsEnumerated || 0),
            slotPairsConsidered: Number(atomic.slotPairsConsidered || 0),
            componentPrunedPairs: Number(atomic.componentPrunedPairs || 0),
            compatibleSlotPairs: Number(atomic.compatibleSlotPairs || 0),
            crossingSlotPairs: Number(atomic.crossingSlotPairs || 0),
            disjointSlotPairs: Number(atomic.disjointSlotPairs || 0),
            entryPairsConsidered: Number(atomic.entryPairsConsidered || 0),
            statesAccepted: Number(atomic.statesAccepted || 0),
            finalistsReserved: Number(atomic.finalistsReserved || 0),
          } : null,
        };
        resolve();
      } catch (error) {
        reject(new Error(`${seed}: ${error.message}`));
      }
    });
  });
}

async function loop() {
  while (true) {
    const position = cursor;
    cursor += 1;
    if (position >= indices.length) return;
    await runOne(position);
  }
}

(async () => {
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, indices.length) }, () => loop()));
    for (const row of results) console.log(JSON.stringify(row));
    const regionSizes = results.flatMap((row) => row.residualRegionDetails.map((region) => region.size));
    const summary = {
      type: "summary",
      runs: results.length,
      indices,
      averagePanels: +(results.reduce((sum, row) => sum + row.panels, 0) / results.length).toFixed(2),
      maximumPanels: Math.max(...results.map((row) => row.panels)),
      totalRegions: results.reduce((sum, row) => sum + row.residualRegionDetails.length, 0),
      largestRegion: Math.max(0, ...regionSizes),
      disconnectedRollbackSeeds: results.filter((row) => row.atomic?.disconnectedRollbackRelaxed > 0).length,
      atomicStateSeeds: results.filter((row) => row.atomic?.statesAccepted > 0).length,
      atomicSelectedSeeds: results.filter((row) => row.selected?.atomicPair).length,
      totalComponentPrunedPairs: results.reduce((sum, row) => sum + Number(row.atomic?.componentPrunedPairs || 0), 0),
      totalCompatiblePairs: results.reduce((sum, row) => sum + Number(row.atomic?.compatibleSlotPairs || 0), 0),
      totalAtomicStates: results.reduce((sum, row) => sum + Number(row.atomic?.statesAccepted || 0), 0),
    };
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
})();
