(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const policy = window.ScanwordEditorialLexicalPolicyV3;
  if (!solver || solver.__vocabularyEditorialTieBreakV1Installed) return;

  const previousGenerateBest = solver.generateBest.bind(solver);
  const properCategories = new Set(["given-name", "surname", "patronymic", "city", "capital"]);

  function option(name, fallback) {
    const value = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return value == null || value === "" ? fallback : value;
  }

  function enabled() {
    return String(option("SCANWORD_VOCABULARY_EDITORIAL_TIEBREAK", "off")).toLowerCase() === "on";
  }

  function limits() {
    const parsed = String(option("SCANWORD_VOCABULARY_PORTFOLIO_LIMITS", "2500,3500"))
      .split(",").map(Number).filter((value) => Number.isFinite(value) && value >= 500).map(Math.floor);
    return [...new Set(parsed.length ? parsed : [2500, 3500])];
  }

  function metadata(answer) {
    const key = String(answer || "").trim().toLowerCase().replaceAll("ё", "е");
    return window.RUSSIAN_LEXICAL_META?.[key] || {};
  }

  function clueKey(clue) {
    return String(clue || "").trim().toLowerCase().replaceAll("ё", "е");
  }

  function clueMetrics(placed) {
    let genericClues = 0;
    let generatedClues = 0;
    let factualTemplates = 0;
    let properNames = 0;
    const categories = new Set();
    const sources = new Set();
    const clues = new Map();

    for (const word of placed || []) {
      const meta = metadata(word.answer);
      const category = String(meta.category || "core-reviewed");
      categories.add(category);
      sources.add(String(meta.source || "unknown"));
      if (meta.genericTemplate) genericClues += 1;
      if (meta.generatedTemplate) generatedClues += 1;
      if (meta.generatedTemplate && !meta.genericTemplate) factualTemplates += 1;
      if (properCategories.has(category)) properNames += 1;
      const key = clueKey(word.clue);
      if (key) clues.set(key, (clues.get(key) || 0) + 1);
    }

    return {
      genericClueCount: genericClues,
      generatedClueCount: generatedClues,
      factualTemplateCount: factualTemplates,
      properNameCount: properNames,
      distinctCategories: categories.size,
      distinctSources: sources.size,
      repeatedClueCount: [...clues.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
      repeatedClueKinds: [...clues.values()].filter((count) => count > 1).length,
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
      editorialPenalty: Number(editorial.editorialPenalty || 0),
      formulaicShortCount: Number(editorial.formulaicShortCount || 0),
      ...clueMetrics(result.placed || []),
      validationValid: Boolean(result.validation?.valid),
      components: Number(result.components || 0),
      score: Number(result.score || 0),
    };
  }

  function compare(first, second) {
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
      || a.repeatedClueCount - b.repeatedClueCount
      || a.genericClueCount - b.genericClueCount
      || a.properNameCount - b.properNameCount
      || b.distinctCategories - a.distinctCategories
      || b.distinctSources - a.distinctSources
      || b.score - a.score
      || a.activeLimit - b.activeLimit;
  }

  function runSingle(activeLimit, args) {
    const processMode = typeof process !== "undefined";
    const previousLimit = processMode ? process.env.SCANWORD_ACTIVE_POOL_LIMIT : window.SCANWORD_ACTIVE_POOL_LIMIT;
    const previousPortfolio = processMode ? process.env.SCANWORD_VOCABULARY_PORTFOLIO : window.SCANWORD_VOCABULARY_PORTFOLIO;
    if (processMode) {
      process.env.SCANWORD_ACTIVE_POOL_LIMIT = String(activeLimit);
      process.env.SCANWORD_VOCABULARY_PORTFOLIO = "off";
    } else {
      window.SCANWORD_ACTIVE_POOL_LIMIT = activeLimit;
      window.SCANWORD_VOCABULARY_PORTFOLIO = "off";
    }
    try {
      return previousGenerateBest(...args);
    } finally {
      if (processMode) {
        if (previousLimit == null) delete process.env.SCANWORD_ACTIVE_POOL_LIMIT;
        else process.env.SCANWORD_ACTIVE_POOL_LIMIT = previousLimit;
        if (previousPortfolio == null) delete process.env.SCANWORD_VOCABULARY_PORTFOLIO;
        else process.env.SCANWORD_VOCABULARY_PORTFOLIO = previousPortfolio;
      } else {
        window.SCANWORD_ACTIVE_POOL_LIMIT = previousLimit;
        window.SCANWORD_VOCABULARY_PORTFOLIO = previousPortfolio;
      }
    }
  }

  function generate(...args) {
    const configured = limits();
    const candidates = configured.map((activeLimit) => {
      const started = Date.now();
      const result = runSingle(activeLimit, args);
      return { result, summary: summarize(result, activeLimit, Date.now() - started) };
    });
    const ranked = [...candidates].sort(compare);
    const selected = ranked[0];
    selected.result.constructionV2 = {
      ...(selected.result.constructionV2 || {}),
      vocabularyPortfolio: {
        mode: "panel-first-active-set-portfolio-v1-editorial-tiebreak",
        evaluationMode: "full",
        editorialTieBreak: true,
        limits: configured,
        evaluatedLimits: configured,
        skippedLimits: [],
        fastPathAccepted: false,
        selectedLimit: selected.summary.activeLimit,
        selected: selected.summary,
        candidates: ranked.map((candidate) => candidate.summary),
        totalCandidateElapsedMs: candidates.reduce((sum, candidate) => sum + candidate.summary.elapsedMs, 0),
      },
    };
    return selected.result;
  }

  solver.generateBest = (...args) => enabled() ? generate(...args) : previousGenerateBest(...args);
  Object.assign(solver, {
    generateVocabularyEditorialPortfolioV1: generate,
    compareVocabularyEditorialCandidatesV1: compare,
    summarizeSelectedGridCluesV1: clueMetrics,
    vocabularyEditorialTieBreakEnabledV1: enabled,
    __vocabularyEditorialTieBreakV1Installed: true,
  });
})();
