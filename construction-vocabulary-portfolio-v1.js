(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const policy = window.ScanwordEditorialLexicalPolicyV3;
  if (!solver || solver.__vocabularyPortfolioV1Installed) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_VOCABULARY_PORTFOLIO) {
      return process.env.SCANWORD_VOCABULARY_PORTFOLIO;
    }
    return window.SCANWORD_VOCABULARY_PORTFOLIO || "off";
  }

  function configuredLimits() {
    const raw = typeof process !== "undefined"
      ? process?.env?.SCANWORD_VOCABULARY_PORTFOLIO_LIMITS
      : window.SCANWORD_VOCABULARY_PORTFOLIO_LIMITS;
    const parsed = String(raw || "2500,3500")
      .split(",")
      .map(Number)
      .filter((value) => Number.isFinite(value) && value >= 500)
      .map(Math.floor);
    return [...new Set(parsed.length ? parsed : [2500, 3500])];
  }

  function summarize(result, activeLimit) {
    const editorial = policy?.summarize?.(result.placed || []) || {};
    return {
      activeLimit,
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
    const candidates = limits.map((limit) => {
      const result = withActiveLimit(limit, () => previousGenerateBest(...args));
      return { result, summary: summarize(result, limit) };
    });
    candidates.sort(compareCandidates);
    const selected = candidates[0];
    selected.result.constructionV2 = {
      ...(selected.result.constructionV2 || {}),
      vocabularyPortfolio: {
        mode: "panel-first-active-set-portfolio-v1",
        limits,
        selectedLimit: selected.summary.activeLimit,
        selected: selected.summary,
        candidates: candidates.map((candidate) => candidate.summary),
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
    __vocabularyPortfolioV1Installed: true,
  });
})();
