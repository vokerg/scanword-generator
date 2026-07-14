(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  if (!solver?.generateTargetedVictimVariants
    || !solver?.stripClueLayoutForTargetedVictim
    || !solver?.rollbackInlineWord
    || !closedFill?.enumerateRegionSlots
    || solver.__constructionTargetedPairInstalled) return;

  const previousGenerateVariants = solver.generateTargetedVictimVariants.bind(solver);
  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];

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

  function unresolvedTargetCells(state, targetKeys) {
    let unresolved = 0;
    for (const key of targetKeys) {
      const [row, col] = key.split(":").map(Number);
      if (state.grid[row]?.[col]?.type === "panel") unresolved += 1;
    }
    return unresolved;
  }

  function buildFocusRegion(state, region, victim, radius, maxCells) {
    const targetKeys = new Set(region.cells.map((cell) => cellKey(cell.row, cell.col)));
    const freed = [{ row: victim.clueRow, col: victim.clueCol }, ...(victim.cells || [])];
    const sources = [...region.cells, ...freed];
    const cells = [];
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        if (state.grid[row][col].type !== "panel") continue;
        let distance = Infinity;
        for (const source of sources) {
          distance = Math.min(distance, Math.abs(row - source.row) + Math.abs(col - source.col));
          if (distance === 0) break;
        }
        if (distance <= radius) cells.push({ row, col, distance });
      }
    }
    cells.sort((a, b) => a.distance - b.distance || a.row - b.row || a.col - b.col);
    const selected = cells.slice(0, maxCells).map(({ row, col }) => ({ row, col }));
    const selectedKeys = new Set(selected.map((cell) => cellKey(cell.row, cell.col)));
    const boundary = new Map();
    for (const current of selected) {
      for (const [dr, dc] of ORTHOGONAL) {
        const row = current.row + dr;
        const col = current.col + dc;
        if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) continue;
        const key = cellKey(row, col);
        if (selectedKeys.has(key)) continue;
        const cell = state.grid[row][col];
        if (cell.type === "panel") continue;
        boundary.set(key, {
          row,
          col,
          type: cell.type,
          char: cell.char || null,
          slotIds: [...(cell.slotIds || [])],
          directions: [...(cell.directions || [])],
          clueDirections: (cell.clues || []).map((clue) => clue.direction).sort(),
        });
      }
    }
    return {
      id: region.id,
      cells: selected,
      boundaryCells: [...boundary.values()].sort((a, b) => a.row - b.row || a.col - b.col),
      targetKeys,
      freedKeys: new Set(freed.map((cell) => cellKey(cell.row, cell.col))),
    };
  }

  function augmentPool(pool) {
    const byAnswer = new Map((pool || []).map((entry) => [entry.answer, entry]));
    for (const entry of window.SCANWORD_TARGETED_SHORT_FILL || []) {
      if (!byAnswer.has(entry.answer)) byAnswer.set(entry.answer, entry);
    }
    return [...byAnswer.values()];
  }

  function slotPairRelation(a, b) {
    if (a.clueKey === b.clueKey && a.direction === b.direction) return null;

    const aPositions = new Map(a.cells.map((cell, index) => [cellKey(cell.row, cell.col), index]));
    const bPositions = new Map(b.cells.map((cell, index) => [cellKey(cell.row, cell.col), index]));
    if (aPositions.has(b.clueKey) || bPositions.has(a.clueKey)) return null;
    if ((a.forbiddenLetterKeys || []).some((key) => bPositions.has(key))) return null;
    if ((b.forbiddenLetterKeys || []).some((key) => aPositions.has(key))) return null;

    const shared = [];
    for (const [key, aPosition] of aPositions) {
      if (bPositions.has(key)) shared.push({ key, aPosition, bPosition: bPositions.get(key) });
    }
    if (shared.length > 1) return null;
    if (shared.length === 1) {
      if (a.direction === b.direction) return null;
      if (a.existingIntersections <= 0 && b.existingIntersections <= 0) return null;
      return { type: "crossing", ...shared[0] };
    }
    if (a.existingIntersections <= 0 || b.existingIntersections <= 0) return null;
    return { type: "disjoint" };
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

  function compareStates(a, b, targetKeys, poolByAnswer) {
    const unresolvedA = unresolvedTargetCells(a, targetKeys);
    const unresolvedB = unresolvedTargetCells(b, targetKeys);
    if (unresolvedA !== unresolvedB) return unresolvedA - unresolvedB;
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

  function generateAtomicPairVariants(baseResult, pool, options, telemetry) {
    const structural = solver.stripClueLayoutForTargetedVictim(baseResult);
    const baselineAnswers = structural.placed.length;
    const augmentedPool = augmentPool(pool);
    const poolByAnswer = new Map(augmentedPool.map((entry) => [entry.answer, entry]));
    const baselineWeak = weakCount(structural, poolByAnswer);
    const patternIndex = closedFill.buildPatternIndex(augmentedPool);
    const regions = closedFill.extractResidualRegions(baseResult)
      .filter((region) => region.boundaryWords?.length)
      .sort((a, b) => b.size - a.size || b.boundaryWords.length - a.boundaryWords.length || a.id - b.id)
      .slice(0, options.maxRegions);
    const collected = new Map();

    telemetry.regionsConsidered = regions.length;
    for (const region of regions) {
      const targetKeys = new Set(region.cells.map((cell) => cellKey(cell.row, cell.col)));
      const victimIds = [...region.boundaryWords].slice(0, options.maxVictimsPerRegion);
      telemetry.victimsConsidered += victimIds.length;
      for (const victimId of victimIds) {
        const victim = structural.placed.find((word) => word.id === victimId);
        if (!victim) continue;
        const rolled = solver.rollbackInlineWord(structural, victimId);
        if (!rolled) {
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
        if (rolledMetrics.components !== 1) telemetry.disconnectedRollbackRelaxed += 1;
        telemetry.victimsRolledBack += 1;
        const focus = buildFocusRegion(rolled, region, victim, options.focusRadius, options.maxFocusCells);
        if (!focus.cells.length) {
          telemetry.emptyFocus += 1;
          continue;
        }
        const queryStats = { lookups: 0, checks: 0 };
        const slots = closedFill.enumerateRegionSlots(rolled, focus, patternIndex, rolled.usedAnswers, {
          maxSlotCandidates: options.maxSlotCandidates,
          maxDomainSize: options.maxDomainSize,
        }, queryStats);
        telemetry.patternLookups += queryStats.lookups;
        telemetry.patternChecks += queryStats.checks;
        telemetry.slotsEnumerated += slots.length;

        const rankedSlots = slots.map((slot) => ({
          slot,
          targetHits: slot.regionLetterKeys.filter((key) => targetKeys.has(key)).length,
          freedHits: slot.regionLetterKeys.filter((key) => focus.freedKeys.has(key)).length,
        })).filter((item) => item.targetHits > 0 || item.freedHits > 0 || item.slot.existingIntersections > 0)
          .sort((a, b) => b.targetHits - a.targetHits
            || b.freedHits - a.freedHits
            || b.slot.existingIntersections - a.slot.existingIntersections
            || b.slot.regionLetterKeys.length - a.slot.regionLetterKeys.length
            || a.slot.signature.localeCompare(b.slot.signature))
          .slice(0, options.atomicMaxSlots);

        for (let aIndex = 0; aIndex < rankedSlots.length; aIndex += 1) {
          for (let bIndex = aIndex + 1; bIndex < rankedSlots.length; bIndex += 1) {
            telemetry.slotPairsConsidered += 1;
            const a = rankedSlots[aIndex];
            const b = rankedSlots[bIndex];
            const relation = slotPairRelation(a.slot, b.slot);
            if (!relation) continue;
            if (a.targetHits + b.targetHits <= 0) continue;
            telemetry.compatibleSlotPairs += 1;
            if (relation.type === "crossing") telemetry.crossingSlotPairs += 1;
            else telemetry.disjointSlotPairs += 1;

            const valuesA = [...a.slot.baseDomain]
              .filter((entry) => entry.answer !== victim.answer && entry.hasExactClue && !rolled.usedAnswers.has(entry.answer))
              .sort((left, right) => entryQuality(right) - entryQuality(left) || left.answer.localeCompare(right.answer, "ru"))
              .slice(0, options.atomicValuesPerSlot);
            const valuesB = [...b.slot.baseDomain]
              .filter((entry) => entry.answer !== victim.answer && entry.hasExactClue && !rolled.usedAnswers.has(entry.answer))
              .sort((left, right) => entryQuality(right) - entryQuality(left) || left.answer.localeCompare(right.answer, "ru"))
              .slice(0, options.atomicValuesPerSlot);

            for (const entryA of valuesA) {
              for (const entryB of valuesB) {
                telemetry.entryPairsConsidered += 1;
                if (entryA.answer === entryB.answer) continue;
                if (relation.type === "crossing"
                  && entryA.answer[relation.aPosition] !== entryB.answer[relation.bPosition]) continue;
                const candidate = cloneState(rolled);
                if (!applySlotRaw(candidate, a.slot, entryA) || !applySlotRaw(candidate, b.slot, entryB)) {
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
                if (candidate.placed.length < baselineAnswers) {
                  telemetry.answerCountRejected += 1;
                  continue;
                }
                const unresolved = unresolvedTargetCells(candidate, targetKeys);
                if (unresolved >= region.size) {
                  telemetry.targetRejected += 1;
                  continue;
                }
                const signature = stateSignature(candidate);
                candidate.targetedVictimMeta = {
                  regionId: region.id,
                  regionSize: region.size,
                  victimSlotId: victim.id,
                  victimAnswer: victim.answer,
                  unresolvedTargetCells: unresolved,
                  depth: 2,
                  atomicPair: true,
                  atomicPairRelation: relation.type,
                  pairAnswers: [entryA.answer, entryB.answer].sort(),
                  supplementalShortFill: [entryA, entryB]
                    .filter((entry) => (window.SCANWORD_TARGETED_SHORT_FILL || []).some((item) => item.answer === entry.answer))
                    .map((entry) => entry.answer)
                    .sort(),
                  baselineWeakFill: baselineWeak,
                  candidateWeakFill: weakCount(candidate, poolByAnswer),
                };
                const existing = collected.get(signature);
                if (!existing || compareStates(candidate, existing, targetKeys, poolByAnswer) < 0) collected.set(signature, candidate);
              }
            }
          }
        }
      }
    }

    const states = [...collected.values()]
      .sort((a, b) => compareStates(a, b, new Set(), poolByAnswer))
      .slice(0, options.atomicMaxVariants)
      .map(cloneState);
    telemetry.statesAccepted = states.length;
    return states;
  }

  solver.generateTargetedVictimVariants = (result, pool, suppliedOptions = {}) => {
    const previous = previousGenerateVariants(result, pool, suppliedOptions);
    const options = {
      maxRegions: 3,
      maxVictimsPerRegion: 4,
      focusRadius: 2,
      maxFocusCells: 32,
      maxSlotCandidates: 240,
      maxDomainSize: 128,
      maxVariants: 8,
      atomicMaxSlots: 28,
      atomicValuesPerSlot: 4,
      atomicMaxVariants: 6,
      atomicFinalists: 2,
      ...suppliedOptions,
    };
    const telemetry = {
      mode: "targeted-atomic-pair-v3",
      regionsConsidered: 0,
      victimsConsidered: 0,
      victimsRolledBack: 0,
      rollbackRejected: 0,
      rollbackInvalid: 0,
      disconnectedRollbackRelaxed: 0,
      emptyFocus: 0,
      slotsEnumerated: 0,
      slotPairsConsidered: 0,
      compatibleSlotPairs: 0,
      crossingSlotPairs: 0,
      disjointSlotPairs: 0,
      entryPairsConsidered: 0,
      applyRejected: 0,
      validationRejected: 0,
      weakBudgetRejected: 0,
      answerCountRejected: 0,
      targetRejected: 0,
      patternLookups: 0,
      patternChecks: 0,
      statesAccepted: 0,
      finalistsReserved: 0,
    };
    const atomicStates = generateAtomicPairVariants(result, pool, options, telemetry);
    const merged = new Map();
    for (const state of previous.states || []) {
      const signature = stateSignature(state);
      if (!merged.has(signature)) merged.set(signature, state);
    }
    const reserved = atomicStates.slice(0, options.atomicFinalists);
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
        atomicPair: telemetry,
        disconnectedRollbackRelaxed: telemetry.disconnectedRollbackRelaxed,
        statesAccepted: states.length,
      },
    };
  };

  Object.assign(solver, {
    generateAtomicTargetedPairVariants: generateAtomicPairVariants,
    __constructionTargetedPairInstalled: true,
  });
})();
