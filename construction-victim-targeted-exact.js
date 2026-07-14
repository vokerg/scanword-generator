(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  const core = window.ScanwordCore;
  if (!solver?.generateTargetedVictimVariants || !solver?.assignClueTextCellsV2 || !closedFill || !core || solver.__constructionTargetedExactInstalled) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_CONSTRUCTION_MODE) return process.env.SCANWORD_CONSTRUCTION_MODE;
    return window.SCANWORD_CONSTRUCTION_MODE || "legacy";
  }

  function numericOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  function cloneCell(cell) {
    return {
      ...cell,
      slotIds: [...(cell.slotIds || [])],
      directions: [...(cell.directions || [])],
      clues: (cell.clues || []).map((clue) => ({
        ...clue,
        textCells: clue.textCells?.map((target) => ({ ...target })),
      })),
    };
  }

  function cloneState(state) {
    return {
      ...state,
      grid: state.grid.map((row) => row.map(cloneCell)),
      placed: state.placed.map((word) => ({
        ...word,
        cells: word.cells.map((cell) => ({ ...cell })),
      })),
      usedAnswers: new Set(state.placed.map((word) => word.answer)),
      clueFootprints: (state.clueFootprints || []).map((footprint) => ({
        ...footprint,
        cells: footprint.cells.map((cell) => ({ ...cell })),
      })),
    };
  }

  function weakFillCount(result, poolByAnswer) {
    return result.placed.reduce((sum, word) => sum + Number(Boolean(poolByAnswer.get(word.answer)?.weakFill)), 0);
  }

  function makeCandidate(base, state, clueLayout) {
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

  function compareCandidates(a, b, poolByAnswer) {
    if (a.panelCells !== b.panelCells) return a.panelCells - b.panelCells;
    if (a.letterCells !== b.letterCells) return b.letterCells - a.letterCells;
    const weakA = weakFillCount(a, poolByAnswer);
    const weakB = weakFillCount(b, poolByAnswer);
    if (weakA !== weakB) return weakA - weakB;
    if (a.clueTextCells !== b.clueTextCells) return a.clueTextCells - b.clueTextCells;
    if (a.intersections !== b.intersections) return b.intersections - a.intersections;
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    return 0;
  }

  function withTemporaryEnvironment(overrides, callback) {
    if (typeof process === "undefined" || !process?.env) return callback();
    const previous = new Map();
    for (const [name, value] of Object.entries(overrides)) {
      previous.set(name, process.env[name]);
      process.env[name] = String(value);
    }
    try {
      return callback();
    } finally {
      for (const [name, value] of previous.entries()) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }

  function exactPostprocess(candidate, seed, index, options, telemetry) {
    return withTemporaryEnvironment({
      SCANWORD_REPACK_NODES: options.repackNodes,
      SCANWORD_REPACK_CANDIDATES: options.repackCandidates,
      SCANWORD_REPACK_BRANCH: options.repackBranch,
    }, () => {
      let current = candidate;
      const stages = [
        ["polish", solver.polishPortfolioResult],
        ["repack", solver.repackClueFootprints],
        ["adaptive", solver.adaptiveRepackClueFootprints],
        ["tail", solver.absorbResidualPanels],
        ["reflow", solver.reflowClueFootprints],
        ["pairReflow", solver.pairReflowClueFootprints],
      ];
      for (const [name, stage] of stages) {
        if (typeof stage !== "function") continue;
        const before = current.panelCells;
        current = stage(current, `${seed}:targeted-exact:${index}:${name}`) || current;
        telemetry.stageRuns[name] = (telemetry.stageRuns[name] || 0) + 1;
        telemetry.stagePanelGain[name] = (telemetry.stagePanelGain[name] || 0) + Math.max(0, before - current.panelCells);
      }
      return current;
    });
  }

  solver.generateBest = (...args) => {
    const generated = previousGenerateBest(...args);
    if (modeFromEnvironment() !== "portfolio") return generated;
    const threshold = numericOption("SCANWORD_TARGETED_EXACT_PANELS", 8);
    const options = {
      maxRegions: numericOption("SCANWORD_TARGETED_EXACT_REGIONS", 3),
      maxVictimsPerRegion: numericOption("SCANWORD_TARGETED_EXACT_WORDS", 4),
      focusRadius: numericOption("SCANWORD_TARGETED_EXACT_RADIUS", 2),
      maxFocusCells: numericOption("SCANWORD_TARGETED_EXACT_FOCUS_CELLS", 32),
      depth: numericOption("SCANWORD_TARGETED_EXACT_DEPTH", 2),
      beamWidth: numericOption("SCANWORD_TARGETED_EXACT_BEAM", 5),
      branching: numericOption("SCANWORD_TARGETED_EXACT_BRANCHING", 18),
      maxVariants: numericOption("SCANWORD_TARGETED_EXACT_VARIANTS", 4),
      maxSlotCandidates: numericOption("SCANWORD_TARGETED_EXACT_SLOT_CANDIDATES", 240),
      maxDomainSize: numericOption("SCANWORD_TARGETED_EXACT_DOMAIN", 128),
      maxSlots: numericOption("SCANWORD_TARGETED_EXACT_SLOTS", 40),
      valuesPerSlot: numericOption("SCANWORD_TARGETED_EXACT_VALUES", 3),
      maxMoves: numericOption("SCANWORD_TARGETED_EXACT_MOVES", 54),
      clueRestarts: numericOption("SCANWORD_TARGETED_EXACT_CLUE_RESTARTS", 160),
      repackNodes: numericOption("SCANWORD_TARGETED_EXACT_REPACK_NODES", 120000),
      repackCandidates: numericOption("SCANWORD_TARGETED_EXACT_REPACK_CANDIDATES", 20),
      repackBranch: numericOption("SCANWORD_TARGETED_EXACT_REPACK_BRANCH", 14),
    };
    const telemetry = {
      mode: "targeted-residual-victim-exact-v1",
      thresholdPanels: threshold,
      panelsBefore: generated.panelCells,
      panelsAfter: generated.panelCells,
      attempted: false,
      accepted: false,
      structuralVariants: 0,
      finalistsEvaluated: 0,
      finalistsPassingCheckpoint: 0,
      exactImprovingFinalists: 0,
      selected: null,
      search: null,
      stageRuns: {},
      stagePanelGain: {},
      budgets: {
        variants: options.maxVariants,
        repackNodes: options.repackNodes,
        repackCandidates: options.repackCandidates,
        repackBranch: options.repackBranch,
      },
    };
    if (generated.panelCells <= threshold) {
      generated.constructionV2 = { ...(generated.constructionV2 || {}), targetedExactVictim: telemetry };
      return generated;
    }

    try {
      telemetry.attempted = true;
      const searched = solver.generateTargetedVictimVariants(generated, generated.pool || [], options);
      telemetry.search = searched.telemetry;
      telemetry.structuralVariants = searched.states.length;
      const poolByAnswer = new Map((generated.pool || []).map((entry) => [entry.answer, entry]));
      let best = generated;
      for (let index = 0; index < searched.states.length; index += 1) {
        const state = cloneState(searched.states[index]);
        const clueLayout = solver.assignClueTextCellsV2(
          state,
          core.makeRandom(`${args[0]}:targeted-exact:clues:${generated.attempt}:${index}`),
          options.clueRestarts,
        );
        let candidate = makeCandidate(generated, state, clueLayout);
        telemetry.finalistsEvaluated += 1;
        if (!candidate) continue;
        candidate = exactPostprocess(candidate, args[0], index, options, telemetry);
        if (!passesCheckpoint(candidate, generated.coverageCheckpoint)) continue;
        telemetry.finalistsPassingCheckpoint += 1;
        if (compareCandidates(candidate, generated, poolByAnswer) < 0) telemetry.exactImprovingFinalists += 1;
        if (compareCandidates(candidate, best, poolByAnswer) < 0) {
          best = candidate;
          telemetry.selected = state.targetedVictimMeta || null;
        }
      }
      telemetry.accepted = best !== generated;
      telemetry.panelsAfter = best.panelCells;
      best.constructionV2 = { ...(best.constructionV2 || generated.constructionV2 || {}), targetedExactVictim: telemetry };
      return solver.attachValidationReport(best, args[0], {
        ...(best.closedFill || generated.closedFill || {}),
        targetedExactVictim: telemetry,
        panelsBefore: generated.panelCells,
        panelsAfter: best.panelCells,
      });
    } catch (error) {
      telemetry.error = String(error?.stack || error);
      generated.constructionV2 = { ...(generated.constructionV2 || {}), targetedExactVictim: telemetry };
      return generated;
    }
  };

  solver.__constructionTargetedExactInstalled = true;
})();
