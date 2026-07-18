(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  const core = window.ScanwordCore;
  if (!solver?.rollbackInlineWord || !solver?.assignClueTextCellsV2 || !closedFill || !core || solver.__constructionTargetedVictimInstalled) return;

  const previousGenerateBest = solver.generateBest.bind(solver);
  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_CONSTRUCTION_MODE) return process.env.SCANWORD_CONSTRUCTION_MODE;
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

  function panelCell() {
    return { type: "panel", char: null, slotIds: [], directions: [], clues: [] };
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
      usedAnswers: new Set(state.placed.map((word) => word.answer)),
      clueFootprints: (state.clueFootprints || []).map((footprint) => ({
        ...footprint,
        cells: footprint.cells.map((cell) => ({ ...cell })),
      })),
    };
  }

  function stripClueLayout(result) {
    const state = cloneState(result);
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.grid[row][col];
        if (cell.type === "clueText" || cell.type === "clueTextContinuation") {
          state.grid[row][col] = panelCell();
          continue;
        }
        if (cell.type !== "clue") continue;
        cell.clues = (cell.clues || []).map((clue) => {
          const clean = { ...clue };
          delete clean.externalText;
          delete clean.textRow;
          delete clean.textCol;
          delete clean.textCells;
          delete clean.arrowRow;
          delete clean.arrowCol;
          return clean;
        });
      }
    }
    state.clueFootprints = [];
    state.usedAnswers = new Set(state.placed.map((word) => word.answer));
    return state;
  }

  function entryQuality(entry) {
    return Number(entry?.lexicalQuality || 50) - (entry?.weakFill ? 90 : 0) - (entry?.answer?.length === 2 ? 20 : 0);
  }

  function weakFillCount(state, poolByAnswer) {
    return state.placed.reduce((sum, word) => sum + Number(Boolean(poolByAnswer.get(word.answer)?.weakFill)), 0);
  }

  function wordCrossings(state, word) {
    return word.cells.reduce((count, target) => {
      const cell = state.grid[target.row]?.[target.col];
      return count + Number(Boolean(cell?.type === "letter" && (cell.slotIds || []).length === 2));
    }, 0);
  }

  function uniqueLetters(state, word) {
    return word.cells.reduce((count, target) => {
      const cell = state.grid[target.row]?.[target.col];
      return count + Number(Boolean(cell?.type === "letter" && (cell.slotIds || []).length === 1));
    }, 0);
  }

  function targetContacts(word, targetKeys) {
    let contacts = 0;
    for (const source of [{ row: word.clueRow, col: word.clueCol }, ...word.cells]) {
      for (const [dr, dc] of ORTHOGONAL) {
        if (targetKeys.has(cellKey(source.row + dr, source.col + dc))) contacts += 1;
      }
    }
    return contacts;
  }

  function rankBoundaryVictims(state, region, poolByAnswer, limit) {
    const targetKeys = new Set(region.cells.map((cell) => cellKey(cell.row, cell.col)));
    const ranked = [];
    for (const slotId of region.boundaryWords || []) {
      const word = state.placed.find((entry) => entry.id === slotId);
      if (!word) continue;
      const contacts = targetContacts(word, targetKeys);
      if (!contacts) continue;
      const crossings = wordCrossings(state, word);
      const unique = uniqueLetters(state, word);
      const entry = poolByAnswer.get(word.answer);
      const weak = Number(Boolean(entry?.weakFill));
      const quality = entryQuality(entry || word);
      ranked.push({
        word,
        contacts,
        crossings,
        unique,
        quality,
        weak,
        score: contacts * 500 + weak * 1200 + unique * 12 - crossings * 45 - quality * 3,
      });
    }
    ranked.sort((a, b) => b.score - a.score
      || b.contacts - a.contacts
      || a.crossings - b.crossings
      || a.quality - b.quality
      || a.word.id - b.word.id);
    return ranked.slice(0, limit);
  }

  function buildFocusRegion(state, region, victim, radius, maxCells) {
    const targetKeys = new Set(region.cells.map((cell) => cellKey(cell.row, cell.col)));
    const freed = [{ row: victim.clueRow, col: victim.clueCol }, ...victim.cells];
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
    const freedKeys = new Set(freed.map((cell) => cellKey(cell.row, cell.col)));
    return {
      id: region.id,
      cells: selected,
      boundaryCells: [...boundary.values()].sort((a, b) => a.row - b.row || a.col - b.col),
      targetKeys,
      freedKeys,
    };
  }

  function applySlot(state, slot, entry) {
    const next = cloneState(state);
    const id = next.placed.reduce((maximum, word) => Math.max(maximum, Number(word.id || 0)), 0) + 1;
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

  function stateSignature(state) {
    return state.placed
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

  function compareFocusedStates(a, b, targetKeys, poolByAnswer) {
    const unresolvedA = unresolvedTargetCells(a, targetKeys);
    const unresolvedB = unresolvedTargetCells(b, targetKeys);
    if (unresolvedA !== unresolvedB) return unresolvedA - unresolvedB;
    const coverageA = closedFill.measureCoverage(a.grid);
    const coverageB = closedFill.measureCoverage(b.grid);
    if (coverageA.panelCells !== coverageB.panelCells) return coverageA.panelCells - coverageB.panelCells;
    if (coverageA.letterCells !== coverageB.letterCells) return coverageB.letterCells - coverageA.letterCells;
    const weakA = weakFillCount(a, poolByAnswer);
    const weakB = weakFillCount(b, poolByAnswer);
    if (weakA !== weakB) return weakA - weakB;
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    return stateSignature(a).localeCompare(stateSignature(b));
  }

  function enumerateFocusedMoves(state, focus, patternIndex, excludedAnswer, options, telemetry) {
    const used = new Set(state.placed.map((word) => word.answer));
    const queryStats = { lookups: 0, checks: 0 };
    const slots = closedFill.enumerateRegionSlots(state, focus, patternIndex, used, {
      maxSlotCandidates: options.maxSlotCandidates,
      maxDomainSize: options.maxDomainSize,
    }, queryStats);
    telemetry.patternLookups += queryStats.lookups;
    telemetry.patternChecks += queryStats.checks;
    telemetry.slotsEnumerated += slots.length;

    const rankedSlots = slots.map((slot) => {
      const targetHits = slot.regionLetterKeys.filter((key) => focus.targetKeys.has(key)).length;
      const freedHits = slot.regionLetterKeys.filter((key) => focus.freedKeys.has(key)).length;
      return { slot, targetHits, freedHits };
    }).filter((item) => item.slot.existingIntersections > 0 && (item.targetHits > 0 || item.freedHits > 0))
      .sort((a, b) => b.targetHits - a.targetHits
        || b.freedHits - a.freedHits
        || b.slot.regionLetterKeys.length - a.slot.regionLetterKeys.length
        || b.slot.existingIntersections - a.slot.existingIntersections
        || a.slot.baseDomain.length - b.slot.baseDomain.length
        || a.slot.signature.localeCompare(b.slot.signature));

    const moves = [];
    for (const ranked of rankedSlots.slice(0, options.maxSlots)) {
      const values = [...ranked.slot.baseDomain]
        .filter((entry) => entry.answer !== excludedAnswer && entry.hasExactClue && !entry.weakFill && !used.has(entry.answer))
        .sort((a, b) => entryQuality(b) - entryQuality(a) || a.answer.localeCompare(b.answer, "ru"))
        .slice(0, options.valuesPerSlot);
      for (const entry of values) {
        moves.push({ ...ranked, entry, score: ranked.targetHits * 1000 + ranked.freedHits * 180 + ranked.slot.regionLetterKeys.length * 20 + entryQuality(entry) });
      }
    }
    moves.sort((a, b) => b.score - a.score || a.slot.signature.localeCompare(b.slot.signature) || a.entry.answer.localeCompare(b.entry.answer, "ru"));
    telemetry.movesEnumerated += moves.length;
    return moves.slice(0, options.maxMoves);
  }

  function generateTargetedVictimVariants(baseResult, pool, suppliedOptions = {}) {
    const options = {
      maxRegions: 3,
      maxVictimsPerRegion: 4,
      focusRadius: 2,
      maxFocusCells: 32,
      depth: 2,
      beamWidth: 5,
      branching: 18,
      maxVariants: 8,
      maxSlotCandidates: 240,
      maxDomainSize: 128,
      maxSlots: 40,
      valuesPerSlot: 3,
      maxMoves: 54,
      ...suppliedOptions,
    };
    const structural = stripClueLayout(baseResult);
    const baselineAnswers = structural.placed.length;
    const poolByAnswer = new Map(pool.map((entry) => [entry.answer, entry]));
    const baselineWeak = weakFillCount(structural, poolByAnswer);
    const patternIndex = closedFill.buildPatternIndex(pool);
    const regions = closedFill.extractResidualRegions(baseResult)
      .filter((region) => region.boundaryWords?.length)
      .sort((a, b) => b.size - a.size || b.boundaryWords.length - a.boundaryWords.length || a.difficulty - b.difficulty || a.id - b.id)
      .slice(0, options.maxRegions);
    const telemetry = {
      mode: "targeted-residual-victim-v1",
      regionsConsidered: regions.length,
      victimsConsidered: 0,
      victimsRolledBack: 0,
      slotsEnumerated: 0,
      movesEnumerated: 0,
      bundlesTried: 0,
      statesAccepted: 0,
      depthReached: 0,
      patternLookups: 0,
      patternChecks: 0,
      targetCells: regions.reduce((sum, region) => sum + region.size, 0),
    };
    const collected = new Map();

    for (const region of regions) {
      const targetKeys = new Set(region.cells.map((cell) => cellKey(cell.row, cell.col)));
      const victims = rankBoundaryVictims(structural, region, poolByAnswer, options.maxVictimsPerRegion);
      telemetry.victimsConsidered += victims.length;
      for (const victim of victims) {
        const rolled = solver.rollbackInlineWord(structural, victim.word.id);
        if (!rolled) continue;
        rolled.usedAnswers = new Set(rolled.placed.map((word) => word.answer));
        rolled.clueFootprints = [];
        const rolledMetrics = solver.resultMetrics(rolled);
        if (!rolledMetrics.validation.valid || rolledMetrics.components !== 1) continue;
        telemetry.victimsRolledBack += 1;
        const focus = buildFocusRegion(rolled, region, victim.word, options.focusRadius, options.maxFocusCells);
        if (!focus.cells.length) continue;
        let beam = [rolled];

        for (let depth = 0; depth < options.depth; depth += 1) {
          const next = [];
          const seen = new Set();
          for (const state of beam) {
            const moves = enumerateFocusedMoves(state, focus, patternIndex, victim.word.answer, options, telemetry);
            for (const move of moves.slice(0, options.branching)) {
              telemetry.bundlesTried += 1;
              const applied = applySlot(state, move.slot, move.entry);
              if (!applied) continue;
              if (weakFillCount(applied, poolByAnswer) > baselineWeak) continue;
              const signature = stateSignature(applied);
              if (seen.has(signature)) continue;
              seen.add(signature);
              next.push(applied);
              if (applied.placed.length >= baselineAnswers && unresolvedTargetCells(applied, targetKeys) < region.size) {
                const existing = collected.get(signature);
                if (!existing || compareFocusedStates(applied, existing, targetKeys, poolByAnswer) < 0) {
                  applied.targetedVictimMeta = {
                    regionId: region.id,
                    regionSize: region.size,
                    victimSlotId: victim.word.id,
                    victimAnswer: victim.word.answer,
                    unresolvedTargetCells: unresolvedTargetCells(applied, targetKeys),
                    depth: depth + 1,
                  };
                  collected.set(signature, applied);
                }
              }
            }
          }
          if (!next.length) break;
          next.sort((a, b) => compareFocusedStates(a, b, targetKeys, poolByAnswer));
          beam = next.slice(0, options.beamWidth);
          telemetry.depthReached = Math.max(telemetry.depthReached, depth + 1);
        }
      }
    }

    const states = [...collected.values()]
      .sort((a, b) => Number(a.targetedVictimMeta?.unresolvedTargetCells ?? Infinity)
        - Number(b.targetedVictimMeta?.unresolvedTargetCells ?? Infinity)
        || compareFocusedStates(a, b, new Set(), poolByAnswer))
      .slice(0, options.maxVariants)
      .map(cloneState);
    telemetry.statesAccepted = states.length;
    return { states, telemetry };
  }

  function makeCandidate(base, state, clueLayout) {
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
    };
  }

  function passesCheckpoint(candidate, checkpoint) {
    if (!candidate) return false;
    return candidate.placed.length >= Number(checkpoint?.minimumAnswers || 0)
      && candidate.fillRatio >= Number(checkpoint?.minimumActive || 0)
      && candidate.answerCoverage >= Number(checkpoint?.minimumAnswerCoverage || 0)
      && candidate.clueTextCells >= Number(checkpoint?.minimumClueTextCells || 0)
      && candidate.externalClueTexts >= Number(checkpoint?.minimumExternalClues || 0)
      && candidate.panelCells <= Number(checkpoint?.maximumPanels ?? Infinity)
      && candidate.components === Number(checkpoint?.requiredComponents || 1)
      && candidate.validation?.valid
      && candidate.placed.every((entry) => entry.hasExactClue);
  }

  function compareCandidates(a, b, poolByAnswer) {
    if (a.panelCells !== b.panelCells) return a.panelCells - b.panelCells;
    if (a.letterCells !== b.letterCells) return b.letterCells - a.letterCells;
    const weakA = weakFillCount(a, poolByAnswer);
    const weakB = weakFillCount(b, poolByAnswer);
    if (weakA !== weakB) return weakA - weakB;
    if (a.clueTextCells !== b.clueTextCells) return a.clueTextCells - b.clueTextCells;
    if (a.intersections !== b.intersections) return b.intersections - a.intersections;
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    return 0;
  }

  solver.generateBest = (...args) => {
    const generated = previousGenerateBest(...args);
    if (modeFromEnvironment() !== "portfolio") return generated;
    const threshold = numericOption("SCANWORD_TARGETED_VICTIM_PANELS", 8);
    const telemetry = {
      mode: "targeted-residual-victim-v1",
      thresholdPanels: threshold,
      panelsBefore: generated.panelCells,
      panelsAfter: generated.panelCells,
      attempted: false,
      accepted: false,
      finalistsEvaluated: 0,
      finalistsPassingCheckpoint: 0,
      selected: null,
      search: null,
    };
    if (generated.panelCells <= threshold) {
      generated.constructionV2 = { ...(generated.constructionV2 || {}), targetedVictim: telemetry };
      return generated;
    }

    try {
      telemetry.attempted = true;
      const options = {
        maxRegions: numericOption("SCANWORD_TARGETED_VICTIM_REGIONS", 3),
        maxVictimsPerRegion: numericOption("SCANWORD_TARGETED_VICTIM_WORDS", 4),
        focusRadius: numericOption("SCANWORD_TARGETED_VICTIM_RADIUS", 2),
        maxFocusCells: numericOption("SCANWORD_TARGETED_VICTIM_FOCUS_CELLS", 32),
        depth: numericOption("SCANWORD_TARGETED_VICTIM_DEPTH", 2),
        beamWidth: numericOption("SCANWORD_TARGETED_VICTIM_BEAM", 5),
        branching: numericOption("SCANWORD_TARGETED_VICTIM_BRANCHING", 18),
        maxVariants: numericOption("SCANWORD_TARGETED_VICTIM_VARIANTS", 8),
        maxSlotCandidates: numericOption("SCANWORD_TARGETED_VICTIM_SLOT_CANDIDATES", 240),
        maxDomainSize: numericOption("SCANWORD_TARGETED_VICTIM_DOMAIN", 128),
        maxSlots: numericOption("SCANWORD_TARGETED_VICTIM_SLOTS", 40),
        valuesPerSlot: numericOption("SCANWORD_TARGETED_VICTIM_VALUES", 3),
        maxMoves: numericOption("SCANWORD_TARGETED_VICTIM_MOVES", 54),
      };
      const searched = generateTargetedVictimVariants(generated, generated.pool || [], options);
      telemetry.search = searched.telemetry;
      const poolByAnswer = new Map((generated.pool || []).map((entry) => [entry.answer, entry]));
      const clueRestarts = numericOption("SCANWORD_PORTFOLIO_CLUE_RESTARTS", 160);
      let best = generated;
      for (let index = 0; index < searched.states.length; index += 1) {
        const state = cloneState(searched.states[index]);
        const clueLayout = solver.assignClueTextCellsV2(
          state,
          core.makeRandom(`${args[0]}:targeted-victim:clues:${generated.attempt}:${index}`),
          clueRestarts,
        );
        telemetry.finalistsEvaluated += 1;
        const candidate = makeCandidate(generated, state, clueLayout);
        if (!passesCheckpoint(candidate, generated.coverageCheckpoint)) continue;
        telemetry.finalistsPassingCheckpoint += 1;
        if (compareCandidates(candidate, best, poolByAnswer) < 0) {
          best = candidate;
          telemetry.selected = state.targetedVictimMeta || null;
        }
      }
      telemetry.accepted = best !== generated;
      telemetry.panelsAfter = best.panelCells;
      best.constructionV2 = { ...(generated.constructionV2 || {}), targetedVictim: telemetry };
      return best;
    } catch (error) {
      telemetry.error = String(error?.stack || error);
      generated.constructionV2 = { ...(generated.constructionV2 || {}), targetedVictim: telemetry };
      return generated;
    }
  };

  Object.assign(solver, {
    generateTargetedVictimVariants,
    stripClueLayoutForTargetedVictim: stripClueLayout,
    __constructionTargetedVictimInstalled: true,
  });
})();
