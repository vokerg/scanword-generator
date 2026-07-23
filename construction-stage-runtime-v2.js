(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const core = window.ScanwordCore;
  const closedFill = window.ScanwordClosedFill;
  const editorialPolicy = window.ScanwordEditorialLexicalPolicyV3;
  if (!solver || !core || !closedFill || solver.__constructionStageRuntimeV2Installed) return;

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function numericOption(name, fallback) {
    const value = Number(environmentOption(name, fallback));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  function constructionMode() {
    return String(environmentOption("SCANWORD_CONSTRUCTION_MODE", "legacy"));
  }

  function completePipelineFrontierEnabled() {
    return String(environmentOption("SCANWORD_COMPLETE_PIPELINE_FRONTIER", "off")).toLowerCase() === "on";
  }

  function withEnvironment(name, value, callback) {
    if (typeof process !== "undefined") {
      const previous = process.env[name];
      if (value == null) delete process.env[name];
      else process.env[name] = String(value);
      try {
        return callback();
      } finally {
        if (previous == null) delete process.env[name];
        else process.env[name] = previous;
      }
    }
    const previous = window[name];
    window[name] = value;
    try {
      return callback();
    } finally {
      window[name] = previous;
    }
  }

  function weakFillCount(result) {
    const poolByAnswer = new Map((result.pool || []).map((entry) => [entry.answer, entry]));
    return (result.placed || []).reduce((sum, word) => (
      sum + Number(Boolean(word.weakFill || poolByAnswer.get(word.answer)?.weakFill))
    ), 0);
  }

  function completeRank(result) {
    return {
      panels: Number(result.panelCells || 0),
      letters: Number(result.letterCells || 0),
      weakFill: weakFillCount(result),
      clueTextCells: Number(result.clueTextCells || 0),
      crossings: Number(result.intersections || 0),
      answers: Number(result.placed?.length || 0),
    };
  }

  function compareGuardCandidates(first, second) {
    const a = completeRank(first);
    const b = completeRank(second);
    return a.panels - b.panels
      || b.letters - a.letters
      || a.weakFill - b.weakFill
      || a.clueTextCells - b.clueTextCells
      || b.crossings - a.crossings
      || b.answers - a.answers;
  }

  function makeTargetedCandidate(base, state, clueLayout) {
    const metrics = solver.resultMetrics(state);
    if (!metrics.validation.valid || metrics.components !== 1) return null;
    const coverage = closedFill.measureCoverage(state.grid);
    return {
      ...base,
      grid: state.grid,
      placed: state.placed,
      score: metrics.score,
      intersections: metrics.intersections,
      doubles: metrics.doubles,
      fillRatio: coverage.activeCoverage,
      answerCoverage: coverage.answerSpaceCoverage,
      rawLetterCoverage: coverage.rawLetterCoverage,
      letterCells: coverage.letterCells,
      panelCells: coverage.panelCells,
      panelRatio: coverage.panelCells / Math.max(1, coverage.totalCells),
      components: metrics.components,
      externalClueTexts: clueLayout.externalClueTexts,
      clueTextCells: clueLayout.clueTextCells,
      clueFootprints: state.clueFootprints || [],
      panelRegions: metrics.panelRegions,
      isolatedPanels: metrics.isolatedPanels,
      largestPanelRegion: metrics.largestPanelRegion,
      validation: metrics.validation,
      availableSlots: state.placed.length,
    };
  }

  function passesCheckpoint(candidate, checkpoint) {
    if (!candidate) return false;
    return candidate.placed.length >= Number(checkpoint?.minimumAnswers || 0)
      && candidate.fillRatio >= Number(checkpoint?.minimumActive || 0)
      && candidate.answerCoverage >= Number(checkpoint?.minimumAnswerCoverage || 0)
      && candidate.clueTextCells >= Number(checkpoint?.minimumClueTextCells || 0)
      && candidate.externalClueTexts >= Number(checkpoint?.minimumExternalClues || 0)
      && candidate.panelCells <= Number(checkpoint?.maximumPanels ?? Infinity)
      && candidate.components === Number(checkpoint?.requiredComponents || 1)
      && candidate.validation?.valid
      && candidate.placed.every((entry) => entry.hasExactClue);
  }

  function compareTargetedCandidates(first, second, poolByAnswer) {
    if (first.panelCells !== second.panelCells) return first.panelCells - second.panelCells;
    if (first.letterCells !== second.letterCells) return second.letterCells - first.letterCells;
    const weakFirst = (first.placed || []).reduce((sum, word) => (
      sum + Number(Boolean(word.weakFill || poolByAnswer.get(word.answer)?.weakFill))
    ), 0);
    const weakSecond = (second.placed || []).reduce((sum, word) => (
      sum + Number(Boolean(word.weakFill || poolByAnswer.get(word.answer)?.weakFill))
    ), 0);
    if (weakFirst !== weakSecond) return weakFirst - weakSecond;
    if (first.clueTextCells !== second.clueTextCells) return first.clueTextCells - second.clueTextCells;
    if (first.intersections !== second.intersections) return second.intersections - first.intersections;
    if (first.placed.length !== second.placed.length) return second.placed.length - first.placed.length;
    return 0;
  }

  function applyTargetedVictim(result, args) {
    const threshold = numericOption("SCANWORD_TARGETED_VICTIM_PANELS", 8);
    const telemetry = {
      mode: "targeted-residual-victim-v1",
      thresholdPanels: threshold,
      panelsBefore: result.panelCells,
      panelsAfter: result.panelCells,
      attempted: false,
      accepted: false,
      finalistsEvaluated: 0,
      finalistsPassingCheckpoint: 0,
      selected: null,
      search: null,
    };
    if (result.panelCells <= threshold) {
      result.constructionV2 = { ...(result.constructionV2 || {}), targetedVictim: telemetry };
      return result;
    }

    telemetry.attempted = true;
    const options = {
      maxRegions: numericOption("SCANWORD_TARGETED_VICTIM_REGIONS", 3),
      maxVictimsPerRegion: numericOption("SCANWORD_TARGETED_VICTIM_WORDS", 4),
      focusRadius: numericOption("SCANWORD_TARGETED_VICTIM_RADIUS", 2),
      maxFocusCells: numericOption("SCANWORD_TARGETED_VICTIM_FOCUS_CELLS", 32),
      depth: numericOption("SCANWORD_TARGETED_VICTIM_DEPTH", 2),
      beamWidth: numericOption("SCANWORD_TARGETED_VICTIM_BEAM", 5),
      branching: numericOption("SCANWORD_TARGETED_VICTIM_BRANCHING", 18),
      maxVariants: numericOption("SCANWORD_TARGETED_VICTIM_VARIANTS", 8),
      maxSlotCandidates: numericOption("SCANWORD_TARGETED_VICTIM_SLOT_CANDIDATES", 240),
      maxDomainSize: numericOption("SCANWORD_TARGETED_VICTIM_DOMAIN", 128),
      maxSlots: numericOption("SCANWORD_TARGETED_VICTIM_SLOTS", 40),
      valuesPerSlot: numericOption("SCANWORD_TARGETED_VICTIM_VALUES", 3),
      maxMoves: numericOption("SCANWORD_TARGETED_VICTIM_MOVES", 54),
    };
    const searched = solver.generateTargetedVictimVariants(result, result.pool || [], options);
    telemetry.search = searched.telemetry;
    const poolByAnswer = new Map((result.pool || []).map((entry) => [entry.answer, entry]));
    const clueRestarts = numericOption("SCANWORD_PORTFOLIO_CLUE_RESTARTS", 160);
    let best = result;
    for (let index = 0; index < searched.states.length; index += 1) {
      const state = solver.cloneVictimState(searched.states[index]);
      const clueLayout = solver.assignClueTextCellsV2(
        state,
        core.makeRandom(`${args[0]}:targeted-victim:clues:${result.attempt}:${index}`),
        clueRestarts,
      );
      telemetry.finalistsEvaluated += 1;
      const candidate = makeTargetedCandidate(result, state, clueLayout);
      if (!passesCheckpoint(candidate, result.coverageCheckpoint)) continue;
      telemetry.finalistsPassingCheckpoint += 1;
      if (compareTargetedCandidates(candidate, best, poolByAnswer) < 0) {
        best = candidate;
        telemetry.selected = state.targetedVictimMeta || null;
      }
    }
    telemetry.accepted = best !== result;
    telemetry.panelsAfter = best.panelCells;
    best.constructionV2 = { ...(result.constructionV2 || {}), targetedVictim: telemetry };
    return best;
  }

  function cloneCompleteCandidate(result) {
    const pool = result.pool || [];
    const source = { ...result, pool: [] };
    let clone;
    if (typeof structuredClone === "function") {
      clone = structuredClone(source);
    } else {
      clone = JSON.parse(JSON.stringify(source));
    }
    clone.pool = pool;
    return clone;
  }

  function generateLegacyGuardCandidate(args) {
    if (constructionMode() !== "portfolio" || typeof solver.generateLegacySingleCandidateV2 !== "function") return null;
    return withEnvironment("SCANWORD_CONSTRUCTION_MODE", "legacy", () => (
      solver.generateLegacySingleCandidateV2(...args)
    ));
  }

  function applyBaselineGuard(portfolio, args, legacyOverride = null) {
    const requestedMode = constructionMode();
    if (requestedMode !== "portfolio") return portfolio;
    const legacy = legacyOverride ? cloneCompleteCandidate(legacyOverride) : generateLegacyGuardCandidate(args);
    if (!legacy) return portfolio;
    const selectedPortfolio = compareGuardCandidates(portfolio, legacy) <= 0;
    const result = selectedPortfolio ? portfolio : legacy;
    result.constructionV2 = {
      ...(portfolio.constructionV2 || {}),
      baselineGuard: {
        selected: selectedPortfolio ? "portfolio" : "legacy",
        portfolioPanels: portfolio.panelCells,
        legacyPanels: legacy.panelCells,
        portfolioLetters: portfolio.letterCells,
        legacyLetters: legacy.letterCells,
        portfolioWeakFill: weakFillCount(portfolio),
        legacyWeakFill: weakFillCount(legacy),
      },
    };
    return result;
  }

  function stageDescriptor(name, before, after, elapsedMs, status = "ok", error = null) {
    return {
      name,
      status,
      elapsedMs,
      panelsBefore: Number(before?.panelCells || 0),
      panelsAfter: Number(after?.panelCells || 0),
      answersBefore: Number(before?.placed?.length || 0),
      answersAfter: Number(after?.placed?.length || 0),
      error,
    };
  }

  function runResultStage(stages, name, result, operation) {
    const started = Date.now();
    try {
      const next = operation(result) || result;
      stages.push(stageDescriptor(name, result, next, Date.now() - started));
      return next;
    } catch (error) {
      stages.push(stageDescriptor(name, result, result, Date.now() - started, "error", String(error?.stack || error)));
      result.constructionV2 = {
        ...(result.constructionV2 || {}),
        explicitStageRuntimeError: {
          stage: name,
          error: String(error?.stack || error),
        },
      };
      return result;
    }
  }

  function generateConstructionPortfolio(args, stages) {
    const started = Date.now();
    try {
      const result = solver.generatePortfolio(...args);
      if (result) {
        stages.push(stageDescriptor("construction-portfolio", null, result, Date.now() - started));
        return result;
      }
      const fallback = solver.generateLegacySingleCandidateV2(...args);
      fallback.constructionV2 = {
        mode: "portfolio-fallback",
        reason: "no-accepted-candidate",
      };
      stages.push(stageDescriptor("construction-portfolio", null, fallback, Date.now() - started, "fallback"));
      return fallback;
    } catch (error) {
      const fallback = solver.generateLegacySingleCandidateV2(...args);
      fallback.constructionV2 = {
        mode: "portfolio-error-fallback",
        error: String(error?.stack || error),
      };
      stages.push(stageDescriptor(
        "construction-portfolio",
        null,
        fallback,
        Date.now() - started,
        "error-fallback",
        String(error?.stack || error),
      ));
      return fallback;
    }
  }

  function runPreGuardStages(result, args, stages) {
    const seed = args[0];
    let current = result;
    if (typeof solver.polishPortfolioResult === "function") {
      current = runResultStage(stages, "portfolio-polish", current, (candidate) => solver.polishPortfolioResult(candidate, seed));
    }
    if (typeof solver.repackClueFootprints === "function") {
      current = runResultStage(stages, "clue-repack", current, (candidate) => solver.repackClueFootprints(candidate, seed));
    }
    if (typeof solver.adaptiveRepackClueFootprints === "function") {
      current = runResultStage(stages, "adaptive-clue-repack", current, (candidate) => solver.adaptiveRepackClueFootprints(candidate, seed));
    }
    if (typeof solver.absorbResidualPanels === "function") {
      current = runResultStage(stages, "clue-tail-absorption", current, (candidate) => solver.absorbResidualPanels(candidate, seed));
    }
    if (typeof solver.reflowClueFootprints === "function") {
      current = runResultStage(stages, "clue-reflow", current, (candidate) => solver.reflowClueFootprints(candidate, seed));
    }
    if (typeof solver.pairReflowClueFootprints === "function") {
      current = runResultStage(stages, "clue-pair-reflow", current, (candidate) => solver.pairReflowClueFootprints(candidate, seed));
    }
    if (typeof solver.generateTargetedVictimVariants === "function") {
      current = runResultStage(stages, "targeted-victim-repair", current, (candidate) => applyTargetedVictim(candidate, args));
    }
    return current;
  }

  function runGuardAndEditorialStages(result, args, stages, sharedLegacy = null) {
    let current = result;
    if (typeof solver.generateLegacySingleCandidateV2 === "function") {
      current = runResultStage(stages, "baseline-guard", current, (candidate) => applyBaselineGuard(candidate, args, sharedLegacy));
    }
    if (String(environmentOption("SCANWORD_EDITORIAL_REPAIR", "off")).toLowerCase() === "on"
      && typeof solver.applyEditorialRepairV3 === "function") {
      current = runResultStage(stages, "editorial-repair", current, (candidate) => solver.applyEditorialRepairV3(candidate));
    }
    return current;
  }

  function selectedGridClueDebt(result) {
    return Number(
      result.selectedGridClueQuality?.clueDebt
      ?? result.selectedGridClueMetrics?.clueDebt
      ?? result.clueQuality?.selectedGridDebt
      ?? 0,
    );
  }

  function finalistSummary(result, frontierIndex, provenance, elapsedMs, stages) {
    const metrics = solver.resultMetrics(result);
    const editorial = editorialPolicy?.summarize?.(result.placed || []) || {};
    const exactClues = (result.placed || []).every((entry) => entry.hasExactClue);
    result.validation = metrics.validation;
    result.components = metrics.components;
    result.score = metrics.score;
    result.intersections = metrics.intersections;
    return {
      frontierIndex,
      provenance,
      elapsedMs,
      stages,
      valid: Boolean(metrics.validation?.valid),
      connected: metrics.components === 1,
      exactClues,
      panels: Number(result.panelCells || 0),
      answers: Number(result.placed?.length || 0),
      crossings: Number(metrics.intersections || result.intersections || 0),
      rawLetterCoverage: Number(result.rawLetterCoverage || 0),
      formulaicShortCount: Number(editorial.formulaicShortCount || 0),
      editorialPenalty: Number(editorial.editorialPenalty || 0),
      clueDebt: selectedGridClueDebt(result),
      score: Number(metrics.score || result.score || 0),
      weakFill: weakFillCount(result),
      clueTextCells: Number(result.clueTextCells || 0),
    };
  }

  function compareCompletePipelineFinalists(first, second) {
    const a = first.summary || first;
    const b = second.summary || second;
    if (a.valid !== b.valid) return a.valid ? -1 : 1;
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    if (a.exactClues !== b.exactClues) return a.exactClues ? -1 : 1;
    return a.panels - b.panels
      || b.answers - a.answers
      || b.crossings - a.crossings
      || b.rawLetterCoverage - a.rawLetterCoverage
      || a.formulaicShortCount - b.formulaicShortCount
      || a.editorialPenalty - b.editorialPenalty
      || a.clueDebt - b.clueDebt
      || b.score - a.score
      || a.frontierIndex - b.frontierIndex;
  }

  function finalDominates(first, second) {
    const a = first.summary || first;
    const b = second.summary || second;
    if (!a.valid || !a.connected || !a.exactClues) return false;
    const noWorse = a.panels <= b.panels
      && a.answers >= b.answers
      && a.crossings >= b.crossings
      && a.rawLetterCoverage >= b.rawLetterCoverage
      && a.formulaicShortCount <= b.formulaicShortCount
      && a.editorialPenalty <= b.editorialPenalty
      && a.clueDebt <= b.clueDebt;
    if (!noWorse) return false;
    return a.panels < b.panels
      || a.answers > b.answers
      || a.crossings > b.crossings
      || a.rawLetterCoverage > b.rawLetterCoverage
      || a.formulaicShortCount < b.formulaicShortCount
      || a.editorialPenalty < b.editorialPenalty
      || a.clueDebt < b.clueDebt;
  }

  function runCompletePipelineFrontier(initial, args, stages) {
    const payload = initial?.__completePipelineFrontierV1;
    if (!completePipelineFrontierEnabled() || !payload?.candidates?.length || payload.candidates.length < 2) return null;

    const started = Date.now();
    const legacyStarted = Date.now();
    const sharedLegacy = generateLegacyGuardCandidate(args);
    const legacyGuardElapsedMs = Date.now() - legacyStarted;
    const processed = [];

    for (let index = 0; index < payload.candidates.length; index += 1) {
      const sourceCandidate = payload.candidates[index];
      const candidateStarted = Date.now();
      const candidateStages = [];
      let result = cloneCompleteCandidate(sourceCandidate);
      result = runPreGuardStages(result, args, candidateStages);
      result = runGuardAndEditorialStages(result, args, candidateStages, sharedLegacy);
      const provenance = payload.telemetry?.members?.[index]?.provenance || {
        sourceIndex: index,
        attempt: Number(sourceCandidate.attempt || 0),
        attemptNumber: Number(sourceCandidate.attempt || 0) + 1,
        partialSearchVariant: sourceCandidate.partialSearchVariant || "default",
        victimReplacement: sourceCandidate.victimReplacement || null,
      };
      const summary = finalistSummary(result, index, provenance, Date.now() - candidateStarted, candidateStages);
      processed.push({ result, summary });
    }

    const eligible = processed.filter(({ summary }) => summary.valid && summary.connected && summary.exactClues);
    const ranked = [...(eligible.length ? eligible : processed)].sort(compareCompletePipelineFinalists);
    const selected = ranked[0];
    const selectedSourceIndex = selected.summary.frontierIndex;
    const finalDominance = processed.map((candidate) => {
      const dominator = processed.find((other) => other !== candidate && finalDominates(other, candidate));
      return {
        frontierIndex: candidate.summary.frontierIndex,
        dominated: Boolean(dominator),
        dominatedBy: dominator?.summary?.frontierIndex ?? null,
      };
    });

    selected.result.constructionV2 = {
      ...(selected.result.constructionV2 || {}),
      completePipelineFrontier: {
        schemaVersion: 1,
        mode: "bounded-complete-pipeline-frontier-v1",
        width: payload.candidates.length,
        exactBaselinePreserved: true,
        baselineFrontierIndex: 0,
        selectedFrontierIndex: selectedSourceIndex,
        selectionChanged: selectedSourceIndex !== 0,
        legacyGuardElapsedMs,
        constructionFrontier: payload.telemetry,
        finalDominance,
        candidates: processed.map(({ summary }) => summary),
      },
    };
    stages.push(stageDescriptor(
      "complete-pipeline-frontier",
      initial,
      selected.result,
      Date.now() - started,
      selectedSourceIndex === 0 ? "baseline-retained" : "alternative-selected",
    ));
    return selected.result;
  }

  function runSinglePipeline(result, args, stages) {
    let current = runPreGuardStages(result, args, stages);
    current = runGuardAndEditorialStages(current, args, stages);
    return current;
  }

  function generateSingleCandidate(...args) {
    if (constructionMode() !== "portfolio") return solver.generateLegacySingleCandidateV2(...args);
    const stages = [];
    const started = Date.now();
    const initial = generateConstructionPortfolio(args, stages);
    let result = runCompletePipelineFrontier(initial, args, stages);
    if (!result) result = runSinglePipeline(initial, args, stages);

    result.constructionV2 = {
      ...(result.constructionV2 || {}),
      explicitStageRuntime: {
        schemaVersion: 3,
        mode: result.constructionV2?.completePipelineFrontier
          ? "direct-complete-pipeline-frontier-v1"
          : "direct-single-candidate-stage-runtime-v2",
        elapsedMs: Date.now() - started,
        stages,
      },
    };
    return result;
  }

  Object.assign(solver, {
    generateExplicitSingleCandidateV2: generateSingleCandidate,
    applyTargetedVictimStageV2: applyTargetedVictim,
    applyBaselineGuardStageV2: applyBaselineGuard,
    compareCompletePipelineFinalistsV1: compareCompletePipelineFinalists,
    completePipelineFinalDominatesV1: finalDominates,
    cloneCompletePipelineCandidateV1: cloneCompleteCandidate,
    __constructionStageRuntimeV2Installed: true,
  });

  window.ScanwordConstructionStageRuntimeV2 = {
    version: 3,
    generateSingleCandidate,
  };
})();
