(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  if (!solver?.generateTargetedVictimVariants
    || !solver?.stripClueLayoutForTargetedVictim
    || !solver?.rollbackInlineWord
    || !solver?.resultMetrics
    || !closedFill?.extractResidualRegions
    || !closedFill?.buildPatternIndex
    || !closedFill?.queryPattern
    || !closedFill?.measureCoverage
    || solver.__constructionRelaxedRollbackCrossInstalled) return;

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

  function stateSignature(state) {
    return (state.placed || [])
      .map((word) => `${word.direction}:${word.clueRow},${word.clueCol}:${word.answer}`)
      .sort()
      .join("|");
  }

  function entryQuality(entry) {
    return Number(entry?.lexicalQuality || 50)
      - (entry?.weakFill ? 90 : 0)
      - (entry?.answer?.length === 2 ? 20 : 0);
  }

  function augmentPool(pool) {
    const byAnswer = new Map((pool || []).map((entry) => [entry.answer, entry]));
    for (const entry of window.SCANWORD_TARGETED_SHORT_FILL || []) {
      if (!byAnswer.has(entry.answer)) byAnswer.set(entry.answer, entry);
    }
    return [...byAnswer.values()];
  }

  function weakCount(state, poolByAnswer) {
    return (state.placed || []).reduce((sum, word) => {
      const metadata = poolByAnswer.get(word.answer);
      return sum + Number(Boolean(word.weakFill || metadata?.weakFill));
    }, 0);
  }

  function directionSpec(direction) {
    return direction === "right"
      ? { dr: 0, dc: 1, perpendicular: "down", sides: [[-1, 0], [1, 0]] }
      : { dr: 1, dc: 0, perpendicular: "right", sides: [[0, -1], [0, 1]] };
  }

  function availableClueCell(cell, direction) {
    return Boolean(cell
      && (cell.type === "panel" || cell.type === "clue")
      && !(cell.clues || []).some((clue) => clue.direction === direction)
      && (cell.clues || []).length < 2);
  }

  function usableExistingLetter(cell, direction, perpendicular) {
    return Boolean(cell?.type === "letter"
      && cell.char
      && (cell.directions || []).length === 1
      && (cell.directions || [])[0] === perpendicular
      && !(cell.directions || []).includes(direction));
  }

  function safeNewPanel(state, row, col, target, sides) {
    if (row === target.row && col === target.col) return true;
    for (const [dr, dc] of sides) {
      if (state.grid[row + dr]?.[col + dc]?.type === "letter") return false;
    }
    return true;
  }

  function validateWordCell(state, row, col, target, direction, spec, allowedPanels) {
    const cell = state.grid[row]?.[col];
    if (!cell) return null;
    if (row === target.row && col === target.col) {
      return cell.type === "panel" ? { char: null, panel: true } : null;
    }
    if (usableExistingLetter(cell, direction, spec.perpendicular)) return { char: cell.char, panel: false };
    if (cell.type !== "panel" || !allowedPanels.has(cellKey(row, col))) return null;
    if (!safeNewPanel(state, row, col, target, spec.sides)) return null;
    return { char: null, panel: true };
  }

  function enumerateSlots(state, target, direction, patternIndex, usedAnswers, allowedPanels, options, telemetry) {
    const spec = directionSpec(direction);
    const slots = new Map();

    for (let clueDistance = 1; clueDistance <= options.relaxedCrossMaxLength; clueDistance += 1) {
      const clueRow = target.row - spec.dr * clueDistance;
      const clueCol = target.col - spec.dc * clueDistance;
      const clueCell = state.grid[clueRow]?.[clueCol];
      if (!clueCell) break;
      if (!availableClueCell(clueCell, direction)) {
        if (["clue", "clueText", "clueTextContinuation"].includes(clueCell.type)) break;
        continue;
      }

      const startRow = clueRow + spec.dr;
      const startCol = clueCol + spec.dc;
      const prefix = [];
      let prefixValid = true;
      let panelCount = 0;
      for (let position = 0; position < clueDistance; position += 1) {
        const row = startRow + spec.dr * position;
        const col = startCol + spec.dc * position;
        const validated = validateWordCell(state, row, col, target, direction, spec, allowedPanels);
        if (!validated) {
          prefixValid = false;
          break;
        }
        panelCount += Number(validated.panel);
        if (panelCount > options.relaxedCrossMaxNewPanels) {
          prefixValid = false;
          break;
        }
        prefix.push({ row, col, char: validated.char, panel: validated.panel });
      }
      if (!prefixValid || !prefix.some((cell) => cell.row === target.row && cell.col === target.col)) continue;

      let cells = [...prefix];
      let currentRow = target.row;
      let currentCol = target.col;
      while (cells.length <= options.relaxedCrossMaxLength) {
        const nextRow = currentRow + spec.dr;
        const nextCol = currentCol + spec.dc;
        const nextCell = state.grid[nextRow]?.[nextCol];
        const nextUsableLetter = usableExistingLetter(nextCell, direction, spec.perpendicular);

        if (!nextUsableLetter) {
          const pattern = cells.map((cell) => cell.char);
          const queryStats = { lookups: 0, checks: 0 };
          const domain = closedFill.queryPattern(patternIndex, pattern, usedAnswers, queryStats)
            .filter((entry) => entry.hasExactClue)
            .sort((a, b) => entryQuality(b) - entryQuality(a) || a.answer.localeCompare(b.answer, "ru"))
            .slice(0, options.relaxedCrossDomain);
          telemetry.patternLookups += queryStats.lookups;
          telemetry.patternChecks += queryStats.checks;
          const patternText = pattern.map((char) => char || "?").join("");
          if (!domain.length) telemetry.emptyPatterns.push(patternText);
          else {
            const targetPosition = cells.findIndex((cell) => cell.row === target.row && cell.col === target.col);
            const signature = `${direction}:${clueRow},${clueCol}:${startRow},${startCol}:${cells.length}`;
            slots.set(signature, {
              clueRow,
              clueCol,
              direction,
              startRow,
              startCol,
              length: cells.length,
              cells: cells.map(({ row, col }) => ({ row, col })),
              pattern,
              targetPosition,
              existingIntersections: cells.filter((cell) => !cell.panel).length,
              panelGainUpperBound: cells.filter((cell) => cell.panel).length + Number(clueCell.type === "panel"),
              baseDomain: domain,
              signature,
            });
          }
        }

        if (cells.length >= options.relaxedCrossMaxLength || !nextCell) break;
        const validated = validateWordCell(state, nextRow, nextCol, target, direction, spec, allowedPanels);
        if (!validated) break;
        const nextPanelCount = cells.filter((cell) => cell.panel).length + Number(validated.panel);
        if (nextPanelCount > options.relaxedCrossMaxNewPanels) break;
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
      .slice(0, options.relaxedCrossCandidateSlots);
  }

  function applySlot(state, slot, entry) {
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

  function expandedPanelKeys(state, target) {
    const key = cellKey(target.row, target.col);
    const region = closedFill.extractResidualRegions(state)
      .find((candidate) => candidate.cells.some((cell) => cellKey(cell.row, cell.col) === key));
    return region ? new Set(region.cells.map((cell) => cellKey(cell.row, cell.col))) : new Set([key]);
  }

  function generateRelaxedRollbackCrossVariants(baseResult, pool, options, telemetry) {
    const structural = solver.stripClueLayoutForTargetedVictim(baseResult);
    const augmentedPool = augmentPool(pool);
    const poolByAnswer = new Map(augmentedPool.map((entry) => [entry.answer, entry]));
    const patternIndex = closedFill.buildPatternIndex(augmentedPool);
    const baselineAnswers = structural.placed.length;
    const baselinePanels = closedFill.measureCoverage(structural.grid).panelCells;
    const baselineWeak = weakCount(structural, poolByAnswer);
    const regions = closedFill.extractResidualRegions(structural)
      .filter((region) => region.size === 1 && region.boundaryWords?.length)
      .sort((a, b) => b.boundaryWords.length - a.boundaryWords.length || a.id - b.id)
      .slice(0, options.relaxedCrossRegions);
    telemetry.regionsConsidered = regions.length;
    const collected = new Map();

    for (const region of regions) {
      const target = region.cells[0];
      const victimIds = [...region.boundaryWords].slice(0, options.relaxedCrossVictims);
      telemetry.victimsConsidered += victimIds.length;
      for (const victimId of victimIds) {
        const victim = structural.placed.find((word) => word.id === victimId);
        const rolled = solver.rollbackInlineWord(structural, victimId);
        if (!victim || !rolled) {
          telemetry.rollbackRejected += 1;
          continue;
        }
        rolled.usedAnswers = new Set(rolled.placed.map((word) => word.answer));
        rolled.clueFootprints = [];
        const rolledMetrics = solver.resultMetrics(rolled);
        if (!rolledMetrics.validation.valid) {
          telemetry.rollbackInvalid += 1;
          continue;
        }
        telemetry.victimsRolledBack += 1;
        if (rolledMetrics.components !== 1) telemetry.disconnectedRollbacks += 1;

        const allowedPanels = expandedPanelKeys(rolled, target);
        for (const cell of victim.cells || []) {
          if (rolled.grid[cell.row]?.[cell.col]?.type === "panel") allowedPanels.add(cellKey(cell.row, cell.col));
        }
        if (rolled.grid[victim.clueRow]?.[victim.clueCol]?.type === "panel") allowedPanels.add(cellKey(victim.clueRow, victim.clueCol));

        const horizontalSlots = enumerateSlots(rolled, target, "right", patternIndex, rolled.usedAnswers, allowedPanels, options, telemetry);
        const verticalSlots = enumerateSlots(rolled, target, "down", patternIndex, rolled.usedAnswers, allowedPanels, options, telemetry);
        telemetry.horizontalSlots += horizontalSlots.length;
        telemetry.verticalSlots += verticalSlots.length;
        if (!horizontalSlots.length || !verticalSlots.length) continue;

        for (const horizontal of horizontalSlots) {
          for (const vertical of verticalSlots) {
            telemetry.slotPairsBuilt += 1;
            for (const horizontalEntry of horizontal.baseDomain) {
              for (const verticalEntry of vertical.baseDomain) {
                telemetry.entryPairsConsidered += 1;
                if (horizontalEntry.answer === verticalEntry.answer) continue;
                if (horizontalEntry.answer[horizontal.targetPosition] !== verticalEntry.answer[vertical.targetPosition]) continue;
                telemetry.characterPairsMatched += 1;
                const candidate = cloneState(rolled);
                if (!applySlot(candidate, horizontal, horizontalEntry) || !applySlot(candidate, vertical, verticalEntry)) {
                  telemetry.applyRejected += 1;
                  continue;
                }
                const metrics = solver.resultMetrics(candidate);
                if (!metrics.validation.valid || metrics.components !== 1 || candidate.placed.some((word) => !word.hasExactClue)) {
                  telemetry.validationRejected += 1;
                  continue;
                }
                if (candidate.placed.length < baselineAnswers) {
                  telemetry.answerCountRejected += 1;
                  continue;
                }
                if (weakCount(candidate, poolByAnswer) > baselineWeak) {
                  telemetry.weakBudgetRejected += 1;
                  continue;
                }
                const panels = closedFill.measureCoverage(candidate.grid).panelCells;
                if (panels >= baselinePanels) {
                  telemetry.nonImprovingRejected += 1;
                  continue;
                }
                candidate.targetedVictimMeta = {
                  relaxedRollbackCross: true,
                  regionId: region.id,
                  targetCell: { row: target.row, col: target.col },
                  victimSlotId: victim.id,
                  victimAnswer: victim.answer,
                  pairAnswers: [horizontalEntry.answer, verticalEntry.answer].sort(),
                  horizontalPattern: horizontal.pattern.map((char) => char || "?").join(""),
                  verticalPattern: vertical.pattern.map((char) => char || "?").join(""),
                  panelsBefore: baselinePanels,
                  panelsAfter: panels,
                };
                const signature = stateSignature(candidate);
                const existing = collected.get(signature);
                if (!existing || compareStates(candidate, existing, poolByAnswer) < 0) collected.set(signature, candidate);
              }
            }
          }
        }
      }
    }

    const states = [...collected.values()]
      .sort((a, b) => compareStates(a, b, poolByAnswer))
      .slice(0, options.relaxedCrossMaxVariants)
      .map(cloneState);
    telemetry.statesAccepted = states.length;
    telemetry.emptyPatterns = [...new Set(telemetry.emptyPatterns)].sort();
    return states;
  }

  solver.generateTargetedVictimVariants = (result, pool, suppliedOptions = {}) => {
    const previous = previousGenerateVariants(result, pool, suppliedOptions);
    const options = {
      relaxedCrossRegions: 4,
      relaxedCrossVictims: 6,
      relaxedCrossDomain: 16,
      relaxedCrossCandidateSlots: 12,
      relaxedCrossMaxLength: 9,
      relaxedCrossMaxNewPanels: 5,
      relaxedCrossMaxVariants: 8,
      relaxedCrossFinalists: 2,
      ...suppliedOptions,
    };
    const telemetry = {
      mode: "rollback-aware-cross-pair-v1",
      regionsConsidered: 0,
      victimsConsidered: 0,
      victimsRolledBack: 0,
      disconnectedRollbacks: 0,
      rollbackRejected: 0,
      rollbackInvalid: 0,
      horizontalSlots: 0,
      verticalSlots: 0,
      slotPairsBuilt: 0,
      entryPairsConsidered: 0,
      characterPairsMatched: 0,
      applyRejected: 0,
      validationRejected: 0,
      answerCountRejected: 0,
      weakBudgetRejected: 0,
      nonImprovingRejected: 0,
      statesAccepted: 0,
      finalistsReserved: 0,
      patternLookups: 0,
      patternChecks: 0,
      emptyPatterns: [],
    };
    const relaxedStates = generateRelaxedRollbackCrossVariants(result, pool, options, telemetry);
    const merged = new Map();
    for (const state of previous.states || []) merged.set(stateSignature(state), state);
    const reserved = relaxedStates.slice(0, options.relaxedCrossFinalists);
    telemetry.finalistsReserved = reserved.length;
    for (const state of reserved) {
      const signature = stateSignature(state);
      if (!merged.has(signature)) merged.set(signature, state);
    }
    return {
      states: [...merged.values()],
      telemetry: {
        ...(previous.telemetry || {}),
        relaxedRollbackCross: telemetry,
        statesAccepted: merged.size,
      },
    };
  };

  Object.assign(solver, {
    generateRelaxedRollbackCrossVariants,
    __constructionRelaxedRollbackCrossInstalled: true,
  });
})();
