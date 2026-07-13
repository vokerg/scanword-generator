(() => {
  "use strict";

  const DIRECTIONS = {
    right: { dr: 0, dc: 1, arrow: "→", label: "вправо" },
    down: { dr: 1, dc: 0, arrow: "↓", label: "вниз" },
  };

  function xmur3(value) {
    let h = 1779033703 ^ value.length;
    for (let i = 0; i < value.length; i += 1) {
      h = Math.imul(h ^ value.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  function mulberry32(seed) {
    return () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRandom(seedText) {
    return mulberry32(xmur3(seedText)());
  }

  function randomInt(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
  }

  function shuffle(items, random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function normalizeWord(value) {
    return String(value).trim().toUpperCase().replaceAll("Ё", "Е");
  }

  function generateWordPool(count, random) {
    const source = Array.isArray(window.RUSSIAN_WORDS) ? window.RUSSIAN_WORDS : [];
    const clues = window.RUSSIAN_CLUES || {};
    const unique = [];
    const seen = new Set();

    for (const rawWord of source) {
      const answer = normalizeWord(rawWord);
      if (!/^[А-Я]+$/.test(answer) || answer.length < 2 || answer.length > 12 || seen.has(answer)) continue;

      seen.add(answer);
      const key = String(rawWord).trim().toLowerCase().replaceAll("ё", "е");
      const exactClue = clues[key];
      unique.push({
        id: unique.length + 1,
        answer,
        clue: exactClue || `Ответ из ${answer.length} букв`,
        hasExactClue: Boolean(exactClue),
      });
    }

    const exact = shuffle(unique.filter((entry) => entry.hasExactClue), random);
    const fallback = shuffle(unique.filter((entry) => !entry.hasExactClue), random);
    return [...exact, ...fallback].slice(0, Math.min(count, unique.length));
  }

  function createMask(rows, cols, random, densityPercent) {
    const mask = Array.from({ length: rows }, () => Array(cols).fill(false));
    const density = Math.max(0.16, Math.min(0.34, densityPercent / 100));
    const averageGap = Math.max(3, Math.min(7, Math.round(1 / density) - 1));

    for (let row = 0; row < rows; row += 1) {
      let col = row === 0 || random() < 0.56 ? 0 : randomInt(random, 1, Math.min(3, cols - 1));
      while (col < cols) {
        mask[row][col] = true;
        col += randomInt(random, Math.max(4, averageGap), Math.min(8, averageGap + 3));
      }

      const lastClue = mask[row].lastIndexOf(true);
      if (lastClue >= 0 && cols - lastClue - 1 > 10) {
        mask[row][lastClue + randomInt(random, 5, 8)] = true;
      }
    }

    for (let col = 0; col < cols; col += 1) {
      if (!mask[0][col] && random() < 0.3) mask[0][col] = true;
    }

    for (let row = 0; row < rows - 1; row += 1) {
      for (let col = 0; col < cols - 1; col += 1) {
        if (mask[row][col] && mask[row + 1][col] && mask[row][col + 1] && mask[row + 1][col + 1]) {
          const choices = [[row, col], [row + 1, col], [row, col + 1], [row + 1, col + 1]];
          const [clearRow, clearCol] = choices[randomInt(random, 0, choices.length - 1)];
          mask[clearRow][clearCol] = false;
        }
      }
    }

    return mask;
  }

  function slotCells(mask, clueRow, clueCol, direction) {
    const rows = mask.length;
    const cols = mask[0].length;
    const { dr, dc } = DIRECTIONS[direction];
    const cells = [];
    let row = clueRow + dr;
    let col = clueCol + dc;

    while (row >= 0 && row < rows && col >= 0 && col < cols && !mask[row][col]) {
      cells.push({ row, col });
      row += dr;
      col += dc;
    }
    return cells;
  }

  function extractSlots(mask, availableLengths) {
    const rows = mask.length;
    const cols = mask[0].length;
    const slots = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!mask[row][col]) continue;
        for (const direction of ["right", "down"]) {
          const cells = slotCells(mask, row, col, direction);
          if (cells.length < 3 || cells.length > 12 || !availableLengths.has(cells.length)) continue;
          slots.push({
            id: slots.length + 1,
            clueRow: row,
            clueCol: col,
            direction,
            cells,
            length: cells.length,
            crossings: [],
          });
        }
      }
    }

    const usage = new Map();
    slots.forEach((slot, slotIndex) => {
      slot.cells.forEach((cell, position) => {
        const key = `${cell.row}:${cell.col}`;
        if (!usage.has(key)) usage.set(key, []);
        usage.get(key).push({ slotIndex, position });
      });
    });

    for (const refs of usage.values()) {
      if (refs.length < 2) continue;
      for (const ref of refs) {
        for (const other of refs) {
          if (ref.slotIndex === other.slotIndex) continue;
          slots[ref.slotIndex].crossings.push({
            slotIndex: other.slotIndex,
            ownPosition: ref.position,
            otherPosition: other.position,
          });
        }
      }
    }

    return slots;
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function slotEndBarrierKey(mask, slot) {
    const { dr, dc } = DIRECTIONS[slot.direction];
    const last = slot.cells[slot.cells.length - 1];
    const row = last.row + dr;
    const col = last.col + dc;
    if (row < 0 || row >= mask.length || col < 0 || col >= mask[0].length || !mask[row][col]) return null;
    return cellKey(row, col);
  }

  function connectedComponentCount(keys) {
    if (!keys.size) return 0;
    const remaining = new Set(keys);
    let components = 0;

    while (remaining.size) {
      components += 1;
      const start = remaining.values().next().value;
      remaining.delete(start);
      const queue = [start];

      while (queue.length) {
        const current = queue.pop();
        const [row, col] = current.split(":").map(Number);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const next = cellKey(row + dr, col + dc);
          if (!remaining.has(next)) continue;
          remaining.delete(next);
          queue.push(next);
        }
      }
    }

    return components;
  }

  function analyzeAssignments(mask, slots, assignments) {
    const occupiedCounts = new Map();
    const usedClueKeys = new Set();
    const structuralClueKeys = new Set();
    let exactClues = 0;

    for (const [slotIndex, entry] of assignments.entries()) {
      const slot = slots[slotIndex];
      if (!slot) continue;
      if (entry.hasExactClue) exactClues += 1;

      const clueKey = cellKey(slot.clueRow, slot.clueCol);
      usedClueKeys.add(clueKey);
      structuralClueKeys.add(clueKey);

      const endBarrier = slotEndBarrierKey(mask, slot);
      if (endBarrier) structuralClueKeys.add(endBarrier);

      for (const cell of slot.cells) {
        const key = cellKey(cell.row, cell.col);
        occupiedCounts.set(key, (occupiedCounts.get(key) || 0) + 1);
      }
    }

    const occupiedKeys = new Set(occupiedCounts.keys());
    const visibleKeys = new Set([...occupiedKeys, ...structuralClueKeys]);
    const intersections = [...occupiedCounts.values()].filter((count) => count > 1).length;

    const clueDirections = new Map();
    for (const slotIndex of assignments.keys()) {
      const slot = slots[slotIndex];
      const key = cellKey(slot.clueRow, slot.clueCol);
      if (!clueDirections.has(key)) clueDirections.set(key, new Set());
      clueDirections.get(key).add(slot.direction);
    }
    const doubles = [...clueDirections.values()].filter((directions) => directions.size > 1).length;

    let minRow = 0;
    let maxRow = mask.length - 1;
    let minCol = 0;
    let maxCol = mask[0].length - 1;

    if (visibleKeys.size) {
      const coordinates = [...visibleKeys].map((key) => key.split(":").map(Number));
      minRow = Math.min(...coordinates.map(([row]) => row));
      maxRow = Math.max(...coordinates.map(([row]) => row));
      minCol = Math.min(...coordinates.map(([, col]) => col));
      maxCol = Math.max(...coordinates.map(([, col]) => col));
    }

    const rows = maxRow - minRow + 1;
    const cols = maxCol - minCol + 1;
    const area = rows * cols;
    const visibleCells = visibleKeys.size;
    const answerArea = Math.max(1, area - structuralClueKeys.size);
    const emptyCells = Math.max(0, area - visibleCells);
    const blankClues = [...structuralClueKeys].filter((key) => !usedClueKeys.has(key)).length;
    const components = connectedComponentCount(visibleKeys);

    return {
      occupiedCounts,
      occupiedKeys,
      usedClueKeys,
      structuralClueKeys,
      visibleKeys,
      exactClues,
      intersections,
      doubles,
      blankClues,
      components,
      minRow,
      maxRow,
      minCol,
      maxCol,
      rows,
      cols,
      area,
      emptyCells,
      fillRatio: area ? visibleCells / area : 0,
      answerCoverage: occupiedKeys.size / answerArea,
      clueUsage: structuralClueKeys.size ? usedClueKeys.size / structuralClueKeys.size : 0,
    };
  }

  function compactSolution(mask, slots, assignments) {
    const metrics = analyzeAssignments(mask, slots, assignments);
    if (!assignments.size) return { mask, slots: [], assignments: new Map(), metrics, offset: { row: 0, col: 0 } };

    const compactMask = Array.from({ length: metrics.rows }, () => Array(metrics.cols).fill(false));
    for (const key of metrics.structuralClueKeys) {
      const [row, col] = key.split(":").map(Number);
      compactMask[row - metrics.minRow][col - metrics.minCol] = true;
    }

    const compactSlots = [];
    const compactAssignments = new Map();
    const ordered = [...assignments.entries()].sort((a, b) => slots[a[0]].id - slots[b[0]].id);

    ordered.forEach(([slotIndex, entry], newIndex) => {
      const slot = slots[slotIndex];
      compactSlots.push({
        ...slot,
        id: newIndex + 1,
        clueRow: slot.clueRow - metrics.minRow,
        clueCol: slot.clueCol - metrics.minCol,
        cells: slot.cells.map((cell) => ({
          row: cell.row - metrics.minRow,
          col: cell.col - metrics.minCol,
        })),
        crossings: [],
      });
      compactAssignments.set(newIndex, entry);
    });

    return {
      mask: compactMask,
      slots: compactSlots,
      assignments: compactAssignments,
      metrics,
      offset: { row: metrics.minRow, col: metrics.minCol },
    };
  }

  function templatePotentialMetrics(mask, slots) {
    const clueCount = mask.flat().filter(Boolean).length;
    const usefulClues = new Set();
    const potentialLetters = new Set();
    for (const slot of slots) {
      usefulClues.add(cellKey(slot.clueRow, slot.clueCol));
      slot.cells.forEach((cell) => potentialLetters.add(cellKey(cell.row, cell.col)));
    }
    const area = mask.length * mask[0].length;
    return {
      clueCount,
      orphanClues: Math.max(0, clueCount - usefulClues.size),
      potentialCoverage: area ? (usefulClues.size + potentialLetters.size) / area : 0,
    };
  }

  window.ScanwordCore = {
    DIRECTIONS,
    makeRandom,
    shuffle,
    generateWordPool,
    createMask,
    extractSlots,
    cellKey,
    slotEndBarrierKey,
    analyzeAssignments,
    compactSolution,
    templatePotentialMetrics,
  };
})();
