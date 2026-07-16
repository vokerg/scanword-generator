(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const policy = window.ScanwordEditorialLexicalPolicyV3;
  if (!solver || !policy || solver.__editorialBundleRefitV3Installed) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_EDITORIAL_BUNDLE_REFIT) {
      return process.env.SCANWORD_EDITORIAL_BUNDLE_REFIT;
    }
    return window.SCANWORD_EDITORIAL_BUNDLE_REFIT || "off";
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

  function wordNeighborIds(result, word) {
    return [...new Set(word.cells.flatMap((cell) =>
      (result.grid[cell.row]?.[cell.col]?.slotIds || [])
        .map(Number)
        .filter((slotId) => slotId !== Number(word.id))))];
  }

  function mutablePattern(result, word, mutableSlotIds) {
    return word.cells.map((cell) => {
      const gridCell = result.grid[cell.row]?.[cell.col];
      const externallyFixed = (gridCell?.slotIds || []).some((slotId) => !mutableSlotIds.has(Number(slotId)));
      return externallyFixed ? gridCell.char : "?";
    }).join("");
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

  function buildIntersections(words) {
    const byCoordinate = new Map();
    words.forEach((word, wordIndex) => {
      word.cells.forEach((cell, charIndex) => {
        const key = `${cell.row}:${cell.col}`;
        if (!byCoordinate.has(key)) byCoordinate.set(key, []);
        byCoordinate.get(key).push({ wordIndex, charIndex, row: cell.row, col: cell.col });
      });
    });
    const intersections = [];
    for (const occurrences of byCoordinate.values()) {
      if (occurrences.length < 2) continue;
      for (let first = 0; first < occurrences.length; first += 1) {
        for (let second = first + 1; second < occurrences.length; second += 1) {
          intersections.push({ first: occurrences[first], second: occurrences[second] });
        }
      }
    }
    return intersections;
  }

  function domainForWord(result, word, pattern, usedOutside, requireNonFormulaic) {
    const maximum = numericOption("SCANWORD_EDITORIAL_BUNDLE_DOMAIN", 100);
    return result.pool
      .filter((entry) => String(entry.answer || "").length === word.answer.length)
      .filter((entry) => entry.hasExactClue)
      .filter((entry) => !usedOutside.has(entry.answer))
      .filter((entry) => matchesPattern(entry.answer, pattern))
      .filter((entry) => !requireNonFormulaic || !policy.classify(entry.answer, entry).formulaicShort)
      .sort((a, b) => entryPenalty(a) - entryPenalty(b) || a.answer.localeCompare(b.answer))
      .slice(0, maximum);
  }

  function buildBundleProblem(result, target, partners, usedAnswers, kind = "bundle") {
    const words = [target, ...partners];
    const mutableIds = new Set(words.map((word) => Number(word.id)));
    const usedOutside = new Set(usedAnswers);
    for (const word of words) usedOutside.delete(word.answer);
    const patterns = words.map((word) => mutablePattern(result, word, mutableIds));
    const domains = words.map((word, index) =>
      domainForWord(result, word, patterns[index], usedOutside, index === 0));
    const intersections = buildIntersections(words);
    return { kind, words, mutableIds, usedOutside, patterns, domains, intersections };
  }

  function compatibleWithAssigned(problem, wordIndex, entry, assignments) {
    for (const intersection of problem.intersections) {
      let current = null;
      let other = null;
      if (intersection.first.wordIndex === wordIndex) {
        current = intersection.first;
        other = intersection.second;
      } else if (intersection.second.wordIndex === wordIndex) {
        current = intersection.second;
        other = intersection.first;
      } else {
        continue;
      }
      const otherEntry = assignments[other.wordIndex];
      if (otherEntry && entry.answer[current.charIndex] !== otherEntry.answer[other.charIndex]) return false;
    }
    return true;
  }

  function hasForwardSupport(problem, wordIndex, entry, assignments, used) {
    const nextAssignments = [...assignments];
    nextAssignments[wordIndex] = entry;
    for (let otherIndex = 0; otherIndex < problem.words.length; otherIndex += 1) {
      if (nextAssignments[otherIndex]) continue;
      const supported = problem.domains[otherIndex].some((candidate) =>
        !used.has(candidate.answer)
        && candidate.answer !== entry.answer
        && compatibleWithAssigned(problem, otherIndex, candidate, nextAssignments));
      if (!supported) return false;
    }
    return true;
  }

  function missingSupportReport(problem) {
    const targetDomain = problem.domains[0] || [];
    return targetDomain.slice(0, 20).map((targetEntry) => {
      const assignments = new Array(problem.words.length).fill(null);
      assignments[0] = targetEntry;
      const support = problem.words.slice(1).map((word, offset) => {
        const wordIndex = offset + 1;
        const compatible = problem.domains[wordIndex]
          .filter((entry) => compatibleWithAssigned(problem, wordIndex, entry, assignments))
          .slice(0, 8)
          .map((entry) => entry.answer);
        return {
          slotId: word.id,
          currentAnswer: word.answer,
          pattern: problem.patterns[wordIndex],
          compatible,
        };
      });
      return { targetAnswer: targetEntry.answer, support };
    });
  }

  function solveBundle(problem) {
    const nodeLimit = numericOption("SCANWORD_EDITORIAL_BUNDLE_NODES", 50000);
    const solutionLimit = numericOption("SCANWORD_EDITORIAL_BUNDLE_SOLUTIONS", 24);
    const assignments = new Array(problem.words.length).fill(null);
    const used = new Set(problem.usedOutside);
    const solutions = [];
    let nodes = 0;
    let forwardPrunes = 0;

    const oldFormulaic = problem.words.filter((word) => policy.classify(word.answer, word).formulaicShort).length;
    const oldPenalty = problem.words.reduce((sum, word) => sum + entryPenalty(word), 0);

    function chooseNextWord() {
      let selected = -1;
      let selectedCount = Infinity;
      for (let index = 0; index < problem.words.length; index += 1) {
        if (assignments[index]) continue;
        let count = 0;
        for (const entry of problem.domains[index]) {
          if (used.has(entry.answer)) continue;
          if (!compatibleWithAssigned(problem, index, entry, assignments)) continue;
          count += 1;
        }
        if (count < selectedCount) {
          selected = index;
          selectedCount = count;
        }
      }
      return { index: selected, count: selectedCount };
    }

    function search() {
      if (nodes >= nodeLimit || solutions.length >= solutionLimit) return;
      const next = chooseNextWord();
      if (next.index < 0) {
        const newFormulaic = assignments.filter((entry) => policy.classify(entry.answer, entry).formulaicShort).length;
        const newPenalty = assignments.reduce((sum, entry) => sum + entryPenalty(entry), 0);
        if (newFormulaic < oldFormulaic && newPenalty < oldPenalty) {
          solutions.push({
            entries: [...assignments],
            oldFormulaic,
            newFormulaic,
            oldPenalty,
            newPenalty,
            formulaicGain: oldFormulaic - newFormulaic,
            penaltyGain: oldPenalty - newPenalty,
          });
        }
        return;
      }
      if (next.count === 0) return;

      for (const entry of problem.domains[next.index]) {
        if (nodes >= nodeLimit || solutions.length >= solutionLimit) break;
        if (used.has(entry.answer)) continue;
        if (!compatibleWithAssigned(problem, next.index, entry, assignments)) continue;
        nodes += 1;
        if (!hasForwardSupport(problem, next.index, entry, assignments, used)) {
          forwardPrunes += 1;
          continue;
        }
        assignments[next.index] = entry;
        used.add(entry.answer);
        search();
        used.delete(entry.answer);
        assignments[next.index] = null;
      }
    }

    search();
    solutions.sort((a, b) =>
      b.formulaicGain - a.formulaicGain
      || b.penaltyGain - a.penaltyGain
      || a.entries.map((entry) => entry.answer).join("|").localeCompare(b.entries.map((entry) => entry.answer).join("|")));
    return { solutions, nodes, forwardPrunes, nodeLimitReached: nodes >= nodeLimit };
  }

  function saveState(result, words) {
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
    word.lexicalSource = entry.lexicalSource || "editorial-bundle-refit-v3";
    for (let index = 0; index < word.cells.length; index += 1) {
      const cell = word.cells[index];
      result.grid[cell.row][cell.col].char = entry.answer[index];
    }
    for (const clue of clueReferences(result, word.id)) {
      clue.answer = entry.answer;
      clue.text = entry.clue;
    }
  }

  function applySolution(result, problem, solution) {
    const saved = saveState(result, problem.words);
    problem.words.forEach((word, index) => assignWord(result, word, solution.entries[index]));
    const validation = solver.validateGrid(result.grid, result.placed);
    const answers = result.placed.map((word) => word.answer);
    const duplicateAnswers = answers.length !== new Set(answers).size;
    const exactClues = problem.words.every((word) => word.hasExactClue);
    if (validation.valid && !duplicateAnswers && exactClues) return { accepted: true, validation };
    restoreState(saved);
    return { accepted: false, validation, duplicateAnswers, exactClues };
  }

  function combinations(items, count) {
    const result = [];
    function visit(start, selected) {
      if (selected.length === count) {
        result.push([...selected]);
        return;
      }
      for (let index = start; index < items.length; index += 1) {
        selected.push(items[index]);
        visit(index + 1, selected);
        selected.pop();
      }
    }
    visit(0, []);
    return result;
  }

  function enumerateBundleCandidates(result, target, byId) {
    const maximum = numericOption("SCANWORD_EDITORIAL_BUNDLE_VARIANTS", 24);
    const direct = wordNeighborIds(result, target).map((slotId) => byId.get(slotId)).filter(Boolean);
    const candidates = [];
    const seen = new Set();

    function add(kind, words) {
      const unique = [];
      const ids = new Set([Number(target.id)]);
      for (const word of words) {
        if (!word || ids.has(Number(word.id))) continue;
        ids.add(Number(word.id));
        unique.push(word);
      }
      if (!unique.length || unique.length > 2) return;
      const key = [...ids].sort((a, b) => a - b).join(":");
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ kind, partners: unique });
    }

    for (const pair of combinations(direct, 2)) add("star", pair);

    for (const partner of direct) {
      const secondHop = wordNeighborIds(result, partner)
        .filter((slotId) => slotId !== Number(target.id))
        .map((slotId) => byId.get(slotId))
        .filter(Boolean)
        .sort((a, b) => a.answer.length - b.answer.length || a.id - b.id);
      for (const neighbor of secondHop) add("chain", [partner, neighbor]);
    }

    candidates.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "chain" ? -1 : 1;
      const lengthA = a.partners.reduce((sum, word) => sum + word.answer.length, 0);
      const lengthB = b.partners.reduce((sum, word) => sum + word.answer.length, 0);
      return lengthA - lengthB || a.partners.map((word) => word.id).join(":").localeCompare(b.partners.map((word) => word.id).join(":"));
    });
    return { directPartnerIds: direct.map((word) => word.id), candidates: candidates.slice(0, maximum) };
  }

  function applyEditorialBundleRefits(result) {
    if (!result?.grid || !Array.isArray(result.placed) || !Array.isArray(result.pool)) return result;

    const before = policy.summarize(result.placed);
    const byId = new Map(result.placed.map((word) => [Number(word.id), word]));
    const usedAnswers = new Set(result.placed.map((word) => word.answer));
    const replacements = [];
    const unresolved = [];
    let targetsAttempted = 0;
    let bundleVariants = 0;
    let starVariants = 0;
    let chainVariants = 0;
    let bundlesBuilt = 0;
    let emptyDomainBundles = 0;
    let nodes = 0;
    let forwardPrunes = 0;
    let solutionsFound = 0;
    let rejectedSolutions = 0;

    const targets = result.placed
      .filter((word) => policy.classify(word.answer, word).formulaicShort)
      .sort((a, b) => a.id - b.id);

    for (const target of targets) {
      if (!policy.classify(target.answer, target).formulaicShort) continue;
      targetsAttempted += 1;
      const generated = enumerateBundleCandidates(result, target, byId);
      bundleVariants += generated.candidates.length;
      starVariants += generated.candidates.filter((candidate) => candidate.kind === "star").length;
      chainVariants += generated.candidates.filter((candidate) => candidate.kind === "chain").length;
      let accepted = false;
      const targetDiagnostics = [];

      for (const candidate of generated.candidates) {
        const problem = buildBundleProblem(result, target, candidate.partners, usedAnswers, candidate.kind);
        bundlesBuilt += 1;
        if (problem.domains.some((domain) => domain.length === 0)) {
          emptyDomainBundles += 1;
          targetDiagnostics.push({
            kind: candidate.kind,
            reason: "empty-domain",
            slotIds: problem.words.map((word) => word.id),
            patterns: problem.patterns,
            domainSizes: problem.domains.map((domain) => domain.length),
          });
          continue;
        }

        const solved = solveBundle(problem);
        nodes += solved.nodes;
        forwardPrunes += solved.forwardPrunes;
        solutionsFound += solved.solutions.length;
        for (const solution of solved.solutions) {
          const oldAnswers = problem.words.map((word) => word.answer);
          const outcome = applySolution(result, problem, solution);
          if (!outcome.accepted) {
            rejectedSolutions += 1;
            continue;
          }
          for (const answer of oldAnswers) usedAnswers.delete(answer);
          for (const entry of solution.entries) usedAnswers.add(entry.answer);
          replacements.push({
            targetSlotId: target.id,
            kind: candidate.kind,
            slotIds: problem.words.map((word) => word.id),
            from: oldAnswers,
            to: solution.entries.map((entry) => entry.answer),
            patterns: problem.patterns,
            formulaicGain: solution.formulaicGain,
            penaltyGain: solution.penaltyGain,
            nodes: solved.nodes,
            forwardPrunes: solved.forwardPrunes,
          });
          accepted = true;
          break;
        }
        if (accepted) break;
        targetDiagnostics.push({
          kind: candidate.kind,
          reason: solved.solutions.length ? "validation-rejected" : "no-improving-assignment",
          slotIds: problem.words.map((word) => word.id),
          patterns: problem.patterns,
          domainSizes: problem.domains.map((domain) => domain.length),
          nodes: solved.nodes,
          forwardPrunes: solved.forwardPrunes,
          nodeLimitReached: solved.nodeLimitReached,
          missingSupport: solved.solutions.length ? [] : missingSupportReport(problem),
        });
      }

      if (!accepted) {
        unresolved.push({
          targetSlotId: target.id,
          targetAnswer: target.answer,
          directPartnerIds: generated.directPartnerIds,
          reason: generated.candidates.length ? "no-bundle-solution" : "no-radius-two-bundle",
          variantsTried: generated.candidates.length,
          diagnostics: targetDiagnostics.slice(0, 12),
        });
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
      editorialBundleRefit: {
        mode: "same-geometry-radius-two-csp-v4",
        targetsAttempted,
        bundleVariants,
        starVariants,
        chainVariants,
        bundlesBuilt,
        emptyDomainBundles,
        nodes,
        forwardPrunes,
        solutionsFound,
        rejectedSolutions,
        accepted: replacements.length,
        before,
        after,
        replacements,
        unresolved: unresolved.slice(0, 40),
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
    return applyEditorialBundleRefits(result);
  };

  Object.assign(solver, {
    applyEditorialBundleRefitsV3: applyEditorialBundleRefits,
    editorialBundleProblemV3: buildBundleProblem,
    solveEditorialBundleV3: solveBundle,
    enumerateEditorialBundleCandidatesV3: enumerateBundleCandidates,
    __editorialBundleRefitV3Installed: true,
  });
})();
