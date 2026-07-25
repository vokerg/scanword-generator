(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  const core = window.ScanwordCore;
  if (!solver
    || !closedFill
    || !core
    || typeof solver.generatePortfolio !== "function"
    || solver.__preallocationFilterV1Installed) return;

  const phase10GeneratePortfolio = solver.generatePortfolio.bind(solver);

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function mode() {
    const value = String(environmentOption("SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER", "off")).toLowerCase();
    return value === "filter" ? "filter" : value === "shadow" ? "shadow" : "off";
  }

  function numericOption(name, fallback) {
    const value = Number(environmentOption(name, fallback));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  function nonNegativeOption(name, fallback = 0) {
    const value = Number(environmentOption(name, fallback));
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
  }

  function filterWidth() {
    return Math.min(320, Math.max(1, numericOption("SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH", 96)));
  }

  function frontierEnabled() {
    return String(environmentOption("SCANWORD_COMPLETE_PIPELINE_FRONTIER", "off")).toLowerCase() === "on";
  }

  function frontierWidth() {
    return Math.min(8, Math.max(1, numericOption("SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH", 4)));
  }

  function now() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function partialSearchVariant(state) {
    return String(state?.partialSearch?.selectedVariant
      || state?.grid?.__scanwordPartialSearch?.selectedVariant
      || "default");
  }

  function countWeakFill(placed, poolByAnswer) {
    return (placed || []).reduce(
      (total, word) => total + Number(Boolean(word.weakFill || poolByAnswer.get(word.answer)?.weakFill)),
      0,
    );
  }

  function geometryCounts(state) {
    let panels = 0;
    let letters = 0;
    let clues = 0;
    let crossings = 0;
    for (const row of state?.grid || []) {
      for (const cell of row || []) {
        if (cell?.type === "panel") panels += 1;
        else if (cell?.type === "letter") {
          letters += 1;
          if ((cell.slotIds || []).length > 1) crossings += 1;
        } else if (cell?.type === "clue") clues += 1;
      }
    }
    return { panels, letters, clues, crossings };
  }

  function makeStructuralRecord(state, provenance, allocationIndex) {
    const geometry = geometryCounts(state);
    const estimate = typeof solver.evaluateClueFeasibilityV1 === "function"
      ? solver.evaluateClueFeasibilityV1(state)
      : null;
    const observation = {
      allocationIndex,
      state,
      provenance: { ...provenance, allocationIndex },
      geometry,
      answers: Number(state?.placed?.length || 0),
      estimate,
    };
    observation.vector = typeof solver.preallocationStructuralVectorV1 === "function"
      ? solver.preallocationStructuralVectorV1(observation)
      : {
        panels: Number(estimate?.panelCells ?? geometry.panels ?? 0),
        letters: Number(geometry.letters || 0),
        answers: Number(observation.answers || 0),
        crossings: Number(geometry.crossings || 0),
        panelRegions: Number(estimate?.panelRegions || 0),
        isolatedPanels: Number(estimate?.isolatedPanels || 0),
        largestPanelRegion: Number(estimate?.largestPanelRegion || 0),
        residualConcentration: Number(estimate?.panelCells || geometry.panels || 0) > 0
          ? +(Number(estimate?.largestPanelRegion || 0) / Number(estimate?.panelCells || geometry.panels || 1)).toFixed(6)
          : 1,
        necessaryPass: Boolean(estimate?.completeNecessaryPass),
        hardImpossible: Boolean(estimate?.hardImpossible),
        hardFailures: Number(estimate?.hardFailures?.length || 0),
        zeroDomainClues: Number(estimate?.zeroDomainClues || 0),
        longClueImpossible: Number(estimate?.longClueImpossible || 0),
        clueTextUpperBound: Number(estimate?.clueTextUpperBound || 0),
        externalUpperBound: Number(estimate?.externalUpperBound || 0),
        greedyClueTextCells: Number(estimate?.greedyClueTextCells || 0),
        greedyExternalClues: Number(estimate?.greedyExternalClues || 0),
        overlapPressure: Number(estimate?.overlapPressure || 0),
      };
    return observation;
  }

  function rankRecords(records, width) {
    if (typeof solver.selectPreallocationRankedFrontierV1 !== "function") {
      throw new Error("Rank-only preallocation selector is unavailable");
    }
    return solver.selectPreallocationRankedFrontierV1(records, width);
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
    return ["default", "baseline", "baseline-fallback"].includes(candidate.partialSearchVariant) ? 0 : 1;
  }

  function compareCandidates(first, second, poolByAnswer) {
    if (first.panelCells !== second.panelCells) return first.panelCells - second.panelCells;
    if (first.letterCells !== second.letterCells) return second.letterCells - first.letterCells;
    const weakFirst = countWeakFill(first.placed, poolByAnswer);
    const weakSecond = countWeakFill(second.placed, poolByAnswer);
    if (weakFirst !== weakSecond) return weakFirst - weakSecond;
    if (first.clueTextCells !== second.clueTextCells) return first.clueTextCells - second.clueTextCells;
    if (first.intersections !== second.intersections) return second.intersections - first.intersections;
    if (first.placed.length !== second.placed.length) return second.placed.length - first.placed.length;
    if (Boolean(first.victimReplacement) !== Boolean(second.victimReplacement)) {
      return Number(Boolean(first.victimReplacement)) - Number(Boolean(second.victimReplacement));
    }
    return variantTieRank(first) - variantTieRank(second)
      || first.attempt - second.attempt
      || String(first.partialSearchVariant).localeCompare(String(second.partialSearchVariant));
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

  function attachFilterTelemetry(result, telemetry) {
    const attach = (candidate) => {
      if (!candidate || typeof candidate !== "object") return;
      candidate.constructionV2 = {
        ...(candidate.constructionV2 || {}),
        preallocationFilter: telemetry,
      };
    };
    attach(result);
    for (const candidate of result?.__completePipelineFrontierV1?.candidates || []) attach(candidate);
    return result;
  }

  function generateFilteredPortfolio(seed, poolSize, rows, cols, targetWords) {
    const width = filterWidth();
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

    const baseRecords = [];
    let statesEvaluated = 0;
    let beamStatesEvaluated = 0;
    let baselineFallbackStatesEvaluated = 0;

    function registerBaseState(state, attempt, forcedVariant = null) {
      if (!state || state.placed.length < targetWords) return;
      const variant = forcedVariant || partialSearchVariant(state);
      if (forcedVariant) {
        state.partialSearch = { ...(state.partialSearch || {}), selectedVariant: forcedVariant };
        state.grid.__scanwordPartialSearch = state.partialSearch;
      }
      statesEvaluated += 1;
      if (variant === "beam") beamStatesEvaluated += 1;
      if (variant === "baseline-fallback") baselineFallbackStatesEvaluated += 1;
      baseRecords.push(makeStructuralRecord(state, {
        source: forcedVariant ? "build-attempt-fallback" : "build-attempt",
        buildIndex: baseRecords.length,
        attempt,
        attemptNumber: attempt + 1,
        partialSearchVariant: variant,
        victimVariantIndex: null,
      }, baseRecords.length));
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
      registerBaseState(state, attempt);
      if (fallback) registerBaseState(fallback, attempt, "baseline-fallback");
    }
    if (!baseRecords.length) return null;

    const baseSelection = rankRecords(baseRecords, width);
    const candidates = [];
    const structuralByCandidate = new Map();
    let structurallyValid = 0;
    let checkpointValid = 0;
    let minimumObservedPanels = Infinity;
    let maximumObservedRawLetters = 0;
    let allocationCalls = 0;
    let allocationElapsedMs = 0;

    function allocateBase(record) {
      const state = record.state;
      const structural = typeof solver.cloneVictimState === "function" ? solver.cloneVictimState(state) : null;
      const started = now();
      const clueLayout = solver.assignClueTextCellsV2(
        state,
        core.makeRandom(`${seed}:clues:${record.provenance.attempt}`),
        clueRestarts,
      );
      allocationCalls += 1;
      allocationElapsedMs += now() - started;
      const candidate = makeCandidate(
        state,
        pool,
        poolIndex,
        rows,
        cols,
        record.provenance.attempt,
        clueLayout,
      );
      if (!candidate) return;
      structurallyValid += 1;
      minimumObservedPanels = Math.min(minimumObservedPanels, candidate.panelCells);
      maximumObservedRawLetters = Math.max(maximumObservedRawLetters, candidate.rawLetterCoverage);
      if (!passesCheckpoint(candidate)) return;
      checkpointValid += 1;
      const key = `${candidate.attempt}:${candidate.partialSearchVariant}`;
      candidate.phase6CandidateKey = key;
      candidates.push(candidate);
      if (structural) structuralByCandidate.set(key, structural);
    }

    for (const record of baseSelection.members) allocateBase(record);
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
    const victimRecords = [];
    if (typeof solver.generateVictimReplacementVariants === "function") {
      const bases = candidates.slice(0, victimOptions.baseCount);
      for (const base of bases) {
        const structural = structuralByCandidate.get(base.phase6CandidateKey);
        if (!structural) continue;
        victimTelemetry.basesExpanded += 1;
        const generated = solver.generateVictimReplacementVariants(structural, pool, victimOptions);
        addTelemetry(victimTelemetry, generated.telemetry);
        for (let variantIndex = 0; variantIndex < generated.states.length; variantIndex += 1) {
          const state = generated.states[variantIndex];
          state.partialSearch = base.partialSearch || null;
          if (state.partialSearch) state.grid.__scanwordPartialSearch = state.partialSearch;
          victimRecords.push(makeStructuralRecord(state, {
            source: "victim-replacement",
            buildIndex: base.attempt,
            attempt: base.attempt,
            attemptNumber: base.attempt + 1,
            partialSearchVariant: base.partialSearchVariant,
            victimVariantIndex: variantIndex,
            baseCandidate: base,
          }, baseRecords.length + victimRecords.length));
        }
      }
    }

    const finalSelection = rankRecords([...baseSelection.members, ...victimRecords], width);
    const retainedVictimIndexes = new Set(finalSelection.members
      .filter((record) => record.provenance.source === "victim-replacement")
      .map((record) => record.allocationIndex));

    for (const record of victimRecords) {
      if (!retainedVictimIndexes.has(record.allocationIndex)) continue;
      const state = record.state;
      const base = record.provenance.baseCandidate;
      const variantIndex = record.provenance.victimVariantIndex;
      const beamSource = base.partialSearchVariant === "beam";
      const clueSeed = beamSource
        ? `${seed}:victim:beam:clues:${base.attempt}:${variantIndex}`
        : `${seed}:victim:clues:${base.attempt}:${variantIndex}`;
      const started = now();
      const clueLayout = solver.assignClueTextCellsV2(
        state,
        core.makeRandom(clueSeed),
        clueRestarts,
      );
      allocationCalls += 1;
      allocationElapsedMs += now() - started;
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

    candidates.sort((a, b) => compareCandidates(a, b, poolByAnswer));
    const best = candidates[0];
    const filterTelemetry = {
      schemaVersion: 1,
      mode: "filter",
      authoritative: true,
      rollback: "SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off",
      ordering: "phase10-repair-potential-ranked-no-dominance-v1",
      stageModel: "base-rank-then-victim-rank-v1",
      width,
      baseStatesConsidered: baseRecords.length,
      baseStatesRetained: baseSelection.retained,
      victimStatesGenerated: victimRecords.length,
      victimStatesRetainedForAllocation: retainedVictimIndexes.size,
      exactAllocationCalls: allocationCalls,
      exactAllocationElapsedMs: +allocationElapsedMs.toFixed(3),
      unrestrictedAllocationUpperBound: baseRecords.length + victimRecords.length,
      callsSavedAgainstObservedSchedule: Math.max(0, baseRecords.length + victimRecords.length - allocationCalls),
      callReductionAgainstObservedSchedule: baseRecords.length + victimRecords.length
        ? +(Math.max(0, baseRecords.length + victimRecords.length - allocationCalls)
          / (baseRecords.length + victimRecords.length)).toFixed(4)
        : 0,
      fallbackUsed: false,
    };
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
      preallocationFilter: filterTelemetry,
    });

    best.attemptBudget = attempts;
    best.coverageCheckpoint = coverageCheckpoint;
    best.constructionV2 = constructionTelemetryFor(best);

    const frontierSelection = frontierEnabled()
      ? solver.selectCompletePipelineFrontierV1(candidates, poolByAnswer, frontierWidth())
      : null;
    if (frontierSelection) {
      for (const candidate of frontierSelection.candidates) {
        candidate.attemptBudget = attempts;
        candidate.coverageCheckpoint = coverageCheckpoint;
        candidate.constructionV2 = {
          ...constructionTelemetryFor(candidate),
          completePipelineConstructionFrontier: frontierSelection.telemetry,
        };
        candidate.completePipelineConstructionFrontierV1 = frontierSelection.telemetry;
      }
      best.constructionV2 = {
        ...best.constructionV2,
        completePipelineConstructionFrontier: frontierSelection.telemetry,
      };
      best.completePipelineConstructionFrontierV1 = frontierSelection.telemetry;
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
      validated.completePipelineConstructionFrontierV1 = frontierSelection.telemetry;
      validated.constructionV2 = {
        ...(validated.constructionV2 || {}),
        completePipelineConstructionFrontier: frontierSelection.telemetry,
      };
      const frontierCandidates = frontierSelection.candidates.map((candidate) => candidate === best ? validated : candidate);
      Object.defineProperty(validated, "__completePipelineFrontierV1", {
        value: {
          schemaVersion: 2,
          candidates: frontierCandidates,
          telemetry: frontierSelection.telemetry,
        },
        enumerable: false,
        configurable: true,
      });
    }
    return attachFilterTelemetry(validated, filterTelemetry);
  }

  function generatePortfolio(...args) {
    if (mode() !== "filter") return phase10GeneratePortfolio(...args);
    try {
      const result = generateFilteredPortfolio(...args);
      if (result) return result;
      const fallback = phase10GeneratePortfolio(...args);
      return attachFilterTelemetry(fallback, {
        schemaVersion: 1,
        mode: "filter",
        authoritative: true,
        rollback: "SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off",
        width: filterWidth(),
        fallbackUsed: true,
        fallbackReason: "no-filtered-candidate-passed-checkpoint",
      });
    } catch (error) {
      const fallback = phase10GeneratePortfolio(...args);
      return attachFilterTelemetry(fallback, {
        schemaVersion: 1,
        mode: "filter",
        authoritative: true,
        rollback: "SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off",
        width: filterWidth(),
        fallbackUsed: true,
        fallbackReason: "filter-error",
        error: String(error?.stack || error),
      });
    }
  }

  solver.generatePortfolio = generatePortfolio;
  Object.assign(solver, {
    generatePreallocationFilteredPortfolioV1: generateFilteredPortfolio,
    preallocationFilterModeV1: mode,
    preallocationFilterWidthV1: filterWidth,
    __preallocationFilterV1Installed: true,
  });

  window.ScanwordPreallocationFilterV1 = {
    version: 1,
    mode,
    width: filterWidth,
    generate: generateFilteredPortfolio,
  };
})();