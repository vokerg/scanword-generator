(() => {
  "use strict";

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_CLOSED_FILL) return process.env.SCANWORD_CLOSED_FILL;
    return window.SCANWORD_CLOSED_FILL || "diagnostic";
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
      clueFootprints: (result.clueFootprints || []).map((footprint) => ({
        ...footprint,
        cells: footprint.cells.map((cell) => ({ ...cell })),
      })),
    };
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function rollbackInlineWord(result, slotId) {
    const word = result.placed.find((entry) => entry.id === slotId);
    if (!word) return null;
    if ((result.clueFootprints || []).some((footprint) => footprint.slotId === slotId)) return null;

    const clueCell = result.grid[word.clueRow]?.[word.clueCol];
    const clue = clueCell?.clues?.find((entry) => entry.slotId === slotId);
    if (!clue || clue.externalText || clue.textCells?.length) return null;

    const rolled = cloneResult(result);
    const rolledWord = rolled.placed.find((entry) => entry.id === slotId);
    const rolledClueCell = rolled.grid[rolledWord.clueRow][rolledWord.clueCol];
    rolledClueCell.clues = rolledClueCell.clues.filter((entry) => entry.slotId !== slotId);
    if (!rolledClueCell.clues.length) {
      rolled.grid[rolledWord.clueRow][rolledWord.clueCol] = {
        type: "panel",
        char: null,
        slotIds: [],
        directions: [],
        clues: [],
      };
    }

    for (const target of rolledWord.cells) {
      const cell = rolled.grid[target.row][target.col];
      const references = [];
      for (let index = 0; index < (cell.slotIds || []).length; index += 1) {
        if (cell.slotIds[index] === slotId) continue;
        references.push({
          slotId: cell.slotIds[index],
          direction: cell.directions[index],
        });
      }
      if (!references.length) {
        rolled.grid[target.row][target.col] = {
          type: "panel",
          char: null,
          slotIds: [],
          directions: [],
          clues: [],
        };
      } else {
        cell.slotIds = references.map((reference) => reference.slotId);
        cell.directions = references.map((reference) => reference.direction);
      }
    }

    rolled.placed = rolled.placed.filter((entry) => entry.id !== slotId);
    return rolled;
  }

  function focusOnExpandedRegion(rolled, originalRegion) {
    const originalKeys = new Set(originalRegion.cells.map((cell) => cellKey(cell.row, cell.col)));
    const expanded = window.ScanwordClosedFill.extractResidualRegions(rolled)
      .find((region) => region.cells.some((cell) => originalKeys.has(cellKey(cell.row, cell.col))));
    if (!expanded) return null;

    const focused = cloneResult(rolled);
    const targetKeys = new Set(expanded.cells.map((cell) => cellKey(cell.row, cell.col)));
    const blockedKeys = [];
    for (let row = 0; row < focused.rows; row += 1) {
      for (let col = 0; col < focused.cols; col += 1) {
        const key = cellKey(row, col);
        if (focused.grid[row][col].type !== "panel" || targetKeys.has(key)) continue;
        focused.grid[row][col].type = "closedFillBlocked";
        blockedKeys.push(key);
      }
    }
    return { focused, expanded, blockedKeys };
  }

  function restoreBlockedPanels(result, blockedKeys) {
    for (const key of blockedKeys) {
      const [row, col] = key.split(":").map(Number);
      if (result.grid[row][col].type === "closedFillBlocked") result.grid[row][col].type = "panel";
    }
  }

  function refreshMetrics(result) {
    const metrics = window.ScanwordSolver.resultMetrics({
      rows: result.rows,
      cols: result.cols,
      grid: result.grid,
      placed: result.placed,
    });
    const coverage = window.ScanwordClosedFill.measureCoverage(result.grid);
    Object.assign(result, {
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
      clueTextCells: coverage.clueTextCells,
      panelRegions: metrics.panelRegions,
      isolatedPanels: metrics.isolatedPanels,
      largestPanelRegion: metrics.largestPanelRegion,
      validation: metrics.validation,
      availableSlots: result.placed.length,
    });
    return { metrics, coverage };
  }

  function betterCandidate(candidate, best) {
    if (!best) return true;
    if (candidate.panelCells !== best.panelCells) return candidate.panelCells < best.panelCells;
    if (candidate.letterCells !== best.letterCells) return candidate.letterCells > best.letterCells;
    if (candidate.placed.length !== best.placed.length) return candidate.placed.length > best.placed.length;
    const candidateAnswers = candidate.placed.map((word) => word.answer).sort().join("|");
    const bestAnswers = best.placed.map((word) => word.answer).sort().join("|");
    return candidateAnswers < bestAnswers;
  }

  function improveWithDepthOneRollback(result, seed, options = {}) {
    const limits = {
      maxRegions: 6,
      maxWordsPerRegion: 5,
      maxRollbackAttempts: 20,
      maxSlotCandidates: 256,
      maxTopologies: 96,
      maxTopologyNodes: 8000,
      maxCspNodes: 12000,
      ...options,
    };
    const baselineCoverage = window.ScanwordClosedFill.measureCoverage(result.grid);
    const regions = window.ScanwordClosedFill.extractResidualRegions(result)
      .sort((a, b) => a.size - b.size || b.boundaryWords.length - a.boundaryWords.length || a.cells[0].row - b.cells[0].row || a.cells[0].col - b.cells[0].col)
      .slice(0, limits.maxRegions);
    const telemetry = {
      ...(result.closedFill || {}),
      mode: "local-indexed-csp",
      panelsBefore: baselineCoverage.panelCells,
      panelsAfter: baselineCoverage.panelCells,
      rollbackDepthUsed: 0,
      rollbackRegionsConsidered: regions.length,
      rollbackWordsConsidered: 0,
      rollbackWordsTried: 0,
      rollbackCandidatesAccepted: 0,
      rollbackSlotsEnumerated: 0,
      rollbackTopologiesTried: 0,
      rollbackCspNodes: 0,
      rollbackPatternChecks: 0,
    };
    let best = null;
    let attempts = 0;

    for (const region of regions) {
      const wordIds = region.boundaryWords.slice(0, limits.maxWordsPerRegion);
      telemetry.rollbackWordsConsidered += wordIds.length;
      for (const slotId of wordIds) {
        if (attempts >= limits.maxRollbackAttempts) break;
        const rolled = rollbackInlineWord(result, slotId);
        if (!rolled) continue;
        attempts += 1;
        telemetry.rollbackWordsTried += 1;
        const focus = focusOnExpandedRegion(rolled, region);
        if (!focus) continue;

        const closed = window.ScanwordClosedFill.closeResidualRegions(focus.focused, result.pool, {
          maxRegions: 1,
          maxSlotCandidates: limits.maxSlotCandidates,
          maxTopologies: limits.maxTopologies,
          maxTopologyNodes: limits.maxTopologyNodes,
          maxCspNodes: limits.maxCspNodes,
          maxSlotsPerTopology: 8,
        });
        telemetry.rollbackSlotsEnumerated += closed.telemetry.slotsEnumerated || 0;
        telemetry.rollbackTopologiesTried += closed.telemetry.topologiesTried || 0;
        telemetry.rollbackCspNodes += closed.telemetry.cspNodes || 0;
        telemetry.rollbackPatternChecks += closed.telemetry.patternChecks || 0;

        const candidate = closed.result;
        restoreBlockedPanels(candidate, focus.blockedKeys);
        const { metrics, coverage } = refreshMetrics(candidate);
        if (!metrics.validation.valid || metrics.components !== 1) continue;
        if (candidate.placed.some((entry) => !entry.hasExactClue)) continue;
        if (candidate.placed.length < result.placed.length) continue;
        if (coverage.panelCells >= baselineCoverage.panelCells) continue;
        if (coverage.clueTextCells < baselineCoverage.clueTextCells) continue;
        telemetry.rollbackCandidatesAccepted += 1;
        if (betterCandidate(candidate, best)) best = candidate;
      }
      if (attempts >= limits.maxRollbackAttempts) break;
    }

    if (!best) return window.ScanwordSolver.attachValidationReport(result, seed, telemetry);
    telemetry.rollbackDepthUsed = 1;
    telemetry.regionsSolved = (telemetry.regionsSolved || 0) + 1;
    telemetry.panelsAfter = best.panelCells;
    return window.ScanwordSolver.attachValidationReport(best, seed, telemetry);
  }

  function install() {
    const solver = window.ScanwordSolver;
    if (!solver || solver.__closedFillRollbackInstalled) return;
    const originalGenerateBest = solver.generateBest.bind(solver);
    solver.generateBest = (...args) => {
      const result = originalGenerateBest(...args);
      if (modeFromEnvironment() !== "on") return result;
      try {
        return improveWithDepthOneRollback(result, args[0]);
      } catch (error) {
        const telemetry = {
          ...(result.closedFill || {}),
          rollbackDepthUsed: 0,
          rollbackError: String(error?.stack || error),
        };
        return solver.attachValidationReport(result, args[0], telemetry);
      }
    };
    Object.assign(solver, {
      improveWithDepthOneRollback,
      rollbackInlineWord,
      __closedFillRollbackInstalled: true,
    });
  }

  window.ScanwordClosedFillRollback = {
    rollbackInlineWord,
    improveWithDepthOneRollback,
    install,
  };
  install();
})();