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

  function summarize(result, activeLimit, elapsedMs) {
    const editorial = policy?.summarize?.(result.placed || []) || {};
    return {
      activeLimit,
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
    };
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

  function withActiveLimit(limit, callback) {
    if (typeof process !== "undefined") {
      const previous = process.env.SCANWORD_ACTIVE_POOL_LIMIT;
      process.env.SCANWORD_ACTIVE_POOL_LIMIT = String(limit);
      try {
        return callback();
      } finally {
        if (previous == null) delete process.env.SCANWORD_ACTIVE_POOL_LIMIT;
        else process.env.SCANWORD_ACTIVE_POOL_LIMIT = previous;
      }
    }
    const previous = window.SCANWORD_ACTIVE_POOL_LIMIT;
    window.SCANWORD_ACTIVE_POOL_LIMIT = limit;
    try {
      return callback();
    } finally {
      window.SCANWORD_ACTIVE_POOL_LIMIT = previous;
    }
  }

  function generateVocabularyPortfolio(...args) {
    const limits = configuredLimits();
    const mode = portfolioMode();
    const thresholds = adaptiveThresholds();
    const candidates = [];
    let fastPathAccepted = false;

    for (let index = 0; index < limits.length; index += 1) {
      const limit = limits[index];
      const started = Date.now();
      const result = withActiveLimit(limit, () => previousGenerateBest(...args));
      const summary = summarize(result, limit, Date.now() - started);
      candidates.push({ result, summary });
      if (mode === "adaptive" && index === 0 && qualifiesForAdaptiveFastPath(summary, thresholds)) {
        fastPathAccepted = true;
        break;
      }
    }

    const ranked = [...candidates].sort(compareCandidates);
    const selected = ranked[0];
    selected.result.constructionV2 = {
      ...(selected.result.constructionV2 || {}),
      vocabularyPortfolio: {
        mode: mode === "adaptive"
          ? "panel-first-active-set-portfolio-v1-adaptive"
          : "panel-first-active-set-portfolio-v1",
        evaluationMode: mode,
        limits,
        evaluatedLimits: candidates.map((candidate) => candidate.summary.activeLimit),
        skippedLimits: limits.filter((limit) => !candidates.some((candidate) => candidate.summary.activeLimit === limit)),
        fastPathAccepted,
        thresholds: mode === "adaptive" ? thresholds : null,
        selectedLimit: selected.summary.activeLimit,
        selected: selected.summary,
        candidates: ranked.map((candidate) => candidate.summary),
        totalCandidateElapsedMs: candidates.reduce((sum, candidate) => sum + candidate.summary.elapsedMs, 0),
      },
    };
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
