(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  if (!solver?.generateVictimReplacementVariants || !solver.rollbackInlineWord || !closedFill || solver.__constructionVictimDepthTwoInstalled) return;

  const originalGenerate = solver.generateVictimReplacementVariants.bind(solver);
  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function numericOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
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

  function adjacentPanels(state, word) {
    const panels = new Set();
    for (const source of [{ row: word.clueRow, col: word.clueCol }, ...word.cells]) {
      for (const [dr, dc] of ORTHOGONAL) {
        const row = source.row + dr;
        const col = source.col + dc;
        if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) continue;
        if (state.grid[row][col].type === "panel") panels.add(cellKey(row, col));
      }
    }
    return panels.size;
  }

  function uniqueLetters(state, word) {
    return word.cells.reduce((count, target) => {
      const cell = state.grid[target.row]?.[target.col];
      return count + Number(Boolean(cell?.type === "letter" && (cell.slotIds || []).length === 1));
    }, 0);
  }

  function signature(state) {
    return state.placed
      .map((word) => `${word.direction}:${word.clueRow},${word.clueCol}:${word.answer}`)
      .sort()
      .join("|");
  }

  function compareStates(a, b, poolByAnswer) {
    const coverageA = closedFill.measureCoverage(a.grid);
    const coverageB = closedFill.measureCoverage(b.grid);
    if (coverageA.panelCells !== coverageB.panelCells) return coverageA.panelCells - coverageB.panelCells;
    if (coverageA.letterCells !== coverageB.letterCells) return coverageB.letterCells - coverageA.letterCells;
    const weakA = weakFillCount(a, poolByAnswer);
    const weakB = weakFillCount(b, poolByAnswer);
    if (weakA !== weakB) return weakA - weakB;
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    return signature(a).localeCompare(signature(b));
  }

  function mergeTelemetry(target, source) {
    for (const key of [
      "victimsConsidered",
      "victimsRemoved",
      "slotsEnumerated",
      "movesEnumerated",
      "bundlesTried",
      "statesAccepted",
      "patternLookups",
      "patternChecks",
    ]) target[key] += Number(source?.[key] || 0);
    target.depthReached = Math.max(target.depthReached, Number(source?.depthReached || 0));
  }

  function rankSecondaryVictims(baseState, poolByAnswer, limit) {
    const ranked = [];
    for (const word of baseState.placed) {
      const crossings = wordCrossings(baseState, word);
      if (crossings !== 2) continue;
      const panels = adjacentPanels(baseState, word);
      if (!panels) continue;
      const entry = poolByAnswer.get(word.answer);
      const weak = Number(Boolean(entry?.weakFill));
      const unique = uniqueLetters(baseState, word);
      const quality = entryQuality(entry || word);
      ranked.push({
        word,
        score: weak * 1200 + panels * 45 + unique * 10 - quality * 3,
        panels,
        quality,
      });
    }
    ranked.sort((a, b) => b.score - a.score || b.panels - a.panels || a.quality - b.quality || a.word.id - b.word.id);
    return ranked.slice(0, limit);
  }

  solver.generateVictimReplacementVariants = (baseState, pool, suppliedOptions = {}) => {
    const primary = originalGenerate(baseState, pool, suppliedOptions);
    const poolByAnswer = new Map(pool.map((entry) => [entry.answer, entry]));
    const baselineAnswers = baseState.placed.length;
    const baselineWeak = weakFillCount(baseState, poolByAnswer);
    const secondaryLimit = numericOption("SCANWORD_VICTIM_SECONDARY_WORDS", 3);
    const secondaryVariants = numericOption("SCANWORD_VICTIM_SECONDARY_VARIANTS", 4);
    const combinedTelemetry = {
      mode: "prelayout-victim-bundles-v2",
      victimsConsidered: 0,
      victimsRemoved: 0,
      slotsEnumerated: 0,
      movesEnumerated: 0,
      bundlesTried: 0,
      statesAccepted: 0,
      depthReached: 0,
      patternLookups: 0,
      patternChecks: 0,
      secondaryVictimsConsidered: 0,
      secondaryVictimsRemoved: 0,
      secondaryStatesAccepted: 0,
    };
    mergeTelemetry(combinedTelemetry, primary.telemetry);

    const collected = new Map(primary.states.map((state) => [signature(state), state]));
    for (const victim of rankSecondaryVictims(baseState, poolByAnswer, secondaryLimit)) {
      combinedTelemetry.secondaryVictimsConsidered += 1;
      const rolled = solver.rollbackInlineWord(baseState, victim.word.id);
      if (!rolled) continue;
      const metrics = solver.resultMetrics(rolled);
      if (!metrics.validation.valid || metrics.components !== 1) continue;
      combinedTelemetry.secondaryVictimsRemoved += 1;

      const nested = originalGenerate(rolled, pool, {
        ...suppliedOptions,
        depth: Math.max(3, Number(suppliedOptions.depth || 0)),
        maxVariants: secondaryVariants,
        maxVictims: Math.min(4, Number(suppliedOptions.maxVictims || 4)),
      });
      mergeTelemetry(combinedTelemetry, nested.telemetry);
      for (const state of nested.states) {
        if (state.placed.length < baselineAnswers) continue;
        if (weakFillCount(state, poolByAnswer) > baselineWeak) continue;
        const key = signature(state);
        const existing = collected.get(key);
        if (!existing || compareStates(state, existing, poolByAnswer) < 0) collected.set(key, state);
        combinedTelemetry.secondaryStatesAccepted += 1;
      }
    }

    const maxVariants = Number(suppliedOptions.maxVariants || 8);
    const states = [...collected.values()]
      .sort((a, b) => compareStates(a, b, poolByAnswer))
      .slice(0, maxVariants);
    combinedTelemetry.statesAccepted = states.length;
    return { states, telemetry: combinedTelemetry };
  };

  solver.__constructionVictimDepthTwoInstalled = true;
})();