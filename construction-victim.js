(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  if (!solver || !closedFill || solver.__constructionVictimInstalled) return;

  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];

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

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function entryQuality(entry) {
    return Number(entry.lexicalQuality || 50) - (entry.weakFill ? 90 : 0) - (entry.answer.length === 2 ? 20 : 0);
  }

  function weakFillCount(placed, poolByAnswer) {
    return placed.reduce((sum, word) => sum + Number(Boolean(poolByAnswer.get(word.answer)?.weakFill)), 0);
  }

  function wordCrossings(state, word) {
    return word.cells.reduce((count, target) => {
      const cell = state.grid[target.row]?.[target.col];
      return count + Number(Boolean(cell?.type === "letter" && (cell.slotIds || []).length === 2));
    }, 0);
  }

  function adjacentPanels(state, word) {
    const seen = new Set();
    const sources = [{ row: word.clueRow, col: word.clueCol }, ...word.cells];
    for (const source of sources) {
      for (const [dr, dc] of ORTHOGONAL) {
        const row = source.row + dr;
        const col = source.col + dc;
        if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) continue;
        if (state.grid[row][col].type === "panel") seen.add(cellKey(row, col));
      }
    }
    return seen.size;
  }

  function uniqueLetterCells(state, word) {
    return word.cells.reduce((count, target) => {
      const cell = state.grid[target.row]?.[target.col];
      return count + Number(Boolean(cell?.type === "letter" && (cell.slotIds || []).length === 1));
    }, 0);
  }

  function structuralSignature(state) {
    return state.placed
      .map((word) => `${word.direction}:${word.clueRow},${word.clueCol}:${word.answer}`)
      .sort()
      .join("|");
  }

  function structuralRank(state, poolByAnswer) {
    const coverage = closedFill.measureCoverage(state.grid);
    const intersections = state.grid.flat().filter((cell) => cell.type === "letter" && (cell.slotIds || []).length === 2).length;
    return {
      panels: coverage.panelCells,
      letters: coverage.letterCells,
      weak: weakFillCount(state.placed, poolByAnswer),
      intersections,
      answers: state.placed.length,
      signature: structuralSignature(state),
    };
  }

  function compareStructural(a, b, poolByAnswer) {
    const ar = structuralRank(a, poolByAnswer);
    const br = structuralRank(b, poolByAnswer);
    return ar.panels - br.panels
      || br.letters - ar.letters
      || ar.weak - br.weak
      || br.intersections - ar.intersections
      || br.answers - ar.answers
      || ar.signature.localeCompare(br.signature);
  }

  function removeVictim(state, word) {
    const rolled = solver.rollbackInlineWord(state, word.id);
    if (!rolled) return null;
    rolled.usedAnswers = new Set(rolled.placed.map((entry) => entry.answer));
    rolled.clueFootprints = [];
    const metrics = solver.resultMetrics(rolled);
    if (!metrics.validation.valid || metrics.components !== 1) return null;
    return rolled;
  }

  function applySlot(state, slot, entry) {
    const next = cloneState(state);
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
      const cell = next.grid[target.row]?.[target.col];
      const char = entry.answer[position];
      if (!cell) return null;
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

  function rankVictims(state, poolByAnswer, options) {
    const victims = [];
    for (const word of state.placed) {
      const crossings = wordCrossings(state, word);
      if (crossings !== 1) continue;
      const entry = poolByAnswer.get(word.answer);
      const panels = adjacentPanels(state, word);
      if (!panels) continue;
      const unique = uniqueLetterCells(state, word);
      const quality = entryQuality(entry || word);
      const weak = Number(Boolean(entry?.weakFill));
      victims.push({
        word,
        crossings,
        panels,
        unique,
        quality,
        weak,
        score: weak * 1000 + panels * 35 + unique * 8 - quality * 3,
      });
    }
    victims.sort((a, b) => b.score - a.score
      || b.panels - a.panels
      || a.quality - b.quality
      || a.word.id - b.word.id);
    return victims.slice(0, options.maxVictims);
  }

  function enumerateMoves(state, pool, options, telemetry, excludedAnswer = null) {
    const patternIndex = closedFill.buildPatternIndex(pool);
    const used = new Set(state.placed.map((word) => word.answer));
    const regions = closedFill.extractResidualRegions(state)
      .sort((a, b) => b.size - a.size || a.difficulty - b.difficulty
        || a.cells[0].row - b.cells[0].row || a.cells[0].col - b.cells[0].col)
      .slice(0, options.maxRegions);
    const queryStats = { lookups: 0, checks: 0 };
    const slots = [];
    for (const region of regions) {
      slots.push(...closedFill.enumerateRegionSlots(state, region, patternIndex, used, {
        maxSlotCandidates: options.maxSlotCandidates,
        maxDomainSize: options.maxDomainSize,
      }, queryStats).filter((slot) => slot.existingIntersections > 0));
    }
    telemetry.patternLookups += queryStats.lookups;
    telemetry.patternChecks += queryStats.checks;
    telemetry.slotsEnumerated += slots.length;

    slots.sort((a, b) => b.regionLetterKeys.length - a.regionLetterKeys.length
      || b.existingIntersections - a.existingIntersections
      || a.baseDomain.length - b.baseDomain.length
      || a.signature.localeCompare(b.signature));

    const moves = [];
    for (const slot of slots.slice(0, options.maxSlots)) {
      const values = [...slot.baseDomain]
        .filter((entry) => entry.answer !== excludedAnswer && !entry.weakFill && entry.hasExactClue)
        .sort((a, b) => entryQuality(b) - entryQuality(a) || a.answer.localeCompare(b.answer, "ru"))
        .slice(0, options.valuesPerSlot);
      for (const entry of values) moves.push({ slot, entry });
    }
    telemetry.movesEnumerated += moves.length;
    return moves.slice(0, options.maxMoves);
  }

  function generateVictimVariants(baseState, pool, suppliedOptions = {}) {
    const options = {
      maxVictims: 6,
      depth: 2,
      beamWidth: 5,
      branching: 18,
      maxVariants: 8,
      maxRegions: 3,
      maxSlotCandidates: 220,
      maxDomainSize: 128,
      maxSlots: 36,
      valuesPerSlot: 2,
      maxMoves: 48,
      ...suppliedOptions,
    };
    const poolByAnswer = new Map(pool.map((entry) => [entry.answer, entry]));
    const baselineWeak = weakFillCount(baseState.placed, poolByAnswer);
    const baselineAnswers = baseState.placed.length;
    const telemetry = {
      mode: "prelayout-victim-bundles-v1",
      victimsConsidered: 0,
      victimsRemoved: 0,
      slotsEnumerated: 0,
      movesEnumerated: 0,
      bundlesTried: 0,
      statesAccepted: 0,
      depthReached: 0,
      patternLookups: 0,
      patternChecks: 0,
    };
    const collected = new Map();

    for (const victim of rankVictims(baseState, poolByAnswer, options)) {
      telemetry.victimsConsidered += 1;
      const rolled = removeVictim(baseState, victim.word);
      if (!rolled) continue;
      telemetry.victimsRemoved += 1;
      let beam = [rolled];

      for (let depth = 0; depth < options.depth; depth += 1) {
        const next = [];
        const seen = new Set();
        for (const state of beam) {
          const moves = enumerateMoves(state, pool, options, telemetry, victim.word.answer);
          for (const move of moves.slice(0, options.branching)) {
            telemetry.bundlesTried += 1;
            const applied = applySlot(state, move.slot, move.entry);
            if (!applied) continue;
            if (weakFillCount(applied.placed, poolByAnswer) > baselineWeak) continue;
            const signature = structuralSignature(applied);
            if (seen.has(signature)) continue;
            seen.add(signature);
            next.push(applied);
            if (applied.placed.length >= baselineAnswers) {
              const existing = collected.get(signature);
              if (!existing || compareStructural(applied, existing, poolByAnswer) < 0) collected.set(signature, applied);
            }
          }
        }
        if (!next.length) break;
        next.sort((a, b) => compareStructural(a, b, poolByAnswer));
        beam = next.slice(0, options.beamWidth);
        telemetry.depthReached = Math.max(telemetry.depthReached, depth + 1);
      }
    }

    const states = [...collected.values()]
      .sort((a, b) => compareStructural(a, b, poolByAnswer))
      .slice(0, options.maxVariants)
      .map(cloneState);
    telemetry.statesAccepted = states.length;
    return { states, telemetry };
  }

  Object.assign(solver, {
    cloneVictimState: cloneState,
    generateVictimReplacementVariants: generateVictimVariants,
    __constructionVictimInstalled: true,
  });
})();
