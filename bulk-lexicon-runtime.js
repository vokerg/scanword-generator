(() => {
  "use strict";

  const normalize = (value) => String(value || "").trim().toUpperCase().replaceAll("Ё", "Е");
  const clueKey = (value) => String(value || "").trim().toLowerCase().replaceAll("ё", "е");
  const state = {
    entries: [],
    byAnswer: new Map(),
    sources: {},
    addedToWordList: 0,
    skippedDuplicates: 0,
  };

  window.RUSSIAN_WORDS = Array.isArray(window.RUSSIAN_WORDS) ? window.RUSSIAN_WORDS : [];
  window.RUSSIAN_CLUES = { ...(window.RUSSIAN_CLUES || {}) };
  window.RUSSIAN_LEXICAL_META = { ...(window.RUSSIAN_LEXICAL_META || {}) };
  if (!Number.isFinite(Number(window.SCANWORD_ACTIVE_POOL_LIMIT))) window.SCANWORD_ACTIVE_POOL_LIMIT = 3500;
  const existing = new Set(window.RUSSIAN_WORDS.map(normalize));

  function register(entries, source = "bulk-lexicon-v1") {
    const local = {
      available: Array.isArray(entries) ? entries.length : 0,
      added: 0,
      skipped: 0,
      categories: {},
      clueKinds: {},
    };

    for (const raw of entries || []) {
      const answer = normalize(raw.answer);
      const clue = String(raw.clue || "").trim();
      if (!/^[А-Я]+$/.test(answer) || answer.length < 2 || answer.length > 12 || clue.length < 3) {
        local.skipped += 1;
        continue;
      }
      const category = String(raw.category || "bulk");
      const clueKind = String(raw.clueKind || "unclassified");
      const entry = {
        answer,
        clue,
        category,
        lexicalQuality: Number(raw.lexicalQuality || 70),
        lexicalSource: String(raw.lexicalSource || source),
        hasExactClue: raw.hasExactClue !== false,
        license: raw.license || null,
        sourceId: raw.sourceId || null,
        clueKind,
        genericTemplate: Boolean(raw.genericTemplate),
        generatedTemplate: Boolean(raw.generatedTemplate),
        clueFacts: raw.clueFacts && typeof raw.clueFacts === "object" ? { ...raw.clueFacts } : null,
      };
      local.categories[category] = (local.categories[category] || 0) + 1;
      local.clueKinds[clueKind] = (local.clueKinds[clueKind] || 0) + 1;

      if (!state.byAnswer.has(answer)) {
        state.byAnswer.set(answer, entry);
        state.entries.push(entry);
      }
      if (!existing.has(answer)) {
        window.RUSSIAN_WORDS.push(answer.toLowerCase());
        existing.add(answer);
        local.added += 1;
        state.addedToWordList += 1;
      } else {
        local.skipped += 1;
        state.skippedDuplicates += 1;
      }
      const key = clueKey(answer);
      if (!window.RUSSIAN_CLUES[key]) window.RUSSIAN_CLUES[key] = clue;
      if (!window.RUSSIAN_LEXICAL_META[key]) {
        window.RUSSIAN_LEXICAL_META[key] = {
          lexicalQuality: entry.lexicalQuality,
          weakFill: false,
          source: entry.lexicalSource,
          category: entry.category,
          license: entry.license,
          sourceId: entry.sourceId,
          clueKind: entry.clueKind,
          genericTemplate: entry.genericTemplate,
          generatedTemplate: entry.generatedTemplate,
          clueFacts: entry.clueFacts,
        };
      }
    }

    state.sources[source] = local;
    return local;
  }

  function metadata(answer) {
    return state.byAnswer.get(normalize(answer)) || null;
  }

  window.ScanwordBulkLexiconV1 = {
    register,
    metadata,
    normalize,
    state,
  };
})();
