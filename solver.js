(() => {
  "use strict";

  const {
    DIRECTIONS,
    makeRandom,
    generateWordPool,
    createMask,
    extractSlots,
    cellKey,
    slotEndBarrierKey,
    analyzeAssignments,
    compactSolution,
    templatePotentialMetrics,
  } = window.ScanwordCore;

  function candidateMatches(slot, entry, letters) {
    for (let index = 0; index < slot.cells.length; index += 1) {
      const cell = slot.cells[index];
      const known = letters.get(`${cell.row}:${cell.col}`);
      if (known && known !== entry.answer[index]) return false;
    }
    return true;
  }

  function countKnownLetters(slot, letters) {
    return slot.cells.reduce((count, cell) => count + (letters.has(`${cell.row}:${cell.col}`) ? 1 : 0), 0);
  }

  function scoreCandidate(slot, entry, slots, assignments, supportIndex, random) {
    let score = entry.hasExactClue ? 80 : 0;
    score += new Set(entry.answer).size * 0.45;

    for (const crossing of slot.crossings) {
      if (assignments.has(crossing.slotIndex)) continue;
      const other = slots[crossing.slotIndex];
      const required = entry.answer[crossing.ownPosition];
      const support = supportIndex.get(`${other.length}:${crossing.otherPosition}:${required}`) || 0;
      score += Math.min(18, support) * 0.9;
    }

    return score + random() * 3;
  }

  function buildFilledGrid(mask, slots, assignments) {
    const rows = mask.length;
    const cols = mask[0].length;
    const grid = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: cols }, (_, col) => ({
        type: mask[row][col] ? "clue" : "inactive",
        char: null,
        slotIds: [],
        clues: [],
      })),
    );

    const placed = [];
    for (const [slotIndex, entry] of assignments.entries()) {
      const slot = slots[slotIndex];
      slot.cells.forEach((cell, position) => {
        const target = grid[cell.row][cell.col];
        target.type = "letter";
        target.char = entry.answer[position];
        target.slotIds.push(slot.id);
      });

      grid[slot.clueRow][slot.clueCol].clues.push({
        slotId: slot.id,
        direction: slot.direction,
        text: entry.clue,
        answer: entry.answer,
      });

      placed.push({
        id: slot.id,
        answer: entry.answer,
        clue: entry.clue,
        hasExactClue: entry.hasExactClue,
        direction: slot.direction,
        length: slot.length,
        clueRow: slot.clueRow,
        clueCol: slot.clueCol,
        startRow: slot.cells[0].row,
        startCol: slot.cells[0].col,
        cells: slot.cells,
      });
    }

    placed.sort((a, b) => a.id - b.id);
    return { grid, placed };
  }

  function solutionScore(mask, slots, assignments, targetWords) {
    const metrics = analyzeAssignments(mask, slots, assignments);
    const missing = Math.max(0, targetWords - assignments.size);
    const extras = Math.max(0, assignments.size - targetWords);

    return {
      ...metrics,
      score:
        Math.min(assignments.size, targetWords) * 10000
        + extras * 2600
        + metrics.intersections * 260
        + metrics.exactClues * 36
        + metrics.doubles * 90
        + metrics.fillRatio * 9000
        + metrics.answerCoverage * 4500
        + metrics.clueUsage * 3000
        - metrics.blankClues * 720
        - metrics.emptyCells * 125
        - Math.max(0, metrics.components - 1) * 2600
        - missing * 13000,
    };
  }

  function fillSlots(mask, slots, entries, targetWords, random, restarts = 20) {
    const wordsByLength = new Map();
    for (const entry of entries) {
      if (!wordsByLength.has(entry.answer.length)) wordsByLength.set(entry.answer.length, []);
      wordsByLength.get(entry.answer.length).push(entry);
    }

    const supportIndex = new Map();
    for (const entry of entries) {
      for (let position = 0; position < entry.answer.length; position += 1) {
        const key = `${entry.answer.length}:${position}:${entry.answer[position]}`;
        supportIndex.set(key, (supportIndex.get(key) || 0) + 1);
      }
    }

    let best = null;
    const maxWords = Math.min(slots.length, targetWords + 18);

    for (let restart = 0; restart < restarts; restart += 1) {
      const runRandom = makeRandom(`${random()}:${restart}`);
      const assignments = new Map();
      const letters = new Map();
      const usedAnswers = new Set();
      const blocked = new Set();
      const usedClueKeys = new Set();
      const structuralClueKeys = new Set();

      while (assignments.size < maxWords) {
        let chosen = null;

        for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
          if (assignments.has(slotIndex) || blocked.has(slotIndex)) continue;
          const slot = slots[slotIndex];
          const candidates = (wordsByLength.get(slot.length) || []).filter(
            (entry) => !usedAnswers.has(entry.answer) && candidateMatches(slot, entry, letters),
          );

          if (candidates.length === 0) {
            blocked.add(slotIndex);
            continue;
          }

          const known = countKnownLetters(slot, letters);
          const newCells = slot.cells.length - known;
          const clueKey = cellKey(slot.clueRow, slot.clueCol);
          const closesBlankBarrier = structuralClueKeys.has(clueKey) && !usedClueKeys.has(clueKey);
          const makesDoubleClue = usedClueKeys.has(clueKey);
          const endBarrier = slotEndBarrierKey(mask, slot);
          const createsBlankBarrier = endBarrier && !usedClueKeys.has(endBarrier);

          const rank =
            known * 360
            + newCells * 78
            + slot.crossings.length * 11
            + (closesBlankBarrier ? 520 : 0)
            + (makesDoubleClue ? 190 : 0)
            - (createsBlankBarrier ? 34 : 0)
            - candidates.length * 0.35
            + runRandom() * 12;

          if (!chosen || rank > chosen.rank) chosen = { slotIndex, slot, candidates, rank };
        }

        if (!chosen) break;

        const ranked = chosen.candidates
          .map((entry) => ({
            entry,
            score: scoreCandidate(chosen.slot, entry, slots, assignments, supportIndex, runRandom),
          }))
          .sort((a, b) => b.score - a.score);

        const shortlist = ranked.slice(0, Math.min(5, ranked.length));
        const selected = shortlist[Math.floor(runRandom() * shortlist.length)].entry;
        assignments.set(chosen.slotIndex, selected);
        usedAnswers.add(selected.answer);
        const selectedClueKey = cellKey(chosen.slot.clueRow, chosen.slot.clueCol);
        usedClueKeys.add(selectedClueKey);
        structuralClueKeys.add(selectedClueKey);
        const selectedEndBarrier = slotEndBarrierKey(mask, chosen.slot);
        if (selectedEndBarrier) structuralClueKeys.add(selectedEndBarrier);
        chosen.slot.cells.forEach((cell, position) => {
          letters.set(cellKey(cell.row, cell.col), selected.answer[position]);
        });
      }

      const metrics = solutionScore(mask, slots, assignments, targetWords);
      const candidate = { assignments, ...metrics };
      if (!best || candidate.score > best.score) best = candidate;
    }

    return best;
  }

  function generateBest(seed, poolSize, rows, cols, targetWords, densityPercent) {
    const poolRandom = makeRandom(`${seed}:pool`);
    const pool = generateWordPool(poolSize, poolRandom);
    const availableLengths = new Set(pool.map((entry) => entry.answer.length));
    let best = null;
    const templateAttempts = 16;

    for (let attempt = 0; attempt < templateAttempts; attempt += 1) {
      const random = makeRandom(`${seed}:template:${attempt}`);
      const mask = createMask(rows, cols, random, densityPercent);
      const slots = extractSlots(mask, availableLengths);
      const potential = templatePotentialMetrics(mask, slots);

      if (slots.length < Math.max(12, Math.floor(targetWords * 0.75))) continue;
      if (potential.potentialCoverage < 0.67) continue;
      if (potential.clueCount && potential.orphanClues / potential.clueCount > 0.48) continue;

      const filled = fillSlots(mask, slots, pool, targetWords, random);
      if (!filled || filled.assignments.size < Math.max(10, Math.floor(targetWords * 0.72))) continue;

      const compact = compactSolution(mask, slots, filled.assignments);
      const rendered = buildFilledGrid(compact.mask, compact.slots, compact.assignments);
      const candidate = {
        rows: compact.mask.length,
        cols: compact.mask[0].length,
        requestedRows: rows,
        requestedCols: cols,
        pool,
        mask: compact.mask,
        slots: compact.slots,
        grid: rendered.grid,
        placed: rendered.placed,
        attempt,
        score: filled.score,
        intersections: filled.intersections,
        exactClues: filled.exactClues,
        doubles: filled.doubles,
        coverage: filled.fillRatio,
        fillRatio: filled.fillRatio,
        answerCoverage: filled.answerCoverage,
        clueUsage: filled.clueUsage,
        blankClues: filled.blankClues,
        emptyCells: filled.emptyCells,
        components: filled.components,
        offset: compact.offset,
        availableSlots: slots.length,
      };

      if (!best || candidate.score > best.score) best = candidate;
    }

    if (best) return best;

    const random = makeRandom(`${seed}:fallback`);
    const mask = createMask(rows, cols, random, densityPercent);
    const slots = extractSlots(mask, availableLengths);
    const filled = fillSlots(mask, slots, pool, targetWords, random, 28);
    const assignments = filled?.assignments || new Map();
    const compact = compactSolution(mask, slots, assignments);
    const rendered = buildFilledGrid(compact.mask, compact.slots, compact.assignments);
    const metrics = filled || solutionScore(mask, slots, assignments, targetWords);

    return {
      rows: compact.mask.length,
      cols: compact.mask[0].length,
      requestedRows: rows,
      requestedCols: cols,
      pool,
      mask: compact.mask,
      slots: compact.slots,
      grid: rendered.grid,
      placed: rendered.placed,
      attempt: 0,
      score: metrics.score || 0,
      intersections: metrics.intersections || 0,
      exactClues: metrics.exactClues || 0,
      doubles: metrics.doubles || 0,
      coverage: metrics.fillRatio || 0,
      fillRatio: metrics.fillRatio || 0,
      answerCoverage: metrics.answerCoverage || 0,
      clueUsage: metrics.clueUsage || 0,
      blankClues: metrics.blankClues || 0,
      emptyCells: metrics.emptyCells || 0,
      components: metrics.components || 0,
      offset: compact.offset,
      availableSlots: slots.length,
    };
  }

  window.ScanwordSolver = { generateBest, fillSlots, solutionScore, buildFilledGrid };
})();
