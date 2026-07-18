(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || solver.__clueDisambiguationV1Installed) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function enabled() {
    const value = typeof process !== "undefined"
      ? process?.env?.SCANWORD_SELECTED_GRID_CLUE_DISAMBIGUATION
      : window.SCANWORD_SELECTED_GRID_CLUE_DISAMBIGUATION;
    return String(value || "off").toLowerCase() === "on";
  }

  function metadata(answer) {
    const key = String(answer || "").trim().toLowerCase().replaceAll("ё", "е");
    return window.RUSSIAN_LEXICAL_META?.[key] || {};
  }

  function clueKey(clue) {
    return String(clue || "").trim().toLowerCase().replaceAll("ё", "е");
  }

  function categoryLabel(category, fallback) {
    if (category === "given-name") return "Имя";
    if (category === "surname") return "Фамилия";
    if (category === "patronymic") return "Отчество";
    if (category === "city") return "Город";
    if (category === "capital") return "Столица";
    return String(fallback || "Ответ").replace(/[.!?]+$/g, "");
  }

  function uniqueClue(word, used) {
    const answer = String(word.answer || "");
    const meta = metadata(answer);
    const label = categoryLabel(String(meta.category || ""), word.clue);
    const first = answer[0] || "?";
    const last = answer.at(-1) || "?";
    const candidates = [
      `${label} на ${first}`,
      `${label}: ${first}…${last}`,
      `${label}: ${first}…${last}, ${answer.length} б.`,
      `${label} на ${answer.slice(0, Math.min(2, answer.length))}`,
    ];
    const selected = candidates.find((candidate) => !used.has(clueKey(candidate))) || candidates.at(-1);
    used.add(clueKey(selected));
    return selected;
  }

  function updateSlotClue(result, word, clue) {
    word.clue = clue;
    for (const row of result.grid || []) {
      for (const cell of row || []) {
        for (const item of cell.clues || []) {
          if (item.slotId === word.id) item.text = clue;
        }
      }
    }
    for (const entry of result.pool || []) {
      if (entry.answer === word.answer) entry.clue = clue;
    }
  }

  function disambiguate(result) {
    const before = solver.summarizeSelectedGridCluesV1?.(result.placed || []) || {};
    const groups = new Map();
    for (const word of result.placed || []) {
      const key = clueKey(word.clue);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(word);
    }

    let changedClues = 0;
    let changedGroups = 0;
    for (const words of groups.values()) {
      if (words.length < 2) continue;
      const generic = words.filter((word) => metadata(word.answer).genericTemplate);
      if (!generic.length) continue;
      changedGroups += 1;
      const used = new Set(words.filter((word) => !generic.includes(word)).map((word) => clueKey(word.clue)));
      for (const word of [...generic].sort((a, b) => String(a.answer).localeCompare(String(b.answer)))) {
        const clue = uniqueClue(word, used);
        if (clueKey(clue) === clueKey(word.clue)) continue;
        updateSlotClue(result, word, clue);
        changedClues += 1;
      }
    }

    const after = solver.summarizeSelectedGridCluesV1?.(result.placed || []) || {};
    const portfolio = result?.constructionV2?.vocabularyPortfolio;
    if (portfolio?.selected) Object.assign(portfolio.selected, after);
    result.constructionV2 = {
      ...(result.constructionV2 || {}),
      clueDisambiguation: {
        mode: "repeated-generic-clue-disambiguation-v1",
        changedGroups,
        changedClues,
        before,
        after,
      },
    };
    return result;
  }

  solver.generateBest = (...args) => {
    const result = previousGenerateBest(...args);
    return enabled() ? disambiguate(result) : result;
  };

  Object.assign(solver, {
    disambiguateSelectedGridCluesV1: disambiguate,
    selectedGridClueDisambiguationEnabledV1: enabled,
    __clueDisambiguationV1Installed: true,
  });
})();
