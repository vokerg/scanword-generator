(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  if (!solver?.generateTargetedVictimVariants
    || !solver?.stripClueLayoutForTargetedVictim
    || !solver?.resultMetrics
    || !closedFill?.extractResidualRegions
    || !closedFill?.buildPatternIndex
    || !closedFill?.queryPattern
    || solver.__constructionTargetedCrossInstalled) return;

  const previousGenerateVariants = solver.generateTargetedVictimVariants.bind(solver);

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

  function cloneState(state) {
    return {
      ...state,
      grid: state.grid.map((row) => row.map(cloneCell)),
      placed: (state.placed || []).map((word) => ({
        ...word,
        cells: (word.cells || []).map((cell) => ({ ...cell })),
      })),
      usedAnswers: new Set((state.placed || []).map((word) => word.answer)),
      clueFootprints: (state.clueFootprints || []).map((footprint) => ({
        ...footprint,
        cells: (footprint.cells || []).map((cell) => ({ ...cell })),
      })),
    };
  }

  function entryQuality(entry) {
    return Number(entry?.lexicalQuality || 50)
      - (entry?.weakFill ? 90 : 0)
      - (entry?.answer?.length === 2 ? 20 : 0);
  }

  function weakCount(state, poolByAnswer) {
    return (state.placed || []).reduce((sum, word) => {
      const metadata = poolByAnswer.get(word.answer);
      return sum + Number(Boolean(word.weakFill || metadata?.weakFill));
    }, 0);
  }

  function stateSignature(state) {
    return (state.placed || [])
      .map((word) => `${word.direction}:${word.clueRow},${word.clueCol}:${word.answer}`)
      .sort()
      .join("|");
  }

  function augmentPool(pool) {
    const byAnswer = new Map((pool || []).map((entry) => [entry.answer, entry]));
    for (const entry of window.SCANWORD_TARGETED_SHORT_FILL || []) {
      if (!byAnswer.has(entry.answer)) byAnswer.set(entry.answer, entry);
    }
    return [...byAnswer.values()];
  }

  function directionSpec(direction) {
    return direction === "right"
      ? { dr: 0, dc: 1, perpendicular: "down" }
      : { dr: 1, dc: 0, perpendicular: "right" };
  }

  function usableExistingLetter(cell, direction, perpendicular) {
    return Boolean(cell?.type === "letter"
      && cell.char
      && (cell.directions || []).length === 1
      && (cell.directions || [])[0] === perpendicular
      && !(cell.directions || []).includes(direction));
  }

  function buildDirectSlot(state, target, direction, patternIndex, usedAnswers, options, telemetry) {
    const { dr, dc, perpendicular } = directionSpec(direction);
    let beforeRow = target.row - dr;
    let beforeCol = target.col - dc;
    while (usableExistingLetter(state.grid[beforeRow]?.[beforeCol], direction, perpendicular)) {
      beforeRow -= dr;
      beforeCol -= dc;
    }
    const clueCell = state.grid[beforeRow]?.[beforeCol];
    if (!clueCell || (clueCell.type !== "panel" && clueCell.type !== "clue")) return null;
    if ((clueCell.clues || []).some((clue) => clue.direction === direction)) return null;
    if ((clueCell.clues || []).length >= 2) return null;

    const startRow = beforeRow + dr;
    const startCol = beforeCol + dc;
    let endRow = target.row + dr;
    let endCol = target.col + dc;
    while (usableExistingLetter(state.grid[endRow]?.[endCol], direction, perpendicular)) {
      endRow += dr;
      endCol += dc;
    }
    const after = state.grid[endRow]?.[endCol];
    if (after?.type === "letter") return null;
    endRow -= dr;
    endCol -= dc;

    const cells = [];
    const pattern = [];
    let row = startRow;
    let col = startCol;
    let targetPosition = -1;
    while (true) {
      const cell = state.grid[row]?.[col];
      if (row === target.row && col === target.col) {
        if (cell?.type !== "panel") return null;
        targetPosition = pattern.length;
        pattern.push(null);
      } else {
        if (!usableExistingLetter(cell, direction, perpendicular)) return null;
        pattern.push(cell.char);
      }
      cells.push({ row, col });
      if (row === endRow && col === endCol) break;
      row += dr;
      col += dc;
    }
    if (targetPosition < 0 || cells.length < 2) return null;

    const queryStats = { lookups: 0, checks: 0 };
    const domain = closedFill.queryPattern(patternIndex, pattern, usedAnswers, queryStats)
      .filter((entry) => entry.hasExactClue)
      .sort((a, b) => entryQuality(b) - entryQuality(a) || a.answer.localeCompare(b.answer, "ru"))
      .slice(0, options.directCrossDomain);
    telemetry.patternLookups += queryStats.lookups;
    telemetry.patternChecks += queryStats.checks;
    if (!domain.length) return { emptyDomain: true, direction, pattern: pattern.map((char) => char || "?").join("") };

    return {
      clueRow: beforeRow,
      clueCol: beforeCol,
      clueKey: cellKey(beforeRow, beforeCol),
      direction,
      startRow,
      startCol,
      length: cells.length,
      cells,
      pattern,
      targetPosition,
      existingIntersections: cells.length - 1,
      baseDomain: domain,
      signature: `${direction}:${beforeRow},${beforeCol}:${startRow},${startCol}:${cells.length}`,
    };
  }

  function applySlotRaw(state, slot, entry) {
    const id = state.placed.reduce((maximum, word) => Math.max(maximum, Number(word.id || 0)), 0) + 1;
    const clueCell = state.grid[slot.clueRow]?.[slot.clueCol];
    if (!clueCell || (clueCell.type !== "panel" && clueCell.type !== "clue")) return false;
    if ((clueCell.clues || []).some((clue) => clue.direction === slot.direction)) return false;
    if ((clueCell.clues || []).length >= 2) return false;
    if (clueCell.type === "panel") {
      clueCell.type = "clue";
      clueCell.char = null;
      clueCell.slotIds = [];
      clueCell.directions = [];
      clueCell.clues = [];
    }
    clueCell.clues.push({
      slotId: id,
      direction: slot.direction,
      text: entry.clue,
      answer: entry.answer,
    });

    const cells = [];
    let intersections = 0;
    for (let position = 0; position < slot.cells.length; position += 1) {
      const target = slot.cells[position];
      const cell = state.grid[target.row]?.[target.col];
      const char = entry.answer[position];
      if (!cell) return false;
      if (cell.type === "letter") {
        if (cell.char !== char || (cell.directions || []).includes(slot.direction) || (cell.directions || []).length >= 2) return false;
        intersections += 1;
      } else if (cell.type === "panel") {
        cell.type = "letter";
        cell.char = char;
        cell.clues = [];
        cell.slotIds = [];
        cell.directions = [];
      } else {
        return false;
      }
      cell.slotIds.push(id);
      cell.directions.push(slot.direction);
      cells.push({ row: target.row, col: target.col });
    }

    state.placed.push({
      id,
      answer: entry.answer,
      clue: entry.clue,
      hasExactClue: Boolean(entry.hasExactClue),
      lexicalQuality: entry.lexicalQuality,
      lexicalSource: entry.lexicalSource,
      weakFill: Boolean(entry.weakFill),
      direction: slot.direction,
      length: entry.answer.length,
      clueRow: slot.clueRow,
      clueCol: slot.clueCol,
      startRow: slot.startRow,
      startCol: slot.startCol,
      cells,
      intersections,
    });
    state.usedAnswers.add(entry.answer);
    return true;
  }

  function compareStates(a, b, poolByAnswer) {
    const coverageA = closedFill.measureCoverage(a.grid);
    const coverageB = closedFill.measureCoverage(b.grid);
    if (coverageA.panelCells !== coverageB.panelCells) return coverageA.panelCells - coverageB.panelCells;
    if (coverageA.letterCells !== coverageB.letterCells) return coverageB.letterCells - coverageA.letterCells;
    const weakA = weakCount(a, poolByAnswer);
    const weakB = weakCount(b, poolByAnswer);
    if (weakA !== weakB) return weakA - weakB;
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    return stateSignature(a).localeCompare(stateSignature(b));
  }

  function generateDirectCrossVariants(baseResult, pool, options, telemetry) {
    const structural = solver.stripClueLayoutForTargetedVictim(baseResult);
    const augmentedPool = augmentPool(pool);
    const poolByAnswer = new Map(augmentedPool.map((entry) => [entry.answer, entry]));
    const baselineWeak = weakCount(structural, poolByAnswer);
    const patternIndex = closedFill.buildPatternIndex(augmentedPool);
    const usedAnswers = new Set(structural.placed.map((word) => word.answer));
    const regions = closedFill.extractResidualRegions(structural)
      .filter((region) => region.size === 1)
      .sort((a, b) => b.boundaryWords.length - a.boundaryWords.length || a.id - b.id)
      .slice(0, options.directCrossRegions);
    const collected = new Map();
    telemetry.regionsConsidered = regions.length;

    for (const region of regions) {
      const target = region.cells[0];
      const orthogonal = [
        structural.grid[target.row - 1]?.[target.col],
        structural.grid[target.row]?.[target.col - 1],
        structural.grid[target.row]?.[target.col + 1],
        structural.grid[target.row + 1]?.[target.col],
      ];
      if (!orthogonal.every((cell) => cell?.type === "letter")) continue;
      telemetry.junctionRegions += 1;

      const horizontal = buildDirectSlot(structural, target, "right", patternIndex, usedAnswers, options, telemetry);
      const vertical = buildDirectSlot(structural, target, "down", patternIndex, usedAnswers, options, telemetry);
      if (!horizontal || horizontal.emptyDomain) {
        telemetry.horizontalUnavailable += 1;
        if (horizontal?.emptyDomain) telemetry.emptyPatterns.push(horizontal.pattern);
        continue;
      }
      if (!vertical || vertical.emptyDomain) {
        telemetry.verticalUnavailable += 1;
        if (vertical?.emptyDomain) telemetry.emptyPatterns.push(vertical.pattern);
        continue;
      }
      telemetry.slotPairsBuilt += 1;

      for (const horizontalEntry of horizontal.baseDomain) {
        for (const verticalEntry of vertical.baseDomain) {
          telemetry.entryPairsConsidered += 1;
          if (horizontalEntry.answer === verticalEntry.answer) continue;
          if (horizontalEntry.answer[horizontal.targetPosition] !== verticalEntry.answer[vertical.targetPosition]) continue;
          telemetry.characterPairsMatched += 1;
          const candidate = cloneState(structural);
          if (!applySlotRaw(candidate, horizontal, horizontalEntry) || !applySlotRaw(candidate, vertical, verticalEntry)) {
            telemetry.applyRejected += 1;
            continue;
          }
          const metrics = solver.resultMetrics(candidate);
          if (!metrics.validation.valid || metrics.components !== 1 || candidate.placed.some((word) => !word.hasExactClue)) {
            telemetry.validationRejected += 1;
            continue;
          }
          if (weakCount(candidate, poolByAnswer) > baselineWeak) {
            telemetry.weakBudgetRejected += 1;
            continue;
          }
          candidate.targetedVictimMeta = {
            regionId: region.id,
            regionSize: 1,
            directCross: true,
            targetCell: { row: target.row, col: target.col },
            horizontalPattern: horizontal.pattern.map((char) => char || "?").join(""),
            verticalPattern: vertical.pattern.map((char) => char || "?").join(""),
            pairAnswers: [horizontalEntry.answer, verticalEntry.answer].sort(),
            baselineWeakFill: baselineWeak,
            candidateWeakFill: weakCount(candidate, poolByAnswer),
          };
          const signature = stateSignature(candidate);
          const existing = collected.get(signature);
          if (!existing || compareStates(candidate, existing, poolByAnswer) < 0) collected.set(signature, candidate);
        }
      }
    }

    const states = [...collected.values()]
      .sort((a, b) => compareStates(a, b, poolByAnswer))
      .slice(0, options.directCrossMaxVariants)
      .map(cloneState);
    telemetry.statesAccepted = states.length;
    telemetry.emptyPatterns = [...new Set(telemetry.emptyPatterns)].sort();
    return states;
  }

  solver.generateTargetedVictimVariants = (result, pool, suppliedOptions = {}) => {
    const previous = previousGenerateVariants(result, pool, suppliedOptions);
    const options = {
      directCrossRegions: 12,
      directCrossDomain: 12,
      directCrossMaxVariants: 6,
      directCrossFinalists: 2,
      ...suppliedOptions,
    };
    const telemetry = {
      mode: "isolated-direct-cross-v1",
      regionsConsidered: 0,
      junctionRegions: 0,
      horizontalUnavailable: 0,
      verticalUnavailable: 0,
      slotPairsBuilt: 0,
      entryPairsConsidered: 0,
      characterPairsMatched: 0,
      applyRejected: 0,
      validationRejected: 0,
      weakBudgetRejected: 0,
      statesAccepted: 0,
      finalistsReserved: 0,
      patternLookups: 0,
      patternChecks: 0,
      emptyPatterns: [],
    };
    const directStates = generateDirectCrossVariants(result, pool, options, telemetry);
    const merged = new Map();
    for (const state of previous.states || []) {
      const signature = stateSignature(state);
      if (!merged.has(signature)) merged.set(signature, state);
    }
    const reserved = directStates.slice(0, options.directCrossFinalists);
    telemetry.finalistsReserved = reserved.length;
    for (const state of reserved) {
      const signature = stateSignature(state);
      if (!merged.has(signature)) merged.set(signature, state);
    }
    const states = [...merged.values()];
    return {
      states,
      telemetry: {
        ...(previous.telemetry || {}),
        directCross: telemetry,
        statesAccepted: states.length,
      },
    };
  };

  Object.assign(solver, {
    generateDirectCrossVariants,
    __constructionTargetedCrossInstalled: true,
  });
})();
