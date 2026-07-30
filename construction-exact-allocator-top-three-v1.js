(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || typeof solver.assignClueTextCellsV2 !== "function" || solver.__exactAllocatorTopThreeV1Installed) return;

  const originalAssign = solver.assignClueTextCellsV2.bind(solver);
  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  let aggregate = createAggregate();

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function mode() {
    return String(environmentOption("SCANWORD_EXACT_ALLOCATOR_SELECTOR", "off")).toLowerCase() === "linear-top-three"
      ? "linear-top-three"
      : "off";
  }

  function now() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function rounded(value) {
    return +Number(value || 0).toFixed(3);
  }

  function createAggregate() {
    return {
      schemaVersion: 1,
      mode: "linear-top-three",
      calls: 0,
      fallbacks: 0,
      errors: 0,
      elapsedMs: 0,
      rankedDomains: 0,
      rankedCandidates: 0,
      comparatorCalls: 0,
      maximumDomainSize: 0,
      last: null,
    };
  }

  function reset() {
    aggregate = createAggregate();
    return aggregate;
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function panelRegionSizeMap(state) {
    const sizes = new Map();
    const seen = new Set();
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        if (state.grid[row][col].type !== "panel") continue;
        const startKey = cellKey(row, col);
        if (seen.has(startKey)) continue;
        const queue = [{ row, col }];
        const cells = [];
        seen.add(startKey);
        for (let index = 0; index < queue.length; index += 1) {
          const current = queue[index];
          cells.push(current);
          for (const [dr, dc] of ORTHOGONAL) {
            const nextRow = current.row + dr;
            const nextCol = current.col + dc;
            if (nextRow < 0 || nextRow >= state.rows || nextCol < 0 || nextCol >= state.cols) continue;
            if (state.grid[nextRow][nextCol].type !== "panel") continue;
            const key = cellKey(nextRow, nextCol);
            if (seen.has(key)) continue;
            seen.add(key);
            queue.push({ row: nextRow, col: nextCol });
          }
        }
        for (const cell of cells) sizes.set(cellKey(cell.row, cell.col), cells.length);
      }
    }
    return sizes;
  }

  function footprintCandidates(state, row, col, maxSize, regionSizes) {
    const starts = [];
    for (const [dr, dc] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextRow >= state.rows || nextCol < 0 || nextCol >= state.cols) continue;
      if (state.grid[nextRow][nextCol].type !== "panel") continue;
      starts.push({ row: nextRow, col: nextCol });
    }

    const candidates = [];
    const seen = new Set();
    function addCandidate(cells) {
      const ordered = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
      const keys = ordered.map((cell) => cellKey(cell.row, cell.col));
      const signature = keys.join("|");
      if (seen.has(signature)) return;
      seen.add(signature);
      const rows = ordered.map((cell) => cell.row);
      const cols = ordered.map((cell) => cell.col);
      const area = (Math.max(...rows) - Math.min(...rows) + 1) * (Math.max(...cols) - Math.min(...cols) + 1);
      const regionBonus = ordered.reduce(
        (sum, cell) => sum + 24 / Math.max(1, regionSizes.get(cellKey(cell.row, cell.col)) || 1),
        0,
      );
      candidates.push({
        cells: ordered,
        keys,
        score: ordered.length * 100 + regionBonus - (area - ordered.length) * 9,
      });
    }

    function expand(cells, keys) {
      addCandidate(cells);
      if (cells.length >= maxSize) return;
      const frontier = new Map();
      for (const cell of cells) {
        for (const [dr, dc] of ORTHOGONAL) {
          const nextRow = cell.row + dr;
          const nextCol = cell.col + dc;
          const key = cellKey(nextRow, nextCol);
          if (nextRow < 0 || nextRow >= state.rows || nextCol < 0 || nextCol >= state.cols || keys.has(key)) continue;
          if (state.grid[nextRow][nextCol].type !== "panel") continue;
          frontier.set(key, { row: nextRow, col: nextCol });
        }
      }
      for (const [key, cell] of frontier) {
        const nextKeys = new Set(keys);
        nextKeys.add(key);
        expand([...cells, cell], nextKeys);
      }
    }

    for (const start of starts) expand([start], new Set([cellKey(start.row, start.col)]));
    return candidates
      .sort((a, b) => b.score - a.score || a.keys.join("|").localeCompare(b.keys.join("|")))
      .slice(0, 96);
  }

  function compareRankedCandidates(first, second) {
    return second.rank - first.rank
      || first.candidate.keys.join("|").localeCompare(second.candidate.keys.join("|"));
  }

  function selectStablePrefix(values, limit = 3, compare = compareRankedCandidates, telemetry = null) {
    const width = Math.max(0, Math.floor(Number(limit) || 0));
    if (!width || !values.length) return [];
    const selected = [];
    for (const value of values) {
      let insertionIndex = selected.length;
      for (let index = 0; index < selected.length; index += 1) {
        if (telemetry) telemetry.comparatorCalls += 1;
        if (compare(value, selected[index]) < 0) {
          insertionIndex = index;
          break;
        }
      }
      if (insertionIndex >= width) continue;
      selected.splice(insertionIndex, 0, value);
      if (selected.length > width) selected.pop();
    }
    return selected;
  }

  function prepareSearch(state, random, restarts) {
    const regionSizes = panelRegionSizeMap(state);
    const items = [];
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.grid[row][col];
        if (cell.type !== "clue") continue;
        for (let clueIndex = 0; clueIndex < cell.clues.length; clueIndex += 1) {
          const clue = cell.clues[clueIndex];
          const maxSize = clue.text.length >= 38 ? 4 : 3;
          const candidates = footprintCandidates(state, row, col, maxSize, regionSizes);
          items.push({ row, col, clueIndex, clue, maxSize, candidates });
        }
      }
    }

    const telemetry = {
      rankedDomains: 0,
      rankedCandidates: 0,
      comparatorCalls: 0,
      maximumDomainSize: 0,
    };
    let best = { score: -Infinity, covered: 0, assigned: new Map() };
    for (let restart = 0; restart < restarts; restart += 1) {
      const occupied = new Set();
      const assigned = new Map();
      const order = items.map((item, index) => ({ item, index, jitter: random() }))
        .sort((a, b) => a.item.candidates.length - b.item.candidates.length
          || b.item.maxSize - a.item.maxSize
          || a.jitter - b.jitter
          || a.index - b.index);
      for (const { item, index } of order) {
        const available = item.candidates.filter((candidate) => candidate.keys.every((key) => !occupied.has(key)));
        if (!available.length) continue;
        const ranked = available.map((candidate) => ({ candidate, rank: candidate.score + random() * 18 }));
        telemetry.rankedDomains += 1;
        telemetry.rankedCandidates += ranked.length;
        telemetry.maximumDomainSize = Math.max(telemetry.maximumDomainSize, ranked.length);
        const top = selectStablePrefix(ranked, 3, compareRankedCandidates, telemetry);
        const selected = top[Math.floor(random() * Math.min(3, ranked.length))].candidate;
        assigned.set(index, selected);
        for (const key of selected.keys) occupied.add(key);
      }
      const score = occupied.size * 1000 + assigned.size * 25;
      if (score > best.score) best = { score, covered: occupied.size, assigned };
    }
    return { items, best, telemetry };
  }

  function applyBest(state, items, best) {
    let externalClueTexts = 0;
    let clueTextCells = 0;
    const footprints = [];
    for (const [itemIndex, footprint] of best.assigned.entries()) {
      const item = items[itemIndex];
      const arrowCell = state.grid[item.row][item.col];
      const clue = arrowCell.clues[item.clueIndex];
      clue.textRow = footprint.cells[0].row;
      clue.textCol = footprint.cells[0].col;
      clue.externalText = true;
      clue.textCells = footprint.cells.map((cell) => ({ ...cell }));
      const footprintId = footprints.length + 1;
      footprints.push({
        id: footprintId,
        slotId: clue.slotId,
        arrowRow: item.row,
        arrowCol: item.col,
        cells: clue.textCells,
      });
      footprint.cells.forEach((target, cellIndex) => {
        state.grid[target.row][target.col] = {
          type: cellIndex === 0 ? "clueText" : "clueTextContinuation",
          char: null,
          slotIds: [clue.slotId],
          directions: [],
          footprintId,
          clues: cellIndex === 0 ? [{ ...clue, arrowRow: item.row, arrowCol: item.col }] : [],
        };
      });
      externalClueTexts += 1;
      clueTextCells += footprint.cells.length;
    }
    state.clueFootprints = footprints;
    return { externalClueTexts, clueTextCells, footprints };
  }

  function record(telemetry, elapsedMs, error = null, fallback = false) {
    aggregate.calls += 1;
    aggregate.fallbacks += Number(fallback);
    aggregate.errors += Number(Boolean(error));
    aggregate.elapsedMs = rounded(aggregate.elapsedMs + elapsedMs);
    aggregate.rankedDomains += Number(telemetry?.rankedDomains || 0);
    aggregate.rankedCandidates += Number(telemetry?.rankedCandidates || 0);
    aggregate.comparatorCalls += Number(telemetry?.comparatorCalls || 0);
    aggregate.maximumDomainSize = Math.max(aggregate.maximumDomainSize, Number(telemetry?.maximumDomainSize || 0));
    aggregate.last = {
      elapsedMs: rounded(elapsedMs),
      rankedDomains: Number(telemetry?.rankedDomains || 0),
      rankedCandidates: Number(telemetry?.rankedCandidates || 0),
      comparatorCalls: Number(telemetry?.comparatorCalls || 0),
      maximumDomainSize: Number(telemetry?.maximumDomainSize || 0),
      fallback,
      error,
    };
  }

  function assignClueTextCellsTopThree(state, random, restarts = 120) {
    if (mode() === "off") return originalAssign(state, random, restarts);

    const sourceRandom = typeof random === "function" ? random : Math.random;
    const randomValues = [];
    const recordingRandom = () => {
      const value = sourceRandom();
      randomValues.push(value);
      return value;
    };
    const started = now();
    let prepared;
    try {
      prepared = prepareSearch(state, recordingRandom, restarts);
    } catch (error) {
      const message = String(error?.stack || error);
      record(null, now() - started, message, true);
      let replayIndex = 0;
      const replayRandom = () => {
        if (replayIndex < randomValues.length) {
          const value = randomValues[replayIndex];
          replayIndex += 1;
          return value;
        }
        return sourceRandom();
      };
      return originalAssign(state, replayRandom, restarts);
    }

    const layout = applyBest(state, prepared.items, prepared.best);
    record(prepared.telemetry, now() - started);
    return layout;
  }

  solver.assignClueTextCellsV2 = assignClueTextCellsTopThree;
  Object.assign(solver, {
    exactAllocatorSelectorModeV1: mode,
    selectExactAllocatorStablePrefixV1: selectStablePrefix,
    compareExactAllocatorRankedCandidatesV1: compareRankedCandidates,
    currentExactAllocatorSelectorV1: () => aggregate,
    resetExactAllocatorSelectorV1: reset,
    __exactAllocatorTopThreeV1Installed: true,
  });

  window.ScanwordExactAllocatorTopThreeV1 = {
    version: 1,
    mode,
    selectStablePrefix,
    compareRankedCandidates,
    current: () => aggregate,
    reset,
  };
})();
