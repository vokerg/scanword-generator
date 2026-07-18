(() => {
  "use strict";
  const normalize = (value) => String(value || "").trim().toUpperCase().replaceAll("Ё", "Е");
  const RAW_ENTRIES = [["ДА","Утвердительный ответ",84],["ПИ","Математическая постоянная, равная отношению длины окружности к диаметру",86],["ФИ","Название греческой буквы φ",78],["ФО","Вьетнамский суп с лапшой",82],["РА","Бог солнца в древнеегипетской мифологии",78],["СУ","Старинная французская монета",76],["КА","Духовный двойник человека в верованиях Древнего Египта",76],["БА","Один из аспектов души в верованиях Древнего Египта",74],["БО","Священное фиговое дерево в буддийской традиции",76],["ЦИ","Жизненная энергия в китайской философии",82],["ДИ","Китайская поперечная флейта",76],["ЯР","Крутой берег или обрыв",84],["ГА","Единица площади — гектар",82]];
  const ENTRIES = Object.freeze(RAW_ENTRIES.map(([answer, clue, lexicalQuality]) => Object.freeze({
    id: `editorial-demand-short-v3:${normalize(answer)}`,
    answer: normalize(answer),
    clue,
    hasExactClue: true,
    weakFill: false,
    lexicalQuality,
    lexicalSource: "editorial-demand-short-lexicon-v3",
  })));
  function extendPool(result) {
    if (!result || !Array.isArray(result.pool)) return result;
    const existing = new Set(result.pool.map((entry) => normalize(entry?.answer)));
    const added = [];
    let skippedDuplicateEntries = 0;
    for (const entry of ENTRIES) {
      if (existing.has(entry.answer)) { skippedDuplicateEntries += 1; continue; }
      existing.add(entry.answer);
      added.push({ ...entry });
    }
    if (added.length) result.pool.push(...added);
    result.constructionV2 = {
      ...(result.constructionV2 || {}),
      editorialDemandShortLexicon: {
        mode: "repair-only-demand-short-lexicon-v3",
        availableEntries: ENTRIES.length,
        addedEntries: added.length,
        skippedDuplicateEntries,
      },
    };
    return result;
  }
  window.ScanwordEditorialDemandShortLexiconV3 = Object.freeze({ entries: ENTRIES, extendPool });
})();
