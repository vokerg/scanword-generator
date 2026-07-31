(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || typeof solver.assignClueTextCellsV2 !== "function" || solver.__exactAllocatorOccupancyIndexV1Installed) return;
  if (typeof solver.selectExactAllocatorStablePrefixV1 !== "function"
      || typeof solver.compareExactAllocatorRankedCandidatesV1 !== "function") return;

  const originalAssign = solver.assignClueTextCellsV2.bind(solver);
  const selectStablePrefix = solver.selectExactAllocatorStablePrefixV1;
  const compareRankedCandidates = solver.compareExactAllocatorRankedCandidatesV1;
  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  let aggregate = createAggregate();

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function mode() {
    return String(environmentOption("SCANWORD_EXACT_ALLOCATOR_OCCUPANCY", "off")).toLowerCase() === "indexed"
      ? "indexed"
      : "off";
  }

  function detail() {
    return String(environmentOption("SCANWORD_EXACT_ALLOCATOR_OCCUPANCY_DETAIL", "summary")).toLowerCase() === "full"
      ? "full"
      : "summary";
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
      mode: "indexed",
      detail: "summary",
      calls: 0,
      fallbacks: 0,
      errors: 0,
      elapsedMs: 0,
      setupElapsedMs: 0,
      indexBuildElapsedMs: 0,
      restartElapsedMs: 0,
      applyElapsedMs: 0,
      candidateReferences: 0,
      candidateLookups: 0,
      invalidations: 0,
      availableCandidates: 0,
      rankedCandidates: 0,
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

  function buildOccupancyIndex(items) {
    if (!Array.isArray(items)) throw new TypeError("occupancy index requires an item array");
    const itemCandidateIds = [];
    const cellToCandidateIds = new Map();
    let totalCandidates = 0;
    let candidateReferences = 0;

    for (const item of items) {
      if (!Array.isArray(item?.candidates)) throw new TypeError("occupancy index item is missing candidates");
      const ids = new Uint32Array(item.candidates.length);
      itemCandidateIds.push(ids);
      for (let candidateIndex = 0; candidateIndex < item.candidates.length; candidateIndex += 1) {
        const candidate = item.candidates[candidateIndex];
        if (!Array.isArray(candidate?.keys)) throw new TypeError("occupancy index candidate is missing keys");
        const candidateId = totalCandidates;
        totalCandidates += 1;
        ids[candidateIndex] = candidateId;
        for (const key of candidate.keys) {
          if (typeof key !== "string") throw new TypeError("occupancy index candidate key must be a string");
          let references = cellToCandidateIds.get(key);
          if (!references) {
            references = [];
            cellToCandidateIds.set(key, references);
          }
          references.push(candidateId);
          candidateReferences += 1;
        }
      }
    }

    return {
      schemaVersion: 1,
      totalCandidates,
      candidateReferences,
      itemCandidateIds,
      cellToCandidateIds,
    };
  }

  function createOccupancyState(index, epoch = 1) {
    const currentEpoch = Number(epoch);
    if (!index || !Number.isInteger(index.totalCandidates) || index.totalCandidates < 0) {
      throw new TypeError("invalid occupancy index");
    }
    if (!Number.isInteger(currentEpoch) || currentEpoch <= 0 || currentEpoch > 0xffffffff) {
      throw new RangeError("occupancy epoch must be a positive uint32");
    }
    return {
      blockedEpoch: new Uint32Array(index.totalCandidates),
      epoch: currentEpoch,
    };
  }

  function availableCandidates(item, itemIndex, index, occupancy, telemetry = null) {
    const ids = index?.itemCandidateIds?.[itemIndex];
    if (!ids || ids.length !== item.candidates.length) throw new Error("occupancy item domain mismatch");
    const available = [];
    for (let candidateIndex = 0; candidateIndex < item.candidates.length; candidateIndex += 1) {
      if (telemetry) telemetry.candidateLookups += 1;
      if (occupancy.blockedEpoch[ids[candidateIndex]] !== occupancy.epoch) {
        available.push(item.candidates[candidateIndex]);
      }
    }
    return available;
  }

  function invalidateCandidate(candidate, index, occupancy, telemetry = null) {
    for (const key of candidate.keys) {
      const references = index.cellToCandidateIds.get(key);
      if (!references) throw new Error(`occupancy index is missing selected key ${key}`);
      for (const candidateId of references) {
        if (occupancy.blockedEpoch[candidateId] === occupancy.epoch) continue;
        occupancy.blockedEpoch[candidateId] = occupancy.epoch;
        if (telemetry) telemetry.invalidations += 1;
      }
    }
  }

  function prepareDomains(state) {
    const setupStarted = now();
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
    return { items, setupElapsedMs: now() - setupStarted };
  }

  function searchIndexed(items, occupancyIndex, random, restarts, collectDetail) {
    const telemetry = {
      candidateReferences: occupancyIndex.candidateReferences,
      candidateLookups: 0,
      invalidations: 0,
      availableCandidates: 0,
      rankedCandidates: 0,
      maximumDomainSize: 0,
      fallbacks: 0,
      errors: 0,
      lastError: null,
    };
    const blockedEpoch = new Uint32Array(occupancyIndex.totalCandidates);
    let best = { score: -Infinity, covered: 0, assigned: new Map() };
    const restartStarted = now();

    for (let restart = 0; restart < restarts; restart += 1) {
      const epoch = restart + 1;
      if (epoch > 0xffffffff) throw new RangeError("occupancy epoch overflow");
      const occupancy = { blockedEpoch, epoch };
      const occupied = new Set();
      const assigned = new Map();
      const order = items.map((item, index) => ({ item, index, jitter: random() }))
        .sort((a, b) => a.item.candidates.length - b.item.candidates.length
          || b.item.maxSize - a.item.maxSize
          || a.jitter - b.jitter
          || a.index - b.index);
      for (const { item, index } of order) {
        const available = availableCandidates(
          item,
          index,
          occupancyIndex,
          occupancy,
          collectDetail ? telemetry : null,
        );
        if (collectDetail) {
          telemetry.availableCandidates += available.length;
          telemetry.maximumDomainSize = Math.max(telemetry.maximumDomainSize, available.length);
        }
        if (!available.length) continue;
        const ranked = available.map((candidate) => ({ candidate, rank: candidate.score + random() * 18 }));
        if (collectDetail) telemetry.rankedCandidates += ranked.length;
        let top;
        try {
          top = selectStablePrefix(
            ranked,
            3,
            compareRankedCandidates,
            null,
          );
        } catch (error) {
          telemetry.fallbacks += 1;
          telemetry.errors += 1;
          telemetry.lastError = String(error?.stack || error);
          top = ranked.sort(compareRankedCandidates).slice(0, 3);
        }
        const selected = top[Math.floor(random() * Math.min(3, ranked.length))].candidate;
        assigned.set(index, selected);
        invalidateCandidate(
          selected,
          occupancyIndex,
          occupancy,
          collectDetail ? telemetry : null,
        );
        for (const key of selected.keys) occupied.add(key);
      }
      const score = occupied.size * 1000 + assigned.size * 25;
      if (score > best.score) best = { score, covered: occupied.size, assigned };
    }

    return {
      best,
      telemetry,
      restartElapsedMs: now() - restartStarted,
    };
  }

  function applyBest(state, items, best) {
    const applyStarted = now();
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
    return {
      layout: { externalClueTexts, clueTextCells, footprints },
      applyElapsedMs: now() - applyStarted,
    };
  }

  function record(telemetry, elapsedMs, currentDetail) {
    aggregate.detail = currentDetail;
    aggregate.calls += 1;
    aggregate.fallbacks += Number(telemetry?.fallbacks || 0);
    aggregate.errors += Number(telemetry?.errors || 0);
    aggregate.elapsedMs = rounded(aggregate.elapsedMs + elapsedMs);
    aggregate.setupElapsedMs = rounded(aggregate.setupElapsedMs + Number(telemetry?.setupElapsedMs || 0));
    aggregate.indexBuildElapsedMs = rounded(
      aggregate.indexBuildElapsedMs + Number(telemetry?.indexBuildElapsedMs || 0),
    );
    aggregate.restartElapsedMs = rounded(aggregate.restartElapsedMs + Number(telemetry?.restartElapsedMs || 0));
    aggregate.applyElapsedMs = rounded(aggregate.applyElapsedMs + Number(telemetry?.applyElapsedMs || 0));
    aggregate.candidateReferences += Number(telemetry?.candidateReferences || 0);
    aggregate.candidateLookups += Number(telemetry?.candidateLookups || 0);
    aggregate.invalidations += Number(telemetry?.invalidations || 0);
    aggregate.availableCandidates += Number(telemetry?.availableCandidates || 0);
    aggregate.rankedCandidates += Number(telemetry?.rankedCandidates || 0);
    aggregate.maximumDomainSize = Math.max(aggregate.maximumDomainSize, Number(telemetry?.maximumDomainSize || 0));
    aggregate.last = {
      detail: currentDetail,
      elapsedMs: rounded(elapsedMs),
      setupElapsedMs: rounded(telemetry?.setupElapsedMs),
      indexBuildElapsedMs: rounded(telemetry?.indexBuildElapsedMs),
      restartElapsedMs: rounded(telemetry?.restartElapsedMs),
      applyElapsedMs: rounded(telemetry?.applyElapsedMs),
      candidateReferences: Number(telemetry?.candidateReferences || 0),
      candidateLookups: Number(telemetry?.candidateLookups || 0),
      invalidations: Number(telemetry?.invalidations || 0),
      availableCandidates: Number(telemetry?.availableCandidates || 0),
      rankedCandidates: Number(telemetry?.rankedCandidates || 0),
      maximumDomainSize: Number(telemetry?.maximumDomainSize || 0),
      fallbacks: Number(telemetry?.fallbacks || 0),
      errors: Number(telemetry?.errors || 0),
      error: telemetry?.lastError || null,
    };
  }

  function assignClueTextCellsIndexed(state, random, restarts = 120) {
    if (mode() === "off") return originalAssign(state, random, restarts);

    const currentDetail = detail();
    const sourceRandom = typeof random === "function" ? random : Math.random;
    const started = now();
    const domains = prepareDomains(state);
    let occupancyIndex;
    const indexStarted = now();
    try {
      occupancyIndex = buildOccupancyIndex(domains.items);
    } catch (error) {
      const layout = originalAssign(state, sourceRandom, restarts);
      record({
        setupElapsedMs: domains.setupElapsedMs,
        indexBuildElapsedMs: now() - indexStarted,
        restartElapsedMs: 0,
        applyElapsedMs: 0,
        candidateReferences: 0,
        candidateLookups: 0,
        invalidations: 0,
        availableCandidates: 0,
        rankedCandidates: 0,
        maximumDomainSize: 0,
        fallbacks: 1,
        errors: 1,
        lastError: String(error?.stack || error),
      }, now() - started, currentDetail);
      return layout;
    }
    const indexBuildElapsedMs = now() - indexStarted;
    const searched = searchIndexed(
      domains.items,
      occupancyIndex,
      sourceRandom,
      restarts,
      currentDetail === "full",
    );
    const applied = applyBest(state, domains.items, searched.best);
    record({
      ...searched.telemetry,
      setupElapsedMs: domains.setupElapsedMs,
      indexBuildElapsedMs,
      restartElapsedMs: searched.restartElapsedMs,
      applyElapsedMs: applied.applyElapsedMs,
    }, now() - started, currentDetail);
    return applied.layout;
  }

  solver.assignClueTextCellsV2 = assignClueTextCellsIndexed;
  Object.assign(solver, {
    exactAllocatorOccupancyModeV1: mode,
    exactAllocatorOccupancyDetailV1: detail,
    buildExactAllocatorOccupancyIndexV1: buildOccupancyIndex,
    createExactAllocatorOccupancyStateV1: createOccupancyState,
    availableExactAllocatorCandidatesV1: availableCandidates,
    invalidateExactAllocatorCandidateV1: invalidateCandidate,
    currentExactAllocatorOccupancyV1: () => aggregate,
    resetExactAllocatorOccupancyV1: reset,
    __exactAllocatorOccupancyIndexV1Installed: true,
  });

  window.ScanwordExactAllocatorOccupancyIndexV1 = {
    version: 1,
    mode,
    detail,
    buildOccupancyIndex,
    createOccupancyState,
    availableCandidates,
    invalidateCandidate,
    current: () => aggregate,
    reset,
  };
})();