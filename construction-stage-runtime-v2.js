(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const core = window.ScanwordCore;
  const closedFill = window.ScanwordClosedFill;
  if (!solver || !core || !closedFill || solver.__constructionStageRuntimeV2Installed) return;

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function numericOption(name, fallback) {
    const value = Number(environmentOption(name, fallback));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  function withEnvironment(name, value, callback) {
    if (typeof process !== "undefined") {
      const previous = process.env[name];
      if (value == null) delete process.env[name];
      else process.env[name] = String(value);
      try { return callback(); } finally {
        if (previous == null) delete process.env[name];
        else process.env[name] = previous;
      }
    }
    const previous = window[name];
    window[name] = value;
    try { return callback(); } finally { window[name] = previous; }
  }

  function weakFillCount(result) {
    const poolByAnswer = new Map((result.pool || []).map((entry) => [entry.answer, entry]));
    return (result.placed || []).reduce((sum, word) => (
      sum + Number(Boolean(word.weakFill || poolByAnswer.get(word.answer)?.weakFill))
    ), 0);
  }

  function compareGuardCandidates(first, second) {
    return Number(first.panelCells || 0) - Number(second.panelCells || 0)
      || Number(second.letterCells || 0) - Number(first.letterCells || 0)
      || weakFillCount(first) - weakFillCount(second)
      || Number(first.clueTextCells || 0) - Number(second.clueTextCells || 0)
      || Number(second.intersections || 0) - Number(first.intersections || 0)
      || Number(second.placed?.length || 0) - Number(first.placed?.length || 0);
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
    const weak = (result) => (result.placed || []).reduce((sum, word) => (
      sum + Number(Boolean(word.weakFill || poolByAnswer.get(word.answer)?.weakFill))
    ), 0);
    const weakFirst = weak(first);
    const weakSecond = weak(second);
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

  function applyBaselineGuard(portfolio, args) {
    if (String(environmentOption("SCANWORD_CONSTRUCTION_MODE", "legacy")) !== "portfolio") return portfolio;
    const legacy = withEnvironment("SCANWORD_CONSTRUCTION_MODE", "legacy", () => (
      solver.generateLegacySingleCandidateV2(...args)
    ));
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

  function stageRecord(name, before, after, elapsedMs, status = "ok", error = null) {
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

  function runStage(stages, name, result, operation) {
    const started = Date.now();
    try {
      const next = operation(result) || result;
      stages.push(stageRecord(name, result, next, Date.now() - started));
      return next;
    } catch (error) {
      stages.push(stageRecord(name, result, result, Date.now() - started, "error", String(error?.stack || error)));
      result.constructionV2 = {
        ...(result.constructionV2 || {}),
        explicitStageRuntimeError: { stage: name, error: String(error?.stack || error) },
      };
      return result;
    }
  }

  function generateConstructionPortfolio(args, stages) {
    const started = Date.now();
    try {
      const result = solver.generatePortfolio(...args);
      if (result) {
        stages.push(stageRecord("construction-portfolio", null, result, Date.now() - started));
        return result;
      }
      const fallback = solver.generateLegacySingleCandidateV2(...args);
      fallback.constructionV2 = { mode: "portfolio-fallback", reason: "no-accepted-candidate" };
      stages.push(stageRecord("construction-portfolio", null, fallback, Date.now() - started, "fallback"));
      return fallback;
    } catch (error) {
      const fallback = solver.generateLegacySingleCandidateV2(...args);
      fallback.constructionV2 = { mode: "portfolio-error-fallback", error: String(error?.stack || error) };
      stages.push(stageRecord("construction-portfolio", null, fallback, Date.now() - started, "error-fallback", String(error?.stack || error)));
      return fallback;
    }
  }

  function generateSingleCandidate(...args) {
    if (String(environmentOption("SCANWORD_CONSTRUCTION_MODE", "legacy")) !== "portfolio") {
      return solver.generateLegacySingleCandidateV2(...args);
    }
    const stages = [];
    const started = Date.now();
    const seed = args[0];
    let result = generateConstructionPortfolio(args, stages);
    const sequence = [
      ["portfolio-polish", solver.polishPortfolioResult, (fn, current) => fn(current, seed)],
      ["clue-repack", solver.repackClueFootprints, (fn, current) => fn(current, seed)],
      ["adaptive-clue-repack", solver.adaptiveRepackClueFootprints, (fn, current) => fn(current, seed)],
      ["clue-tail-absorption", solver.absorbResidualPanels, (fn, current) => fn(current, seed)],
      ["clue-reflow", solver.reflowClueFootprints, (fn, current) => fn(current, seed)],
      ["clue-pair-reflow", solver.pairReflowClueFootprints, (fn, current) => fn(current, seed)],
    ];
    for (const [name, fn, invoke] of sequence) {
      if (typeof fn === "function") result = runStage(stages, name, result, (current) => invoke(fn, current));
    }
    if (typeof solver.generateTargetedVictimVariants === "function") {
      result = runStage(stages, "targeted-victim-repair", result, (current) => applyTargetedVictim(current, args));
    }
    result = runStage(stages, "baseline-guard", result, (current) => applyBaselineGuard(current, args));
    if (String(environmentOption("SCANWORD_EDITORIAL_REPAIR", "off")).toLowerCase() === "on"
      && typeof solver.applyEditorialRepairV3 === "function") {
      result = runStage(stages, "editorial-repair", result, (current) => solver.applyEditorialRepairV3(current));
    }
    result.constructionV2 = {
      ...(result.constructionV2 || {}),
      explicitStageRuntime: {
        schemaVersion: 2,
        mode: "direct-single-candidate-stage-runtime-v2",
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
    __constructionStageRuntimeV2Installed: true,
  });

  window.ScanwordConstructionStageRuntimeV2 = { version: 2, generateSingleCandidate };
})();
