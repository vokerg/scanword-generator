(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  const core = window.ScanwordCore;
  if (!solver || !closedFill || !core || solver.__constructionV2Installed) return;

  const originalGenerateBest = solver.generateBest.bind(solver);
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
      usedAnswers: new Set(state.usedAnswers || state.placed.map((word) => word.answer)),
      clueFootprints: (state.clueFootprints || []).map((footprint) => ({
        ...footprint,
        cells: footprint.cells.map((cell) => ({ ...cell })),
      })),
    };
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function panelRegionSizeMap(state) {
    const sizes = new Map();
    const seen = new Set();
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        if (state.grid[row][col].type !== "panel") continue;
        const startKey = cellKey(row, col);
        if (seen.has(startKey)) continue;
        const queue = [{ row, col }];
        const cells = [];
        seen.add(startKey);
        for (let index = 0; index < queue.length; index += 1) {
          const current = queue[index];
          cells.push(current);
          for (const [dr, dc] of ORTHOGONAL) {
            const nextRow = current.row + dr;
            const nextCol = current.col + dc;
            if (nextRow < 0 || nextRow >= state.rows || nextCol < 0 || nextCol >= state.cols) continue;
            if (state.grid[nextRow][nextCol].type !== "panel") continue;
            const key = cellKey(nextRow, nextCol);
            if (seen.has(key)) continue;
            seen.add(key);
            queue.push({ row: nextRow, col: nextCol });
          }
        }
        for (const cell of cells) sizes.set(cellKey(cell.row, cell.col), cells.length);
      }
    }
    return sizes;
  }

  function footprintCandidates(state, row, col, maxSize, regionSizes) {
    const starts = [];
    for (const [dr, dc] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextRow >= state.rows || nextCol < 0 || nextCol >= state.cols) continue;
      if (state.grid[nextRow][nextCol].type !== "panel") continue;
      starts.push({ row: nextRow, col: nextCol });
    }

    const candidates = [];
    const seen = new Set();
    function addCandidate(cells) {
      const ordered = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
      const keys = ordered.map((cell) => cellKey(cell.row, cell.col));
      const signature = keys.join("|");
      if (seen.has(signature)) return;
      seen.add(signature);
      const rows = ordered.map((cell) => cell.row);
      const cols = ordered.map((cell) => cell.col);
      const area = (Math.max(...rows) - Math.min(...rows) + 1) * (Math.max(...cols) - Math.min(...cols) + 1);
      const regionBonus = ordered.reduce((sum, cell) => sum + 24 / Math.max(1, regionSizes.get(cellKey(cell.row, cell.col)) || 1), 0);
      candidates.push({
        cells: ordered,
        keys,
        score: ordered.length * 100 + regionBonus - (area - ordered.length) * 9,
      });
    }

    function expand(cells, keys) {
      addCandidate(cells);
      if (cells.length >= maxSize) return;
      const frontier = new Map();
      for (const cell of cells) {
        for (const [dr, dc] of ORTHOGONAL) {
          const nextRow = cell.row + dr;
          const nextCol = cell.col + dc;
          const key = cellKey(nextRow, nextCol);
          if (nextRow < 0 || nextRow >= state.rows || nextCol < 0 || nextCol >= state.cols || keys.has(key)) continue;
          if (state.grid[nextRow][nextCol].type !== "panel") continue;
          frontier.set(key, { row: nextRow, col: nextCol });
        }
      }
      for (const [key, cell] of frontier) {
        const nextKeys = new Set(keys);
        nextKeys.add(key);
        expand([...cells, cell], nextKeys);
      }
    }

    for (const start of starts) expand([start], new Set([cellKey(start.row, start.col)]));
    return candidates.sort((a, b) => b.score - a.score || a.keys.join("|").localeCompare(b.keys.join("|"))).slice(0, 96);
  }

  function assignClueTextCells(state, random, restarts = 120) {
    const regionSizes = panelRegionSizeMap(state);
    const items = [];
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.grid[row][col];
        if (cell.type !== "clue") continue;
        for (let clueIndex = 0; clueIndex < cell.clues.length; clueIndex += 1) {
          const clue = cell.clues[clueIndex];
          const maxSize = clue.text.length >= 38 ? 4 : 3;
          const candidates = footprintCandidates(state, row, col, maxSize, regionSizes);
          items.push({ row, col, clueIndex, clue, maxSize, candidates });
        }
      }
    }

    let best = { score: -Infinity, covered: 0, assigned: new Map() };
    for (let restart = 0; restart < restarts; restart += 1) {
      const occupied = new Set();
      const assigned = new Map();
      const order = items.map((item, index) => ({ item, index, jitter: random() }))
        .sort((a, b) => a.item.candidates.length - b.item.candidates.length
          || b.item.maxSize - a.item.maxSize
          || a.jitter - b.jitter
          || a.index - b.index);
      for (const { item, index } of order) {
        const available = item.candidates.filter((candidate) => candidate.keys.every((key) => !occupied.has(key)));
        if (!available.length) continue;
        const ranked = available.map((candidate) => ({ candidate, rank: candidate.score + random() * 18 }))
          .sort((a, b) => b.rank - a.rank || a.candidate.keys.join("|").localeCompare(b.candidate.keys.join("|")));
        const selected = ranked[Math.floor(random() * Math.min(3, ranked.length))].candidate;
        assigned.set(index, selected);
        for (const key of selected.keys) occupied.add(key);
      }
      const score = occupied.size * 1000 + assigned.size * 25;
      if (score > best.score) best = { score, covered: occupied.size, assigned };
    }

    let externalClueTexts = 0;
    let clueTextCells = 0;
    const footprints = [];
    for (const [itemIndex, footprint] of best.assigned.entries()) {
      const item = items[itemIndex];
      const arrowCell = state.grid[item.row][item.col];
      const clue = arrowCell.clues[item.clueIndex];
      clue.textRow = footprint.cells[0].row;
      clue.textCol = footprint.cells[0].col;
      clue.externalText = true;
      clue.textCells = footprint.cells.map((cell) => ({ ...cell }));
      const footprintId = footprints.length + 1;
      footprints.push({ id: footprintId, slotId: clue.slotId, arrowRow: item.row, arrowCol: item.col, cells: clue.textCells });
      footprint.cells.forEach((target, cellIndex) => {
        state.grid[target.row][target.col] = {
          type: cellIndex === 0 ? "clueText" : "clueTextContinuation",
          char: null,
          slotIds: [clue.slotId],
          directions: [],
          footprintId,
          clues: cellIndex === 0 ? [{ ...clue, arrowRow: item.row, arrowCol: item.col }] : [],
        };
      });
      externalClueTexts += 1;
      clueTextCells += footprint.cells.length;
    }
    state.clueFootprints = footprints;
    return { externalClueTexts, clueTextCells, footprints };
  }

  function entryQuality(entry) {
    return Number(entry.lexicalQuality || 50) - (entry.weakFill ? 35 : 0) - (entry.answer.length === 2 ? 12 : 0);
  }

  function weakFillCount(placed, poolByAnswer) {
    return placed.reduce((count, word) => count + Number(Boolean(poolByAnswer.get(word.answer)?.weakFill)), 0);
  }

  function structuralSignature(state) {
    return state.placed.map((word) => `${word.direction}:${word.clueRow},${word.clueCol}:${word.answer}`).sort().join("|");
  }

  function structuralRank(state, poolByAnswer) {
    const coverage = closedFill.measureCoverage(state.grid);
    const regions = closedFill.extractResidualRegions(state);
    const intersections = state.grid.flat().filter((cell) => cell.type === "letter" && cell.slotIds.length === 2).length;
    const weak = weakFillCount(state.placed, poolByAnswer);
    const isolated = regions.filter((region) => region.size === 1).length;
    return {
      letterCells: coverage.letterCells,
      intersections,
      weak,
      isolated,
      regionCount: regions.length,
      signature: structuralSignature(state),
    };
  }

  function compareStructural(a, b, poolByAnswer) {
    const ar = structuralRank(a, poolByAnswer);
    const br = structuralRank(b, poolByAnswer);
    return br.letterCells - ar.letterCells
      || br.intersections - ar.intersections
      || ar.weak - br.weak
      || ar.isolated - br.isolated
      || ar.regionCount - br.regionCount
      || ar.signature.localeCompare(br.signature);
  }

  function applySlot(state, slot, entry) {
    const next = cloneState(state);
    const id = next.placed.reduce((maximum, word) => Math.max(maximum, word.id || 0), 0) + 1;
    const clueCell = next.grid[slot.clueRow][slot.clueCol];
    if (clueCell.type !== "panel" && clueCell.type !== "clue") return null;
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
        if (cell.char !== char || cell.directions.includes(slot.direction)) return null;
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

    const validation = solver.validateGrid(next.grid, next.placed);
    const metrics = solver.resultMetrics(next);
    if (!validation.valid || metrics.components !== 1) return null;
    return next;
  }

  function enumerateMoves(state, patternIndex, options, telemetry) {
    const used = new Set(state.placed.map((word) => word.answer));
    const regions = closedFill.extractResidualRegions(state)
      .sort((a, b) => b.size - a.size || a.difficulty - b.difficulty || a.cells[0].row - b.cells[0].row || a.cells[0].col - b.cells[0].col)
      .slice(0, options.maxRegionsPerState);
    const slots = [];
    for (const region of regions) {
      const found = closedFill.enumerateRegionSlots(state, region, patternIndex, used, {
        maxSlotCandidates: options.maxSlotCandidates,
        maxDomainSize: options.maxDomainSize,
      }, telemetry).filter((slot) => slot.existingIntersections > 0);
      slots.push(...found);
    }
    slots.sort((a, b) => b.regionLetterKeys.length - a.regionLetterKeys.length
      || b.existingIntersections - a.existingIntersections
      || a.baseDomain.length - b.baseDomain.length
      || a.signature.localeCompare(b.signature));

    const moves = [];
    for (const slot of slots.slice(0, options.maxSlotsPerState)) {
      const values = [...slot.baseDomain]
        .sort((a, b) => entryQuality(b) - entryQuality(a) || a.answer.localeCompare(b.answer, "ru"))
        .slice(0, options.valuesPerSlot);
      for (const entry of values) moves.push({ slot, entry });
    }
    return moves;
  }

  function beamImprove(baseState, pool, options, telemetry) {
    const patternIndex = closedFill.buildPatternIndex(pool);
    const poolByAnswer = new Map(pool.map((entry) => [entry.answer, entry]));
    let beam = [cloneState(baseState)];
    const collected = [cloneState(baseState)];

    for (let depth = 0; depth < options.depth; depth += 1) {
      const next = [];
      const seen = new Set();
      for (const state of beam) {
        const moveTelemetry = { lookups: 0, checks: 0 };
        const moves = enumerateMoves(state, patternIndex, options, moveTelemetry);
        telemetry.patternLookups += moveTelemetry.lookups;
        telemetry.patternChecks += moveTelemetry.checks;
        telemetry.slotsEnumerated += moves.length;
        for (const { slot, entry } of moves.slice(0, options.branching)) {
          telemetry.nodes += 1;
          const applied = applySlot(state, slot, entry);
          if (!applied) continue;
          if (weakFillCount(applied.placed, poolByAnswer) > options.maxWeakFill) continue;
          const signature = structuralSignature(applied);
          if (seen.has(signature)) continue;
          seen.add(signature);
          next.push(applied);
        }
      }
      if (!next.length) break;
      next.sort((a, b) => compareStructural(a, b, poolByAnswer));
      beam = next.slice(0, options.beamWidth);
      collected.push(...beam.map(cloneState));
      telemetry.depthReached = depth + 1;
    }

    const unique = new Map();
    for (const state of collected) unique.set(structuralSignature(state), state);
    return [...unique.values()]
      .sort((a, b) => compareStructural(a, b, poolByAnswer))
      .slice(0, options.finalistsPerAttempt);
  }

  function makeCandidate(state, pool, poolIndex, rows, cols, attempt, clueLayout) {
    const metrics = solver.resultMetrics(state);
    if (!metrics.validation.valid || metrics.components !== 1) return null;
    const coverage = closedFill.measureCoverage(state.grid);
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
      mode: "structural-beam-v2",
    };
  }

  function candidateWeakFill(candidate, poolByAnswer) {
    return weakFillCount(candidate.placed, poolByAnswer);
  }

  function compareFinal(a, b, poolByAnswer) {
    if (a.panelCells !== b.panelCells) return a.panelCells - b.panelCells;
    if (a.letterCells !== b.letterCells) return b.letterCells - a.letterCells;
    const weakA = candidateWeakFill(a, poolByAnswer);
    const weakB = candidateWeakFill(b, poolByAnswer);
    if (weakA !== weakB) return weakA - weakB;
    if (a.clueTextCells !== b.clueTextCells) return a.clueTextCells - b.clueTextCells;
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    return a.attempt - b.attempt;
  }

  function generateBestV2(seed, poolSize, rows, cols, targetWords) {
    const options = {
      attempts: numericOption("SCANWORD_V2_ATTEMPTS", 36),
      baseKeep: numericOption("SCANWORD_V2_BASE_KEEP", 8),
      depth: numericOption("SCANWORD_V2_DEPTH", 3),
      beamWidth: numericOption("SCANWORD_V2_BEAM", 6),
      branching: numericOption("SCANWORD_V2_BRANCHING", 24),
      finalistsPerAttempt: numericOption("SCANWORD_V2_FINALISTS", 5),
      maxRegionsPerState: numericOption("SCANWORD_V2_REGIONS", 3),
      maxSlotCandidates: numericOption("SCANWORD_V2_SLOT_CANDIDATES", 180),
      maxDomainSize: numericOption("SCANWORD_V2_DOMAIN", 128),
      maxSlotsPerState: numericOption("SCANWORD_V2_SLOTS", 48),
      valuesPerSlot: numericOption("SCANWORD_V2_VALUES", 2),
      maxWeakFill: numericOption("SCANWORD_V2_WEAK_FILL", 2),
      clueRestarts: numericOption("SCANWORD_V2_CLUE_RESTARTS", 120),
    };
    const pool = core.generateWordPool(poolSize, core.makeRandom(`${seed}:pool`));
    if (!pool.length) throw new Error("The word pool is empty.");
    const poolIndex = solver.buildPoolIndex(pool);
    const poolByAnswer = new Map(pool.map((entry) => [entry.answer, entry]));
    const bases = [];

    for (let attempt = 0; attempt < options.attempts; attempt += 1) {
      const state = solver.buildAttempt(pool, rows, cols, targetWords, core.makeRandom(`${seed}:v2:placement:${attempt}`), poolIndex);
      if (state.placed.length < targetWords) continue;
      bases.push({ attempt, state });
      bases.sort((a, b) => compareStructural(a.state, b.state, poolByAnswer));
      if (bases.length > options.baseKeep) bases.length = options.baseKeep;
    }

    const telemetry = {
      mode: "structural-beam-v2",
      attemptsBuilt: options.attempts,
      baseCandidates: bases.length,
      beamWidth: options.beamWidth,
      depthRequested: options.depth,
      depthReached: 0,
      nodes: 0,
      slotsEnumerated: 0,
      patternLookups: 0,
      patternChecks: 0,
      finalistsEvaluated: 0,
    };
    const finals = [];

    for (const base of bases) {
      const structuralStates = beamImprove(base.state, pool, options, telemetry);
      for (let finalist = 0; finalist < structuralStates.length; finalist += 1) {
        const state = cloneState(structuralStates[finalist]);
        const clueLayout = assignClueTextCells(
          state,
          core.makeRandom(`${seed}:v2:clues:${base.attempt}:${finalist}`),
          options.clueRestarts,
        );
        const candidate = makeCandidate(state, pool, poolIndex, rows, cols, base.attempt, clueLayout);
        telemetry.finalistsEvaluated += 1;
        if (!candidate) continue;
        if (candidate.placed.some((entry) => !entry.hasExactClue)) continue;
        if (candidateWeakFill(candidate, poolByAnswer) > options.maxWeakFill) continue;
        finals.push(candidate);
      }
    }

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
      && candidate.validation?.valid);

    finals.sort((a, b) => compareFinal(a, b, poolByAnswer));
    const best = finals.find(passesCheckpoint);
    if (!best) return null;

    best.attemptBudget = options.attempts;
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
    telemetry.panelsAfter = best.panelCells;
    telemetry.rawLetterCoverage = best.rawLetterCoverage;
    telemetry.weakFillCount = candidateWeakFill(best, poolByAnswer);
    best.constructionV2 = telemetry;
    return closedFill.attachValidationReport(best, seed, {
      mode: "structural-beam-v2",
      rollbackDepthUsed: 0,
      regionsBefore: closedFill.extractResidualRegions(best).length,
      regionsAfter: closedFill.extractResidualRegions(best).length,
      panelsBefore: best.panelCells,
      panelsAfter: best.panelCells,
      regionsAttempted: 0,
      regionsSolved: 0,
      structuralBeam: telemetry,
    });
  }

  solver.generateBest = (...args) => {
    if (modeFromEnvironment() !== "v2") return originalGenerateBest(...args);
    try {
      const generated = generateBestV2(...args);
      if (generated) return generated;
    } catch (error) {
      const fallback = originalGenerateBest(...args);
      fallback.constructionV2 = { mode: "v2-fallback", error: String(error?.stack || error) };
      return fallback;
    }
    const fallback = originalGenerateBest(...args);
    fallback.constructionV2 = { mode: "v2-fallback", reason: "no candidate passed the preserved production checkpoint" };
    return fallback;
  };

  Object.assign(solver, {
    generateBestV2,
    assignClueTextCellsV2: assignClueTextCells,
    __constructionV2Installed: true,
  });
})();