(() => {
  "use strict";

  if (typeof require === "function") {
    if (!window.ScanwordEditorialDemandLexiconV3) require("./editorial-demand-lexicon-v3.js");
    if (!window.ScanwordEditorialDemandLexiconSupplementV3) {
      require("./editorial-demand-lexicon-supplement-v3.js");
    }
    if (!window.ScanwordEditorialDemandShortLexiconV3) {
      require("./editorial-demand-short-lexicon-v3.js");
    }
    if (!window.ScanwordEditorialDemandTailLexiconV3) {
      require("./editorial-demand-tail-lexicon-v3.js");
    }
  }

  const solver = window.ScanwordSolver;
  const policy = window.ScanwordEditorialLexicalPolicyV3;
  const retrieval = window.ScanwordFullCorpusPatternIndexV1;
  if (!solver || !policy || solver.__editorialRepairV3Installed) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_EDITORIAL_REPAIR) {
      return process.env.SCANWORD_EDITORIAL_REPAIR;
    }
    return window.SCANWORD_EDITORIAL_REPAIR || "off";
  }

  function cloneResult(result) {
    if (typeof structuredClone === "function") return structuredClone(result);
    return JSON.parse(JSON.stringify(result));
  }

  function withRetrievalMode(value, callback) {
    if (typeof process !== "undefined") {
      const previous = process.env.SCANWORD_FULL_CORPUS_RETRIEVAL;
      process.env.SCANWORD_FULL_CORPUS_RETRIEVAL = value;
      try {
        return callback();
      } finally {
        if (previous == null) delete process.env.SCANWORD_FULL_CORPUS_RETRIEVAL;
        else process.env.SCANWORD_FULL_CORPUS_RETRIEVAL = previous;
      }
    }
    const previous = window.SCANWORD_FULL_CORPUS_RETRIEVAL;
    window.SCANWORD_FULL_CORPUS_RETRIEVAL = value;
    try {
      return callback();
    } finally {
      window.SCANWORD_FULL_CORPUS_RETRIEVAL = previous;
    }
  }

  function runRepairPipeline(result) {
    if (!result?.grid || !Array.isArray(result.placed)) return result;
    const before = policy.summarize(result.placed);
    const stages = [];
    const demandLexicon = window.ScanwordEditorialDemandLexiconV3;

    if (typeof demandLexicon?.extendPool === "function") {
      result = demandLexicon.extendPool(result);
      stages.push({
        name: "demand-lexicon-extension",
        accepted: 0,
        added: Number(result.constructionV2?.editorialDemandLexicon?.addedEntries || 0),
      });
    }
    const supplement = window.ScanwordEditorialDemandLexiconSupplementV3;
    if (typeof supplement?.extendPool === "function") {
      result = supplement.extendPool(result);
      stages.push({
        name: "demand-lexicon-supplement",
        accepted: 0,
        added: Number(result.constructionV2?.editorialDemandLexiconSupplement?.addedEntries || 0),
      });
    }
    const shortLexicon = window.ScanwordEditorialDemandShortLexiconV3;
    if (typeof shortLexicon?.extendPool === "function") {
      result = shortLexicon.extendPool(result);
      stages.push({
        name: "demand-short-lexicon",
        accepted: 0,
        added: Number(result.constructionV2?.editorialDemandShortLexicon?.addedEntries || 0),
      });
    }
    const tailLexicon = window.ScanwordEditorialDemandTailLexiconV3;
    if (typeof tailLexicon?.extendPool === "function") {
      result = tailLexicon.extendPool(result);
      stages.push({
        name: "demand-tail-lexicon",
        accepted: 0,
        added: Number(result.constructionV2?.editorialDemandTailLexicon?.addedEntries || 0),
      });
    }

    if (typeof solver.applyEditorialReplacementsV3 === "function") {
      result = solver.applyEditorialReplacementsV3(result);
      stages.push({
        name: "single-pattern-replacement",
        accepted: Number(result.constructionV2?.editorialReplacement?.accepted || 0),
      });
    }
    if (typeof solver.applyEditorialPairRefitsV3 === "function") {
      result = solver.applyEditorialPairRefitsV3(result);
      stages.push({
        name: "crossing-pair-refit",
        accepted: Number(result.constructionV2?.editorialPairRefit?.accepted || 0),
      });
    }
    if (typeof solver.applyEditorialBundleRefitsV3 === "function") {
      result = solver.applyEditorialBundleRefitsV3(result);
      stages.push({
        name: "radius-two-component-csp",
        accepted: Number(result.constructionV2?.editorialBundleRefit?.accepted || 0),
      });
    }

    const metrics = solver.resultMetrics(result);
    const after = policy.summarize(result.placed);
    result.validation = metrics.validation;
    result.intersections = metrics.intersections;
    result.doubles = metrics.doubles;
    result.components = metrics.components;
    result.score = metrics.score;
    result.constructionV2 = {
      ...(result.constructionV2 || {}),
      editorialRepair: {
        mode: "same-geometry-editorial-repair-pipeline-v3",
        stages,
        accepted: stages.reduce((sum, stage) => sum + stage.accepted, 0),
        before,
        after,
        formulaicGain: before.formulaicShortCount - after.formulaicShortCount,
        editorialPenaltyGain: before.editorialPenalty - after.editorialPenalty,
        panelsBefore: result.panelCells,
        panelsAfter: result.panelCells,
        answersBefore: result.placed.length,
        answersAfter: result.placed.length,
        validation: metrics.validation,
      },
    };
    return result;
  }

  function structuralSignature(result) {
    const payload = {
      rows: result.rows,
      cols: result.cols,
      panelCells: result.panelCells,
      intersections: result.intersections,
      components: result.components,
      grid: (result.grid || []).map((row) => row.map((cell) => ({
        type: cell.type,
        slotIds: [...(cell.slotIds || [])].map(Number).sort((a, b) => a - b),
        directions: [...(cell.directions || [])].sort(),
        footprintId: cell.footprintId || null,
        clues: (cell.clues || []).map((clue) => ({
          slotId: Number(clue.slotId || 0),
          direction: clue.direction,
          textCells: (clue.textCells || []).map((item) => [item.row, item.col]),
        })).sort((a, b) => a.slotId - b.slotId || String(a.direction).localeCompare(String(b.direction))),
      }))),
      answers: (result.placed || []).map((word) => ({
        id: Number(word.id),
        direction: word.direction,
        clueRow: word.clueRow,
        clueCol: word.clueCol,
        startRow: word.startRow,
        startCol: word.startCol,
        cells: (word.cells || []).map((cell) => [cell.row, cell.col]),
      })).sort((a, b) => a.id - b.id),
      clueFootprints: (result.clueFootprints || []).map((footprint) => ({
        id: footprint.id,
        slotId: footprint.slotId,
        arrowRow: footprint.arrowRow,
        arrowCol: footprint.arrowCol,
        cells: (footprint.cells || []).map((cell) => [cell.row, cell.col]),
      })),
    };
    return JSON.stringify(payload);
  }

  function repairSummary(result) {
    const editorial = policy.summarize(result.placed || []);
    return {
      valid: Boolean(result.validation?.valid),
      components: Number(result.components || 0),
      exactCluesOnly: Boolean((result.placed || []).every((entry) => entry.hasExactClue)),
      panels: Number(result.panelCells || 0),
      answers: Number(result.placed?.length || 0),
      crossings: Number(result.intersections || 0),
      formulaicShortCount: Number(editorial.formulaicShortCount || 0),
      editorialPenalty: Number(editorial.editorialPenalty || 0),
      twoLetterCount: Number(editorial.twoLetterCount || 0),
    };
  }

  function chooseRetrievalCandidate(baseline, candidate) {
    const baselineSummary = repairSummary(baseline);
    const candidateSummary = repairSummary(candidate);
    const structuralEqual = structuralSignature(baseline) === structuralSignature(candidate);
    const validBoundary = candidateSummary.valid
      && candidateSummary.components === 1
      && candidateSummary.exactCluesOnly;
    const editorialBetter = candidateSummary.formulaicShortCount < baselineSummary.formulaicShortCount
      || (candidateSummary.formulaicShortCount === baselineSummary.formulaicShortCount
        && candidateSummary.editorialPenalty < baselineSummary.editorialPenalty);
    const twoLetterSafe = candidateSummary.twoLetterCount <= baselineSummary.twoLetterCount;
    const accepted = structuralEqual && validBoundary && editorialBetter && twoLetterSafe;
    let reason = "strict-editorial-improvement";
    if (!structuralEqual) reason = "structural-mismatch";
    else if (!validBoundary) reason = "validation-boundary-failed";
    else if (!twoLetterSafe) reason = "two-letter-regression";
    else if (!editorialBetter) reason = "no-strict-editorial-improvement";
    return { accepted, reason, structuralEqual, baselineSummary, candidateSummary };
  }

  function finalRetrievalReport(candidateReport, decision) {
    const source = cloneResult(candidateReport || {
      enabled: true,
      mode: retrieval?.retrievalMode?.() || "empty",
      indexedEntries: 0,
      stages: {},
      totals: {},
    });
    const candidateTotals = cloneResult(source.totals || {});
    source.enabled = true;
    source.candidateAccepted = decision.accepted;
    source.candidateDecision = decision.reason;
    source.candidateTotals = candidateTotals;
    source.comparison = {
      structuralEqual: decision.structuralEqual,
      baseline: decision.baselineSummary,
      candidate: decision.candidateSummary,
    };
    if (!decision.accepted) {
      source.totals = {
        ...candidateTotals,
        selectedFallbackEntries: 0,
        selectedFallbackAnswers: [],
      };
    }
    return source;
  }

  function applyEditorialRepair(result) {
    if (!result?.grid || !Array.isArray(result.placed)) return result;
    if (!retrieval?.enabled?.()) return runRepairPipeline(result);

    const baseline = withRetrievalMode("off", () => runRepairPipeline(cloneResult(result)));
    const candidate = withRetrievalMode("on", () => runRepairPipeline(cloneResult(result)));
    const decision = chooseRetrievalCandidate(baseline, candidate);
    const selected = decision.accepted ? candidate : baseline;
    const candidateReport = candidate.constructionV2?.fullCorpusRetrieval || null;
    selected.constructionV2 = {
      ...(selected.constructionV2 || {}),
      fullCorpusRetrieval: finalRetrievalReport(candidateReport, decision),
      editorialRepair: {
        ...(selected.constructionV2?.editorialRepair || {}),
        retrievalComparison: {
          accepted: decision.accepted,
          reason: decision.reason,
          structuralEqual: decision.structuralEqual,
          baseline: decision.baselineSummary,
          candidate: decision.candidateSummary,
        },
      },
    };
    return selected;
  }

  solver.generateBest = (...args) => {
    const result = previousGenerateBest(...args);
    if (modeFromEnvironment() !== "on") return result;
    return applyEditorialRepair(result);
  };

  Object.assign(solver, {
    applyEditorialRepairV3: applyEditorialRepair,
    runEditorialRepairPipelineV3: runRepairPipeline,
    chooseFullCorpusRepairCandidateV1: chooseRetrievalCandidate,
    __editorialRepairV3Installed: true,
  });
})();

if (typeof require === "function" && !window.ScanwordSolver?.__vocabularyPortfolioV1Installed) {
  require("./construction-vocabulary-portfolio-v1.js");
}
