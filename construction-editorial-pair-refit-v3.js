(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const policy = window.ScanwordEditorialLexicalPolicyV3;
  if (!solver || !policy || solver.__editorialPairRefitV3Installed) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_EDITORIAL_PAIR_REFIT) {
      return process.env.SCANWORD_EDITORIAL_PAIR_REFIT;
    }
    return window.SCANWORD_EDITORIAL_PAIR_REFIT || "off";
  }

  function numericOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  function matchesPattern(answer, pattern) {
    if (answer.length !== pattern.length) return false;
    for (let index = 0; index < pattern.length; index += 1) {
      if (pattern[index] !== "?" && answer[index] !== pattern[index]) return false;
    }
    return true;
  }

  function mutablePattern(result, word, mutableSlotIds) {
    return word.cells.map((cell) => {
      const gridCell = result.grid[cell.row]?.[cell.col];
      const externallyFixed = (gridCell?.slotIds || []).some((slotId) => !mutableSlotIds.has(Number(slotId)));
      return externallyFixed ? gridCell.char : "?";
    }).join("");
  }

  function sharedIntersections(first, second) {
    const secondByCoordinate = new Map(
      second.cells.map((cell, index) => [`${cell.row}:${cell.col}`, index]),
    );
    const shared = [];
    first.cells.forEach((cell, firstIndex) => {
      const secondIndex = secondByCoordinate.get(`${cell.row}:${cell.col}`);
      if (secondIndex != null) shared.push({ firstIndex, secondIndex, row: cell.row, col: cell.col });
    });
    return shared;
  }

  function clueReferences(result, slotId) {
    const references = [];
    for (const row of result.grid || []) {
      for (const cell of row || []) {
        for (const clue of cell.clues || []) {
          if (Number(clue.slotId) === Number(slotId)) references.push(clue);
        }
      }
    }
    return references;
  }

  function entryPenalty(entry) {
    return policy.classify(entry.answer, entry).editorialPenalty;
  }

  function domainForWord(result, word, pattern, usedOutside, options = {}) {
    const maximum = numericOption("SCANWORD_EDITORIAL_PAIR_DOMAIN", 80);
    return result.pool
      .filter((entry) => String(entry.answer || "").length === word.answer.length)
      .filter((entry) => entry.hasExactClue)
      .filter((entry) => !usedOutside.has(entry.answer))
      .filter((entry) => matchesPattern(entry.answer, pattern))
      .filter((entry) => !options.requireNonFormulaic || !policy.classify(entry.answer, entry).formulaicShort)
      .sort((a, b) => entryPenalty(a) - entryPenalty(b) || a.answer.localeCompare(b.answer))
      .slice(0, maximum);
  }

  function saveWordState(result, words) {
    const cells = new Map();
    const clues = [];
    for (const word of words) {
      for (const cell of word.cells) {
        const key = `${cell.row}:${cell.col}`;
        if (!cells.has(key)) {
          const gridCell = result.grid[cell.row][cell.col];
          cells.set(key, { cell: gridCell, char: gridCell.char });
        }
      }
      for (const clue of clueReferences(result, word.id)) {
        clues.push({ clue, answer: clue.answer, text: clue.text });
      }
    }
    return {
      words: words.map((word) => ({
        word,
        answer: word.answer,
        clue: word.clue,
        hasExactClue: word.hasExactClue,
        weakFill: word.weakFill,
        lexicalQuality: word.lexicalQuality,
        lexicalSource: word.lexicalSource,
      })),
      cells: [...cells.values()],
      clues,
    };
  }

  function restoreState(saved) {
    for (const item of saved.words) {
      item.word.answer = item.answer;
      item.word.clue = item.clue;
      item.word.hasExactClue = item.hasExactClue;
      item.word.weakFill = item.weakFill;
      item.word.lexicalQuality = item.lexicalQuality;
      item.word.lexicalSource = item.lexicalSource;
    }
    for (const item of saved.cells) item.cell.char = item.char;
    for (const item of saved.clues) {
      item.clue.answer = item.answer;
      item.clue.text = item.text;
    }
  }

  function assignWord(result, word, entry) {
    word.answer = entry.answer;
    word.clue = entry.clue;
    word.hasExactClue = Boolean(entry.hasExactClue);
    word.weakFill = Boolean(entry.weakFill);
    word.lexicalQuality = Number(entry.lexicalQuality || policy.classify(entry.answer, entry).editorialQuality);
    word.lexicalSource = entry.lexicalSource || "editorial-pair-refit-v3";
    for (let index = 0; index < word.cells.length; index += 1) {
      const cell = word.cells[index];
      result.grid[cell.row][cell.col].char = entry.answer[index];
    }
    for (const clue of clueReferences(result, word.id)) {
      clue.answer = entry.answer;
      clue.text = entry.clue;
    }
  }

  function applyPair(result, first, firstEntry, second, secondEntry) {
    const saved = saveWordState(result, [first, second]);
    assignWord(result, first, firstEntry);
    assignWord(result, second, secondEntry);
    const validation = solver.validateGrid(result.grid, result.placed);
    const answers = result.placed.map((word) => word.answer);
    const duplicateAnswers = answers.length !== new Set(answers).size;
    if (validation.valid && !duplicateAnswers && first.hasExactClue && second.hasExactClue) {
      return { accepted: true, validation };
    }
    restoreState(saved);
    return { accepted: false, validation, duplicateAnswers };
  }

  function pairCandidates(result, target, partner, usedAnswers) {
    const mutableIds = new Set([Number(target.id), Number(partner.id)]);
    const targetPattern = mutablePattern(result, target, mutableIds);
    const partnerPattern = mutablePattern(result, partner, mutableIds);
    const shared = sharedIntersections(target, partner);
    if (!shared.length) return { targetPattern, partnerPattern, shared, pairs: [] };

    const usedOutside = new Set(usedAnswers);
    usedOutside.delete(target.answer);
    usedOutside.delete(partner.answer);
    const targetDomain = domainForWord(result, target, targetPattern, usedOutside, { requireNonFormulaic: true });
    const partnerDomain = domainForWord(result, partner, partnerPattern, usedOutside);
    const oldEntries = [target, partner];
    const oldFormulaic = oldEntries.filter((entry) => policy.classify(entry.answer, entry).formulaicShort).length;
    const oldPenalty = oldEntries.reduce((sum, entry) => sum + entryPenalty(entry), 0);
    const maximumPairs = numericOption("SCANWORD_EDITORIAL_PAIR_CANDIDATES", 600);
    const pairs = [];

    for (const targetEntry of targetDomain) {
      for (const partnerEntry of partnerDomain) {
        if (targetEntry.answer === partnerEntry.answer) continue;
        if (shared.some((cell) => targetEntry.answer[cell.firstIndex] !== partnerEntry.answer[cell.secondIndex])) continue;
        const newEntries = [targetEntry, partnerEntry];
        const newFormulaic = newEntries.filter((entry) => policy.classify(entry.answer, entry).formulaicShort).length;
        if (newFormulaic >= oldFormulaic) continue;
        const newPenalty = newEntries.reduce((sum, entry) => sum + entryPenalty(entry), 0);
        if (newPenalty >= oldPenalty) continue;
        pairs.push({
          targetEntry,
          partnerEntry,
          oldFormulaic,
          newFormulaic,
          oldPenalty,
          newPenalty,
          formulaicGain: oldFormulaic - newFormulaic,
          penaltyGain: oldPenalty - newPenalty,
        });
        if (pairs.length >= maximumPairs) break;
      }
      if (pairs.length >= maximumPairs) break;
    }

    pairs.sort((a, b) =>
      b.formulaicGain - a.formulaicGain
      || b.penaltyGain - a.penaltyGain
      || entryPenalty(a.partnerEntry) - entryPenalty(b.partnerEntry)
      || a.targetEntry.answer.localeCompare(b.targetEntry.answer)
      || a.partnerEntry.answer.localeCompare(b.partnerEntry.answer));
    return { targetPattern, partnerPattern, shared, targetDomain, partnerDomain, pairs };
  }

  function applyEditorialPairRefits(result) {
    if (!result?.grid || !Array.isArray(result.placed) || !Array.isArray(result.pool)) return result;

    const before = policy.summarize(result.placed);
    const byId = new Map(result.placed.map((word) => [Number(word.id), word]));
    const usedAnswers = new Set(result.placed.map((word) => word.answer));
    const replacements = [];
    let targetsAttempted = 0;
    let partnerSearches = 0;
    let domainsBuilt = 0;
    let compatiblePairs = 0;
    let rejectedPairs = 0;

    const remainingTargets = () => result.placed
      .filter((word) => policy.classify(word.answer, word).formulaicShort)
      .sort((a, b) => a.id - b.id);

    for (const target of remainingTargets()) {
      if (!policy.classify(target.answer, target).formulaicShort) continue;
      targetsAttempted += 1;
      const partnerIds = [...new Set(target.cells.flatMap((cell) =>
        (result.grid[cell.row]?.[cell.col]?.slotIds || [])
          .map(Number)
          .filter((slotId) => slotId !== Number(target.id)))),
      ];
      const partners = partnerIds
        .map((slotId) => byId.get(slotId))
        .filter(Boolean)
        .sort((a, b) => a.answer.length - b.answer.length || a.id - b.id);

      let accepted = false;
      for (const partner of partners) {
        partnerSearches += 1;
        const generated = pairCandidates(result, target, partner, usedAnswers);
        domainsBuilt += generated.targetDomain?.length || 0;
        domainsBuilt += generated.partnerDomain?.length || 0;
        compatiblePairs += generated.pairs.length;
        for (const pair of generated.pairs) {
          const fromTarget = target.answer;
          const fromPartner = partner.answer;
          const outcome = applyPair(result, target, pair.targetEntry, partner, pair.partnerEntry);
          if (!outcome.accepted) {
            rejectedPairs += 1;
            continue;
          }
          usedAnswers.delete(fromTarget);
          usedAnswers.delete(fromPartner);
          usedAnswers.add(pair.targetEntry.answer);
          usedAnswers.add(pair.partnerEntry.answer);
          replacements.push({
            targetSlotId: target.id,
            partnerSlotId: partner.id,
            targetFrom: fromTarget,
            targetTo: pair.targetEntry.answer,
            partnerFrom: fromPartner,
            partnerTo: pair.partnerEntry.answer,
            targetPattern: generated.targetPattern,
            partnerPattern: generated.partnerPattern,
            shared: generated.shared,
            formulaicGain: pair.formulaicGain,
            penaltyGain: pair.penaltyGain,
          });
          accepted = true;
          break;
        }
        if (accepted) break;
      }
    }

    const metrics = solver.resultMetrics(result);
    result.validation = metrics.validation;
    result.intersections = metrics.intersections;
    result.doubles = metrics.doubles;
    result.components = metrics.components;
    result.score = metrics.score;
    const after = policy.summarize(result.placed);
    result.constructionV2 = {
      ...(result.constructionV2 || {}),
      editorialPairRefit: {
        mode: "same-geometry-crossing-pair-refit-v3",
        targetsAttempted,
        partnerSearches,
        domainsBuilt,
        compatiblePairs,
        rejectedPairs,
        accepted: replacements.length,
        before,
        after,
        replacements,
        panelsBefore: result.panelCells,
        panelsAfter: result.panelCells,
        validation: metrics.validation,
      },
    };
    return result;
  }

  solver.generateBest = (...args) => {
    const result = previousGenerateBest(...args);
    if (modeFromEnvironment() !== "on") return result;
    return applyEditorialPairRefits(result);
  };

  Object.assign(solver, {
    applyEditorialPairRefitsV3: applyEditorialPairRefits,
    editorialPairCandidatesV3: pairCandidates,
    editorialMutablePatternV3: mutablePattern,
    __editorialPairRefitV3Installed: true,
  });
})();
