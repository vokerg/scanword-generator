(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  if (!solver || !closedFill || solver.__constructionCluePairReflowInstalled) return;

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

  function footprintDistance(left, right) {
    let best = Infinity;
    for (const a of left.cells) {
      for (const b of right.cells) {
        best = Math.min(best, Math.abs(a.row - b.row) + Math.abs(a.col - b.col));
      }
    }
    return best;
  }

  function generateCandidates(result, footprint, partner, options) {
    const arrowCell = result.grid[footprint.arrowRow]?.[footprint.arrowCol];
    const clue = arrowCell?.clues?.find((item) => item.slotId === footprint.slotId);
    if (!clue) return [];
    const visibleLength = String(clue.text || "").trim().length;
    if (visibleLength < options.minimumClueLength && footprint.cells.length < 3) return [];

    const own = footprint.cells.map((cell) => ({ ...cell }));
    const other = partner.cells.map((cell) => ({ ...cell }));
    const ownKeys = new Set(own.map((cell) => cellKey(cell.row, cell.col)));
    const partnerKeys = new Set(other.map((cell) => cellKey(cell.row, cell.col)));
    const releasedKeys = new Set([...ownKeys, ...partnerKeys]);
    const originalStats = rectangleStats(own);
    const maximumSize = Math.min(options.maximumFootprintCells, own.length + options.maximumAddedPerFootprint);
    const candidates = [];
    const seen = new Set();
    let expansionNodes = 0;

    function available(row, col) {
      if (row < 0 || row >= result.rows || col < 0 || col >= result.cols) return false;
      const key = cellKey(row, col);
      return releasedKeys.has(key) || result.grid[row][col].type === "panel";
    }

    function addCandidate(cells) {
      if (cells.length < own.length) return;
      const ordered = orderedCells(cells, footprint.arrowRow, footprint.arrowCol);
      const keys = ordered.map((cell) => cellKey(cell.row, cell.col));
      const signature = keys.slice().sort().join("|");
      if (seen.has(signature)) return;
      seen.add(signature);
      const stats = rectangleStats(ordered);
      if (stats.largestArea < originalStats.largestArea) return;
      if (stats.fillRatio < options.minimumFillRatio) return;
      const borrowed = keys.reduce((sum, key) => sum + Number(partnerKeys.has(key)), 0);
      const panelsUsed = keys.reduce((sum, key) => sum + Number(!releasedKeys.has(key)), 0);
      const ownRetained = keys.reduce((sum, key) => sum + Number(ownKeys.has(key)), 0);
      candidates.push({
        cells: ordered,
        keys,
        signature,
        size: ordered.length,
        borrowed,
        panelsUsed,
        ownRetained,
        rectangleGain: stats.largestArea - originalStats.largestArea,
        score: ordered.length * 1000 + borrowed * 45 + panelsUsed * 30 + ownRetained * 6
          + (stats.largestArea - originalStats.largestArea) * 90 - stats.boxArea,
      });
    }

    function expand(cells, selectedKeys) {
      expansionNodes += 1;
      if (expansionNodes > options.expansionNodeBudget) return;
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
        if (expansionNodes > options.expansionNodeBudget) return;
      }
    }

    for (const [dr, dc] of ORTHOGONAL) {
      const row = footprint.arrowRow + dr;
      const col = footprint.arrowCol + dc;
      if (!available(row, col)) continue;
      expand([{ row, col }], new Set([cellKey(row, col)]));
    }

    return candidates
      .sort((a, b) => b.size - a.size || b.rectangleGain - a.rectangleGain || b.borrowed - a.borrowed
        || b.score - a.score || a.signature.localeCompare(b.signature))
      .slice(0, options.candidateLimit);
  }

  function bestPairMove(result, options) {
    let pairsConsidered = 0;
    let candidateCombinations = 0;
    let best = null;
    const footprints = result.clueFootprints || [];
    outer:
    for (let leftIndex = 0; leftIndex < footprints.length; leftIndex += 1) {
      const left = footprints[leftIndex];
      if (left.cells.length > options.maximumOriginalFootprintCells) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < footprints.length; rightIndex += 1) {
        const right = footprints[rightIndex];
        if (right.cells.length > options.maximumOriginalFootprintCells) continue;
        if (footprintDistance(left, right) > options.maximumPairDistance) continue;
        pairsConsidered += 1;
        if (pairsConsidered > options.pairLimit) break outer;
        const leftCandidates = generateCandidates(result, left, right, options);
        const rightCandidates = generateCandidates(result, right, left, options);
        if (!leftCandidates.length || !rightCandidates.length) continue;
        const originalTotal = left.cells.length + right.cells.length;
        for (const leftCandidate of leftCandidates) {
          const leftKeys = new Set(leftCandidate.keys);
          for (const rightCandidate of rightCandidates) {
            candidateCombinations += 1;
            if (rightCandidate.keys.some((key) => leftKeys.has(key))) continue;
            if (leftCandidate.borrowed + rightCandidate.borrowed === 0) continue;
            const totalSize = leftCandidate.size + rightCandidate.size;
            const gain = totalSize - originalTotal;
            if (gain <= 0) continue;
            const score = gain * 10000 + (leftCandidate.rectangleGain + rightCandidate.rectangleGain) * 300
              + (leftCandidate.borrowed + rightCandidate.borrowed) * 50
              + leftCandidate.score + rightCandidate.score;
            const signature = `${left.id}:${leftCandidate.signature};${right.id}:${rightCandidate.signature}`;
            if (!best || score > best.score || (score === best.score && signature < best.signature)) {
              best = {
                leftIndex,
                rightIndex,
                leftCandidate,
                rightCandidate,
                gain,
                score,
                signature,
              };
            }
          }
        }
      }
    }
    return { best, pairsConsidered, candidateCombinations };
  }

  function panelCell() {
    return { type: "panel", char: null, slotIds: [], directions: [], clues: [] };
  }

  function applyMove(result, move) {
    const state = cloneResult(result);
    const assignments = [
      [move.leftIndex, move.leftCandidate],
      [move.rightIndex, move.rightCandidate],
    ];
    for (const [footprintIndex] of assignments) {
      state.clueFootprints[footprintIndex].cells.forEach((cell) => {
        state.grid[cell.row][cell.col] = panelCell();
      });
    }
    for (const [footprintIndex, candidate] of assignments) {
      const footprint = state.clueFootprints[footprintIndex];
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

  function metricsResult(previous, state, seed, telemetry) {
    const metrics = solver.resultMetrics(state);
    const coverage = closedFill.measureCoverage(state.grid);
    telemetry.panelsAfter = coverage.panelCells;
    telemetry.accepted = Boolean(metrics.validation.valid
      && metrics.components === 1
      && coverage.panelCells < previous.panelCells
      && metrics.clueTextCells > previous.clueTextCells
      && state.placed.length === previous.placed.length);
    if (!telemetry.accepted) return previous;
    const improved = {
      ...previous,
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
      constructionV2: { ...(previous.constructionV2 || {}), cluePairReflow: telemetry },
    };
    return solver.attachValidationReport(improved, seed, {
      ...(previous.closedFill || {}),
      cluePairReflow: telemetry,
      panelsBefore: previous.panelCells,
      panelsAfter: improved.panelCells,
    });
  }

  function pairReflow(result, seed) {
    const options = {
      panelThreshold: numericOption("SCANWORD_PAIR_REFLOW_THRESHOLD", 8),
      maximumPairDistance: numericOption("SCANWORD_PAIR_REFLOW_DISTANCE", 2),
      maximumOriginalFootprintCells: numericOption("SCANWORD_PAIR_REFLOW_ORIGINAL_SIZE", 4),
      maximumAddedPerFootprint: numericOption("SCANWORD_PAIR_REFLOW_ADD", 1),
      maximumFootprintCells: numericOption("SCANWORD_PAIR_REFLOW_SIZE", 5),
      minimumClueLength: numericOption("SCANWORD_PAIR_REFLOW_CLUE_LENGTH", 12),
      minimumFillRatio: 0.75,
      candidateLimit: numericOption("SCANWORD_PAIR_REFLOW_CANDIDATES", 16),
      expansionNodeBudget: numericOption("SCANWORD_PAIR_REFLOW_EXPANSION_NODES", 2500),
      pairLimit: numericOption("SCANWORD_PAIR_REFLOW_PAIRS", 64),
      maximumRounds: numericOption("SCANWORD_PAIR_REFLOW_ROUNDS", 2),
    };
    const telemetry = {
      mode: "bounded-two-footprint-clue-reflow-v1",
      panelsBefore: result.panelCells,
      panelsAfter: result.panelCells,
      pairsConsidered: 0,
      candidateCombinations: 0,
      roundsAttempted: 0,
      roundsAccepted: 0,
      movedFootprints: 0,
      addedCells: 0,
      attempted: false,
      accepted: false,
    };
    if (!result?.clueFootprints?.length || result.panelCells <= options.panelThreshold) {
      result.constructionV2 = { ...(result.constructionV2 || {}), cluePairReflow: telemetry };
      return result;
    }

    let current = result;
    for (let round = 0; round < options.maximumRounds && current.panelCells > options.panelThreshold; round += 1) {
      const search = bestPairMove(current, options);
      telemetry.roundsAttempted += 1;
      telemetry.pairsConsidered += search.pairsConsidered;
      telemetry.candidateCombinations += search.candidateCombinations;
      if (!search.best) break;
      telemetry.attempted = true;
      const roundTelemetry = {
        ...telemetry,
        panelsBefore: current.panelCells,
        panelsAfter: current.panelCells,
        accepted: false,
      };
      const candidate = metricsResult(current, applyMove(current, search.best), seed, roundTelemetry);
      if (candidate === current) break;
      current = candidate;
      telemetry.roundsAccepted += 1;
      telemetry.movedFootprints += 2;
      telemetry.addedCells += search.best.gain;
      telemetry.panelsAfter = current.panelCells;
      telemetry.accepted = true;
    }
    current.constructionV2 = { ...(current.constructionV2 || result.constructionV2 || {}), cluePairReflow: telemetry };
    return current;
  }

  solver.generateBest = (...args) => {
    const generated = previousGenerateBest(...args);
    if (modeFromEnvironment() !== "portfolio") return generated;
    try {
      return pairReflow(generated, args[0]);
    } catch (error) {
      generated.constructionV2 = {
        ...(generated.constructionV2 || {}),
        cluePairReflow: {
          mode: "bounded-two-footprint-clue-reflow-error",
          error: String(error?.stack || error),
        },
      };
      return generated;
    }
  };

  Object.assign(solver, {
    pairReflowClueFootprints: pairReflow,
    __constructionCluePairReflowInstalled: true,
  });
})();
