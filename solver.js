(() => {
  "use strict";

  const {
    makeRandom,
    generateWordPool,
    createMask,
    extractSlots,
    cellKey,
    analyzeAssignments,
    compactSolution,
    templatePotentialMetrics,
  } = window.ScanwordCore;

  function candidateMatches(slot, entry, letters) {
    return slot.cells.every((cell, index) => {
      const known = letters.get(cellKey(cell.row, cell.col));
      return !known || known === entry.answer[index];
    });
  }

  function countKnownLetters(slot, letters) {
    return slot.cells.reduce((count, cell) => count + (letters.has(cellKey(cell.row, cell.col)) ? 1 : 0), 0);
  }

  function buildSupportIndex(entries) {
    const index = new Map();
    for (const entry of entries) {
      for (let position = 0; position < entry.answer.length; position += 1) {
        const key = `${entry.answer.length}:${position}:${entry.answer[position]}`;
        index.set(key, (index.get(key) || 0) + 1);
      }
    }
    return index;
  }

  function wouldCreateAccidentalRun(slot, assignments, touchedPositions) {
    for (const crossing of slot.crossings) {
      if (assignments.has(crossing.slotIndex)) continue;
      const positions = touchedPositions.get(crossing.slotIndex);
      if (!positions) continue;
      if (positions.has(crossing.otherPosition - 1) || positions.has(crossing.otherPosition + 1)) return true;
    }
    return false;
  }

  function registerCrossingTouches(slot, assignments, touchedPositions) {
    for (const crossing of slot.crossings) {
      if (assignments.has(crossing.slotIndex)) continue;
      if (!touchedPositions.has(crossing.slotIndex)) touchedPositions.set(crossing.slotIndex, new Set());
      touchedPositions.get(crossing.slotIndex).add(crossing.otherPosition);
    }
  }

  function scoreCandidate(slot, entry, slots, assignments, supportIndex, random) {
    let score = entry.hasExactClue ? 95 : 0;
    score += new Set(entry.answer).size * 0.5;
    for (const crossing of slot.crossings) {
      if (assignments.has(crossing.slotIndex)) continue;
      const other = slots[crossing.slotIndex];
      const required = entry.answer[crossing.ownPosition];
      const support = supportIndex.get(`${other.length}:${crossing.otherPosition}:${required}`) || 0;
      score += Math.min(20, support) * 0.95;
    }
    return score + random() * 2.5;
  }

  function buildFilledGrid(mask, slots, assignments) {
    const rows = mask.length;
    const cols = mask[0].length;
    const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({
      type: "panel",
      char: null,
      slotIds: [],
      clues: [],
    })));

    const placed = [];
    for (const [slotIndex, entry] of assignments.entries()) {
      const slot = slots[slotIndex];
      if (!slot) continue;
      slot.cells.forEach((cell, position) => {
        const target = grid[cell.row][cell.col];
        target.type = "letter";
        target.char = entry.answer[position];
        target.slotIds.push(slot.id);
      });
      const clueCell = grid[slot.clueRow][slot.clueCol];
      clueCell.type = "clue";
      clueCell.clues.push({
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

  function findLetterRuns(grid, direction) {
    const rows = grid.length;
    const cols = grid[0].length;
    const runs = [];
    if (direction === "right") {
      for (let row = 0; row < rows; row += 1) {
        let col = 0;
        while (col < cols) {
          if (grid[row][col].type !== "letter") { col += 1; continue; }
          const cells = [];
          while (col < cols && grid[row][col].type === "letter") {
            cells.push({ row, col });
            col += 1;
          }
          if (cells.length >= 2) runs.push(cells);
        }
      }
    } else {
      for (let col = 0; col < cols; col += 1) {
        let row = 0;
        while (row < rows) {
          if (grid[row][col].type !== "letter") { row += 1; continue; }
          const cells = [];
          while (row < rows && grid[row][col].type === "letter") {
            cells.push({ row, col });
            row += 1;
          }
          if (cells.length >= 2) runs.push(cells);
        }
      }
    }
    return runs;
  }

  function runSignature(direction, cells) {
    return `${direction}:${cells.map((cell) => `${cell.row},${cell.col}`).join(";")}`;
  }

  function validateGrid(grid, placed) {
    const assignedRuns = new Set(placed.map((word) => runSignature(word.direction, word.cells)));
    const accidentalRuns = [];
    for (const direction of ["right", "down"]) {
      for (const cells of findLetterRuns(grid, direction)) {
        if (!assignedRuns.has(runSignature(direction, cells))) accidentalRuns.push({ direction, cells });
      }
    }

    let conflicts = 0;
    let orphanLetters = 0;
    let clueDirectionConflicts = 0;
    for (const row of grid) {
      for (const cell of row) {
        if (cell.type === "letter" && (!cell.char || cell.slotIds.length === 0)) orphanLetters += 1;
        if (cell.type === "letter" && cell.slotIds.length > 2) conflicts += 1;
        if (cell.type === "clue") {
          const directions = new Set(cell.clues.map((clue) => clue.direction));
          if (cell.clues.length > 2 || directions.size !== cell.clues.length) clueDirectionConflicts += 1;
        }
      }
    }

    return {
      valid: accidentalRuns.length === 0 && conflicts === 0 && orphanLetters === 0 && clueDirectionConflicts === 0,
      accidentalRuns,
      conflicts,
      orphanLetters,
      clueDirectionConflicts,
    };
  }

  function solutionScore(mask, slots, assignments, targetWords) {
    const metrics = analyzeAssignments(mask, slots, assignments);
    const missing = Math.max(0, targetWords - assignments.size);
    const extras = Math.max(0, assignments.size - targetWords);
    return {
      ...metrics,
      score:
        Math.min(assignments.size, targetWords) * 11000
        + extras * 1800
        + metrics.intersections * 320
        + metrics.exactClues * 48
        + metrics.doubles * 110
        + metrics.fillRatio * 7000
        + metrics.answerCoverage * 3000
        + metrics.clueUsage * 2500
        - metrics.blankClues * 260
        - metrics.emptyCells * 75
        - Math.max(0, metrics.components - 1) * 5000
        - missing * 15000,
    };
  }

  function fillSlots(mask, slots, entries, targetWords, random, restarts = 28) {
    const wordsByLength = new Map();
    for (const entry of entries) {
      if (!wordsByLength.has(entry.answer.length)) wordsByLength.set(entry.answer.length, []);
      wordsByLength.get(entry.answer.length).push(entry);
    }
    const supportIndex = buildSupportIndex(entries);
    let best = null;
    const maxWords = Math.min(slots.length, targetWords + 16);

    for (let restart = 0; restart < restarts; restart += 1) {
      const runRandom = makeRandom(`${random()}:${restart}`);
      const assignments = new Map();
      const letters = new Map();
      const usedAnswers = new Set();
      const blocked = new Set();
      const touchedPositions = new Map();

      while (assignments.size < maxWords) {
        let chosen = null;
        for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
          if (assignments.has(slotIndex) || blocked.has(slotIndex)) continue;
          const slot = slots[slotIndex];
          if (wouldCreateAccidentalRun(slot, assignments, touchedPositions)) {
            blocked.add(slotIndex);
            continue;
          }
          const candidates = (wordsByLength.get(slot.length) || []).filter(
            (entry) => !usedAnswers.has(entry.answer) && candidateMatches(slot, entry, letters),
          );
          if (candidates.length === 0) {
            blocked.add(slotIndex);
            continue;
          }
          const known = countKnownLetters(slot, letters);
          const rank = known * 470 + (slot.length - known) * 64 + slot.crossings.length * 10 - candidates.length * 0.3 + runRandom() * 10;
          if (!chosen || rank > chosen.rank) chosen = { slotIndex, slot, candidates, rank };
        }
        if (!chosen) break;

        const ranked = chosen.candidates
          .map((entry) => ({ entry, score: scoreCandidate(chosen.slot, entry, slots, assignments, supportIndex, runRandom) }))
          .sort((a, b) => b.score - a.score);
        const shortlist = ranked.slice(0, Math.min(4, ranked.length));
        const selected = shortlist[Math.floor(runRandom() * shortlist.length)].entry;
        assignments.set(chosen.slotIndex, selected);
        usedAnswers.add(selected.answer);
        touchedPositions.delete(chosen.slotIndex);
        chosen.slot.cells.forEach((cell, position) => letters.set(cellKey(cell.row, cell.col), selected.answer[position]));
        registerCrossingTouches(chosen.slot, assignments, touchedPositions);
      }

      const compact = compactSolution(mask, slots, assignments);
      const rendered = buildFilledGrid(compact.mask, compact.slots, compact.assignments);
      const validation = validateGrid(rendered.grid, rendered.placed);
      if (!validation.valid) continue;
      const metrics = solutionScore(mask, slots, assignments, targetWords);
      const panelCells = rendered.grid.flat().filter((cell) => cell.type === "panel").length;
      const panelRatio = panelCells / Math.max(1, rendered.grid.length * rendered.grid[0].length);
      const candidate = {
        assignments,
        compact,
        rendered,
        validation,
        panelCells,
        panelRatio,
        ...metrics,
        score: metrics.score - panelRatio * 7500,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
    return best;
  }

  function generateBest(seed, poolSize, rows, cols, targetWords, densityPercent) {
    const pool = generateWordPool(poolSize, makeRandom(`${seed}:pool`));
    const availableLengths = new Set(pool.map((entry) => entry.answer.length));
    let best = null;
    const templateAttempts = 32;

    for (let attempt = 0; attempt < templateAttempts; attempt += 1) {
      const random = makeRandom(`${seed}:template:${attempt}`);
      const mask = createMask(rows, cols, random, densityPercent);
      const slots = extractSlots(mask, availableLengths);
      const potential = templatePotentialMetrics(mask, slots);
      if (slots.length < Math.max(14, Math.floor(targetWords * 0.72))) continue;
      if (potential.potentialCoverage < 0.58) continue;

      const filled = fillSlots(mask, slots, pool, targetWords, random);
      if (!filled || filled.assignments.size < Math.max(12, Math.floor(targetWords * 0.7))) continue;
      const compact = filled.compact;
      const rendered = filled.rendered;
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
        fillRatio: 1 - filled.panelRatio,
        answerCoverage: filled.answerCoverage,
        clueUsage: 1,
        blankClues: 0,
        panelCells: filled.panelCells,
        panelRatio: filled.panelRatio,
        emptyCells: 0,
        components: filled.components,
        validation: filled.validation,
        offset: compact.offset,
        availableSlots: slots.length,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }

    if (best) return best;
    throw new Error("Unable to build a structurally valid arrowword for this seed and grid size.");
  }

  window.ScanwordSolver = { generateBest, fillSlots, solutionScore, buildFilledGrid, validateGrid };
})();