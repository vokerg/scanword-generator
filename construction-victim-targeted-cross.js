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
      ? { dr: 0, dc: 1, perpendicular: "down", sides: [[-1, 0], [1, 0]] }
      : { dr: 1, dc: 0, perpendicular: "right", sides: [[0, -1], [0, 1]] };
  }

  function usableExistingLetter(cell, direction, perpendicular) {
    return Boolean(cell?.type === "letter"
      && cell.char
      && (cell.directions || []).length === 1
      && (cell.directions || [])[0] === perpendicular
      && !(cell.directions || []).includes(direction));
  }

  function availableClueCell(cell, direction) {
    return Boolean(cell
      && (cell.type === "panel" || cell.type === "clue")
      && !(cell.clues || []).some((clue) => clue.direction === direction)
      && (cell.clues || []).length < 2);
  }

  function safeNewPanel(state, row, col, target, sides) {
    if (row === target.row && col === target.col) return true;
    for (const [dr, dc] of sides) {
      if (state.grid[row + dr]?.[col + dc]?.type === "letter") return false;
    }
    return true;
  }

  function validateWordCell(state, row, col, target, direction, spec) {
    const cell = state.grid[row]?.[col];
    if (row === target.row && col === target.col) {
      return cell?.type === "panel" ? { char: null, panel: true } : null;
    }
    if (usableExistingLetter(cell, direction, spec.perpendicular)) return { char: cell.char, panel: false };
    if (cell?.type === "panel" && safeNewPanel(state, row, col, target, spec.sides)) return { char: null, panel: true };
    return null;
  }

  function enumerateDirectSlots(state, target, direction, patternIndex, usedAnswers, options, telemetry) {
    const spec = directionSpec(direction);
    const slots = new Map();
    const maxLength = options.directCrossMaxLength;
    const maxNewPanels = options.directCrossMaxNewPanels;

    for (let clueDistance = 1; clueDistance <= maxLength; clueDistance += 1) {
      const clueRow = target.row - spec.dr * clueDistance;
      const clueCol = target.col - spec.dc * clueDistance;
      const clueCell = state.grid[clueRow]?.[clueCol];
      if (!clueCell) break;
      if (!availableClueCell(clueCell, direction)) {
        if (clueCell.type === "clue" || clueCell.type === "clueText" || clueCell.type === "clueTextContinuation") break;
        continue;
      }

      const startRow = clueRow + spec.dr;
      const startCol = clueCol + spec.dc;
      const prefix = [];
      let panelCount = 0;
      let prefixValid = true;
      for (let position = 0; position < clueDistance; position += 1) {
        const row = startRow + spec.dr * position;
        const col = startCol + spec.dc * position;
        const validated = validateWordCell(state, row, col, target, direction, spec);
        if (!validated) {
          prefixValid = false;
          break;
        }
        panelCount += Number(validated.panel);
        if (panelCount > maxNewPanels) {
          prefixValid = false;
          break;
        }
        prefix.push({ row, col, char: validated.char, panel: validated.panel });
      }
      if (!prefixValid || !prefix.some((cell) => cell.row === target.row && cell.col === target.col)) continue;

      let cells = [...prefix];
      let currentRow = target.row;
      let currentCol = target.col;
      while (cells.length <= maxLength) {
        const nextRow = currentRow + spec.dr;
        const nextCol = currentCol + spec.dc;
        const nextCell = state.grid[nextRow]?.[nextCol];
        const nextUsableLetter = usableExistingLetter(nextCell, direction, spec.perpendicular);

        if (!nextUsableLetter) {
          const pattern = cells.map((cell) => cell.char);
          const targetPosition = cells.findIndex((cell) => cell.row === target.row && cell.col === target.col);
          const queryStats = { lookups: 0, checks: 0 };
          const domain = closedFill.queryPattern(patternIndex, pattern, usedAnswers, queryStats)
            .filter((entry) => entry.hasExactClue)
            .sort((a, b) => entryQuality(b) - entryQuality(a) || a.answer.localeCompare(b.answer, "ru"))
            .slice(0, options.directCrossDomain);
          telemetry.patternLookups += queryStats.lookups;
          telemetry.patternChecks += queryStats.checks;
          const patternText = pattern.map((char) => char || "?").join("");
          if (!domain.length) telemetry.emptyPatterns.push(patternText);
          else {
            const panelCells = cells.filter((cell) => cell.panel).length + Number(clueCell.type === "panel");
            const slot = {
              clueRow,
              clueCol,
              clueKey: cellKey(clueRow, clueCol),
              direction,
              startRow,
              startCol,
              length: cells.length,
              cells: cells.map(({ row, col }) => ({ row, col })),
              pattern,
              targetPosition,
              existingIntersections: cells.length - cells.filter((cell) => cell.panel).length,
              panelGainUpperBound: panelCells,
              baseDomain: domain,
              signature: `${direction}:${clueRow},${clueCol}:${startRow},${startCol}:${cells.length}`,
            };
            slots.set(slot.signature, slot);
          }
        }

        if (cells.length >= maxLength || !nextCell) break;
        const validated = validateWordCell(state, nextRow, nextCol, target, direction, spec);
        if (!validated) break;
        const nextPanelCount = cells.filter((cell) => cell.panel).length + Number(validated.panel);
        if (nextPanelCount > maxNewPanels) break;
        cells = [...cells, { row: nextRow, col: nextCol, char: validated.char, panel: validated.panel }];
        currentRow = nextRow;
        currentCol = nextCol;
      }
    }

    return [...slots.values()]
      .sort((a, b) => b.panelGainUpperBound - a.panelGainUpperBound
        || b.existingIntersections - a.existingIntersections
        || a.baseDomain.length - b.baseDomain.length
        || a.signature.localeCompare(b.signature))
      .slice(0, options.directCrossCandidateSlots);
  }

  function applySlotRaw(state, slot, entry) {
    const id = state.placed.reduce((maximum, word) => Math.max(maximum, Number(word.id || 0)), 0) + 1;
    const clueCell = state.grid[slot.clueRow]?.[slot.clueCol];
    if (!availableClueCell(clueCell, slot.direction)) return false;
    if (clueCell.type === "panel") {
      clueCell.type = "clue";
      clueCell.char = null;
      clueCell.slotIds = [];
      clueCell.directions = [];
      clueCell.clues = [];
    }
    clueCell.clues.push({ slotId: id, direction: slot.direction, text: entry.clue, answer: entry.answer });

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
      } else return false;
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

      const horizontalSlots = enumerateDirectSlots(structural, target, "right", patternIndex, usedAnswers, options, telemetry);
      const verticalSlots = enumerateDirectSlots(structural, target, "down", patternIndex, usedAnswers, options, telemetry);
      telemetry.horizontalSlots += horizontalSlots.length;
      telemetry.verticalSlots += verticalSlots.length;
      if (!horizontalSlots.length) {
        telemetry.horizontalUnavailable += 1;
        continue;
      }
      if (!verticalSlots.length) {
        telemetry.verticalUnavailable += 1;
        continue;
      }

      for (const horizontal of horizontalSlots) {
        for (const vertical of verticalSlots) {
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
                structuralPanelGain: horizontal.panelGainUpperBound + vertical.panelGainUpperBound - 1,
                baselineWeakFill: baselineWeak,
                candidateWeakFill: weakCount(candidate, poolByAnswer),
              };
              const signature = stateSignature(candidate);
              const existing = collected.get(signature);
              if (!existing || compareStates(candidate, existing, poolByAnswer) < 0) collected.set(signature, candidate);
            }
          }
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
      directCrossDomain: 10,
      directCrossCandidateSlots: 8,
      directCrossMaxLength: 8,
      directCrossMaxNewPanels: 3,
      directCrossMaxVariants: 6,
      directCrossFinalists: 2,
      ...suppliedOptions,
    };
    const telemetry = {
      mode: "isolated-direct-cross-v2",
      regionsConsidered: 0,
      junctionRegions: 0,
      horizontalUnavailable: 0,
      verticalUnavailable: 0,
      horizontalSlots: 0,
      verticalSlots: 0,
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
