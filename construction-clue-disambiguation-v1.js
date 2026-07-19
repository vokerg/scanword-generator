(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || solver.__clueDisambiguationV1Installed) return;
  if (!solver.__selectedGridClueMetricsV1Installed) {
    throw new Error("Selected-grid clue metrics must load before clue disambiguation");
  }

  const previousGenerateBest = solver.generateBest.bind(solver);
  const vowels = new Set(["А", "Е", "Е", "И", "О", "У", "Ы", "Э", "Ю", "Я"]);
  const categoryLabels = {
    "given-name": "Имя",
    surname: "Фамилия",
    patronymic: "Отчество",
    city: "Город",
    capital: "Столица",
    country: "Государство",
    region: "Регион",
    river: "Река",
    mountain: "Гора",
    peak: "Горная вершина",
    "mountain-range": "Горный хребет",
    island: "Остров",
    islands: "Группа островов",
    lake: "Озеро",
    sea: "Море",
    bay: "Залив",
    volcano: "Вулкан",
    valley: "Долина",
    plateau: "Плато",
    hill: "Холм",
    hills: "Группа холмов",
    glacier: "Ледник",
    "water-body": "Водоём",
  };

  function enabled() {
    const value = typeof process !== "undefined"
      ? process?.env?.SCANWORD_SELECTED_GRID_CLUE_DISAMBIGUATION
      : window.SCANWORD_SELECTED_GRID_CLUE_DISAMBIGUATION;
    return String(value || "off").toLowerCase() === "on";
  }

  function metadata(answer) {
    return solver.selectedGridClueMetadataV1?.(answer) || {};
  }

  function clueKey(value) {
    return solver.selectedGridClueKeyV1?.(value) || String(value || "").trim().toLowerCase();
  }

  function lettersOnly(value) {
    return String(value || "").toUpperCase().replaceAll("Ё", "Е").replace(/[^А-Я]/g, "");
  }

  function cleanLabel(value) {
    return String(value || "").trim().replace(/[.!?]+$/g, "");
  }

  function categoryLabel(word, meta) {
    const original = cleanLabel(word.clue);
    const category = String(meta.category || word.lexicalCategory || "");
    if (category === "given-name") {
      if (/мужское имя/i.test(original)) return "М. имя";
      if (/женское имя/i.test(original)) return "Ж. имя";
      return "Имя";
    }
    if (categoryLabels[category]) return categoryLabels[category];
    const firstField = cleanLabel(original.split(/[;,]/)[0]);
    return firstField && firstField.length <= 28 ? firstField : "Ответ";
  }

  function uniqueCandidates(candidates) {
    const seen = new Set();
    return candidates.filter((candidate) => {
      const key = clueKey(candidate.text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function populationText(value) {
    const population = Number(value || 0);
    if (population >= 1_000_000) {
      const millions = Math.round(population / 100_000) / 10;
      return `${String(millions).replace(".", ",")} млн`;
    }
    if (population >= 10_000) return `${Math.round(population / 1_000)} тыс.`;
    return population > 0 ? String(population) : null;
  }

  function areaText(value) {
    const area = Number(value || 0);
    if (area <= 0) return null;
    const rounded = area >= 10_000 ? Math.round(area / 1_000) * 1_000 : Math.round(area);
    return `${rounded} км²`;
  }

  function factualCandidates(word, meta, label) {
    const candidates = [];
    const facts = meta.clueFacts && typeof meta.clueFacts === "object" ? meta.clueFacts : {};
    const originalFields = String(word.clue || "").split(";").map((value) => value.trim()).filter(Boolean);
    for (const field of originalFields.slice(1)) {
      candidates.push({
        text: `${label}; ${field}`,
        kind: "sourced-clue-field",
        source: "existing-clue",
        revealedLetters: 0,
      });
    }
    if (facts.region && lettersOnly(facts.region) !== lettersOnly(word.answer)) {
      candidates.push({
        text: `${label}; регион: ${facts.region}`,
        kind: "factual-metadata",
        source: "clueFacts.region",
        revealedLetters: 0,
      });
    }
    if (Number(facts.elevationM || 0) > 250) {
      const rounded = Math.max(100, Math.round(Number(facts.elevationM) / 100) * 100);
      candidates.push({
        text: `${label}; высота: около ${rounded} м`,
        kind: "factual-metadata",
        source: "clueFacts.elevationM",
        revealedLetters: 0,
      });
    }
    const population = populationText(facts.population);
    if (population) {
      candidates.push({
        text: `${label}; население: ${population}`,
        kind: "factual-metadata",
        source: "clueFacts.population",
        revealedLetters: 0,
      });
    }
    const area = areaText(facts.areaKm2);
    if (area) {
      candidates.push({
        text: `${label}; площадь: около ${area}`,
        kind: "factual-metadata",
        source: "clueFacts.areaKm2",
        revealedLetters: 0,
      });
    }
    return uniqueCandidates(candidates);
  }

  function distinguishingPositions(answer, group) {
    return Array.from({ length: answer.length }, (_, index) => {
      const chars = new Set(
        group
          .map((word) => String(word.answer || ""))
          .filter((value) => value.length === answer.length)
          .map((value) => value[index]),
      );
      return { index, diversity: chars.size };
    }).sort((a, b) => b.diversity - a.diversity || a.index - b.index);
  }

  function letterClassPattern(answer) {
    return [...String(answer || "")].map((char) => vowels.has(char) ? "Г" : "С").join("-");
  }

  function patternCandidates(word, label, group) {
    const answer = String(word.answer || "");
    const length = answer.length;
    const candidates = [];
    if (new Set(answer).size < length) {
      candidates.push({
        text: `${label} с повтором`,
        kind: "letter-class-pattern",
        source: "answer-repeated-letter",
        revealedLetters: 0,
      });
    }
    candidates.push({
      text: `${label}: ${letterClassPattern(answer)}`,
      kind: "letter-class-pattern",
      source: "answer-vowel-consonant-pattern",
      revealedLetters: 0,
    });

    for (const { index } of distinguishingPositions(answer, group)) {
      const char = answer[index];
      if (!char) continue;
      candidates.push({
        text: index === 0 ? `${label} на ${char}` : `${label}: ${index + 1}-я — ${char}`,
        kind: "letter-pattern-hint",
        source: `answer-position-${index}`,
        revealedLetters: 1,
      });
    }

    if (length >= 8 && answer[0] && answer.at(-1)) {
      candidates.push({
        text: `${label}: ${answer[0]}…${answer.at(-1)}`,
        kind: "letter-pattern-hint",
        source: "answer-edges",
        revealedLetters: 2,
      });
    }
    return uniqueCandidates(candidates);
  }

  function revealPolicy(answer, candidate) {
    const normalizedAnswer = lettersOnly(answer);
    const normalizedClue = lettersOnly(candidate.text);
    const length = normalizedAnswer.length;
    const allowedLetters = length <= 3 ? 0 : length <= 7 ? 1 : 2;
    const revealedLetters = Number(candidate.revealedLetters || 0);
    const revealFraction = length ? revealedLetters / length : 0;
    const exposesAnswer = Boolean(normalizedAnswer && normalizedClue.includes(normalizedAnswer));
    const overRevealing = revealedLetters > allowedLetters || revealFraction > 0.25 || exposesAnswer;
    return {
      revealedLetters,
      revealFraction: +revealFraction.toFixed(3),
      allowedLetters,
      exposesAnswer,
      overRevealing,
    };
  }

  function candidatesFor(word, group) {
    const meta = metadata(word.answer);
    const label = categoryLabel(word, meta);
    return [
      ...factualCandidates(word, meta, label),
      ...patternCandidates(word, label, group),
    ].map((candidate) => ({ ...candidate, policy: revealPolicy(word.answer, candidate) }));
  }

  function updateSlotClue(result, word, candidate, originalClue) {
    word.clue = candidate.text;
    word.clueEditorial = {
      generated: true,
      mode: "repeated-generic-clue-disambiguation-v1",
      kind: candidate.kind,
      source: candidate.source,
      originalClue,
      revealedLetters: candidate.policy.revealedLetters,
      revealFraction: candidate.policy.revealFraction,
      overRevealing: candidate.policy.overRevealing,
    };
    for (const row of result.grid || []) {
      for (const cell of row || []) {
        for (const item of cell.clues || []) {
          if (Number(item.slotId) === Number(word.id)) item.text = candidate.text;
        }
      }
    }
  }

  function sortGenericWords(words) {
    return [...words].sort((a, b) => {
      const aQuality = Number(metadata(a.answer).lexicalQuality || a.lexicalQuality || 0);
      const bQuality = Number(metadata(b.answer).lexicalQuality || b.lexicalQuality || 0);
      return bQuality - aQuality || String(a.answer).localeCompare(String(b.answer), "ru");
    });
  }

  function disambiguate(result) {
    const annotated = solver.annotateSelectedGridCluesV1(result);
    const before = { ...(annotated.constructionV2?.selectedGridClues || {}) };
    const answerSignature = before.answerSignature;
    const geometrySignature = before.geometrySignature;
    const groups = new Map();
    for (const word of result.placed || []) {
      const key = clueKey(word.clue);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(word);
    }

    let groupsConsidered = 0;
    let changedGroups = 0;
    let skippedUnsafeCandidates = 0;
    let unresolvedWords = 0;
    const changes = [];

    for (const words of groups.values()) {
      if (words.length < 2) continue;
      const generic = words.filter((word) => metadata(word.answer).genericTemplate);
      if (!generic.length) continue;
      groupsConsidered += 1;

      const orderedGeneric = sortGenericWords(generic);
      const nonGeneric = words.filter((word) => !generic.includes(word));
      const used = new Set(nonGeneric.map((word) => clueKey(word.clue)));
      let targets = orderedGeneric;
      if (!nonGeneric.length && orderedGeneric.length) {
        used.add(clueKey(orderedGeneric[0].clue));
        targets = orderedGeneric.slice(1);
      }

      let groupChanges = 0;
      for (const word of targets) {
        const originalClue = String(word.clue || "");
        const originalKey = clueKey(originalClue);
        const candidates = candidatesFor(word, words);
        const selected = candidates.find((candidate) => {
          if (candidate.policy.overRevealing) {
            skippedUnsafeCandidates += 1;
            return false;
          }
          const key = clueKey(candidate.text);
          return key && key !== originalKey && !used.has(key);
        });
        if (!selected) {
          unresolvedWords += 1;
          continue;
        }
        updateSlotClue(result, word, selected, originalClue);
        used.add(clueKey(selected.text));
        groupChanges += 1;
        changes.push({
          slotId: Number(word.id),
          answer: word.answer,
          from: originalClue,
          to: selected.text,
          kind: selected.kind,
          source: selected.source,
          revealedLetters: selected.policy.revealedLetters,
          revealFraction: selected.policy.revealFraction,
        });
      }
      if (groupChanges > 0) changedGroups += 1;
    }

    solver.annotateSelectedGridCluesV1(result);
    const after = { ...(result.constructionV2?.selectedGridClues || {}) };
    if (after.answerSignature !== answerSignature || after.geometrySignature !== geometrySignature) {
      throw new Error("Clue disambiguation changed answers or grid geometry");
    }

    result.constructionV2 = {
      ...(result.constructionV2 || {}),
      clueDisambiguation: {
        mode: "repeated-generic-clue-disambiguation-v1",
        groupsConsidered,
        changedGroups,
        changedClues: changes.length,
        unresolvedWords,
        skippedUnsafeCandidates,
        before,
        after,
        changes,
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
    selectedGridClueCandidatesV1: candidatesFor,
    selectedGridClueRevealPolicyV1: revealPolicy,
    selectedGridClueDisambiguationEnabledV1: enabled,
    __clueDisambiguationV1Installed: true,
  });
})();
