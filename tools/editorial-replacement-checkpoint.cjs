"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workerPath = path.join(__dirname, "benchmark-seed-v3.cjs");
const runCount = Math.max(1, Number(process.argv[2]) || 20);
const prefix = process.argv[3] || "editorial-replacement";
const concurrency = Math.max(1, Number(process.env.SCANWORD_LEXICAL_CONCURRENCY) || 2);
const enforce = process.env.SCANWORD_EDITORIAL_REPLACEMENT_ENFORCE === "1";
const samples = new Array(runCount);
let cursor = 0;

function average(values) {
  return +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
}

function runVariant(seed, replacementMode) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SCANWORD_CONSTRUCTION_MODE: "portfolio",
      SCANWORD_CLOSED_FILL: "diagnostic",
      SCANWORD_PORTFOLIO_SELECTION: "panel-first",
      SCANWORD_LEXICAL_PLACEMENT: "off",
      SCANWORD_EDITORIAL_REPLACE: replacementMode,
      SCANWORD_EDITORIAL_PAIR_REFIT: replacementMode,
      SCANWORD_EDITORIAL_BUNDLE_REFIT: replacementMode,
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
      SCANWORD_EDITORIAL_PAIR_DOMAIN: process.env.SCANWORD_EDITORIAL_PAIR_DOMAIN || "80",
      SCANWORD_EDITORIAL_PAIR_CANDIDATES: process.env.SCANWORD_EDITORIAL_PAIR_CANDIDATES || "600",
      SCANWORD_EDITORIAL_BUNDLE_DOMAIN: process.env.SCANWORD_EDITORIAL_BUNDLE_DOMAIN || "100",
      SCANWORD_EDITORIAL_BUNDLE_NODES: process.env.SCANWORD_EDITORIAL_BUNDLE_NODES || "50000",
      SCANWORD_EDITORIAL_BUNDLE_SOLUTIONS: process.env.SCANWORD_EDITORIAL_BUNDLE_SOLUTIONS || "24",
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
      reject(new Error(`Timed out: ${seed}/${replacementMode}`));
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
        reject(new Error(`${seed}/${replacementMode} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        const sample = JSON.parse(line);
        if (!sample.validation?.valid) throw new Error(`invalid grid: ${JSON.stringify(sample.validation)}`);
        if (sample.components !== 1) throw new Error("disconnected answer graph");
        if (!sample.exactCluesOnly) throw new Error("fallback clue detected");
        if (!sample.coverageCheckpointPassed) throw new Error("preserved production checkpoint failed");
        resolve(sample);
      } catch (error) {
        reject(new Error(`${seed}/${replacementMode}: ${error.message}`));
      }
    });
  });
}

function describe(sample) {
  const single = sample.constructionV2?.editorialReplacement || null;
  const pair = sample.constructionV2?.editorialPairRefit || null;
  const bundle = sample.constructionV2?.editorialBundleRefit || null;
  return {
    panels: sample.panelCells,
    answers: sample.answers,
    crossings: sample.crossings,
    rawLetterPercent: sample.rawLetterPercent,
    twoLetterCount: sample.twoLetterCount,
    formulaicShortCount: sample.formulaicShortCount,
    specialistShortCount: sample.specialistShortCount,
    commonShortCount: sample.commonShortCount,
    editorialWeakCount: sample.editorialWeakCount,
    editorialPenalty: sample.editorialPenalty,
    formulaicAnswers: sample.formulaicAnswers,
    elapsedMs: sample.elapsedMs,
    single: {
      attempted: Number(single?.attempted || 0),
      matchedCandidates: Number(single?.matchedCandidates || 0),
      accepted: Number(single?.accepted || 0),
      replacements: single?.replacements || [],
    },
    pair: {
      targetsAttempted: Number(pair?.targetsAttempted || 0),
      partnerSearches: Number(pair?.partnerSearches || 0),
      domainsBuilt: Number(pair?.domainsBuilt || 0),
      compatiblePairs: Number(pair?.compatiblePairs || 0),
      rejectedPairs: Number(pair?.rejectedPairs || 0),
      accepted: Number(pair?.accepted || 0),
      replacements: pair?.replacements || [],
    },
    bundle: {
      targetsAttempted: Number(bundle?.targetsAttempted || 0),
      bundlesBuilt: Number(bundle?.bundlesBuilt || 0),
      emptyDomainBundles: Number(bundle?.emptyDomainBundles || 0),
      nodes: Number(bundle?.nodes || 0),
      forwardPrunes: Number(bundle?.forwardPrunes || 0),
      solutionsFound: Number(bundle?.solutionsFound || 0),
      rejectedSolutions: Number(bundle?.rejectedSolutions || 0),
      accepted: Number(bundle?.accepted || 0),
      replacements: bundle?.replacements || [],
      unresolved: bundle?.unresolved || [],
    },
  };
}

async function runSeed(index) {
  const seed = `${prefix}-${index}`;
  const baseline = describe(await runVariant(seed, "off"));
  const replacement = describe(await runVariant(seed, "on"));
  const geometryStable = baseline.panels === replacement.panels
    && baseline.answers === replacement.answers
    && baseline.crossings === replacement.crossings
    && baseline.rawLetterPercent === replacement.rawLetterPercent
    && baseline.twoLetterCount === replacement.twoLetterCount;
  samples[index] = {
    type: "seed",
    index,
    seed,
    baseline,
    replacement,
    geometryStable,
    delta: {
      panels: replacement.panels - baseline.panels,
      answers: replacement.answers - baseline.answers,
      crossings: replacement.crossings - baseline.crossings,
      twoLetterCount: replacement.twoLetterCount - baseline.twoLetterCount,
      formulaicShortCount: replacement.formulaicShortCount - baseline.formulaicShortCount,
      editorialWeakCount: replacement.editorialWeakCount - baseline.editorialWeakCount,
      editorialPenalty: replacement.editorialPenalty - baseline.editorialPenalty,
    },
  };
  console.log(JSON.stringify(samples[index]));
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
    const summary = {
      type: "summary",
      runs: samples.length,
      baseline: {
        averagePanels: average(samples.map((sample) => sample.baseline.panels)),
        averageTwoLetterCount: average(samples.map((sample) => sample.baseline.twoLetterCount)),
        averageFormulaicShortCount: average(samples.map((sample) => sample.baseline.formulaicShortCount)),
        maximumFormulaicShortCount: Math.max(...samples.map((sample) => sample.baseline.formulaicShortCount)),
        averageEditorialPenalty: average(samples.map((sample) => sample.baseline.editorialPenalty)),
      },
      replacement: {
        averagePanels: average(samples.map((sample) => sample.replacement.panels)),
        averageTwoLetterCount: average(samples.map((sample) => sample.replacement.twoLetterCount)),
        averageFormulaicShortCount: average(samples.map((sample) => sample.replacement.formulaicShortCount)),
        maximumFormulaicShortCount: Math.max(...samples.map((sample) => sample.replacement.formulaicShortCount)),
        averageEditorialPenalty: average(samples.map((sample) => sample.replacement.editorialPenalty)),
        singleAttempted: samples.reduce((sum, sample) => sum + sample.replacement.single.attempted, 0),
        singleMatchedCandidates: samples.reduce((sum, sample) => sum + sample.replacement.single.matchedCandidates, 0),
        singleAccepted: samples.reduce((sum, sample) => sum + sample.replacement.single.accepted, 0),
        pairTargetsAttempted: samples.reduce((sum, sample) => sum + sample.replacement.pair.targetsAttempted, 0),
        pairPartnerSearches: samples.reduce((sum, sample) => sum + sample.replacement.pair.partnerSearches, 0),
        pairCompatibleCandidates: samples.reduce((sum, sample) => sum + sample.replacement.pair.compatiblePairs, 0),
        pairAccepted: samples.reduce((sum, sample) => sum + sample.replacement.pair.accepted, 0),
        bundleTargetsAttempted: samples.reduce((sum, sample) => sum + sample.replacement.bundle.targetsAttempted, 0),
        bundlesBuilt: samples.reduce((sum, sample) => sum + sample.replacement.bundle.bundlesBuilt, 0),
        bundleNodes: samples.reduce((sum, sample) => sum + sample.replacement.bundle.nodes, 0),
        bundleSolutionsFound: samples.reduce((sum, sample) => sum + sample.replacement.bundle.solutionsFound, 0),
        bundleAccepted: samples.reduce((sum, sample) => sum + sample.replacement.bundle.accepted, 0),
      },
      comparison: {
        improvedSeeds: samples.filter((sample) => sample.delta.formulaicShortCount < 0).length,
        unchangedSeeds: samples.filter((sample) => sample.delta.formulaicShortCount === 0).length,
        regressedSeeds: samples.filter((sample) => sample.delta.formulaicShortCount > 0).length,
        geometryStableSeeds: samples.filter((sample) => sample.geometryStable).length,
        averageFormulaicDelta: average(samples.map((sample) => sample.delta.formulaicShortCount)),
        minimumFormulaicDelta: Math.min(...samples.map((sample) => sample.delta.formulaicShortCount)),
        averageEditorialPenaltyDelta: average(samples.map((sample) => sample.delta.editorialPenalty)),
      },
    };
    console.log(JSON.stringify(summary));

    if (enforce) {
      if (summary.comparison.geometryStableSeeds !== samples.length) {
        throw new Error("editorial replacement changed grid geometry");
      }
      if (summary.comparison.regressedSeeds > 0) {
        throw new Error("editorial replacement increased formulaic short answers");
      }
      if (summary.replacement.averageFormulaicShortCount >= summary.baseline.averageFormulaicShortCount) {
        throw new Error("editorial replacement did not reduce formulaic short answers");
      }
    }
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
})();
