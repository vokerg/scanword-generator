(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || typeof solver.assignClueTextCellsV2 !== "function" || solver.__exactAllocatorProfileV1Installed) return;

  const originalAssign = solver.assignClueTextCellsV2.bind(solver);
  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  let callIndex = 0;
  let aggregate = createAggregate();

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function mode() {
    return String(environmentOption("SCANWORD_EXACT_ALLOCATOR_PROFILE", "off")).toLowerCase() === "shadow"
      ? "shadow"
      : "off";
  }

  function detail() {
    return String(environmentOption("SCANWORD_EXACT_ALLOCATOR_PROFILE_DETAIL", "summary")).toLowerCase() === "full"
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
      mode: "shadow",
      calls: 0,
      parityFailures: 0,
      randomDrawMismatches: 0,
      errors: 0,
      originalElapsedMs: 0,
      replayElapsedMs: 0,
      setupElapsedMs: 0,
      restartElapsedMs: 0,
      applyElapsedMs: 0,
      clueItems: 0,
      footprintCandidates: 0,
      candidateAvailabilityChecks: 0,
      availableCandidates: 0,
      rankedCandidates: 0,
      assignments: 0,
      randomDraws: 0,
      last: null,
    };
  }

  function reset() {
    callIndex = 0;
    aggregate = createAggregate();
    return aggregate;
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
      usedAnswers: new Set(state.usedAnswers || (state.placed || []).map((word) => word.answer)),
      clueFootprints: (state.clueFootprints || []).map((footprint) => ({
        ...footprint,
        cells: (footprint.cells || []).map((cell) => ({ ...cell })),
      })),
    };
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function geometryCounts(state) {
    let panels = 0;
    let letters = 0;
    let clueCells = 0;
    let clueItems = 0;
    for (const row of state.grid || []) {
      for (const cell of row || []) {
        if (cell.type === "panel") panels += 1;
        else if (cell.type === "letter") letters += 1;
        else if (cell.type === "clue") {
          clueCells += 1;
          clueItems += (cell.clues || []).length;
        }
      }
    }
    return {
      rows: Number(state.rows || state.grid?.length || 0),
      cols: Number(state.cols || state.grid?.[0]?.length || 0),
      panels,
      letters,
      clueCells,
      clueItems,
      answers: Number(state.placed?.length || 0),
    };
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
      const regionBonus = ordered.reduce((sum, cell) => sum + 24 / Math.max(1, regionSizes.get(cellKey(cell.row, cell.col)) || 1), 0);
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
    return candidates.sort((a, b) => b.score - a.score || a.keys.join("|").localeCompare(b.keys.join("|"))).slice(0, 96);
  }

  function layoutSignature(layout) {
    return JSON.stringify({
      externalClueTexts: Number(layout?.externalClueTexts || 0),
      clueTextCells: Number(layout?.clueTextCells || 0),
      footprints: (layout?.footprints || []).map((footprint) => ({
        id: footprint.id,
        slotId: footprint.slotId,
        arrowRow: footprint.arrowRow,
        arrowCol: footprint.arrowCol,
        cells: (footprint.cells || []).map((cell) => [cell.row, cell.col]),
      })),
    });
  }

  function gridSignature(grid) {
    return JSON.stringify((grid || []).map((row) => row.map((cell) => ({
      type: cell.type,
      char: cell.char ?? null,
      slotIds: cell.slotIds || [],
      directions: cell.directions || [],
      footprintId: cell.footprintId ?? null,
      clues: (cell.clues || []).map((clue) => ({
        slotId: clue.slotId,
        direction: clue.direction,
        text: clue.text,
        answer: clue.answer,
        textRow: clue.textRow ?? null,
        textCol: clue.textCol ?? null,
        externalText: Boolean(clue.externalText),
        arrowRow: clue.arrowRow ?? null,
        arrowCol: clue.arrowCol ?? null,
        textCells: (clue.textCells || []).map((target) => [target.row, target.col]),
      })),
    }))));
  }

  function replayAssign(state, random, restarts, includeRestarts) {
    const replayStarted = now();
    const regionStarted = now();
    const regionSizes = panelRegionSizeMap(state);
    const regionMapElapsedMs = now() - regionStarted;
    const domainStarted = now();
    const items = [];
    let footprintCandidateCount = 0;
    let zeroDomainItems = 0;
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.grid[row][col];
        if (cell.type !== "clue") continue;
        for (let clueIndex = 0; clueIndex < cell.clues.length; clueIndex += 1) {
          const clue = cell.clues[clueIndex];
          const maxSize = clue.text.length >= 38 ? 4 : 3;
          const candidates = footprintCandidates(state, row, col, maxSize, regionSizes);
          footprintCandidateCount += candidates.length;
          if (!candidates.length) zeroDomainItems += 1;
          items.push({ row, col, clueIndex, clue, maxSize, candidates });
        }
      }
    }
    const domainBuildElapsedMs = now() - domainStarted;

    let best = { score: -Infinity, covered: 0, assigned: new Map() };
    let orderElapsedMs = 0;
    let availabilityElapsedMs = 0;
    let rankingElapsedMs = 0;
    let candidateAvailabilityChecks = 0;
    let availableCandidates = 0;
    let rankedCandidates = 0;
    let assignments = 0;
    const restartSummaries = [];
    const restartCount = restarts === undefined ? 120 : restarts;
    const restartStarted = now();
    for (let restart = 0; restart < restartCount; restart += 1) {
      const occupied = new Set();
      const assigned = new Map();
      const orderStarted = now();
      const order = items.map((item, index) => ({ item, index, jitter: random() }))
        .sort((a, b) => a.item.candidates.length - b.item.candidates.length
          || b.item.maxSize - a.item.maxSize
          || a.jitter - b.jitter
          || a.index - b.index);
      const currentOrderElapsedMs = now() - orderStarted;
      orderElapsedMs += currentOrderElapsedMs;
      let restartChecks = 0;
      let restartAvailable = 0;
      let restartRanked = 0;
      let restartAssignments = 0;
      let currentAvailabilityElapsedMs = 0;
      let currentRankingElapsedMs = 0;
      for (const { item, index } of order) {
        const availableStarted = now();
        const available = item.candidates.filter((candidate) => {
          restartChecks += 1;
          candidateAvailabilityChecks += 1;
          return candidate.keys.every((key) => !occupied.has(key));
        });
        currentAvailabilityElapsedMs += now() - availableStarted;
        restartAvailable += available.length;
        availableCandidates += available.length;
        if (!available.length) continue;
        const rankingStarted = now();
        const ranked = available.map((candidate) => ({ candidate, rank: candidate.score + random() * 18 }))
          .sort((a, b) => b.rank - a.rank || a.candidate.keys.join("|").localeCompare(b.candidate.keys.join("|")));
        const selected = ranked[Math.floor(random() * Math.min(3, ranked.length))].candidate;
        currentRankingElapsedMs += now() - rankingStarted;
        restartRanked += ranked.length;
        rankedCandidates += ranked.length;
        restartAssignments += 1;
        assignments += 1;
        assigned.set(index, selected);
        for (const key of selected.keys) occupied.add(key);
      }
      availabilityElapsedMs += currentAvailabilityElapsedMs;
      rankingElapsedMs += currentRankingElapsedMs;
      const score = occupied.size * 1000 + assigned.size * 25;
      const bestUpdated = score > best.score;
      if (bestUpdated) best = { score, covered: occupied.size, assigned };
      if (includeRestarts) {
        restartSummaries.push({
          restart,
          orderElapsedMs: rounded(currentOrderElapsedMs),
          availabilityElapsedMs: rounded(currentAvailabilityElapsedMs),
          rankingElapsedMs: rounded(currentRankingElapsedMs),
          candidateAvailabilityChecks: restartChecks,
          availableCandidates: restartAvailable,
          rankedCandidates: restartRanked,
          assignments: restartAssignments,
          covered: occupied.size,
          score,
          bestUpdated,
        });
      }
    }
    const restartElapsedMs = now() - restartStarted;

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
      footprints.push({ id: footprintId, slotId: clue.slotId, arrowRow: item.row, arrowCol: item.col, cells: clue.textCells });
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
    const applyElapsedMs = now() - applyStarted;
    return {
      layout: { externalClueTexts, clueTextCells, footprints },
      telemetry: {
        clueItems: items.length,
        footprintCandidates: footprintCandidateCount,
        zeroDomainItems,
        regionMapElapsedMs: rounded(regionMapElapsedMs),
        domainBuildElapsedMs: rounded(domainBuildElapsedMs),
        setupElapsedMs: rounded(regionMapElapsedMs + domainBuildElapsedMs),
        restartElapsedMs: rounded(restartElapsedMs),
        orderElapsedMs: rounded(orderElapsedMs),
        availabilityElapsedMs: rounded(availabilityElapsedMs),
        rankingElapsedMs: rounded(rankingElapsedMs),
        applyElapsedMs: rounded(applyElapsedMs),
        replayElapsedMs: rounded(now() - replayStarted),
        candidateAvailabilityChecks,
        availableCandidates,
        rankedCandidates,
        assignments,
        bestScore: best.score,
        bestCovered: best.covered,
        bestAssigned: best.assigned.size,
        restartSummaries,
      },
    };
  }

  function attachObservation(state, observation) {
    try {
      Object.defineProperty(state.grid, "__scanwordExactAllocatorProfileV1", {
        value: observation,
        enumerable: false,
        configurable: true,
      });
    } catch (_error) {
      // Profiling must never affect the allocator result.
    }
  }

  function compactObservation(observation) {
    return {
      callIndex: observation.callIndex,
      geometry: observation.geometry,
      restarts: observation.restarts,
      detail: observation.detail,
      originalElapsedMs: observation.originalElapsedMs,
      replayElapsedMs: observation.replayElapsedMs,
      setupElapsedMs: observation.setupElapsedMs,
      restartElapsedMs: observation.restartElapsedMs,
      applyElapsedMs: observation.applyElapsedMs,
      clueItems: observation.clueItems,
      footprintCandidates: observation.footprintCandidates,
      candidateAvailabilityChecks: observation.candidateAvailabilityChecks,
      availableCandidates: observation.availableCandidates,
      rankedCandidates: observation.rankedCandidates,
      assignments: observation.assignments,
      randomDraws: observation.randomDraws,
      replayRandomDraws: observation.replayRandomDraws,
      exactParity: observation.exactParity,
      randomDrawParity: observation.randomDrawParity,
      error: observation.error,
    };
  }

  function record(observation) {
    aggregate.calls += 1;
    aggregate.originalElapsedMs += observation.originalElapsedMs;
    aggregate.replayElapsedMs += observation.replayElapsedMs;
    aggregate.setupElapsedMs += observation.setupElapsedMs;
    aggregate.restartElapsedMs += observation.restartElapsedMs;
    aggregate.applyElapsedMs += observation.applyElapsedMs;
    aggregate.clueItems += observation.clueItems;
    aggregate.footprintCandidates += observation.footprintCandidates;
    aggregate.candidateAvailabilityChecks += observation.candidateAvailabilityChecks;
    aggregate.availableCandidates += observation.availableCandidates;
    aggregate.rankedCandidates += observation.rankedCandidates;
    aggregate.assignments += observation.assignments;
    aggregate.randomDraws += observation.randomDraws;
    if (!observation.exactParity) aggregate.parityFailures += 1;
    if (!observation.randomDrawParity) aggregate.randomDrawMismatches += 1;
    if (observation.error) aggregate.errors += 1;
    aggregate.last = compactObservation(observation);
    for (const key of ["originalElapsedMs", "replayElapsedMs", "setupElapsedMs", "restartElapsedMs", "applyElapsedMs"]) {
      aggregate[key] = rounded(aggregate[key]);
    }
  }

  function assignClueTextCellsProfiled(state, random, restarts) {
    if (mode() === "off") return originalAssign(state, random, restarts);

    const currentCallIndex = callIndex;
    callIndex += 1;
    const currentDetail = detail();
    const snapshot = cloneState(state);
    const randomValues = [];
    const sourceRandom = typeof random === "function" ? random : Math.random;
    const recordingRandom = () => {
      const value = sourceRandom();
      randomValues.push(value);
      return value;
    };
    const originalStarted = now();
    const layout = originalAssign(state, recordingRandom, restarts);
    const originalElapsedMs = rounded(now() - originalStarted);
    const observation = {
      schemaVersion: 1,
      mode: "shadow",
      detail: currentDetail,
      callIndex: currentCallIndex,
      geometry: geometryCounts(snapshot),
      restarts: Number(restarts === undefined ? 120 : restarts),
      originalElapsedMs,
      replayElapsedMs: 0,
      setupElapsedMs: 0,
      restartElapsedMs: 0,
      applyElapsedMs: 0,
      clueItems: 0,
      footprintCandidates: 0,
      candidateAvailabilityChecks: 0,
      availableCandidates: 0,
      rankedCandidates: 0,
      assignments: 0,
      randomDraws: randomValues.length,
      replayRandomDraws: 0,
      exactParity: false,
      randomDrawParity: false,
      error: null,
      restartSummaries: [],
    };

    try {
      let replayRandomIndex = 0;
      const replayRandom = () => {
        if (replayRandomIndex >= randomValues.length) throw new Error("exact allocator replay requested an unrecorded random draw");
        const value = randomValues[replayRandomIndex];
        replayRandomIndex += 1;
        return value;
      };
      const replay = replayAssign(snapshot, replayRandom, restarts, currentDetail === "full");
      Object.assign(observation, replay.telemetry, {
        replayRandomDraws: replayRandomIndex,
        exactParity: layoutSignature(layout) === layoutSignature(replay.layout)
          && gridSignature(state.grid) === gridSignature(snapshot.grid),
        randomDrawParity: replayRandomIndex === randomValues.length,
        restartSummaries: replay.telemetry.restartSummaries,
      });
    } catch (error) {
      observation.error = String(error?.stack || error);
    }

    attachObservation(state, observation);
    record(observation);
    return layout;
  }

  solver.assignClueTextCellsV2 = assignClueTextCellsProfiled;
  Object.assign(solver, {
    exactAllocatorProfileModeV1: mode,
    exactAllocatorProfileDetailV1: detail,
    currentExactAllocatorProfileV1: () => aggregate,
    resetExactAllocatorProfileV1: reset,
    __exactAllocatorProfileV1Installed: true,
  });

  window.ScanwordExactAllocatorProfileV1 = {
    version: 1,
    mode,
    detail,
    current: () => aggregate,
    reset,
  };
})();
