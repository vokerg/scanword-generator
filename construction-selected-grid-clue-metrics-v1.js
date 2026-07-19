(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || solver.__selectedGridClueMetricsV1Installed) return;

  const previousGenerateBest = solver.generateBest.bind(solver);
  const properCategories = new Set(["given-name", "surname", "patronymic", "city", "capital"]);

  function normalizeAnswer(value) {
    return String(value || "").trim().toLowerCase().replaceAll("ё", "е");
  }

  function clueKey(value) {
    return String(value || "").trim().toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ");
  }

  function metadata(answer) {
    return window.RUSSIAN_LEXICAL_META?.[normalizeAnswer(answer)] || {};
  }

  function answerSignature(placed) {
    return [...(placed || [])]
      .map((word) => String(word.answer || ""))
      .sort((a, b) => a.localeCompare(b, "ru"))
      .join("|");
  }

  function geometrySignature(placed) {
    return [...(placed || [])]
      .map((word) => {
        const cells = (word.cells || [])
          .map((cell) => `${Number(cell.row)}:${Number(cell.col)}`)
          .join(",");
        return [
          Number(word.id || 0),
          String(word.answer || ""),
          String(word.direction || ""),
          Number(word.clueRow ?? -1),
          Number(word.clueCol ?? -1),
          Number(word.startRow ?? -1),
          Number(word.startCol ?? -1),
          cells,
        ].join(":");
      })
      .sort((a, b) => a.localeCompare(b, "ru"))
      .join("|");
  }

  function summarize(placed) {
    let genericClueCount = 0;
    let generatedClueCount = 0;
    let factualTemplateCount = 0;
    let properNameCount = 0;
    let rewrittenClueCount = 0;
    let overRevealingGeneratedClueCount = 0;
    const categories = new Set();
    const sources = new Set();
    const clues = new Map();
    const genericClues = new Map();

    for (const word of placed || []) {
      const meta = metadata(word.answer);
      const category = String(meta.category || word.lexicalCategory || "core-reviewed");
      const source = String(meta.source || word.lexicalSource || "unknown");
      categories.add(category);
      sources.add(source);
      if (meta.genericTemplate) genericClueCount += 1;
      if (meta.generatedTemplate) generatedClueCount += 1;
      if (meta.generatedTemplate && !meta.genericTemplate) factualTemplateCount += 1;
      if (properCategories.has(category)) properNameCount += 1;

      const key = clueKey(word.clue);
      if (key) {
        clues.set(key, (clues.get(key) || 0) + 1);
        if (meta.genericTemplate) genericClues.set(key, (genericClues.get(key) || 0) + 1);
      }

      if (word.clueEditorial?.generated) rewrittenClueCount += 1;
      if (word.clueEditorial?.overRevealing) overRevealingGeneratedClueCount += 1;
    }

    const repeated = (counts) => ({
      count: [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
      kinds: [...counts.values()].filter((count) => count > 1).length,
    });
    const allRepeated = repeated(clues);
    const genericRepeated = repeated(genericClues);

    return {
      genericClueCount,
      generatedClueCount,
      factualTemplateCount,
      properNameCount,
      distinctCategories: categories.size,
      distinctSources: sources.size,
      repeatedClueCount: allRepeated.count,
      repeatedClueKinds: allRepeated.kinds,
      repeatedGenericClueCount: genericRepeated.count,
      repeatedGenericClueKinds: genericRepeated.kinds,
      rewrittenClueCount,
      overRevealingGeneratedClueCount,
    };
  }

  function annotate(result) {
    if (!result || typeof result !== "object") return result;
    const metrics = summarize(result.placed || []);
    const summary = {
      ...metrics,
      answerSignature: answerSignature(result.placed || []),
      geometrySignature: geometrySignature(result.placed || []),
    };
    result.constructionV2 = {
      ...(result.constructionV2 || {}),
      selectedGridClues: summary,
    };
    const selected = result.constructionV2?.vocabularyPortfolio?.selected;
    if (selected) Object.assign(selected, metrics);
    return result;
  }

  solver.generateBest = (...args) => annotate(previousGenerateBest(...args));
  Object.assign(solver, {
    summarizeSelectedGridCluesV1: summarize,
    annotateSelectedGridCluesV1: annotate,
    selectedGridAnswerSignatureV1: answerSignature,
    selectedGridGeometrySignatureV1: geometrySignature,
    selectedGridClueKeyV1: clueKey,
    selectedGridClueMetadataV1: metadata,
    __selectedGridClueMetricsV1Installed: true,
  });
})();
