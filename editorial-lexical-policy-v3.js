(() => {
  "use strict";

  const normalize = (value) => String(value || "").trim().toUpperCase().replaceAll("Ё", "Е");

  const FORMULAIC_TWO_LETTER = new Set(["ДО", "РЕ", "МИ", "ФА", "ЛЯ", "СИ"]);
  const COMMON_TWO_LETTER = new Set([
    "АД", "АС", "ДА", "ЕЖ", "ИЛ", "ПИ", "УЖ", "УМ", "УС", "ЮГ", "ЯД", "ЯК", "ЯР",
  ]);
  const SPECIALIST_TWO_LETTER = new Set([
    "АР", "ГА", "ГО", "ДИ", "ЛИ", "ОМ", "ПА", "РА", "СУ", "ФИ", "ФО", "ЦИ",
  ]);
  const OBSCURE_TWO_LETTER = new Set(["БА", "БО", "КА"]);

  function classify(answer, metadata = {}) {
    const normalized = normalize(answer || metadata.answer);
    const length = normalized.length;
    const twoLetter = length === 2;
    const formulaicShort = FORMULAIC_TWO_LETTER.has(normalized);
    const commonShort = COMMON_TWO_LETTER.has(normalized);
    const specialistShort = SPECIALIST_TWO_LETTER.has(normalized);
    const obscureShort = OBSCURE_TWO_LETTER.has(normalized);
    const inheritedWeak = Boolean(metadata.weakFill);

    let editorialQuality = Number(metadata.lexicalQuality || (length >= 4 ? 80 : 68));
    let editorialWeak = false;
    let editorialTier = "standard";
    let rarityPenalty = 0;

    if (formulaicShort) {
      editorialQuality = 38;
      editorialWeak = true;
      editorialTier = "formulaic-short";
    } else if (obscureShort) {
      editorialQuality = Math.min(editorialQuality, 48);
      editorialTier = "obscure-short";
      rarityPenalty = 14;
    } else if (specialistShort) {
      editorialQuality = 62;
      editorialTier = "specialist-short";
      rarityPenalty = 6;
    } else if (commonShort) {
      editorialQuality = 76;
      editorialTier = "common-short";
    } else if (twoLetter) {
      editorialQuality = Math.min(editorialQuality, 58);
      editorialWeak = inheritedWeak;
      editorialTier = "unclassified-short";
      rarityPenalty = 8;
    } else if (inheritedWeak) {
      editorialWeak = true;
      editorialTier = "inherited-weak";
    }

    const editorialPenalty = Math.max(0, 80 - editorialQuality)
      + (editorialWeak ? 30 : 0)
      + rarityPenalty;

    return {
      answer: normalized,
      length,
      twoLetter,
      commonShort,
      specialistShort,
      obscureShort,
      formulaicShort,
      inheritedWeak,
      editorialWeak,
      editorialTier,
      editorialQuality,
      rarityPenalty,
      editorialPenalty,
    };
  }

  function summarize(entries) {
    const classified = (entries || []).map((entry) => classify(entry.answer || entry, entry));
    return {
      twoLetterCount: classified.filter((entry) => entry.twoLetter).length,
      commonShortCount: classified.filter((entry) => entry.commonShort).length,
      specialistShortCount: classified.filter((entry) => entry.specialistShort).length,
      obscureShortCount: classified.filter((entry) => entry.obscureShort).length,
      unclassifiedShortCount: classified.filter((entry) => entry.twoLetter
        && !entry.formulaicShort
        && !entry.commonShort
        && !entry.specialistShort
        && !entry.obscureShort).length,
      formulaicShortCount: classified.filter((entry) => entry.formulaicShort).length,
      editorialWeakCount: classified.filter((entry) => entry.editorialWeak).length,
      shortRarityPenalty: classified.reduce((sum, entry) => sum + entry.rarityPenalty, 0),
      editorialPenalty: classified.reduce((sum, entry) => sum + entry.editorialPenalty, 0),
      formulaicAnswers: classified.filter((entry) => entry.formulaicShort).map((entry) => entry.answer).sort(),
      commonAnswers: classified.filter((entry) => entry.commonShort).map((entry) => entry.answer).sort(),
      specialistAnswers: classified.filter((entry) => entry.specialistShort).map((entry) => entry.answer).sort(),
      obscureAnswers: classified.filter((entry) => entry.obscureShort).map((entry) => entry.answer).sort(),
      unclassifiedShortAnswers: classified.filter((entry) => entry.twoLetter
        && !entry.formulaicShort
        && !entry.commonShort
        && !entry.specialistShort
        && !entry.obscureShort).map((entry) => entry.answer).sort(),
    };
  }

  window.ScanwordEditorialLexicalPolicyV3 = {
    classify,
    summarize,
    normalize,
    FORMULAIC_TWO_LETTER,
    COMMON_TWO_LETTER,
    SPECIALIST_TWO_LETTER,
    OBSCURE_TWO_LETTER,
  };
})();