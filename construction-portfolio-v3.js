(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  const core = window.ScanwordCore;
  if (!solver || !closedFill || !core || solver.__constructionPortfolioV3Installed) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_CONSTRUCTION_MODE) {
      return process.env.SCANWORD_CONSTRUCTION_MODE;
    }
    return window.SCANWORD_CONSTRUCTION_MODE || "legacy";
  }

  function selectionModeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_PORTFOLIO_SELECTION) {
      return process.env.SCANWORD_PORTFOLIO_SELECTION;
    }
    return window.SCANWORD_PORTFOLIO_SELECTION || "panel-first";
  }

  function numericOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  function nonNegativeOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
  }

  function lexicalMetrics(placed, poolByAnswer) {
    let weakFillCount = 0;
    let twoLetterCount = 0;
    let shortAnswerCount = 0;
    let lexicalPenalty = 0;
    let qualityTotal = 0;
    let minimumLexicalQuality = 100;
    const weakAnswers = [];

    for (const word of placed || []) {
      const metadata = poolByAnswer.get(word.answer) || word || {};
      const answer = String(word.answer || metadata.answer || "");
      const quality = Number(metadata.lexicalQuality || word.lexicalQuality || (answer.length >= 4 ? 80 : 65));
      const weak = Boolean(metadata.weakFill || word.weakFill);
      if (weak) {
        weakFillCount += 1;
        weakAnswers.push(answer);
      }
      if (answer.length === 2) twoLetterCount += 1;
      if (answer.length <= 3) shortAnswerCount += 1;
      lexicalPenalty += Math.max(0, 80 - quality) + (weak ? 20 : 0);
      qualityTotal += quality;
      minimumLexicalQuality = Math.min(minimumLexicalQuality, quality);
    }

    const count = Math.max(1, (placed || []).length);
    return {
      weakFillCount,
      twoLetterCount,
      shortAnswerCount,
      lexicalPenalty,
      averageLexicalQuality: +(qualityTotal / count).toFixed(2),
      minimumLexicalQuality: (placed || []).length ? minimumLexicalQuality : 0,
      weakAnswers: weakAnswers.sort(),
    };
  }

  function makeCandidate(state, pool, poolIndex, poolByAnswer, rows, cols, attempt, clueLayout) {
    const metrics = solver.resultMetrics(state);
    if (!metrics.validation.valid || metrics.components !== 1) return null;
    const coverage = closedFill.measureCoverage(state.grid);
    const lexical = lexicalMetrics(state.placed, poolByAnswer);
    return {
      rows,
      cols,
      requestedRows: rows,
      requestedCols: cols,
      pool,
      grid: state.grid,
      placed: state.placed,
      attempt,
      score: metrics.score,
      intersections: metrics.intersections,
      doubles: metrics.doubles,
      fillRatio: coverage.activeCoverage,
      answerCoverage: coverage.answerSpaceCoverage,
      rawLetterCoverage: coverage.rawLetterCoverage,
      letterCells: coverage.letterCells,
      clueUsage: 1,
      blankClues: 0,
      panelCells: coverage.panelCells,
      panelRatio: coverage.panelCells / Math.max(1, rows * cols),
      emptyCells: 0,
      components: metrics.components,
      externalClueTexts: clueLayout.externalClueTexts,
      clueTextCells: clueLayout.clueTextCells,
      clueFootprints: state.clueFootprints || [],
      panelRegions: metrics.panelRegions,
      isolatedPanels: metrics.isolatedPanels,
      largestPanelRegion: metrics.largestPanelRegion,
      validation: metrics.validation,
      availableSlots: state.placed.length,
      candidateMode: "indexed",
      candidateChecks: state.candidateChecks || 0,
      candidateLookups: state.candidateLookups || 0,
      poolEntries: poolIndex.entries,
      poolOccurrences: poolIndex.occurrences,
      weakFillCount: lexical.weakFillCount,
      twoLetterCount: lexical.twoLetterCount,
      shortAnswerCount: lexical.shortAnswerCount,
      lexicalPenalty: lexical.lexicalPenalty,
      averageLexicalQuality: lexical.averageLexicalQuality,
      minimumLexicalQuality: lexical.minimumLexicalQuality,
      weakAnswers: lexical.weakAnswers,
      mode: "portfolio-lexical-pareto-v3",
    };
  }

  function comparePanelFirst(a, b) {
    if (a.panelCells !== b.panelCells) return a.panelCells - b.panelCells;
    if (a.letterCells !== b.letterCells) return b.letterCells - a.letterCells;
    if (a.weakFillCount !== b.weakFillCount) return a.weakFillCount - b.weakFillCount;
    if (a.lexicalPenalty !== b.lexicalPenalty) return a.lexicalPenalty - b.lexicalPenalty;
    if (a.clueTextCells !== b.clueTextCells) return a.clueTextCells - b.clueTextCells;
    if (a.intersections !== b.intersections) return b.intersections - a.intersections;
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    if (Boolean(a.victimReplacement) !== Boolean(b.victimReplacement)) {
      return Number(Boolean(a.victimReplacement)) - Number(Boolean(b.victimReplacement));
    }
    return a.attempt - b.attempt;
  }

  function compareLexicalPareto(a, b) {
    if (a.weakFillCount !== b.weakFillCount) return a.weakFillCount - b.weakFillCount;
    if (a.lexicalPenalty !== b.lexicalPenalty) return a.lexicalPenalty - b.lexicalPenalty;
    if (a.panelCells !== b.panelCells) return a.panelCells - b.panelCells;
    if (a.letterCells !== b.letterCells) return b.letterCells - a.letterCells;
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    if (a.clueTextCells !== b.clueTextCells) return a.clueTextCells - b.clueTextCells;
    if (a.intersections !== b.intersections) return b.intersections - a.intersections;
    if (Boolean(a.victimReplacement) !== Boolean(b.victimReplacement)) {
      return Number(Boolean(a.victimReplacement)) - Number(Boolean(b.victimReplacement));
    }
    return a.attempt - b.attempt;
  }

  function dominates(a, b) {
    const noWorse = a.panelCells <= b.panelCells
      && a.weakFillCount <= b.weakFillCount
      && a.lexicalPenalty <= b.lexicalPenalty
      && a.letterCells >= b.letterCells
      && a.placed.length >= b.placed.length;
    if (!noWorse) return false;
    return a.panelCells < b.panelCells
      || a.weakFillCount < b.weakFillCount
      || a.lexicalPenalty < b.lexicalPenalty
      || a.letterCells > b.letterCells
      || a.placed.length > b.placed.length;
  }

  function paretoFrontier(candidates) {
    const frontier = [];
    for (const candidate of candidates || []) {
      let dominated = false;
      for (let index = frontier.length - 1; index >= 0; index -= 1) {
        const incumbent = frontier[index];
        if (dominates(incumbent, candidate)) {
          dominated = true;
          break;
        }
        if (dominates(candidate, incumbent)) frontier.splice(index, 1);
      }
      if (!dominated) frontier.push(candidate);
    }
    return frontier;
  }

  function selectCandidate(candidates, options = {}) {
    if (!candidates?.length) return { candidate: null, telemetry: null };
    const panelFirst = [...candidates].sort(comparePanelFirst)[0];
    const selectionMode = options.selectionMode || "panel-first";
    const panelSlack = Math.max(0, Number(options.panelSlack || 0));
    const frontier = paretoFrontier(candidates);

    if (selectionMode !== "lexical-pareto") {
      return {
        candidate: panelFirst,
        telemetry: {
          selectionMode: "panel-first",
          panelSlack: 0,
          frontierSize: frontier.length,
          eligibleSize: 1,
          panelFirstPanels: panelFirst.panelCells,
          panelFirstWeakFillCount: panelFirst.weakFillCount,
          selectedPanels: panelFirst.panelCells,
          selectedWeakFillCount: panelFirst.weakFillCount,
          tradeoffApplied: false,
        },
      };
    }

    const minimumPanels = Math.min(...candidates.map((candidate) => candidate.panelCells));
    const eligible = frontier
      .filter((candidate) => candidate.panelCells <= minimumPanels + panelSlack)
      .sort(compareLexicalPareto);
    const selected = eligible[0] || panelFirst;
    return {
      candidate: selected,
      telemetry: {
        selectionMode: "lexical-pareto",
        panelSlack,
        frontierSize: frontier.length,
        eligibleSize: eligible.length,
        panelFirstPanels: panelFirst.panelCells,
        panelFirstWeakFillCount: panelFirst.weakFillCount,
        panelFirstLexicalPenalty: panelFirst.lexicalPenalty,
        selectedPanels: selected.panelCells,
        selectedWeakFillCount: selected.weakFillCount,
        selectedLexicalPenalty: selected.lexicalPenalty,
        panelDelta: selected.panelCells - panelFirst.panelCells,
        weakFillDelta: selected.weakFillCount - panelFirst.weakFillCount,
        tradeoffApplied: selected !== panelFirst,
      },
    };
  }

  function selectVictimBases(candidates, baseCount, selectionMode, panelSlack) {
    const panelRanked = [...candidates].sort(comparePanelFirst);
    if (selectionMode !== "lexical-pareto") return panelRanked.slice(0, baseCount);

    const lexicalRanked = paretoFrontier(candidates)
      .filter((candidate) => candidate.panelCells <= panelRanked[0].panelCells + panelSlack + 1)
      .sort(compareLexicalPareto);
    const selected = [];
    const seenAttempts = new Set();
    const panelQuota = Math.ceil(baseCount / 2);

    for (const candidate of panelRanked.slice(0, panelQuota)) {
      if (seenAttempts.has(candidate.attempt)) continue;
      selected.push(candidate);
      seenAttempts.add(candidate.attempt);
    }
    for (const candidate of lexicalRanked) {
      if (selected.length >= baseCount) break;
      if (seenAttempts.has(candidate.attempt)) continue;
      selected.push(candidate);
      seenAttempts.add(candidate.attempt);
    }
    for (const candidate of panelRanked) {
      if (selected.length >= baseCount) break;
      if (seenAttempts.has(candidate.attempt)) continue;
      selected.push(candidate);
      seenAttempts.add(candidate.attempt);
    }
    return selected;
  }

  function addTelemetry(target, source) {
    for (const key of [
      "victimsConsidered",
      "victimsRemoved",
      "slotsEnumerated",
      "movesEnumerated",
      "bundlesTried",
      "statesAccepted",
      "patternLookups",
      "patternChecks",
      "primaryStatesPreserved",
      "secondaryVictimsConsidered",
      "secondaryVictimsRemoved",
      "secondaryStatesAccepted",
      "secondaryFinalists",
    ]) target[key] += Number(source?.[key] || 0);
    target.depthReached = Math.max(target.depthReached, Number(source?.depthReached || 0));
  }

  function generatePortfolio(seed, poolSize, rows, cols, targetWords) {
    const attempts = numericOption("SCANWORD_PORTFOLIO_ATTEMPTS", 120);
    const clueRestarts = numericOption("SCANWORD_PORTFOLIO_CLUE_RESTARTS", 160);
    const selectionMode = selectionModeFromEnvironment();
    const panelSlack = nonNegativeOption("SCANWORD_PORTFOLIO_PANEL_SLACK", 1);
    const victimOptions = {
      baseCount: numericOption("SCANWORD_VICTIM_BASES", 12),
      maxVictims: numericOption("SCANWORD_VICTIM_WORDS", 6),
      depth: numericOption("SCANWORD_VICTIM_DEPTH", 2),
      beamWidth: numericOption("SCANWORD_VICTIM_BEAM", 5),
      branching: numericOption("SCANWORD_VICTIM_BRANCHING", 18),
      maxVariants: numericOption("SCANWORD_VICTIM_VARIANTS", 8),
      maxRegions: numericOption("SCANWORD_VICTIM_REGIONS", 3),
      maxSlotCandidates: numericOption("SCANWORD_VICTIM_SLOT_CANDIDATES", 220),
      maxDomainSize: numericOption("SCANWORD_VICTIM_DOMAIN", 128),
      maxSlots: numericOption("SCANWORD_VICTIM_SLOTS", 36),
      valuesPerSlot: numericOption("SCANWORD_VICTIM_VALUES", 2),
      maxMoves: numericOption("SCANWORD_VICTIM_MOVES", 48),
    };
    const pool = core.generateWordPool(poolSize, core.makeRandom(`${seed}:pool`));
    if (!pool.length) throw new Error("The word pool is empty.");
    const poolIndex = solver.buildPoolIndex(pool);
    const poolByAnswer = new Map(pool.map((entry) => [entry.answer, entry]));
    const area = rows * cols;
    const checkpointAnswers = Math.max(targetWords, Math.min(40, Math.floor(area / 5)));
    const checkpointPanels = Math.ceil(area * 0.09);
    const checkpointActive = area >= 200 ? 0.90 : 0.88;
    const passesCheckpoint = (candidate) => Boolean(candidate
      && candidate.placed.length >= checkpointAnswers
      && candidate.fillRatio >= checkpointActive
      && candidate.answerCoverage >= 0.65
      && candidate.clueTextCells >= 45
      && candidate.externalClueTexts >= 24
      && candidate.panelCells <= checkpointPanels
      && candidate.components === 1
      && candidate.validation?.valid
      && candidate.placed.every((entry) => entry.hasExactClue));

    const candidates = [];
    const structuralByAttempt = new Map();
    let structurallyValid = 0;
    let checkpointValid = 0;
    let minimumObservedPanels = Infinity;
    let maximumObservedRawLetters = 0;
    let minimumObservedWeakFill = Infinity;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const state = solver.buildAttempt(
        pool,
        rows,
        cols,
        targetWords,
        core.makeRandom(`${seed}:placement:${attempt}`),
        poolIndex,
        "indexed",
      );
      if (state.placed.length < targetWords) continue;
      const structural = solver.cloneVictimState ? solver.cloneVictimState(state) : null;
      const clueLayout = solver.assignClueTextCellsV2(
        state,
        core.makeRandom(`${seed}:clues:${attempt}`),
        clueRestarts,
      );
      const candidate = makeCandidate(state, pool, poolIndex, poolByAnswer, rows, cols, attempt, clueLayout);
      if (!candidate) continue;
      structurallyValid += 1;
      minimumObservedPanels = Math.min(minimumObservedPanels, candidate.panelCells);
      maximumObservedRawLetters = Math.max(maximumObservedRawLetters, candidate.rawLetterCoverage);
      minimumObservedWeakFill = Math.min(minimumObservedWeakFill, candidate.weakFillCount);
      if (!passesCheckpoint(candidate)) continue;
      checkpointValid += 1;
      candidates.push(candidate);
      if (structural) structuralByAttempt.set(attempt, structural);
    }

    if (!candidates.length) return null;

    const victimTelemetry = {
      mode: "prelayout-victim-bundles-v3",
      basesExpanded: 0,
      victimsConsidered: 0,
      victimsRemoved: 0,
      slotsEnumerated: 0,
      movesEnumerated: 0,
      bundlesTried: 0,
      statesAccepted: 0,
      finalistsEvaluated: 0,
      finalistsPassingCheckpoint: 0,
      depthReached: 0,
      patternLookups: 0,
      patternChecks: 0,
      primaryStatesPreserved: 0,
      secondaryVictimsConsidered: 0,
      secondaryVictimsRemoved: 0,
      secondaryStatesAccepted: 0,
      secondaryFinalists: 0,
    };

    if (solver.generateVictimReplacementVariants) {
      const bases = selectVictimBases(candidates, victimOptions.baseCount, selectionMode, panelSlack);
      for (const base of bases) {
        const structural = structuralByAttempt.get(base.attempt);
        if (!structural) continue;
        victimTelemetry.basesExpanded += 1;
        const generated = solver.generateVictimReplacementVariants(structural, pool, victimOptions);
        addTelemetry(victimTelemetry, generated.telemetry);
        for (let variantIndex = 0; variantIndex < generated.states.length; variantIndex += 1) {
          const state = generated.states[variantIndex];
          const clueLayout = solver.assignClueTextCellsV2(
            state,
            core.makeRandom(`${seed}:victim:clues:${base.attempt}:${variantIndex}`),
            clueRestarts,
          );
          const candidate = makeCandidate(state, pool, poolIndex, poolByAnswer, rows, cols, base.attempt, clueLayout);
          victimTelemetry.finalistsEvaluated += 1;
          if (!candidate || !passesCheckpoint(candidate)) continue;
          victimTelemetry.finalistsPassingCheckpoint += 1;
          candidate.victimReplacement = {
            baseAttempt: base.attempt + 1,
            variant: variantIndex + 1,
            depth: Number(state.victimReplacementDepth || 1),
          };
          candidates.push(candidate);
        }
      }
    }

    const selection = selectCandidate(candidates, { selectionMode, panelSlack });
    const best = selection.candidate;
    best.attemptBudget = attempts;
    best.coverageCheckpoint = {
      passed: true,
      minimumAnswers: checkpointAnswers,
      minimumActive: checkpointActive,
      minimumAnswerCoverage: 0.65,
      minimumClueTextCells: 45,
      minimumExternalClues: 24,
      maximumPanels: checkpointPanels,
      requiredComponents: 1,
    };
    best.constructionV2 = {
      mode: "portfolio-lexical-pareto-v3",
      selection: selection.telemetry,
      attemptsBuilt: attempts,
      structurallyValid,
      checkpointValid,
      candidateCount: candidates.length,
      minimumObservedPanels,
      maximumObservedRawLetterCoverage: maximumObservedRawLetters,
      minimumObservedWeakFill: Number.isFinite(minimumObservedWeakFill) ? minimumObservedWeakFill : null,
      selectedAttempt: best.attempt + 1,
      selectedPanels: best.panelCells,
      selectedRawLetterCoverage: best.rawLetterCoverage,
      selectedWeakFillCount: best.weakFillCount,
      selectedTwoLetterCount: best.twoLetterCount,
      selectedShortAnswerCount: best.shortAnswerCount,
      selectedLexicalPenalty: best.lexicalPenalty,
      selectedAverageLexicalQuality: best.averageLexicalQuality,
      selectedMinimumLexicalQuality: best.minimumLexicalQuality,
      selectedWeakAnswers: best.weakAnswers,
      selectedVictimReplacement: best.victimReplacement || null,
      victimReplacement: victimTelemetry,
    };
    return solver.attachValidationReport(best, seed, {
      mode: "portfolio-lexical-pareto-v3",
      rollbackDepthUsed: best.victimReplacement?.depth || 0,
      regionsBefore: closedFill.extractResidualRegions(best).length,
      regionsAfter: closedFill.extractResidualRegions(best).length,
      panelsBefore: best.panelCells,
      panelsAfter: best.panelCells,
      regionsAttempted: victimTelemetry.basesExpanded,
      regionsSolved: best.victimReplacement ? 1 : 0,
      portfolio: best.constructionV2,
    });
  }

  solver.generateBest = (...args) => {
    if (modeFromEnvironment() !== "portfolio") return previousGenerateBest(...args);
    try {
      const result = generatePortfolio(...args);
      if (result) return result;
      const fallback = previousGenerateBest(...args);
      fallback.constructionV2 = {
        mode: "portfolio-v3-fallback",
        reason: "no portfolio candidate passed the preserved production checkpoint",
      };
      return fallback;
    } catch (error) {
      const fallback = previousGenerateBest(...args);
      fallback.constructionV2 = {
        mode: "portfolio-v3-fallback",
        error: String(error?.stack || error),
      };
      return fallback;
    }
  };

  Object.assign(solver, {
    generatePortfolioV3: generatePortfolio,
    portfolioLexicalMetrics: lexicalMetrics,
    portfolioParetoFrontier: paretoFrontier,
    selectPortfolioCandidateV3: selectCandidate,
    __constructionPortfolioV3Installed: true,
  });
})();
