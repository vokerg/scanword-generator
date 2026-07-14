"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 100);
const prefix = process.argv[3] || "construction-checkpoint";
const concurrency = Math.max(1, Number(process.env.SCANWORD_CHECKPOINT_CONCURRENCY) || 2);
const enforce = process.env.SCANWORD_CHECKPOINT_ENFORCE === "1";
const samples = new Array(runCount);
let cursor = 0;

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

function runSeed(index) {
  return new Promise((resolve, reject) => {
    const seed = `${prefix}-${index}`;
    const env = {
      ...process.env,
      SCANWORD_CONSTRUCTION_MODE: "portfolio",
      SCANWORD_CLOSED_FILL: "diagnostic",
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
      SCANWORD_TARGETED_VICTIM_BEAM: process.env.SCANWORD_TARGETED_VICTIM_BEAM || "5",
      SCANWORD_TARGETED_VICTIM_BRANCHING: process.env.SCANWORD_TARGETED_VICTIM_BRANCHING || "18",
      SCANWORD_TARGETED_VICTIM_VARIANTS: process.env.SCANWORD_TARGETED_VICTIM_VARIANTS || "8",
      SCANWORD_TARGETED_EXACT_VARIANTS: process.env.SCANWORD_TARGETED_EXACT_VARIANTS || "4",
      SCANWORD_TARGETED_EXACT_REPACK_NODES: process.env.SCANWORD_TARGETED_EXACT_REPACK_NODES || "120000",
      SCANWORD_TARGETED_EXACT_REPACK_CANDIDATES: process.env.SCANWORD_TARGETED_EXACT_REPACK_CANDIDATES || "20",
      SCANWORD_TARGETED_EXACT_REPACK_BRANCH: process.env.SCANWORD_TARGETED_EXACT_REPACK_BRANCH || "14",
      SCANWORD_REPACK_NODES: process.env.SCANWORD_REPACK_NODES || "600000",
      SCANWORD_REPACK_CANDIDATES: process.env.SCANWORD_REPACK_CANDIDATES || "24",
      SCANWORD_REPACK_BRANCH: process.env.SCANWORD_REPACK_BRANCH || "24",
    };
    const child = spawn(process.execPath, [workerPath, seed], {
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
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        const sample = JSON.parse(line);
        if (!sample.validation?.valid) throw new Error(`invalid grid: ${JSON.stringify(sample.validation)}`);
        if (sample.components !== 1) throw new Error("disconnected answer graph");
        if (!sample.exactCluesOnly) throw new Error("fallback clue detected");
        if (!sample.coverageCheckpointPassed) throw new Error("preserved production checkpoint failed");
        const guardSelected = sample.constructionV2?.baselineGuard?.selected || "portfolio";
        const targeted = sample.constructionV2?.targetedVictim || null;
        const exact = sample.constructionV2?.targetedExactVictim || null;
        const atomic = exact?.search?.atomicPair || null;
        samples[index] = {
          type: "seed",
          index,
          seed,
          panels: sample.panelCells,
          rawLetterPercent: sample.rawLetterPercent,
          answers: sample.answers,
          clueTextCells: sample.clueTextCells,
          externalClues: sample.externalClues,
          elapsedMs: sample.elapsedMs,
          victimDepth: Number(sample.constructionV2?.selectedVictimReplacement?.depth || 0),
          targetedVictimAttempted: Boolean(targeted?.attempted && guardSelected !== "legacy"),
          targetedVictimAccepted: Boolean(targeted?.accepted && guardSelected !== "legacy"),
          targetedVictimGain: Number(targeted?.panelsBefore != null && targeted?.panelsAfter != null
            ? targeted.panelsBefore - targeted.panelsAfter
            : 0),
          targetedVictimsRolledBack: Number(targeted?.search?.victimsRolledBack || 0),
          targetedStatesAccepted: Number(targeted?.search?.statesAccepted || 0),
          targetedFinalistsEvaluated: Number(targeted?.finalistsEvaluated || 0),
          targetedSelectedVictim: targeted?.selected?.victimAnswer || null,
          targetedExactVictimAttempted: Boolean(exact?.attempted && guardSelected !== "legacy"),
          targetedExactVictimAccepted: Boolean(exact?.accepted && guardSelected !== "legacy"),
          targetedExactVictimGain: Number(exact?.panelsBefore != null && exact?.panelsAfter != null
            ? exact.panelsBefore - exact.panelsAfter
            : 0),
          targetedExactStructuralVariants: Number(exact?.structuralVariants || 0),
          targetedExactFinalistsEvaluated: Number(exact?.finalistsEvaluated || 0),
          targetedExactFinalistsPassingCheckpoint: Number(exact?.finalistsPassingCheckpoint || 0),
          targetedExactImprovingFinalists: Number(exact?.exactImprovingFinalists || 0),
          targetedExactSelectedVictim: exact?.selected?.victimAnswer || null,
          targetedExactSelectedShortFill: exact?.selected?.supplementalShortFill || [],
          targetedExactSelectedAtomicPair: Boolean(exact?.selected?.atomicPair),
          targetedExactSelectedPairAnswers: exact?.selected?.pairAnswers || [],
          targetedExactSupplementalEntries: Number(exact?.search?.supplementalShortFillEntries || 0),
          targetedExactSupplementalStates: Number(exact?.search?.supplementalShortFillStates || 0),
          targetedExactWeakFillBudget: Number(exact?.search?.weakFillBudget || 0),
          targetedExactWeakFillRejected: Number(exact?.search?.weakFillBudgetRejected || 0),
          targetedExactStatesBeforeWeakBudget: Number(exact?.search?.statesAcceptedBeforeWeakBudget || 0),
          targetedExactDisconnectedRollbackRelaxed: Number(exact?.search?.disconnectedRollbackRelaxed
            || atomic?.disconnectedRollbackRelaxed
            || 0),
          targetedExactAtomicStates: Number(atomic?.statesAccepted || 0),
          targetedExactAtomicCompatiblePairs: Number(atomic?.compatibleSlotPairs || 0),
          targetedExactAtomicEntryPairs: Number(atomic?.entryPairsConsidered || 0),
          targetedExactAtomicRollbackInvalid: Number(atomic?.rollbackInvalid || 0),
          targetedExactStagePanelGain: exact?.stagePanelGain || {},
          clueRepackAccepted: Boolean(sample.constructionV2?.clueRepack?.accepted),
          adaptiveClueRepackAccepted: Boolean(sample.constructionV2?.adaptiveClueRepack?.accepted),
          clueTailAccepted: Boolean(sample.constructionV2?.clueTailAbsorption?.accepted),
          clueTailGain: Number(sample.constructionV2?.clueTailAbsorption?.panelsBefore != null
            && sample.constructionV2?.clueTailAbsorption?.panelsAfter != null
            ? sample.constructionV2.clueTailAbsorption.panelsBefore - sample.constructionV2.clueTailAbsorption.panelsAfter
            : 0),
          clueReflowAccepted: Boolean(sample.constructionV2?.clueReflow?.accepted),
          clueReflowGain: Number(sample.constructionV2?.clueReflow?.panelsBefore != null
            && sample.constructionV2?.clueReflow?.panelsAfter != null
            ? sample.constructionV2.clueReflow.panelsBefore - sample.constructionV2.clueReflow.panelsAfter
            : 0),
        };
        resolve();
      } catch (error) {
        reject(new Error(`${seed}: ${error.message}`));
      }
    });
  });
}

