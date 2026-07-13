(() => {
  "use strict";

  const { DIRECTIONS, makeRandom, generateWordPool } = window.ScanwordCore;

  function createState(rows, cols) {
    return {
      rows,
      cols,
      grid: Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => ({
          type: "panel",
          char: null,
          slotIds: [],
          directions: [],
          clues: [],
        })),
      ),
      placed: [],
      usedAnswers: new Set(),
      componentsStarted: 0,
    };
  }

  function inBounds(state, row, col) {
    return row >= 0 && row < state.rows && col >= 0 && col < state.cols;
  }

  function clueCoordinates(startRow, startCol, direction) {
    const { dr, dc } = DIRECTIONS[direction];
    return { row: startRow - dr, col: startCol - dc };
  }

  function validatePlacement(state, entry, startRow, startCol, direction, requireIntersection = true) {
    const { dr, dc } = DIRECTIONS[direction];
    const answer = entry.answer;
    const clue = clueCoordinates(startRow, startCol, direction);
    if (!inBounds(state, clue.row, clue.col)) return null;

    const clueCell = state.grid[clue.row][clue.col];
    if (clueCell.type === "letter") return null;
    if (clueCell.clues.some((item) => item.direction === direction)) return null;
    if (clueCell.clues.length >= 2) return null;

    const endRow = startRow + dr * (answer.length - 1);
    const endCol = startCol + dc * (answer.length - 1);
    if (!inBounds(state, startRow, startCol) || !inBounds(state, endRow, endCol)) return null;

    const afterRow = endRow + dr;
    const afterCol = endCol + dc;
    if (inBounds(state, afterRow, afterCol) && state.grid[afterRow][afterCol].type === "letter") return null;

    let intersections = 0;
    let newCells = 0;
    let futureHooks = 0;

    for (let index = 0; index < answer.length; index += 1) {
      const row = startRow + dr * index;
      const col = startCol + dc * index;
      const cell = state.grid[row][col];
      const char = answer[index];

      if (cell.type === "clue") return null;
      if (cell.type === "letter") {
        if (cell.char !== char) return null;
        if (cell.directions.includes(direction)) return null;
        intersections += 1;
      } else {
        newCells += 1;
        const sides = direction === "right"
          ? [{ row: row - 1, col }, { row: row + 1, col }]
          : [{ row, col: col - 1 }, { row, col: col + 1 }];
        for (const side of sides) {
          if (inBounds(state, side.row, side.col) && state.grid[side.row][side.col].type === "letter") return null;
        }
        if (index > 0 && index < answer.length - 1) futureHooks += 1;
      }
    }

    if (requireIntersection && intersections === 0) return null;

    const centerRow = startRow + dr * ((answer.length - 1) / 2);
    const centerCol = startCol + dc * ((answer.length - 1) / 2);
    const distance = Math.abs(centerRow - (state.rows - 1) / 2) + Math.abs(centerCol - (state.cols - 1) / 2);
    const dualClueBonus = clueCell.clues.length === 1 ? 42 : 0;
    const exactClueBonus = entry.hasExactClue ? 18 : 0;
    const score = intersections * 220 + futureHooks * 1.2 + dualClueBonus + exactClueBonus - distance * 0.9;

    return { startRow, startCol, direction, clue, intersections, newCells, score };
  }

  function commitPlacement(state, entry, placement) {
    const id = state.placed.length + 1;
    const { dr, dc } = DIRECTIONS[placement.direction];
    const cells = [];

    const clueCell = state.grid[placement.clue.row][placement.clue.col];
    clueCell.type = "clue";
    clueCell.clues.push({
      slotId: id,
      direction: placement.direction,
      text: entry.clue,
      answer: entry.answer,
    });

    for (let index = 0; index < entry.answer.length; index += 1) {
      const row = placement.startRow + dr * index;
      const col = placement.startCol + dc * index;
      const cell = state.grid[row][col];
      if (cell.type !== "letter") {
        cell.type = "letter";
        cell.char = entry.answer[index];
      }
      cell.slotIds.push(id);
      cell.directions.push(placement.direction);
      cells.push({ row, col });
    }

    state.placed.push({
      id,
      answer: entry.answer,
      clue: entry.clue,
      hasExactClue: entry.hasExactClue,
      direction: placement.direction,
      length: entry.answer.length,
      clueRow: placement.clue.row,
      clueCol: placement.clue.col,
      startRow: placement.startRow,
      startCol: placement.startCol,
      cells,
      intersections: placement.intersections,
    });
    state.usedAnswers.add(entry.answer);
  }

  function placeInitialWord(state, entry, random) {
    const options = [];
    for (const direction of ["right", "down"]) {
      const startRow = direction === "right"
        ? Math.floor(state.rows / 2)
        : Math.max(1, Math.floor((state.rows - entry.answer.length) / 2));
      const startCol = direction === "right"
        ? Math.max(1, Math.floor((state.cols - entry.answer.length) / 2))
        : Math.floor(state.cols / 2);
      const placement = validatePlacement(state, entry, startRow, startCol, direction, false);
      if (placement) options.push(placement);
    }
    if (!options.length) return false;
    commitPlacement(state, entry, options[Math.floor(random() * options.length)]);
    state.componentsStarted += 1;
    return true;
  }

  function buildLetterIndex(state) {
    const result = new Map();
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.grid[row][col];
        if (cell.type !== "letter") continue;
        if (!result.has(cell.char)) result.set(cell.char, []);
        result.get(cell.char).push({ row, col });
      }
    }
    return result;
  }

  function insertTopCandidate(top, candidate, limit = 96) {
    let index = top.findIndex((item) => candidate.score > item.score);
    if (index < 0) index = top.length;
    top.splice(index, 0, candidate);
    if (top.length > limit) top.length = limit;
  }

  function findCrossingCandidates(state, pool, random, sampleLimit) {
    const letterIndex = buildLetterIndex(state);
    const words = pool.filter((entry) => !state.usedAnswers.has(entry.answer));
    for (let index = words.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [words[index], words[other]] = [words[other], words[index]];
    }

    const top = [];
    const limit = Math.min(sampleLimit, words.length);
    for (let wordIndex = 0; wordIndex < limit; wordIndex += 1) {
      const entry = words[wordIndex];
      for (let charIndex = 0; charIndex < entry.answer.length; charIndex += 1) {
        const matches = letterIndex.get(entry.answer[charIndex]) || [];
        for (const match of matches) {
          for (const direction of ["right", "down"]) {
            const { dr, dc } = DIRECTIONS[direction];
            const startRow = match.row - dr * charIndex;
            const startCol = match.col - dc * charIndex;
            const placement = validatePlacement(state, entry, startRow, startCol, direction, true);
            if (!placement) continue;
            insertTopCandidate(top, { entry, placement, score: placement.score + random() * 5 });
          }
        }
      }
    }
    return top;
  }

  function findSeedCandidates(state, pool, random, sampleLimit) {
    const unused = pool.filter((entry) => !state.usedAnswers.has(entry.answer));
    for (let index = unused.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [unused[index], unused[other]] = [unused[other], unused[index]];
    }

    const top = [];
    for (const entry of unused.slice(0, sampleLimit)) {
      for (const direction of ["right", "down"]) {
        for (let row = 0; row < state.rows; row += 1) {
          for (let col = 0; col < state.cols; col += 1) {
            const placement = validatePlacement(state, entry, row, col, direction, false);
            if (!placement || placement.intersections !== 0) continue;
            const centerRow = row + (direction === "down" ? (entry.answer.length - 1) / 2 : 0);
            const centerCol = col + (direction === "right" ? (entry.answer.length - 1) / 2 : 0);
            const edgeSpread = Math.abs(centerRow - (state.rows - 1) / 2) + Math.abs(centerCol - (state.cols - 1) / 2);
            const seedScore = placement.score + placement.newCells * 14 + edgeSpread * 1.5 + random() * 5;
            insertTopCandidate(top, { entry, placement, score: seedScore }, 32);
          }
        }
      }
    }
    return top;
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

  function countComponents(placed) {
    if (!placed.length) return 0;
    const byCell = new Map();
    for (let index = 0; index < placed.length; index += 1) {
      for (const cell of placed[index].cells) {
        const key = `${cell.row}:${cell.col}`;
        if (!byCell.has(key)) byCell.set(key, []);
        byCell.get(key).push(index);
      }
    }
    const graph = Array.from({ length: placed.length }, () => new Set());
    for (const refs of byCell.values()) {
      if (refs.length < 2) continue;
      for (const a of refs) for (const b of refs) if (a !== b) graph[a].add(b);
    }
    const seen = new Set();
    let components = 0;
    for (let start = 0; start < placed.length; start += 1) {
      if (seen.has(start)) continue;
      components += 1;
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const current = stack.pop();
        for (const next of graph[current]) {
          if (seen.has(next)) continue;
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return components;
  }

  function assignClueTextCells(state) {
    const items = [];
    const offsetsByDirection = {
      right: [[0, -1], [-1, 0], [1, 0], [0, 1]],
      down: [[0, -1], [0, 1], [-1, 0], [1, 0]],
    };

    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.grid[row][col];
        if (cell.type !== "clue") continue;
        for (let clueIndex = 0; clueIndex < cell.clues.length; clueIndex += 1) {
          const clue = cell.clues[clueIndex];
          const candidates = [];
          for (const [dr, dc] of offsetsByDirection[clue.direction] || offsetsByDirection.right) {
            const nextRow = row + dr;
            const nextCol = col + dc;
            if (!inBounds(state, nextRow, nextCol)) continue;
            if (state.grid[nextRow][nextCol].type !== "panel") continue;
            candidates.push({ row: nextRow, col: nextCol, key: `${nextRow}:${nextCol}` });
          }
          items.push({ row, col, clueIndex, clue, candidates });
        }
      }
    }

    items.sort((a, b) => a.candidates.length - b.candidates.length || a.clue.slotId - b.clue.slotId);
    const ownerByCell = new Map();
    const assignedCellByItem = new Map();

    function tryAssign(itemIndex, visited) {
      const item = items[itemIndex];
      for (const candidate of item.candidates) {
        if (visited.has(candidate.key)) continue;
        visited.add(candidate.key);
        const previous = ownerByCell.get(candidate.key);
        if (previous === undefined || tryAssign(previous, visited)) {
          ownerByCell.set(candidate.key, itemIndex);
          assignedCellByItem.set(itemIndex, candidate);
          return true;
        }
      }
      return false;
    }

    for (let index = 0; index < items.length; index += 1) tryAssign(index, new Set());

    let externalClueTexts = 0;
    for (const [itemIndex, target] of assignedCellByItem.entries()) {
      const item = items[itemIndex];
      const arrowCell = state.grid[item.row][item.col];
      const clue = arrowCell.clues[item.clueIndex];
      clue.textRow = target.row;
      clue.textCol = target.col;
      clue.externalText = true;
      state.grid[target.row][target.col] = {
        type: "clueText",
        char: null,
        slotIds: [clue.slotId],
        directions: [],
        clues: [{ ...clue, arrowRow: item.row, arrowCol: item.col }],
      };
      externalClueTexts += 1;
    }
    return externalClueTexts;
  }

  function panelTopology(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    const seen = new Set();
    let regions = 0;
    let isolated = 0;
    let largest = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (grid[row][col].type !== "panel") continue;
        const key = `${row}:${col}`;
        if (seen.has(key)) continue;
        regions += 1;
        seen.add(key);
        const stack = [[row, col]];
        let size = 0;
        while (stack.length) {
          const [currentRow, currentCol] = stack.pop();
          size += 1;
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nextRow = currentRow + dr;
            const nextCol = currentCol + dc;
            if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) continue;
            if (grid[nextRow][nextCol].type !== "panel") continue;
            const nextKey = `${nextRow}:${nextCol}`;
            if (seen.has(nextKey)) continue;
            seen.add(nextKey);
            stack.push([nextRow, nextCol]);
          }
        }
        if (size === 1) isolated += 1;
        largest = Math.max(largest, size);
      }
    }
    return { regions, isolated, largest };
  }

  function resultMetrics(state) {
    const total = state.rows * state.cols;
    const letterCells = state.grid.flat().filter((cell) => cell.type === "letter").length;
    const clueCells = state.grid.flat().filter((cell) => cell.type === "clue").length;
    const clueTextCells = state.grid.flat().filter((cell) => cell.type === "clueText").length;
    const panelCells = total - letterCells - clueCells - clueTextCells;
    const intersections = state.grid.flat().filter((cell) => cell.type === "letter" && cell.slotIds.length === 2).length;
    const doubles = state.grid.flat().filter((cell) => cell.type === "clue" && cell.clues.length === 2).length;
    const components = countComponents(state.placed);
    const validation = validateGrid(state.grid, state.placed);
    const fillRatio = (letterCells + clueCells + clueTextCells) / total;
    const panels = panelTopology(state.grid);
    const score = state.placed.length * 12000 + intersections * 320 + fillRatio * 9000 + doubles * 90
      - Math.max(0, components - 1) * 2400 - panels.regions * 180 - panels.isolated * 220;
    return { letterCells, clueCells, clueTextCells, panelCells, intersections, doubles, components, fillRatio, validation, panelRegions: panels.regions, isolatedPanels: panels.isolated, largestPanelRegion: panels.largest, score };
  }

  function buildAttempt(pool, rows, cols, targetWords, random) {
    const state = createState(rows, cols);
    const initialCandidates = pool.filter((entry) => entry.answer.length >= 5 && entry.answer.length <= 8);
    const first = initialCandidates[Math.floor(random() * initialCandidates.length)] || pool[0];
    if (!first || !placeInitialWord(state, first, random)) return state;

    const maxComponents = 3;
    let stalled = 0;
    while (state.placed.length < targetWords && stalled < 8) {
      let candidates = findCrossingCandidates(state, pool, random, Math.min(700, pool.length));
      let seeded = false;
      if (!candidates.length && state.componentsStarted < maxComponents) {
        candidates = findSeedCandidates(state, pool, random, Math.min(320, pool.length));
        seeded = candidates.length > 0;
      }
      if (!candidates.length) { stalled += 1; continue; }
      const remaining = targetWords - state.placed.length;
      if (!seeded) {
        const penalty = remaining <= 5 ? 6 : 3;
        candidates.sort((a, b) => (b.score - penalty * b.placement.newCells) - (a.score - penalty * a.placement.newCells));
      }
      const shortlistSize = seeded ? 5 : (remaining <= 5 ? 1 : 4);
      const shortlist = candidates.slice(0, Math.min(shortlistSize, candidates.length));
      const selected = shortlist[Math.floor(random() * shortlist.length)];
      commitPlacement(state, selected.entry, selected.placement);
      if (seeded) state.componentsStarted += 1;
      stalled = 0;
    }

    if (state.placed.length >= targetWords) {
      let denseStalled = 0;
      const denseLimit = 65;
      while (state.placed.length < denseLimit && denseStalled < 6) {
        let candidates = findCrossingCandidates(state, pool, random, Math.min(700, pool.length));
        let seeded = false;
        if (!candidates.length && state.componentsStarted < maxComponents) {
          candidates = findSeedCandidates(state, pool, random, Math.min(320, pool.length));
          seeded = candidates.length > 0;
        }
        if (!candidates.length) { denseStalled += 1; continue; }
        if (!seeded) {
          candidates.sort((a, b) => (b.score + 4 * b.placement.newCells) - (a.score + 4 * a.placement.newCells));
        }
        const shortlist = candidates.slice(0, Math.min(seeded ? 4 : 5, candidates.length));
        const selected = shortlist[Math.floor(random() * shortlist.length)];
        commitPlacement(state, selected.entry, selected.placement);
        if (seeded) state.componentsStarted += 1;
        denseStalled = 0;
      }
    }
    return state;
  }

  function generateBest(seed, poolSize, rows, cols, targetWords) {
    const pool = generateWordPool(poolSize, makeRandom(`${seed}:pool`));
    if (!pool.length) throw new Error("The word pool is empty.");

    let best = null;
    const attempts = 12;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const state = buildAttempt(pool, rows, cols, targetWords, makeRandom(`${seed}:placement:${attempt}`));
      const externalClueTexts = assignClueTextCells(state);
      const metrics = resultMetrics(state);
      if (!metrics.validation.valid) continue;
      const candidate = {
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
        fillRatio: metrics.fillRatio,
        answerCoverage: metrics.fillRatio,
        clueUsage: 1,
        blankClues: 0,
        panelCells: metrics.panelCells,
        panelRatio: metrics.panelCells / (rows * cols),
        emptyCells: 0,
        components: metrics.components,
        externalClueTexts,
        clueTextCells: metrics.clueTextCells,
        panelRegions: metrics.panelRegions,
        isolatedPanels: metrics.isolatedPanels,
        largestPanelRegion: metrics.largestPanelRegion,
        validation: metrics.validation,
        availableSlots: state.placed.length,
        mode: "strict-placement",
      };
      if (!best || candidate.score > best.score) best = candidate;
    }

    if (!best) throw new Error("Unable to build a structurally valid arrowword for this seed and grid size.");
    return best;
  }

  window.ScanwordSolver = { generateBest, validateGrid, buildAttempt, resultMetrics };
})();
