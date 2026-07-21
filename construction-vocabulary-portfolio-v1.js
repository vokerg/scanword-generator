(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const policy = window.ScanwordEditorialLexicalPolicyV3;
  if (!solver || solver.__vocabularyPortfolioV1Installed) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function numericOption(name, fallback) {
    const value = Number(environmentOption(name, fallback));
    return Number.isFinite(value) ? value : fallback;
  }

  function modeFromEnvironment() {
    return String(environmentOption("SCANWORD_VOCABULARY_PORTFOLIO", "off"));
  }

  function portfolioMode() {
    const mode = String(environmentOption("SCANWORD_VOCABULARY_PORTFOLIO_MODE", "full")).toLowerCase();
    return mode === "adaptive" ? "adaptive" : "full";
  }

  function partialSearchMode() {
    return String(environmentOption("SCANWORD_PARTIAL_SEARCH", "off")).toLowerCase();
  }

  function configuredLimits() {
    const parsed = String(environmentOption("SCANWORD_VOCABULARY_PORTFOLIO_LIMITS", "2500,3500"))
      .split(",")
      .map(Number)
      .filter((value) => Number.isFinite(value) && value >= 500)
      .map(Math.floor);
    return [...new Set(parsed.length ? parsed : [2500, 3500])];
  }

  function adaptiveThresholds() {
    return {
      maxPanels: numericOption("SCANWORD_VOCABULARY_FAST_MAX_PANELS", 4),
      minAnswers: numericOption("SCANWORD_VOCABULARY_FAST_MIN_ANSWERS", 47),
      minCrossings: numericOption("SCANWORD_VOCABULARY_FAST_MIN_CROSSINGS", 50),
      maxEditorialPenalty: numericOption("SCANWORD_VOCABULARY_FAST_MAX_EDITORIAL_PENALTY", 430),
      maxFormulaicShort: numericOption("SCANWORD_VOCABULARY_FAST_MAX_FORMULAIC", 0),
    };
  }

  function summarize(result, activeLimit, elapsedMs, searchVariant = "default") {
    const editorial = policy?.summarize?.(result.placed || []) || {};
    return {
      activeLimit,
      searchVariant,
      elapsedMs,
      panels: Number(result.panelCells || 0),
      answers: Number(result.placed?.length || 0),
      crossings: Number(result.intersections || 0),
      rawLetterPercent: +((Number(result.rawLetterCoverage || 0) * 100).toFixed(2)),
      answerPercent: +((Number(result.answerCoverage || 0) * 100).toFixed(2)),
      editorialPenalty: Number(editorial.editorialPenalty || 0),
      formulaicShortCount: Number(editorial.formulaicShortCount || 0),
      validationValid: Boolean(result.validation?.valid),
      components: Number(result.components || 0),
      score: Number(result.score || 0),
      selectedAttempt: Number(result.constructionV2?.selectedAttempt || 0),
      selectedPartialSearchVariant: result.constructionV2?.selectedPartialSearchVariant || null,
    };
  }

  function variantRank(summary) {
    return summary.searchVariant === "beam" ? 1 : 0;
  }

  function compareCandidates(first, second) {
    const a = first.summary;
    const b = second.summary;
    if (a.validationValid !== b.validationValid) return a.validationValid ? -1 : 1;
    if ((a.components === 1) !== (b.components === 1)) return a.components === 1 ? -1 : 1;
    return a.panels - b.panels
      || b.answers - a.answers
      || b.crossings - a.crossings
      || b.rawLetterPercent - a.rawLetterPercent
      || a.editorialPenalty - b.editorialPenalty
      || a.formulaicShortCount - b.formulaicShortCount
      || b.score - a.score
      || variantRank(a) - variantRank(b)
      || a.activeLimit - b.activeLimit;
  }

  function qualifiesForAdaptiveFastPath(summary, thresholds = adaptiveThresholds()) {
    return summary.validationValid
      && summary.components === 1
      && summary.panels <= thresholds.maxPanels
      && summary.answers >= thresholds.minAnswers
      && summary.crossings >= thresholds.minCrossings
      && summary.editorialPenalty <= thresholds.maxEditorialPenalty
      && summary.formulaicShortCount <= thresholds.maxFormulaicShort;
  }

  function withEnvironment(name, value, callback) {
    if (value == null) return callback();
    if (typeof process !== "undefined") {
      const previous = process.env[name];
      process.env[name] = String(value);
      try {
        return callback();
      } finally {
        if (previous == null) delete process.env[name];
        else process.env[name] = previous;
      }
    }
    const previous = window[name];
    window[name] = value;
    try {
      return callback();
    } finally {
      window[name] = previous;
    }
  }

  function withActiveLimit(limit, callback) {
    return withEnvironment("SCANWORD_ACTIVE_POOL_LIMIT", limit, callback);
  }

  function splitAttemptBudget() {
    const total = Math.max(2, Math.floor(numericOption("SCANWORD_PORTFOLIO_ATTEMPTS", 120)));
    const baseline = Math.max(1, Math.floor(numericOption(
      "SCANWORD_PARTIAL_SEARCH_BASE_ATTEMPTS",
      total,
    )));
    const beam = Math.max(1, Math.floor(numericOption(
      "SCANWORD_PARTIAL_SEARCH_BEAM_ATTEMPTS",
      Math.max(24, Math.ceil(total / 4)),
    )));
    const beamOffset = Math.max(0, Math.floor(numericOption(
      "SCANWORD_PARTIAL_SEARCH_BEAM_OFFSET",
      Math.floor(total / 2),
    )));
    return { total, baseline, beam, beamOffset };
  }

  function runCandidate(args, limit, searchVariant, attempts = null, offset = null) {
    const started = Date.now();
    const result = withActiveLimit(limit, () => withEnvironment(
      "SCANWORD_PARTIAL_SEARCH",
      searchVariant === "beam" ? "beam" : searchVariant === "shadow" ? "shadow" : "off",
      () => withEnvironment(
        "SCANWORD_PORTFOLIO_ATTEMPTS",
        attempts,
        () => withEnvironment(
          "SCANWORD_PORTFOLIO_ATTEMPT_OFFSET",
          offset,
          () => previousGenerateBest(...args),
        ),
      ),
    ));
    return {
      result,
      summary: summarize(result, limit, Date.now() - started, searchVariant),
    };
  }

  function attachPartialSearchPortfolio(selected, candidates, budget) {
    const selectedLimit = selected.summary.activeLimit;
    const evidence = candidates.find((candidate) => (
      candidate.summary.activeLimit === selectedLimit && candidate.summary.searchVariant === "beam"
    )) || candidates.find((candidate) => candidate.summary.searchVariant === "beam") || null;
    const selectedEvidence = selected.result.partialSearch || null;
    const beamEvidence = evidence?.result?.partialSearch || null;
    const wordEvidence = (selected.result.placed || []).find((word) => word.phase6Search)?.phase6Search || null;
    selected.result.partialSearch = {
      schemaVersion: 1,
      search: "split-complete-pipeline-v1",
      mode: "beam",
      selected: selectedEvidence?.selected || wordEvidence || null,
      aggregate: beamEvidence?.aggregate || selectedEvidence?.aggregate || null,
      portfolio: {
        budget,
        selectedLimit,
        selectedSearchVariant: selected.summary.searchVariant,
        selectedAttemptVariant: selected.summary.selectedPartialSearchVariant,
        candidates: candidates.map((candidate) => candidate.summary),
      },
    };
  }

  function generateVocabularyPortfolio(...args) {
    const limits = configuredLimits();
    const mode = portfolioMode();
    const thresholds = adaptiveThresholds();
    const searchMode = partialSearchMode();
    const candidates = [];
    let fastPathAccepted = false;
    const splitBudget = searchMode === "beam" ? splitAttemptBudget() : null;

    for (let index = 0; index < limits.length; index += 1) {
      const limit = limits[index];
      if (searchMode === "beam") {
        candidates.push(runCandidate(args, limit, "baseline", splitBudget.baseline, 0));
        candidates.push(runCandidate(args, limit, "beam", splitBudget.beam, splitBudget.beamOffset));
        continue;
      }

      const candidate = runCandidate(args, limit, searchMode === "shadow" ? "shadow" : "default");
      candidates.push(candidate);
      if (mode === "adaptive" && index === 0 && qualifiesForAdaptiveFastPath(candidate.summary, thresholds)) {
        fastPathAccepted = true;
        break;
      }
    }

    const ranked = [...candidates].sort(compareCandidates);
    const selected = ranked[0];
    selected.result.constructionV2 = {
      ...(selected.result.constructionV2 || {}),
      vocabularyPortfolio: {
        mode: searchMode === "beam"
          ? "panel-first-active-set-portfolio-v1-phase6-split"
          : mode === "adaptive"
            ? "panel-first-active-set-portfolio-v1-adaptive"
            : "panel-first-active-set-portfolio-v1",
        evaluationMode: mode,
        partialSearchMode: searchMode,
        splitAttemptBudget: splitBudget,
        limits,
        evaluatedLimits: [...new Set(candidates.map((candidate) => candidate.summary.activeLimit))],
        skippedLimits: limits.filter((limit) => !candidates.some((candidate) => candidate.summary.activeLimit === limit)),
        fastPathAccepted,
        thresholds: mode === "adaptive" ? thresholds : null,
        selectedLimit: selected.summary.activeLimit,
        selectedSearchVariant: selected.summary.searchVariant,
        selected: selected.summary,
        candidates: ranked.map((candidate) => candidate.summary),
        totalCandidateElapsedMs: candidates.reduce((sum, candidate) => sum + candidate.summary.elapsedMs, 0),
      },
    };
    if (searchMode === "beam") attachPartialSearchPortfolio(selected, candidates, splitBudget);
    return selected.result;
  }

  solver.generateBest = (...args) => {
    if (String(modeFromEnvironment()).toLowerCase() !== "on") return previousGenerateBest(...args);
    return generateVocabularyPortfolio(...args);
  };

  Object.assign(solver, {
    generateVocabularyPortfolioV1: generateVocabularyPortfolio,
    compareVocabularyPortfolioCandidatesV1: compareCandidates,
    qualifiesForAdaptiveVocabularyFastPathV1: qualifiesForAdaptiveFastPath,
    vocabularyAdaptiveThresholdsV1: adaptiveThresholds,
    __vocabularyPortfolioV1Installed: true,
  });
})();