async function workerLoop() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= runCount) return;
    await runSeed(index);
  }
}

(async () => {
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, runCount) }, () => workerLoop()));
    for (const sample of samples) console.log(JSON.stringify(sample));
    const summary = {
      type: "summary",
      runs: samples.length,
      concurrency,
      averagePanels: average(samples.map((sample) => sample.panels)),
      maximumPanels: Math.max(...samples.map((sample) => sample.panels)),
      minimumPanels: Math.min(...samples.map((sample) => sample.panels)),
      averageRawLetterPercent: average(samples.map((sample) => sample.rawLetterPercent)),
      averageAnswers: average(samples.map((sample) => sample.answers)),
      averageElapsedMs: average(samples.map((sample) => sample.elapsedMs)),
      victimSelectedSeeds: samples.filter((sample) => sample.victimDepth > 0).length,
      targetedVictimAttemptedSeeds: samples.filter((sample) => sample.targetedVictimAttempted).length,
      targetedVictimAcceptedSeeds: samples.filter((sample) => sample.targetedVictimAccepted).length,
      averageTargetedVictimGain: average(samples.map((sample) => sample.targetedVictimGain)),
      averageTargetedVictimsRolledBack: average(samples.map((sample) => sample.targetedVictimsRolledBack)),
      averageTargetedStatesAccepted: average(samples.map((sample) => sample.targetedStatesAccepted)),
      averageTargetedFinalistsEvaluated: average(samples.map((sample) => sample.targetedFinalistsEvaluated)),
      targetedExactVictimAttemptedSeeds: samples.filter((sample) => sample.targetedExactVictimAttempted).length,
      targetedExactVictimAcceptedSeeds: samples.filter((sample) => sample.targetedExactVictimAccepted).length,
      averageTargetedExactVictimGain: average(samples.map((sample) => sample.targetedExactVictimGain)),
      averageTargetedExactStructuralVariants: average(samples.map((sample) => sample.targetedExactStructuralVariants)),
      averageTargetedExactFinalistsEvaluated: average(samples.map((sample) => sample.targetedExactFinalistsEvaluated)),
      averageTargetedExactFinalistsPassingCheckpoint: average(samples.map((sample) => sample.targetedExactFinalistsPassingCheckpoint)),
      averageTargetedExactImprovingFinalists: average(samples.map((sample) => sample.targetedExactImprovingFinalists)),
      targetedExactSupplementalStateSeeds: samples.filter((sample) => sample.targetedExactSupplementalStates > 0).length,
      targetedExactSupplementalAcceptedSeeds: samples.filter((sample) => sample.targetedExactSelectedShortFill.length > 0).length,
      averageTargetedExactSupplementalStates: average(samples.map((sample) => sample.targetedExactSupplementalStates)),
      totalTargetedExactWeakFillRejected: samples.reduce((sum, sample) => sum + sample.targetedExactWeakFillRejected, 0),
      targetedExactDisconnectedRollbackSeeds: samples.filter((sample) => sample.targetedExactDisconnectedRollbackRelaxed > 0).length,
      totalTargetedExactDisconnectedRollbacks: samples.reduce((sum, sample) => sum + sample.targetedExactDisconnectedRollbackRelaxed, 0),
      targetedExactAtomicStateSeeds: samples.filter((sample) => sample.targetedExactAtomicStates > 0).length,
      targetedExactAtomicSelectedSeeds: samples.filter((sample) => sample.targetedExactSelectedAtomicPair).length,
      totalTargetedExactAtomicStates: samples.reduce((sum, sample) => sum + sample.targetedExactAtomicStates, 0),
      totalTargetedExactAtomicCompatiblePairs: samples.reduce((sum, sample) => sum + sample.targetedExactAtomicCompatiblePairs, 0),
      totalTargetedExactAtomicEntryPairs: samples.reduce((sum, sample) => sum + sample.targetedExactAtomicEntryPairs, 0),
      totalTargetedExactAtomicRollbackInvalid: samples.reduce((sum, sample) => sum + sample.targetedExactAtomicRollbackInvalid, 0),
      clueRepackAcceptedSeeds: samples.filter((sample) => sample.clueRepackAccepted).length,
      adaptiveClueRepackAcceptedSeeds: samples.filter((sample) => sample.adaptiveClueRepackAccepted).length,
      clueTailAcceptedSeeds: samples.filter((sample) => sample.clueTailAccepted).length,
      averageClueTailGain: average(samples.map((sample) => sample.clueTailGain)),
      clueReflowAcceptedSeeds: samples.filter((sample) => sample.clueReflowAccepted).length,
      averageClueReflowGain: average(samples.map((sample) => sample.clueReflowGain)),
    };
    summary.checkpointPassed = summary.averagePanels <= 8 && summary.maximumPanels <= 12;
    summary.requirement = { averagePanelsAtMost: 8, maximumPanelsAtMost: 12 };
    console.log(JSON.stringify(summary));
    if (enforce && !summary.checkpointPassed) process.exitCode = 1;
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
})();
