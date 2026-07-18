(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  const core = window.ScanwordCore;
  if (!solver || !closedFill || !core || solver.__constructionPolishInstalled) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_CONSTRUCTION_MODE) {
      return process.env.SCANWORD_CONSTRUCTION_MODE;
    }
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

  function cloneResult(result) {
    return {
      ...result,
      grid: result.grid.map((row) => row.map(cloneCell)),
      placed: result.placed.map((word) => ({
        ...word,
        cells: word.cells.map((cell) => ({ ...cell })),
      })),
      usedAnswers: new Set(result.placed.map((word) => word.answer)),
      clueFootprints: (result.clueFootprints || []).map((footprint) => ({
        ...footprint,
        cells: footprint.cells.map((cell) => ({ ...cell })),
      })),
    };
  }

  function releaseClueFootprints(result) {
    const state = cloneResult(result);
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.grid[row][col];
        if (cell.type === "clueText" || cell.type === "clueTextContinuation") {
          state.grid[row][col] = {
            type: "panel",
            char: null,
            slotIds: [],
            directions: [],
            clues: [],
          };
          continue;
        }
        if (cell.type !== "clue") continue;
        cell.clues = cell.clues.map((clue) => {
          const cleaned = { ...clue };
          delete cleaned.externalText;
          delete cleaned.textRow;
          delete cleaned.textCol;
          delete cleaned.textCells;
          return cleaned;
        });
      }
    }
    state.clueFootprints = [];
    return state;
  }

  function entryQuality(entry) {
    return Number(entry.lexicalQuality || 50) - (entry.weakFill ? 80 : 0) - (entry.answer.length === 2 ? 20 : 0);
  }

  function weakFillCount(placed, poolByAnswer) {
    return placed.reduce((sum, word) => sum + Number(Boolean(poolByAnswer.get(word.answer)?.weakFill)), 0);
  }

  function applySlot(state, slot, entry) {
    const next = cloneResult(state);
    const id = next.placed.reduce((maximum, word) => Math.max(maximum, word.id || 0), 0) + 1;
    const clueCell = next.grid[slot.clueRow]?.[slot.clueCol];
    if (!clueCell || (clueCell.type !== "panel" && clueCell.type !== "clue")) return null;
    if ((clueCell.clues || []).some((clue) => clue.direction === slot.direction)) return null;
    if ((clueCell.clues || []).length >= 2) return null;
    clueCell.type = "clue";
    clueCell.clues.push({
      slotId: id,
      direction: slot.direction,
      text: entry.clue,
      answer: entry.answer,
    });

    const cells = [];
    for (let position = 0; position < slot.cells.length; position += 1) {
      const target = slot.cells[position];
      const cell = next.grid[target.row][target.col];
      const char = entry.answer[position];
      if (cell.type === "letter") {
        if (cell.char !== char || cell.directions.includes(slot.direction) || cell.directions.length >= 2) return null;
      } else if (cell.type === "panel") {
        cell.type = "letter";
        cell.char = char;
      } else {
        return null;
      }
      cell.slotIds.push(id);
      cell.directions.push(slot.direction);
      cells.push({ row: target.row, col: target.col });
    }

    next.placed.push({
      id,
      answer: entry.answer,
      clue: entry.clue,
      hasExactClue: entry.hasExactClue,
      lexicalQuality: entry.lexicalQuality,
      weakFill: Boolean(entry.weakFill),
      direction: slot.direction,
      length: entry.answer.length,
      clueRow: slot.clueRow,
      clueCol: slot.clueCol,
      startRow: slot.startRow,
      startCol: slot.startCol,
      cells,
      intersections: slot.existingIntersections,
    });
    next.usedAnswers.add(entry.answer);
    const metrics = solver.resultMetrics(next);
    if (!metrics.validation.valid || metrics.components !== 1) return null;
    return next;
  }

  function finalizeCandidate(base, state, clueLayout) {
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
      mode: "portfolio-polish-v2",
    };
  }

  function passesPreservedCheckpoint(candidate) {
    const area = candidate.rows * candidate.cols;
    const checkpointAnswers = Math.max(30, Math.min(40, Math.floor(area / 5)));
    const checkpointPanels = Math.ceil(area * 0.09);
    const checkpointActive = area >= 200 ? 0.90 : 0.88;
    return Boolean(candidate
      && candidate.placed.length >= checkpointAnswers
      && candidate.fillRatio >= checkpointActive
      && candidate.answerCoverage >= 0.65
      && candidate.clueTextCells >= 45
      && candidate.externalClueTexts >= 24
      && candidate.panelCells <= checkpointPanels
      && candidate.components === 1
      && candidate.validation?.valid
      && candidate.placed.every((entry) => entry.hasExactClue));
  }

  function compareCandidates(a, b, poolByAnswer) {
    if (a.panelCells !== b.panelCells) return a.panelCells - b.panelCells;
    if (a.letterCells !== b.letterCells) return b.letterCells - a.letterCells;
    const weakA = weakFillCount(a.placed, poolByAnswer);
    const weakB = weakFillCount(b.placed, poolByAnswer);
    if (weakA !== weakB) return weakA - weakB;
    if (a.clueTextCells !== b.clueTextCells) return a.clueTextCells - b.clueTextCells;
    if (a.intersections !== b.intersections) return b.intersections - a.intersections;
    return b.placed.length - a.placed.length;
  }

  function enumerateMoves(state, pool, options, telemetry) {
    const patternIndex = closedFill.buildPatternIndex(pool);
    const used = new Set(state.placed.map((word) => word.answer));
    const regions = closedFill.extractResidualRegions(state)
      .sort((a, b) => b.size - a.size || a.difficulty - b.difficulty)
      .slice(0, options.maxRegions);
    const slots = [];
    const queryStats = { lookups: 0, checks: 0 };
    for (const region of regions) {
      slots.push(...closedFill.enumerateRegionSlots(state, region, patternIndex, used, {
        maxSlotCandidates: options.maxSlotCandidates,
        maxDomainSize: options.maxDomainSize,
      }, queryStats).filter((slot) => slot.existingIntersections > 0));
    }
    telemetry.patternLookups += queryStats.lookups;
    telemetry.patternChecks += queryStats.checks;
    slots.sort((a, b) => b.regionLetterKeys.length - a.regionLetterKeys.length
      || b.existingIntersections - a.existingIntersections
      || a.baseDomain.length - b.baseDomain.length
      || a.signature.localeCompare(b.signature));

    const moves = [];
    for (const slot of slots.slice(0, options.maxSlots)) {
      const values = [...slot.baseDomain]
        .filter((entry) => !entry.weakFill)
        .sort((a, b) => entryQuality(b) - entryQuality(a) || a.answer.localeCompare(b.answer, "ru"))
        .slice(0, options.valuesPerSlot);
      for (const entry of values) moves.push({ slot, entry });
    }
    telemetry.slotsEnumerated += slots.length;
    telemetry.movesEnumerated += moves.length;
    return moves.slice(0, options.maxMoves);
  }

  function polish(result, seed) {
    if (result.mode !== "portfolio-panel-first-v2") return result;
    const options = {
      depth: numericOption("SCANWORD_POLISH_DEPTH", 2),
      maxRegions: numericOption("SCANWORD_POLISH_REGIONS", 4),
      maxSlotCandidates: numericOption("SCANWORD_POLISH_SLOT_CANDIDATES", 220),
      maxDomainSize: numericOption("SCANWORD_POLISH_DOMAIN", 128),
      maxSlots: numericOption("SCANWORD_POLISH_SLOTS", 36),
      valuesPerSlot: numericOption("SCANWORD_POLISH_VALUES", 2),
      maxMoves: numericOption("SCANWORD_POLISH_MOVES", 36),
      clueRestarts: numericOption("SCANWORD_POLISH_CLUE_RESTARTS", 120),
    };
    const poolByAnswer = new Map(result.pool.map((entry) => [entry.answer, entry]));
    const baselineWeak = weakFillCount(result.placed, poolByAnswer);
    const telemetry = {
      mode: "portfolio-polish-v2",
      depthRequested: options.depth,
      depthReached: 0,
      slotsEnumerated: 0,
      movesEnumerated: 0,
      candidatesFinalized: 0,
      candidatesAccepted: 0,
      patternLookups: 0,
      patternChecks: 0,
      panelsBefore: result.panelCells,
      panelsAfter: result.panelCells,
      lettersBefore: result.letterCells,
      lettersAfter: result.letterCells,
    };
    let best = result;

    for (let depth = 0; depth < options.depth; depth += 1) {
      const structural = releaseClueFootprints(best);
      const moves = enumerateMoves(structural, result.pool, options, telemetry);
      let improved = null;
      for (let index = 0; index < moves.length; index += 1) {
        const { slot, entry } = moves[index];
        const applied = applySlot(structural, slot, entry);
        if (!applied) continue;
        const clueLayout = solver.assignClueTextCellsV2(
          applied,
          core.makeRandom(`${seed}:polish:${depth}:${index}`),
          options.clueRestarts,
        );
        const candidate = finalizeCandidate(best, applied, clueLayout);
        telemetry.candidatesFinalized += 1;
        if (!passesPreservedCheckpoint(candidate)) continue;
        if (weakFillCount(candidate.placed, poolByAnswer) > baselineWeak) continue;
        if (compareCandidates(candidate, best, poolByAnswer) >= 0) continue;
        telemetry.candidatesAccepted += 1;
        if (!improved || compareCandidates(candidate, improved, poolByAnswer) < 0) improved = candidate;
      }
      if (!improved) break;
      best = improved;
      telemetry.depthReached = depth + 1;
    }

    telemetry.panelsAfter = best.panelCells;
    telemetry.lettersAfter = best.letterCells;
    best.constructionV2 = {
      ...(best.constructionV2 || result.constructionV2 || {}),
      polish: telemetry,
    };
    return solver.attachValidationReport(best, seed, {
      mode: "portfolio-polish-v2",
      rollbackDepthUsed: 0,
      regionsBefore: closedFill.extractResidualRegions(result).length,
      regionsAfter: closedFill.extractResidualRegions(best).length,
      panelsBefore: result.panelCells,
      panelsAfter: best.panelCells,
      regionsAttempted: telemetry.depthReached ? telemetry.depthReached : 0,
      regionsSolved: telemetry.depthReached,
      portfolio: best.constructionV2,
    });
  }

  solver.generateBest = (...args) => {
    const generated = previousGenerateBest(...args);
    if (modeFromEnvironment() !== "portfolio") return generated;
    try {
      return polish(generated, args[0]);
    } catch (error) {
      generated.constructionV2 = {
        ...(generated.constructionV2 || {}),
        polish: { mode: "portfolio-polish-error", error: String(error?.stack || error) },
      };
      return generated;
    }
  };

  Object.assign(solver, {
    polishPortfolioResult: polish,
    __constructionPolishInstalled: true,
  });
})();
