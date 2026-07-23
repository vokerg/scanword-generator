(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  const core = window.ScanwordCore;
  if (!solver || !closedFill || !core || solver.__constructionPortfolioInstalled) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function environmentOption(name, fallback) {
    if (typeof process !== "undefined" && process?.env?.[name] != null) {
      return process.env[name];
    }
    return window[name] == null ? fallback : window[name];
  }

  function modeFromEnvironment() {
    return environmentOption("SCANWORD_CONSTRUCTION_MODE", "legacy");
  }

  function numericOption(name, fallback) {
    const value = Number(environmentOption(name, fallback));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  function nonNegativeOption(name, fallback = 0) {
    const value = Number(environmentOption(name, fallback));
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
  }

  function frontierEnabled() {
    return String(environmentOption("SCANWORD_COMPLETE_PIPELINE_FRONTIER", "off")).toLowerCase() === "on";
  }

  function frontierWidth() {
    return Math.min(8, Math.max(1, numericOption("SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH", 4)));
  }

  function countWeakFill(placed, poolByAnswer) {
    return placed.reduce((total, word) => total + Number(Boolean(poolByAnswer.get(word.answer)?.weakFill)), 0);
  }

  function partialSearchVariant(state) {
    return String(state?.partialSearch?.selectedVariant
      || state?.grid?.__scanwordPartialSearch?.selectedVariant
      || "default");
  }

  function makeCandidate(state, pool, poolIndex, rows, cols, attempt, clueLayout) {
    const metrics = solver.resultMetrics(state);
    if (!metrics.validation.valid || metrics.components !== 1) return null;
    const coverage = closedFill.measureCoverage(state.grid);
    const search = state.partialSearch || state.grid.__scanwordPartialSearch || null;
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
      mode: "portfolio-panel-first-v2",
      partialSearch: search,
      partialSearchVariant: partialSearchVariant(state),
    };
  }

  function variantTieRank(candidate) {
    if (["default", "baseline", "baseline-fallback"].includes(candidate.partialSearchVariant)) return 0;
    return 1;
  }

  function compareCandidates(a, b, poolByAnswer) {
    if (a.panelCells !== b.panelCells) return a.panelCells - b.panelCells;
    if (a.letterCells !== b.letterCells) return b.letterCells - a.letterCells;
    const weakA = countWeakFill(a.placed, poolByAnswer);
    const weakB = countWeakFill(b.placed, poolByAnswer);
    if (weakA !== weakB) return weakA - weakB;
    if (a.clueTextCells !== b.clueTextCells) return a.clueTextCells - b.clueTextCells;
    if (a.intersections !== b.intersections) return b.intersections - a.intersections;
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    if (Boolean(a.victimReplacement) !== Boolean(b.victimReplacement)) return Number(Boolean(a.victimReplacement)) - Number(Boolean(b.victimReplacement));
    return variantTieRank(a) - variantTieRank(b)
      || a.attempt - b.attempt
      || String(a.partialSearchVariant).localeCompare(String(b.partialSearchVariant));
  }

  function frontierVector(candidate, poolByAnswer) {
    return {
      panels: Number(candidate.panelCells || 0),
      letters: Number(candidate.letterCells || 0),
      weakFill: countWeakFill(candidate.placed || [], poolByAnswer),
      clueTextCells: Number(candidate.clueTextCells || 0),
      externalClues: Number(candidate.externalClueTexts || 0),
      crossings: Number(candidate.intersections || 0),
      answers: Number(candidate.placed?.length || 0),
    };
  }

  function dominatesVector(first, second) {
    const noWorse = first.panels <= second.panels
      && first.letters >= second.letters
      && first.weakFill <= second.weakFill
      && first.clueTextCells <= second.clueTextCells
      && first.externalClues >= second.externalClues
      && first.crossings >= second.crossings
      && first.answers >= second.answers;
    if (!noWorse) return false;
    return first.panels < second.panels
      || first.letters > second.letters
      || first.weakFill < second.weakFill
      || first.clueTextCells < second.clueTextCells
      || first.externalClues > second.externalClues
      || first.crossings > second.crossings
      || first.answers > second.answers;
  }

  function candidateProvenance(candidate, sourceIndex) {
    return {
      sourceIndex,
      attempt: Number(candidate.attempt || 0),
      attemptNumber: Number(candidate.attempt || 0) + 1,
      partialSearchVariant: candidate.partialSearchVariant || "default",
      victimReplacement: candidate.victimReplacement || null,
      phase6CandidateKey: candidate.phase6CandidateKey || null,
    };
  }

  function selectCompletePipelineFrontier(candidates, poolByAnswer, width = frontierWidth()) {
    const ranked = [...candidates].sort((a, b) => compareCandidates(a, b, poolByAnswer));
    if (!ranked.length) return { candidates: [], telemetry: { width, considered: 0, retained: 0, rejected: [] } };

    const selected = [ranked[0]];
    const rejected = [];
    const vectorByCandidate = new Map(ranked.map((candidate) => [candidate, frontierVector(candidate, poolByAnswer)]));

    for (let index = 1; index < ranked.length; index += 1) {
      const candidate = ranked[index];
      const vector = vectorByCandidate.get(candidate);
      const dominatorIndex = selected.findIndex((retained) => dominatesVector(vectorByCandidate.get(retained), vector));
      if (dominatorIndex >= 0) {
        rejected.push({
          provenance: candidateProvenance(candidate, index),
          reason: "dominated",
          dominatedBy: candidateProvenance(selected[dominatorIndex], ranked.indexOf(selected[dominatorIndex])),
          vector,
        });
        continue;
      }

      for (let selectedIndex = selected.length - 1; selectedIndex >= 1; selectedIndex -= 1) {
        const retained = selected[selectedIndex];
        if (!dominatesVector(vector, vectorByCandidate.get(retained))) continue;
        selected.splice(selectedIndex, 1);
        rejected.push({
          provenance: candidateProvenance(retained, ranked.indexOf(retained)),
          reason: "dominated-by-later-frontier-member",
          dominatedBy: candidateProvenance(candidate, index),
          vector: vectorByCandidate.get(retained),
        });
      }

      selected.push(candidate);
      selected.sort((a, b) => compareCandidates(a, b, poolByAnswer));
      if (selected.length > width) {
        const removed = selected.pop();
        rejected.push({
          provenance: candidateProvenance(removed, ranked.indexOf(removed)),
          reason: "frontier-width",
          vector: vectorByCandidate.get(removed),
        });
      }
    }

    return {
      candidates: selected,
      telemetry: {
        schemaVersion: 1,
        mode: "bounded-complete-construction-frontier-v1",
        width,
        considered: ranked.length,
        retained: selected.length,
        baselinePreserved: selected[0] === ranked[0],
        members: selected.map((candidate) => ({
          provenance: candidateProvenance(candidate, ranked.indexOf(candidate)),
          vector: vectorByCandidate.get(candidate),
        })),
        rejected,
      },
    };
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
    const attemptOffset = nonNegativeOption("SCANWORD_PORTFOLIO_ATTEMPT_OFFSET", 0);
    const clueRestarts = numericOption("SCANWORD_PORTFOLIO_CLUE_RESTARTS", 160);
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
    const coverageCheckpoint = {
      passed: true,
      minimumAnswers: checkpointAnswers,
      minimumActive: checkpointActive,
      minimumAnswerCoverage: 0.65,
      minimumClueTextCells: 45,
      minimumExternalClues: 24,
      maximumPanels: checkpointPanels,
      requiredComponents: 1,
    };
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
    const structuralByCandidate = new Map();
    let statesEvaluated = 0;
    let structurallyValid = 0;
    let checkpointValid = 0;
    let minimumObservedPanels = Infinity;
    let maximumObservedRawLetters = 0;
    let beamStatesEvaluated = 0;
    let baselineFallbackStatesEvaluated = 0;

    function evaluateAttemptState(state, attempt, forcedVariant = null) {
      if (!state || state.placed.length < targetWords) return;
      statesEvaluated += 1;
      const variant = forcedVariant || partialSearchVariant(state);
      if (variant === "beam") beamStatesEvaluated += 1;
      if (variant === "baseline-fallback") baselineFallbackStatesEvaluated += 1;
      if (forcedVariant) {
        state.partialSearch = {
          ...(state.partialSearch || {}),
          selectedVariant: forcedVariant,
        };
        state.grid.__scanwordPartialSearch = state.partialSearch;
      }
      const structural = solver.cloneVictimState ? solver.cloneVictimState(state) : null;
      const clueLayout = solver.assignClueTextCellsV2(
        state,
        core.makeRandom(`${seed}:clues:${attempt}`),
        clueRestarts,
      );
      const candidate = makeCandidate(state, pool, poolIndex, rows, cols, attempt, clueLayout);
      if (!candidate) return;
      structurallyValid += 1;
      minimumObservedPanels = Math.min(minimumObservedPanels, candidate.panelCells);
      maximumObservedRawLetters = Math.max(maximumObservedRawLetters, candidate.rawLetterCoverage);
      if (!passesCheckpoint(candidate)) return;
      checkpointValid += 1;
      const key = `${attempt}:${candidate.partialSearchVariant}`;
      candidate.phase6CandidateKey = key;
      candidates.push(candidate);
      if (structural) structuralByCandidate.set(key, structural);
    }

    for (let localAttempt = 0; localAttempt < attempts; localAttempt += 1) {
      const attempt = attemptOffset + localAttempt;
      const state = solver.buildAttempt(
        pool,
        rows,
        cols,
        targetWords,
        core.makeRandom(`${seed}:placement:${attempt}`),
        poolIndex,
        "indexed",
      );
      const fallback = state?.__phase6BaselineState || null;
      evaluateAttemptState(state, attempt);
      if (fallback) evaluateAttemptState(fallback, attempt, "baseline-fallback");
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => compareCandidates(a, b, poolByAnswer));

    const victimTelemetry = {
      mode: "prelayout-victim-bundles-v2",
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
      const bases = candidates.slice(0, victimOptions.baseCount);
      for (const base of bases) {
        const structural = structuralByCandidate.get(base.phase6CandidateKey);
        if (!structural) continue;
        victimTelemetry.basesExpanded += 1;
        const generated = solver.generateVictimReplacementVariants(structural, pool, victimOptions);
        addTelemetry(victimTelemetry, generated.telemetry);
        for (let variantIndex = 0; variantIndex < generated.states.length; variantIndex += 1) {
          const state = generated.states[variantIndex];
          const beamSource = base.partialSearchVariant === "beam";
          const clueSeed = beamSource
            ? `${seed}:victim:beam:clues:${base.attempt}:${variantIndex}`
            : `${seed}:victim:clues:${base.attempt}:${variantIndex}`;
          const clueLayout = solver.assignClueTextCellsV2(
            state,
            core.makeRandom(clueSeed),
            clueRestarts,
          );
          state.partialSearch = base.partialSearch || null;
          if (state.partialSearch) state.grid.__scanwordPartialSearch = state.partialSearch;
          const candidate = makeCandidate(state, pool, poolIndex, rows, cols, base.attempt, clueLayout);
          victimTelemetry.finalistsEvaluated += 1;
          if (!candidate || !passesCheckpoint(candidate)) continue;
          victimTelemetry.finalistsPassingCheckpoint += 1;
          candidate.victimReplacement = {
            baseAttempt: base.attempt + 1,
            variant: variantIndex + 1,
            depth: Number(state.victimReplacementDepth || 1),
            sourceVariant: base.partialSearchVariant,
          };
          candidate.phase6CandidateKey = base.phase6CandidateKey;
          candidates.push(candidate);
        }
      }
    }

    candidates.sort((a, b) => compareCandidates(a, b, poolByAnswer));
    const best = candidates[0];
    const constructionTelemetryFor = (candidate) => ({
      mode: "portfolio-panel-first-v2",
      attemptsBuilt: attempts,
      attemptOffset,
      statesEvaluated,
      beamStatesEvaluated,
      baselineFallbackStatesEvaluated,
      structurallyValid,
      checkpointValid,
      minimumObservedPanels,
      maximumObservedRawLetterCoverage: maximumObservedRawLetters,
      selectedAttempt: candidate.attempt + 1,
      selectedPanels: candidate.panelCells,
      selectedRawLetterCoverage: candidate.rawLetterCoverage,
      selectedWeakFillCount: countWeakFill(candidate.placed, poolByAnswer),
      selectedVictimReplacement: candidate.victimReplacement || null,
      selectedPartialSearchVariant: candidate.partialSearchVariant,
      victimReplacement: victimTelemetry,
    });

    best.attemptBudget = attempts;
    best.coverageCheckpoint = coverageCheckpoint;
    best.constructionV2 = constructionTelemetryFor(best);

    const frontierSelection = frontierEnabled()
      ? selectCompletePipelineFrontier(candidates, poolByAnswer, frontierWidth())
      : null;
    if (frontierSelection) {
      for (const candidate of frontierSelection.candidates) {
        candidate.attemptBudget = attempts;
        candidate.coverageCheckpoint = coverageCheckpoint;
        candidate.constructionV2 = constructionTelemetryFor(candidate);
      }
      best.constructionV2.completePipelineFrontier = frontierSelection.telemetry;
    }

    const validated = solver.attachValidationReport(best, seed, {
      mode: "portfolio-panel-first-v2",
      rollbackDepthUsed: best.victimReplacement?.depth || 0,
      regionsBefore: closedFill.extractResidualRegions(best).length,
      regionsAfter: closedFill.extractResidualRegions(best).length,
      panelsBefore: best.panelCells,
      panelsAfter: best.panelCells,
      regionsAttempted: victimTelemetry.basesExpanded,
      regionsSolved: best.victimReplacement ? 1 : 0,
      portfolio: best.constructionV2,
    });

    if (frontierSelection) {
      const frontierCandidates = frontierSelection.candidates.map((candidate) => candidate === best ? validated : candidate);
      Object.defineProperty(validated, "__completePipelineFrontierV1", {
        value: {
          schemaVersion: 1,
          candidates: frontierCandidates,
          telemetry: frontierSelection.telemetry,
        },
        enumerable: false,
        configurable: true,
      });
    }
    return validated;
  }

  solver.generateBest = (...args) => {
    if (modeFromEnvironment() !== "portfolio") return previousGenerateBest(...args);
    try {
      const result = generatePortfolio(...args);
      if (result) return result;
      const fallback = previousGenerateBest(...args);
      fallback.constructionV2 = {
        mode: "portfolio-fallback",
        reason: "no portfolio candidate passed the preserved production checkpoint",
      };
      return fallback;
    } catch (error) {
      const fallback = previousGenerateBest(...args);
      fallback.constructionV2 = {
        mode: "portfolio-fallback",
        error: String(error?.stack || error),
      };
      return fallback;
    }
  };

  Object.assign(solver, {
    generatePortfolio,
    selectCompletePipelineFrontierV1: selectCompletePipelineFrontier,
    completePipelineFrontierVectorV1: frontierVector,
    completePipelineFrontierDominatesV1: dominatesVector,
    completePipelineFrontierWidthV1: frontierWidth,
    __constructionPortfolioInstalled: true,
  });
})();
