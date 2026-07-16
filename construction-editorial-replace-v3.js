(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const policy = window.ScanwordEditorialLexicalPolicyV3;
  if (!solver || !policy || solver.__editorialReplacementV3Installed) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_EDITORIAL_REPLACE) {
      return process.env.SCANWORD_EDITORIAL_REPLACE;
    }
    return window.SCANWORD_EDITORIAL_REPLACE || "off";
  }

  function candidateRank(entry) {
    const classification = policy.classify(entry.answer, entry);
    const tierRank = classification.commonShort ? 0 : classification.specialistShort ? 1 : 2;
    return [tierRank, classification.editorialPenalty, -classification.editorialQuality, entry.answer];
  }

  function compareRank(a, b) {
    const rankA = candidateRank(a);
    const rankB = candidateRank(b);
    for (let index = 0; index < rankA.length; index += 1) {
      if (rankA[index] < rankB[index]) return -1;
      if (rankA[index] > rankB[index]) return 1;
    }
    return 0;
  }

  function fixedPattern(result, word) {
    return word.cells.map((cell, index) => {
      const gridCell = result.grid[cell.row]?.[cell.col];
      return gridCell?.slotIds?.length > 1 ? String(word.answer || "")[index] : "?";
    }).join("");
  }

  function matchesPattern(answer, pattern) {
    if (answer.length !== pattern.length) return false;
    for (let index = 0; index < pattern.length; index += 1) {
      if (pattern[index] !== "?" && answer[index] !== pattern[index]) return false;
    }
    return true;
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

  function applyReplacement(result, word, entry) {
    const previous = {
      word: {
        answer: word.answer,
        clue: word.clue,
        hasExactClue: word.hasExactClue,
        weakFill: word.weakFill,
        lexicalQuality: word.lexicalQuality,
        lexicalSource: word.lexicalSource,
      },
      cells: word.cells.map((cell) => ({
        cell: result.grid[cell.row][cell.col],
        char: result.grid[cell.row][cell.col].char,
      })),
      clues: clueReferences(result, word.id).map((clue) => ({
        clue,
        answer: clue.answer,
        text: clue.text,
      })),
    };

    word.answer = entry.answer;
    word.clue = entry.clue;
    word.hasExactClue = Boolean(entry.hasExactClue);
    word.weakFill = Boolean(entry.weakFill);
    word.lexicalQuality = Number(entry.lexicalQuality || policy.classify(entry.answer, entry).editorialQuality);
    word.lexicalSource = entry.lexicalSource || "editorial-replacement-v3";

    for (let index = 0; index < word.cells.length; index += 1) {
      const cell = result.grid[word.cells[index].row][word.cells[index].col];
      if ((cell.slotIds || []).length === 1) cell.char = entry.answer[index];
    }
    for (const reference of previous.clues) {
      reference.clue.answer = entry.answer;
      reference.clue.text = entry.clue;
    }

    const validation = solver.validateGrid(result.grid, result.placed);
    const duplicateAnswers = result.placed.length !== new Set(result.placed.map((placed) => placed.answer)).size;
    if (validation.valid && !duplicateAnswers && word.hasExactClue) return { accepted: true, validation };

    word.answer = previous.word.answer;
    word.clue = previous.word.clue;
    word.hasExactClue = previous.word.hasExactClue;
    word.weakFill = previous.word.weakFill;
    word.lexicalQuality = previous.word.lexicalQuality;
    word.lexicalSource = previous.word.lexicalSource;
    for (const saved of previous.cells) saved.cell.char = saved.char;
    for (const reference of previous.clues) {
      reference.clue.answer = reference.answer;
      reference.clue.text = reference.text;
    }
    return { accepted: false, validation, duplicateAnswers };
  }

  function applyEditorialReplacements(result) {
    if (!result?.grid || !Array.isArray(result.placed) || !Array.isArray(result.pool)) return result;

    const before = policy.summarize(result.placed);
    const usedAnswers = new Set(result.placed.map((word) => word.answer));
    const pool = result.pool
      .filter((entry) => String(entry.answer || "").length === 2)
      .filter((entry) => entry.hasExactClue)
      .filter((entry) => !policy.classify(entry.answer, entry).formulaicShort)
      .sort(compareRank);
    const replacements = [];
    let attempted = 0;
    let matchedCandidates = 0;
    let rejected = 0;

    const formulaicWords = result.placed
      .filter((word) => policy.classify(word.answer, word).formulaicShort)
      .sort((a, b) => {
        const patternA = fixedPattern(result, a);
        const patternB = fixedPattern(result, b);
        const fixedA = [...patternA].filter((char) => char !== "?").length;
        const fixedB = [...patternB].filter((char) => char !== "?").length;
        return fixedA - fixedB || a.id - b.id;
      });

    for (const word of formulaicWords) {
      attempted += 1;
      const pattern = fixedPattern(result, word);
      const candidates = pool.filter((entry) => !usedAnswers.has(entry.answer) && matchesPattern(entry.answer, pattern));
      matchedCandidates += candidates.length;
      for (const entry of candidates) {
        const from = word.answer;
        const outcome = applyReplacement(result, word, entry);
        if (!outcome.accepted) {
          rejected += 1;
          continue;
        }
        usedAnswers.delete(from);
        usedAnswers.add(entry.answer);
        replacements.push({
          slotId: word.id,
          from,
          to: entry.answer,
          pattern,
          fromTier: policy.classify(from).editorialTier,
          toTier: policy.classify(entry.answer, entry).editorialTier,
        });
        break;
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
      editorialReplacement: {
        mode: "pattern-preserving-short-replacement-v3",
        attempted,
        matchedCandidates,
        accepted: replacements.length,
        rejected,
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
    return applyEditorialReplacements(result);
  };

  Object.assign(solver, {
    applyEditorialReplacementsV3: applyEditorialReplacements,
    editorialReplacementFixedPatternV3: fixedPattern,
    __editorialReplacementV3Installed: true,
  });
})();
