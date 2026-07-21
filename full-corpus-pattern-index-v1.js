(() => {
  "use strict";

  if (window.ScanwordFullCorpusPatternIndexV1) return;

  const core = window.ScanwordCore;
  const editorialPolicy = window.ScanwordEditorialLexicalPolicyV3;
  if (!core?.normalizeWord) throw new Error("ScanwordCore must load before the full-corpus pattern index");

  const properCategories = new Set(["given-name", "surname", "patronymic", "city", "capital"]);
  const telemetry = {
    indexBuilds: 0,
    indexBuildMs: 0,
    indexedEntries: 0,
    hotLookups: 0,
    fallbackLookups: 0,
    fullCorpusChecks: 0,
    emptyDomainRescues: 0,
    smallDomainRescues: 0,
    poorDomainRescues: 0,
    returnedFallbackEntries: 0,
    selectedFallbackEntries: 0,
    unconstrainedRejected: 0,
    selectedFallbackAnswers: [],
    selectedCategories: {},
    selectedSources: {},
  };

  let cachedIndex = null;
  let cachedSourceLength = -1;

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function numericOption(name, fallback) {
    const value = Number(environmentOption(name, fallback));
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
  }

  function enabled() {
    return String(environmentOption("SCANWORD_FULL_CORPUS_RETRIEVAL", "off")).toLowerCase() === "on";
  }

  function retrievalMode() {
    const raw = String(environmentOption("SCANWORD_FULL_CORPUS_RETRIEVAL_MODE", "empty")).toLowerCase();
    return raw === "small-poor" ? "small-poor" : "empty";
  }

  function normalizePattern(value) {
    return String(value || "").trim().toUpperCase().replaceAll("Ё", "Е");
  }

  function metadataFor(answer) {
    const key = String(answer || "").toLowerCase().replaceAll("ё", "е");
    return window.RUSSIAN_LEXICAL_META?.[key] || {};
  }

  function clueFor(answer) {
    const key = String(answer || "").toLowerCase().replaceAll("ё", "е");
    return String(window.RUSSIAN_CLUES?.[key] || "").trim();
  }

  function admittedEntry(rawWord, ordinal) {
    const answer = core.normalizeWord(rawWord);
    const clue = clueFor(answer);
    const metadata = metadataFor(answer);
    if (!/^[А-Я]+$/.test(answer) || answer.length < 2 || answer.length > 12) return null;
    if (clue.length < 3) return null;
    if (metadata.blocked === true || metadata.admitted === false) return null;
    return {
      id: `full-corpus:${ordinal + 1}`,
      answer,
      clue,
      hasExactClue: true,
      lexicalQuality: Number(metadata.lexicalQuality || (answer.length >= 4 ? 80 : 65)),
      weakFill: Boolean(metadata.weakFill),
      lexicalSource: metadata.source || "reviewed-project-dictionary",
      lexicalCategory: metadata.category || "core-reviewed",
      lexicalLicense: metadata.license || null,
      lexicalSourceId: metadata.sourceId || null,
      clueKind: metadata.clueKind || "unclassified",
      genericTemplate: Boolean(metadata.genericTemplate),
      generatedTemplate: Boolean(metadata.generatedTemplate),
      clueFacts: metadata.clueFacts && typeof metadata.clueFacts === "object"
        ? { ...metadata.clueFacts }
        : null,
      retrievalSource: "full-corpus-pattern-v1",
      fullCorpusFallback: true,
    };
  }

  function buildIndex() {
    const source = Array.isArray(window.RUSSIAN_WORDS) ? window.RUSSIAN_WORDS : [];
    if (cachedIndex && cachedSourceLength === source.length) return cachedIndex;
    const started = Date.now();
    const entries = [];
    const seen = new Set();
    const byLength = new Map();
    const byPositionLetter = new Map();

    for (let ordinal = 0; ordinal < source.length; ordinal += 1) {
      const entry = admittedEntry(source[ordinal], ordinal);
      if (!entry || seen.has(entry.answer)) continue;
      seen.add(entry.answer);
      entries.push(entry);
      if (!byLength.has(entry.answer.length)) byLength.set(entry.answer.length, []);
      byLength.get(entry.answer.length).push(entry);
      for (let position = 0; position < entry.answer.length; position += 1) {
        const key = `${entry.answer.length}:${position}:${entry.answer[position]}`;
        if (!byPositionLetter.has(key)) byPositionLetter.set(key, []);
        byPositionLetter.get(key).push(entry);
      }
    }

    for (const bucket of byLength.values()) bucket.sort((a, b) => a.answer.localeCompare(b.answer));
    for (const bucket of byPositionLetter.values()) bucket.sort((a, b) => a.answer.localeCompare(b.answer));
    cachedIndex = { entries, byLength, byPositionLetter };
    cachedSourceLength = source.length;
    telemetry.indexBuilds += 1;
    telemetry.indexBuildMs += Date.now() - started;
    telemetry.indexedEntries = entries.length;
    return cachedIndex;
  }

  function matchesPattern(answer, pattern) {
    if (answer.length !== pattern.length) return false;
    for (let index = 0; index < pattern.length; index += 1) {
      if (pattern[index] !== "?" && answer[index] !== pattern[index]) return false;
    }
    return true;
  }

  function classification(entry) {
    return typeof editorialPolicy?.classify === "function"
      ? editorialPolicy.classify(entry.answer, entry)
      : { editorialPenalty: Math.max(0, 80 - Number(entry.lexicalQuality || 0)), formulaicShort: false };
  }

  function clueKindRank(entry) {
    const kind = String(entry.clueKind || "").toLowerCase();
    if (kind.includes("definition") || kind.includes("sourced")) return 0;
    if (kind.includes("factual") || kind.includes("descriptive")) return 1;
    if (entry.genericTemplate) return 4;
    if (entry.generatedTemplate) return 3;
    return 2;
  }

  function rankTuple(entry, options = {}) {
    const editorial = classification(entry);
    const categoryCount = Number(options.categoryCounts?.[entry.lexicalCategory] || 0);
    const sourceCount = Number(options.sourceCounts?.[entry.lexicalSource] || 0);
    return [
      editorial.formulaicShort ? 1 : 0,
      entry.weakFill ? 1 : 0,
      entry.genericTemplate ? 1 : 0,
      entry.generatedTemplate ? 1 : 0,
      Number(editorial.editorialPenalty || 0),
      properCategories.has(String(entry.lexicalCategory || "")) ? 1 : 0,
      categoryCount,
      sourceCount,
      clueKindRank(entry),
      -Number(entry.lexicalQuality || 0),
      entry.answer,
    ];
  }

  function compareRank(first, second, options = {}) {
    const a = rankTuple(first, options);
    const b = rankTuple(second, options);
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] < b[index]) return -1;
      if (a[index] > b[index]) return 1;
    }
    return 0;
  }

  function query(patternValue, options = {}) {
    const pattern = normalizePattern(patternValue);
    if (!/^[А-Я?]{2,12}$/.test(pattern)) return [];
    const fixed = [...pattern].map((char, position) => ({ char, position })).filter((item) => item.char !== "?");
    if (!fixed.length && options.allowUnconstrained !== true) {
      telemetry.unconstrainedRejected += 1;
      return [];
    }

    const index = buildIndex();
    let sourceBucket = index.byLength.get(pattern.length) || [];
    for (const item of fixed) {
      const bucket = index.byPositionLetter.get(`${pattern.length}:${item.position}:${item.char}`) || [];
      if (bucket.length < sourceBucket.length) sourceBucket = bucket;
    }
    telemetry.fullCorpusChecks += sourceBucket.length;

    const usedAnswers = options.usedAnswers instanceof Set ? options.usedAnswers : new Set(options.usedAnswers || []);
    const excludedAnswers = options.excludedAnswers instanceof Set
      ? options.excludedAnswers
      : new Set(options.excludedAnswers || []);
    const maximum = Math.max(1, Number(options.maximum || numericOption("SCANWORD_FULL_CORPUS_DOMAIN", 80)));
    const result = sourceBucket
      .filter((entry) => matchesPattern(entry.answer, pattern))
      .filter((entry) => !usedAnswers.has(entry.answer) && !excludedAnswers.has(entry.answer))
      .filter((entry) => !options.requireNonFormulaic || !classification(entry).formulaicShort)
      .sort((a, b) => compareRank(a, b, options))
      .slice(0, maximum)
      .map((entry) => ({ ...entry }));
    telemetry.returnedFallbackEntries += result.length;
    return result;
  }

  function allPoor(entries, threshold) {
    return entries.length > 0 && entries.every((entry) => {
      const editorial = classification(entry);
      return editorial.formulaicShort || Number(editorial.editorialPenalty || 0) >= threshold;
    });
  }

  function augmentDomain(hotDomain, pattern, options = {}) {
    const hot = [...(hotDomain || [])];
    telemetry.hotLookups += 1;
    if (!enabled()) return { entries: hot, hotCount: hot.length, fallbackEntries: [], trigger: null };

    const mode = options.mode || retrievalMode();
    const smallThreshold = Number(options.smallThreshold ?? numericOption("SCANWORD_FULL_CORPUS_SMALL_DOMAIN", 6));
    const poorThreshold = Number(options.poorThreshold ?? numericOption("SCANWORD_FULL_CORPUS_POOR_PENALTY", 24));
    let trigger = null;
    if (hot.length === 0) trigger = "empty";
    else if (mode === "small-poor" && hot.length < smallThreshold) trigger = "small";
    else if (mode === "small-poor" && allPoor(hot, poorThreshold)) trigger = "poor";
    if (!trigger) return { entries: hot, hotCount: hot.length, fallbackEntries: [], trigger: null };

    telemetry.fallbackLookups += 1;
    const excludedAnswers = new Set(hot.map((entry) => entry.answer));
    const fallbackEntries = query(pattern, { ...options, excludedAnswers });
    if (fallbackEntries.length) {
      if (trigger === "empty") telemetry.emptyDomainRescues += 1;
      if (trigger === "small") telemetry.smallDomainRescues += 1;
      if (trigger === "poor") telemetry.poorDomainRescues += 1;
    }
    return {
      entries: [...hot, ...fallbackEntries],
      hotCount: hot.length,
      fallbackEntries,
      trigger,
    };
  }

  function recordSelected(entry, context = {}) {
    if (!entry?.fullCorpusFallback) return;
    telemetry.selectedFallbackEntries += 1;
    const record = {
      answer: entry.answer,
      category: entry.lexicalCategory || "unknown",
      source: entry.lexicalSource || "unknown",
      stage: context.stage || null,
      slotId: context.slotId ?? null,
    };
    telemetry.selectedFallbackAnswers.push(record);
    telemetry.selectedCategories[record.category] = (telemetry.selectedCategories[record.category] || 0) + 1;
    telemetry.selectedSources[record.source] = (telemetry.selectedSources[record.source] || 0) + 1;
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(telemetry));
  }

  function delta(before = {}) {
    const after = snapshot();
    const numericKeys = [
      "indexBuilds", "indexBuildMs", "hotLookups", "fallbackLookups", "fullCorpusChecks",
      "emptyDomainRescues", "smallDomainRescues", "poorDomainRescues", "returnedFallbackEntries",
      "selectedFallbackEntries", "unconstrainedRejected",
    ];
    const result = { indexedEntries: after.indexedEntries };
    for (const key of numericKeys) result[key] = Number(after[key] || 0) - Number(before[key] || 0);
    const selectedStart = Array.isArray(before.selectedFallbackAnswers) ? before.selectedFallbackAnswers.length : 0;
    result.selectedFallbackAnswers = after.selectedFallbackAnswers.slice(selectedStart);
    result.selectedCategories = {};
    result.selectedSources = {};
    for (const item of result.selectedFallbackAnswers) {
      result.selectedCategories[item.category] = (result.selectedCategories[item.category] || 0) + 1;
      result.selectedSources[item.source] = (result.selectedSources[item.source] || 0) + 1;
    }
    return result;
  }

  function attachTelemetry(result, stage, before) {
    if (!result || !stage) return result;
    const stageDelta = delta(before);
    const existing = result.constructionV2?.fullCorpusRetrieval || {};
    const stages = { ...(existing.stages || {}), [stage]: stageDelta };
    const totals = Object.values(stages).reduce((sum, item) => {
      for (const key of [
        "hotLookups", "fallbackLookups", "fullCorpusChecks", "emptyDomainRescues", "smallDomainRescues",
        "poorDomainRescues", "returnedFallbackEntries", "selectedFallbackEntries", "unconstrainedRejected",
      ]) sum[key] = Number(sum[key] || 0) + Number(item[key] || 0);
      sum.selectedFallbackAnswers.push(...(item.selectedFallbackAnswers || []));
      return sum;
    }, { selectedFallbackAnswers: [] });
    result.constructionV2 = {
      ...(result.constructionV2 || {}),
      fullCorpusRetrieval: {
        mode: retrievalMode(),
        enabled: enabled(),
        indexedEntries: stageDelta.indexedEntries || existing.indexedEntries || 0,
        stages,
        totals,
      },
    };
    return result;
  }

  window.ScanwordFullCorpusPatternIndexV1 = {
    enabled,
    retrievalMode,
    buildIndex,
    entries() { return buildIndex().entries; },
    matchesPattern,
    query,
    augmentDomain,
    compareRank,
    rankTuple,
    recordSelected,
    snapshot,
    delta,
    attachTelemetry,
    resetForTests() {
      cachedIndex = null;
      cachedSourceLength = -1;
      for (const key of Object.keys(telemetry)) {
        if (Array.isArray(telemetry[key])) telemetry[key] = [];
        else if (telemetry[key] && typeof telemetry[key] === "object") telemetry[key] = {};
        else telemetry[key] = 0;
      }
    },
  };
})();
