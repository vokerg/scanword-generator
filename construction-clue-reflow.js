(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  if (!solver || !closedFill || solver.__constructionClueReflowInstalled) return;

  const previousGenerateBest = solver.generateBest.bind(solver);
  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];

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

  function cellKey(row, col) {
    return `${row}:${col}`;
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

  function rectangleStats(cells) {
    if (!cells.length) return { largestArea: 0, boxArea: 0, fillRatio: 0 };
    const keys = new Set(cells.map((cell) => cellKey(cell.row, cell.col)));
    const rows = cells.map((cell) => cell.row);
    const cols = cells.map((cell) => cell.col);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    const boxArea = (maxRow - minRow + 1) * (maxCol - minCol + 1);
    let largestArea = 0;
    for (let top = minRow; top <= maxRow; top += 1) {
      for (let bottom = top; bottom <= maxRow; bottom += 1) {
        for (let left = minCol; left <= maxCol; left += 1) {
          for (let right = left; right <= maxCol; right += 1) {
            let complete = true;
            for (let row = top; row <= bottom && complete; row += 1) {
              for (let col = left; col <= right; col += 1) {
                if (!keys.has(cellKey(row, col))) {
                  complete = false;
                  break;
                }
              }
            }
            if (complete) largestArea = Math.max(largestArea, (bottom - top + 1) * (right - left + 1));
          }
        }
      }
    }
    return { largestArea, boxArea, fillRatio: cells.length / Math.max(1, boxArea) };
  }

  function orderedCells(cells, arrowRow, arrowCol) {
    return [...cells].sort((a, b) => {
      const distanceA = Math.abs(a.row - arrowRow) + Math.abs(a.col - arrowCol);
      const distanceB = Math.abs(b.row - arrowRow) + Math.abs(b.col - arrowCol);
      return distanceA - distanceB || a.row - b.row || a.col - b.col;
    });
  }

  function relocationCandidates(result, footprint, options) {
    const arrowCell = result.grid[footprint.arrowRow]?.[footprint.arrowCol];
    const clue = arrowCell?.clues?.find((item) => item.slotId === footprint.slotId);
    if (!clue) return [];
    const visibleLength = String(clue.text || "").trim().length;
    if (visibleLength < options.minimumClueLength && footprint.cells.length < 3) return [];

    const original = footprint.cells.map((cell) => ({ ...cell }));
    const originalKeys = new Set(original.map((cell) => cellKey(cell.row, cell.col)));
    const originalStats = rectangleStats(original);
    const maximumSize = Math.min(options.maximumFootprintCells, original.length + options.maximumAddedCells);
    const candidates = [];
    const seen = new Set();

    function available(row, col) {
      if (row < 0 || row >= result.rows || col < 0 || col >= result.cols) return false;
      const key = cellKey(row, col);
      return originalKeys.has(key) || result.grid[row][col].type === "panel";
    }

    function addCandidate(cells) {
      if (cells.length <= original.length) return;
      const ordered = orderedCells(cells, footprint.arrowRow, footprint.arrowCol);
      const keys = ordered.map((cell) => cellKey(cell.row, cell.col));
      const signature = keys.slice().sort().join("|");
      if (seen.has(signature)) return;
      seen.add(signature);
      const stats = rectangleStats(ordered);
      if (stats.largestArea < originalStats.largestArea) return;
      if (stats.fillRatio < options.minimumFillRatio) return;
      const retained = keys.reduce((sum, key) => sum + Number(originalKeys.has(key)), 0);
      const gain = ordered.length - original.length;
      candidates.push({
        cells: ordered,
        keys,
        signature,
        gain,
        rectangleGain: stats.largestArea - originalStats.largestArea,
        retained,
        score: gain * 1000 + (stats.largestArea - originalStats.largestArea) * 100 + retained * 8 - stats.boxArea,
      });
    }

    function expand(cells, selectedKeys) {
      addCandidate(cells);
      if (cells.length >= maximumSize) return;
      const frontier = new Map();
      for (const cell of cells) {
        for (const [dr, dc] of ORTHOGONAL) {
          const row = cell.row + dr;
          const col = cell.col + dc;
          const key = cellKey(row, col);
          if (selectedKeys.has(key) || !available(row, col)) continue;
          frontier.set(key, { row, col });
        }
      }
      for (const [key, cell] of frontier) {
        const nextKeys = new Set(selectedKeys);
        nextKeys.add(key);
        expand([...cells, cell], nextKeys);
      }
    }

    for (const [dr, dc] of ORTHOGONAL) {
      const row = footprint.arrowRow + dr;
      const col = footprint.arrowCol + dc;
      if (!available(row, col)) continue;
      expand([{ row, col }], new Set([cellKey(row, col)]));
    }

    return candidates
      .sort((a, b) => b.gain - a.gain || b.rectangleGain - a.rectangleGain || b.retained - a.retained || b.score - a.score || a.signature.localeCompare(b.signature))
      .slice(0, options.candidateLimit);
  }

  function solveRelocations(items, options) {
    const occupied = new Set();
    const selected = new Map();
    let best = { gain: 0, rectangleGain: 0, selected: new Map(), signature: "" };
    let nodes = 0;
    let prunes = 0;
    let exhausted = false;

    function selectionSignature(map) {
      return [...map.entries()].map(([index, candidate]) => `${index}:${candidate.signature}`).sort().join(";");
    }

    function updateBest(gain, rectangleGain) {
      const signature = selectionSignature(selected);
      if (gain < best.gain) return;
      if (gain === best.gain && rectangleGain < best.rectangleGain) return;
      if (gain === best.gain && rectangleGain === best.rectangleGain && signature >= best.signature) return;
      best = { gain, rectangleGain, selected: new Map(selected), signature };
    }

    function visit(remaining, gain, rectangleGain) {
      nodes += 1;
      if (nodes > options.nodeBudget) {
        exhausted = true;
        return;
      }
      updateBest(gain, rectangleGain);
      if (!remaining.length) return;
      const upperBound = gain + remaining.reduce((sum, index) => sum + (items[index].candidates[0]?.gain || 0), 0);
      if (upperBound < best.gain) {
        prunes += 1;
        return;
      }
      const ranked = remaining.map((index) => ({
        index,
        available: items[index].candidates.filter((candidate) => candidate.keys.every((key) => !occupied.has(key))),
      })).sort((a, b) => a.available.length - b.available.length || b.index - a.index);
      const current = ranked[0];
      const nextRemaining = remaining.filter((index) => index !== current.index);
      for (const candidate of current.available) {
        selected.set(current.index, candidate);
        candidate.keys.forEach((key) => occupied.add(key));
        visit(nextRemaining, gain + candidate.gain, rectangleGain + candidate.rectangleGain);
        candidate.keys.forEach((key) => occupied.delete(key));
        selected.delete(current.index);
        if (exhausted) return;
      }
      visit(nextRemaining, gain, rectangleGain);
    }

    visit(items.map((_, index) => index), 0, 0);
    return { ...best, nodes, prunes, exhausted };
  }

  function panelCell() {
    return { type: "panel", char: null, slotIds: [], directions: [], clues: [] };
  }

  function applyRelocations(result, items, solution) {
    const state = cloneResult(result);
    for (const [itemIndex] of solution.selected.entries()) {
      const footprint = state.clueFootprints[items[itemIndex].footprintIndex];
      footprint.cells.forEach((cell) => {
        state.grid[cell.row][cell.col] = panelCell();
      });
    }
    for (const [itemIndex, candidate] of solution.selected.entries()) {
      const footprint = state.clueFootprints[items[itemIndex].footprintIndex];
      const arrowCell = state.grid[footprint.arrowRow][footprint.arrowCol];
      const clue = arrowCell.clues.find((entry) => entry.slotId === footprint.slotId);
      if (!clue) continue;
      footprint.cells = candidate.cells.map((cell) => ({ ...cell }));
      clue.textCells = footprint.cells.map((cell) => ({ ...cell }));
      clue.textRow = footprint.cells[0].row;
      clue.textCol = footprint.cells[0].col;
      clue.externalText = true;
      footprint.cells.forEach((target, index) => {
        state.grid[target.row][target.col] = {
          type: index === 0 ? "clueText" : "clueTextContinuation",
          char: null,
          slotIds: [clue.slotId],
          directions: [],
          footprintId: footprint.id,
          clues: index === 0 ? [{ ...clue, arrowRow: footprint.arrowRow, arrowCol: footprint.arrowCol }] : [],
        };
      });
    }
    return state;
  }

  function reflowClueFootprints(result, seed) {
    const options = {
      panelThreshold: numericOption("SCANWORD_REFLOW_THRESHOLD", 0),
      maximumAddedCells: numericOption("SCANWORD_REFLOW_ADD", 2),
      maximumFootprintCells: numericOption("SCANWORD_REFLOW_SIZE", 6),
      minimumClueLength: numericOption("SCANWORD_REFLOW_CLUE_LENGTH", 12),
      minimumFillRatio: 0.74,
      candidateLimit: numericOption("SCANWORD_REFLOW_CANDIDATES", 16),
      nodeBudget: numericOption("SCANWORD_REFLOW_NODES", 120000),
    };
    const telemetry = {
      mode: "local-rectangular-clue-reflow-v1",
      panelsBefore: result.panelCells,
      panelsAfter: result.panelCells,
      candidateFootprints: 0,
      candidates: 0,
      nodes: 0,
      prunes: 0,
      exhausted: false,
      movedFootprints: 0,
      netAddedCells: 0,
      attempted: false,
      accepted: false,
    };
    if (!result?.clueFootprints?.length || result.panelCells <= options.panelThreshold) {
      result.constructionV2 = { ...(result.constructionV2 || {}), clueReflow: telemetry };
      return result;
    }

    const items = [];
    result.clueFootprints.forEach((footprint, footprintIndex) => {
      const candidates = relocationCandidates(result, footprint, options);
      if (candidates.length) items.push({ footprintIndex, candidates });
    });
    telemetry.candidateFootprints = items.length;
    telemetry.candidates = items.reduce((sum, item) => sum + item.candidates.length, 0);
    if (!items.length) {
      result.constructionV2 = { ...(result.constructionV2 || {}), clueReflow: telemetry };
      return result;
    }

    telemetry.attempted = true;
    const solution = solveRelocations(items, options);
    telemetry.nodes = solution.nodes;
    telemetry.prunes = solution.prunes;
    telemetry.exhausted = solution.exhausted;
    telemetry.movedFootprints = solution.selected.size;
    telemetry.netAddedCells = solution.gain;
    if (!solution.gain) {
      result.constructionV2 = { ...(result.constructionV2 || {}), clueReflow: telemetry };
      return result;
    }

    const state = applyRelocations(result, items, solution);
    const metrics = solver.resultMetrics(state);
    const coverage = closedFill.measureCoverage(state.grid);
    telemetry.panelsAfter = coverage.panelCells;
    telemetry.accepted = Boolean(metrics.validation.valid
      && metrics.components === 1
      && coverage.panelCells < result.panelCells
      && metrics.clueTextCells > result.clueTextCells
      && state.placed.length === result.placed.length);
    if (!telemetry.accepted) {
      result.constructionV2 = { ...(result.constructionV2 || {}), clueReflow: telemetry };
      return result;
    }

    const improved = {
      ...result,
      grid: state.grid,
      placed: state.placed,
      clueFootprints: state.clueFootprints,
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
      clueTextCells: metrics.clueTextCells,
      panelRegions: metrics.panelRegions,
      isolatedPanels: metrics.isolatedPanels,
      largestPanelRegion: metrics.largestPanelRegion,
      validation: metrics.validation,
      constructionV2: { ...(result.constructionV2 || {}), clueReflow: telemetry },
    };
    return solver.attachValidationReport(improved, seed, {
      ...(result.closedFill || {}),
      clueReflow: telemetry,
      panelsBefore: result.panelCells,
      panelsAfter: improved.panelCells,
    });
  }

  solver.generateBest = (...args) => {
    const generated = previousGenerateBest(...args);
    if (modeFromEnvironment() !== "portfolio") return generated;
    try {
      return reflowClueFootprints(generated, args[0]);
    } catch (error) {
      generated.constructionV2 = {
        ...(generated.constructionV2 || {}),
        clueReflow: {
          mode: "local-rectangular-clue-reflow-error",
          error: String(error?.stack || error),
        },
      };
      return generated;
    }
  };

  Object.assign(solver, {
    reflowClueFootprints,
    __constructionClueReflowInstalled: true,
  });
})();
