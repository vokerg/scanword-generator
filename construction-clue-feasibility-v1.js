(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const core = window.ScanwordCore;
  if (!solver || !core || solver.__clueFeasibilityV1Installed) return;

  const { DIRECTIONS } = core;
  const originalBuildAttempt = solver.buildAttempt.bind(solver);
  const originalAssignClueTextCells = typeof solver.assignClueTextCellsV2 === "function"
    ? solver.assignClueTextCellsV2.bind(solver)
    : null;
  const originalAttachValidationReport = typeof solver.attachValidationReport === "function"
    ? solver.attachValidationReport.bind(solver)
    : null;
  const poolTelemetry = new WeakMap();
  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function stringOption(name, fallback) {
    if (typeof process !== "undefined" && process?.env?.[name] != null) return String(process.env[name]);
    if (window[name] != null) return String(window[name]);
    return fallback;
  }

  function numericOption(name, fallback, minimum = 0) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    const value = Number(raw);
    return Number.isFinite(value) && value >= minimum ? value : fallback;
  }

  function mode() {
    const value = stringOption("SCANWORD_CLUE_FEASIBILITY", "off").toLowerCase();
    return ["off", "shadow", "rank", "guard"].includes(value) ? value : "off";
  }

  function options() {
    return {
      candidateLimit: Math.max(1, Math.floor(numericOption("SCANWORD_CLUE_FEASIBILITY_CANDIDATES", 8, 1))),
      footprintLimit: Math.max(4, Math.floor(numericOption("SCANWORD_CLUE_FEASIBILITY_FOOTPRINTS", 24, 4))),
      minimumClueTextCells: Math.max(1, Math.floor(numericOption("SCANWORD_CLUE_FEASIBILITY_MIN_CELLS", 45, 1))),
      minimumExternalClues: Math.max(1, Math.floor(numericOption("SCANWORD_CLUE_FEASIBILITY_MIN_EXTERNAL", 24, 1))),
      rankWeight: numericOption("SCANWORD_CLUE_FEASIBILITY_WEIGHT", 1, 0),
    };
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function inBounds(state, row, col) {
    return row >= 0 && row < state.rows && col >= 0 && col < state.cols;
  }

  function effectiveType(state, row, col, overlay) {
    const key = cellKey(row, col);
    if (overlay?.letters?.has(key)) return "letter";
    if (overlay?.clueKey === key) return "clue";
    return state.grid[row][col].type;
  }

  function placementOverlay(state, entry, placement) {
    const letters = new Set();
    const { dr, dc } = DIRECTIONS[placement.direction];
    for (let index = 0; index < entry.answer.length; index += 1) {
      const row = placement.startRow + dr * index;
      const col = placement.startCol + dc * index;
      if (state.grid[row][col].type === "panel") letters.add(cellKey(row, col));
    }
    return {
      letters,
      clueKey: cellKey(placement.clue.row, placement.clue.col),
      newClue: {
        row: placement.clue.row,
        col: placement.clue.col,
        clue: {
          slotId: `candidate:${state.placed.length + 1}`,
          direction: placement.direction,
          text: entry.clue,
          answer: entry.answer,
        },
      },
    };
  }

  function panelRegions(state, overlay) {
    const seen = new Set();
    const regionByCell = new Map();
    const regions = [];
    let panelCells = 0;
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        if (effectiveType(state, row, col, overlay) !== "panel") continue;
        panelCells += 1;
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
            const key = cellKey(nextRow, nextCol);
            if (!inBounds(state, nextRow, nextCol) || seen.has(key)) continue;
            if (effectiveType(state, nextRow, nextCol, overlay) !== "panel") continue;
            seen.add(key);
            queue.push({ row: nextRow, col: nextCol });
          }
        }
        const id = regions.length;
        const keys = cells.map((cell) => cellKey(cell.row, cell.col));
        const region = { id, cells, keys, size: cells.length };
        regions.push(region);
        for (const key of keys) regionByCell.set(key, region);
      }
    }
    return {
      panelCells,
      regions,
      regionByCell,
      isolatedPanels: regions.filter((region) => region.size === 1).length,
      largestRegion: regions.reduce((maximum, region) => Math.max(maximum, region.size), 0),
    };
  }

  function collectClues(state, overlay) {
    const clues = [];
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.grid[row][col];
        if (cell.type !== "clue") continue;
        for (let clueIndex = 0; clueIndex < (cell.clues || []).length; clueIndex += 1) {
          clues.push({ row, col, clueIndex, clue: cell.clues[clueIndex] });
        }
      }
    }
    if (overlay?.newClue) clues.push({ ...overlay.newClue, clueIndex: 0 });
    return clues;
  }

  function preferredCells(clue) {
    const length = String(clue?.text || "").length;
    if (length >= 38) return 3;
    if (length >= 24) return 2;
    return 1;
  }

  function maximumCells(clue) {
    return String(clue?.text || "").length >= 38 ? 4 : 3;
  }

  function footprintCandidates(state, row, col, clue, overlay, limit) {
    const starts = [];
    for (const [dr, dc] of ORTHOGONAL) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (!inBounds(state, nextRow, nextCol)) continue;
      if (effectiveType(state, nextRow, nextCol, overlay) !== "panel") continue;
      starts.push({ row: nextRow, col: nextCol });
    }
    starts.sort((a, b) => a.row - b.row || a.col - b.col);
    const candidates = [];
    const seen = new Set();
    const maxSize = maximumCells(clue);

    function add(cells) {
      const ordered = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
      const keys = ordered.map((cell) => cellKey(cell.row, cell.col));
      const signature = keys.join("|");
      if (seen.has(signature)) return;
      seen.add(signature);
      const rows = ordered.map((cell) => cell.row);
      const cols = ordered.map((cell) => cell.col);
      const area = (Math.max(...rows) - Math.min(...rows) + 1) * (Math.max(...cols) - Math.min(...cols) + 1);
      candidates.push({
        cells: ordered,
        keys,
        size: ordered.length,
        score: ordered.length * 100 - (area - ordered.length) * 9,
      });
    }

    function expand(cells, keys) {
      add(cells);
      if (cells.length >= maxSize || candidates.length >= limit) return;
      const frontier = new Map();
      for (const cell of cells) {
        for (const [dr, dc] of ORTHOGONAL) {
          const nextRow = cell.row + dr;
          const nextCol = cell.col + dc;
          const key = cellKey(nextRow, nextCol);
          if (!inBounds(state, nextRow, nextCol) || keys.has(key)) continue;
          if (effectiveType(state, nextRow, nextCol, overlay) !== "panel") continue;
          frontier.set(key, { row: nextRow, col: nextCol });
        }
      }
      for (const [key, cell] of [...frontier.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (candidates.length >= limit) break;
        const nextKeys = new Set(keys);
        nextKeys.add(key);
        expand([...cells, cell], nextKeys);
      }
    }

    for (const start of starts) {
      if (candidates.length >= limit) break;
      expand([start], new Set([cellKey(start.row, start.col)]));
    }
    return candidates.sort((a, b) => b.size - a.size || b.score - a.score || a.keys.join("|").localeCompare(b.keys.join("|")));
  }

  function greedyFootprintEstimate(items) {
    const occupied = new Set();
    let externalClues = 0;
    let clueTextCells = 0;
    const selected = [];
    const order = items.map((item, index) => ({ item, index }))
      .sort((a, b) => a.item.candidates.length - b.item.candidates.length
        || b.item.preferredCells - a.item.preferredCells
        || a.item.row - b.item.row
        || a.item.col - b.item.col
        || a.index - b.index);
    for (const { item, index } of order) {
      const available = item.candidates.filter((candidate) => candidate.keys.every((key) => !occupied.has(key)));
      if (!available.length) continue;
      const preferred = available.find((candidate) => candidate.size >= item.preferredCells) || available[0];
      selected.push({ index, keys: preferred.keys, size: preferred.size });
      for (const key of preferred.keys) occupied.add(key);
      externalClues += 1;
      clueTextCells += preferred.size;
    }
    return { externalClues, clueTextCells, selected };
  }

  function evaluateState(state, overlay = null, suppliedOptions = null) {
    const config = suppliedOptions || options();
    const topology = panelRegions(state, overlay);
    const clues = collectClues(state, overlay);
    const cellPressure = new Map();
    const items = clues.map((item) => {
      const candidates = footprintCandidates(state, item.row, item.col, item.clue, overlay, config.footprintLimit);
      const reachable = new Set(candidates.flatMap((candidate) => candidate.keys));
      for (const key of reachable) cellPressure.set(key, (cellPressure.get(key) || 0) + 1);
      return {
        ...item,
        candidates,
        reachable,
        domainSize: candidates.length,
        preferredCells: preferredCells(item.clue),
        maximumCells: candidates.reduce((maximum, candidate) => Math.max(maximum, candidate.size), 0),
      };
    });
    const zeroDomainClues = items.filter((item) => item.domainSize === 0);
    const longClueImpossible = items.filter((item) => item.maximumCells < item.preferredCells);
    const greedy = greedyFootprintEstimate(items);
    const externalUpperBound = items.filter((item) => item.domainSize > 0).length;
    const clueTextUpperBound = Math.min(
      topology.panelCells,
      items.reduce((sum, item) => sum + item.maximumCells, 0),
      new Set(items.flatMap((item) => [...item.reachable])).size,
    );
    const overlapPressure = [...cellPressure.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    const maximumCellPressure = [...cellPressure.values()].reduce((maximum, count) => Math.max(maximum, count), 0);
    const hardFailures = [];
    if (topology.panelCells < config.minimumClueTextCells) hardFailures.push("panel-capacity");
    const completeNecessaryPass = externalUpperBound >= config.minimumExternalClues
      && clueTextUpperBound >= config.minimumClueTextCells;
    return {
      schemaVersion: 1,
      panelCells: topology.panelCells,
      panelRegions: topology.regions.length,
      isolatedPanels: topology.isolatedPanels,
      largestPanelRegion: topology.largestRegion,
      clues: items.length,
      zeroDomainClues: zeroDomainClues.length,
      zeroDomainSlotIds: zeroDomainClues.map((item) => item.clue.slotId),
      longClueImpossible: longClueImpossible.length,
      longClueImpossibleSlotIds: longClueImpossible.map((item) => item.clue.slotId),
      minimumDomainSize: items.length ? Math.min(...items.map((item) => item.domainSize)) : 0,
      averageDomainSize: items.length
        ? items.reduce((sum, item) => sum + item.domainSize, 0) / items.length
        : 0,
      externalUpperBound,
      clueTextUpperBound,
      greedyExternalClues: greedy.externalClues,
      greedyClueTextCells: greedy.clueTextCells,
      overlapPressure,
      maximumCellPressure,
      hardFailures,
      hardImpossible: hardFailures.length > 0,
      completeNecessaryPass,
      utility: greedy.clueTextCells * 3
        + greedy.externalClues * 18
        - zeroDomainClues.length * 80
        - longClueImpossible.length * 35
        - overlapPressure * 1.5
        - topology.isolatedPanels * 12,
    };
  }

  function evaluatePlacement(state, entry, placement, base = null, suppliedOptions = null) {
    const config = suppliedOptions || options();
    const baseline = base || evaluateState(state, null, config);
    const estimate = evaluateState(state, placementOverlay(state, entry, placement), config);
    return {
      ...estimate,
      newZeroDomainClues: Math.max(0, estimate.zeroDomainClues - baseline.zeroDomainClues),
      newLongClueImpossible: Math.max(0, estimate.longClueImpossible - baseline.longClueImpossible),
      panelCellsConsumed: baseline.panelCells - estimate.panelCells,
      utilityDelta: estimate.utility - baseline.utility,
    };
  }

  function telemetryForPool(pool) {
    let telemetry = poolTelemetry.get(pool);
    if (!telemetry) {
      telemetry = {
        schemaVersion: 1,
        mode: mode(),
        attemptsBuilt: 0,
        placementRounds: 0,
        candidateEvaluations: 0,
        hardImpossibleCandidates: 0,
        candidatesPruned: 0,
        denseStops: 0,
        fallbackRounds: 0,
        newlyStrandedClues: 0,
        completeStates: 0,
        predictedPasses: 0,
        actualPasses: 0,
        falsePositives: 0,
        falseNegatives: 0,
        clueTextAbsoluteError: 0,
        externalAbsoluteError: 0,
      };
      poolTelemetry.set(pool, telemetry);
    }
    return telemetry;
  }

  function cloneTelemetry(telemetry) {
    return JSON.parse(JSON.stringify(telemetry));
  }

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
      candidateChecks: 0,
      candidateLookups: 0,
    };
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
    const placements = [];
    for (const direction of ["right", "down"]) {
      const startRow = direction === "right"
        ? Math.floor(state.rows / 2)
        : Math.max(1, Math.floor((state.rows - entry.answer.length) / 2));
      const startCol = direction === "right"
        ? Math.max(1, Math.floor((state.cols - entry.answer.length) / 2))
        : Math.floor(state.cols / 2);
      const placement = validatePlacement(state, entry, startRow, startCol, direction, false);
      if (placement) placements.push(placement);
    }
    if (!placements.length) return false;
    commitPlacement(state, entry, placements[Math.floor(random() * placements.length)]);
    state.componentsStarted += 1;
    return true;
  }

  function insertTopCandidate(top, candidate, limit = 96) {
    let index = top.findIndex((item) => candidate.score > item.score);
    if (index < 0) index = top.length;
    top.splice(index, 0, candidate);
    if (top.length > limit) top.length = limit;
  }

  function coprimeStep(size, random) {
    if (size <= 2) return 1;
    const gcd = (a, b) => {
      while (b) [a, b] = [b, a % b];
      return a;
    };
    let step = 1 + Math.floor(random() * (size - 1));
    while (gcd(step, size) !== 1) step = step % (size - 1) + 1;
    return step;
  }

  function findCrossingCandidatesIndexed(state, poolIndex, random, sampleLimit) {
    const anchors = [];
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.grid[row][col];
        if (cell.type !== "letter" || cell.directions.length !== 1) continue;
        const bucket = poolIndex.byLetter.get(cell.char) || [];
        if (!bucket.length) continue;
        const direction = cell.directions[0] === "right" ? "down" : "right";
        anchors.push({ row, col, char: cell.char, direction, bucket, jitter: random() });
      }
    }
    anchors.sort((a, b) => a.bucket.length - b.bucket.length || a.jitter - b.jitter);
    const top = [];
    const seenPlacements = new Set();
    const maxChecks = Math.max(900, sampleLimit * 2);
    const perAnchorLimit = Math.max(18, Math.ceil(maxChecks / Math.max(1, anchors.length)));
    let checks = 0;
    for (const anchor of anchors) {
      if (checks >= maxChecks) break;
      const bucket = anchor.bucket;
      const visitLimit = Math.min(bucket.length, perAnchorLimit, maxChecks - checks);
      const offset = Math.floor(random() * bucket.length);
      const step = coprimeStep(bucket.length, random);
      state.candidateLookups += 1;
      for (let visit = 0; visit < visitLimit; visit += 1) {
        const occurrence = bucket[(offset + visit * step) % bucket.length];
        const entry = occurrence.entry;
        if (state.usedAnswers.has(entry.answer)) continue;
        const { dr, dc } = DIRECTIONS[anchor.direction];
        const startRow = anchor.row - dr * occurrence.charIndex;
        const startCol = anchor.col - dc * occurrence.charIndex;
        const key = `${entry.id}:${startRow}:${startCol}:${anchor.direction}`;
        if (seenPlacements.has(key)) continue;
        seenPlacements.add(key);
        checks += 1;
        state.candidateChecks += 1;
        const placement = validatePlacement(state, entry, startRow, startCol, anchor.direction, true);
        if (!placement) continue;
        const rarityBonus = Math.max(0, 18 - Math.log2(bucket.length + 1) * 2.2);
        insertTopCandidate(top, { entry, placement, score: placement.score + rarityBonus + random() * 5 });
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

  function candidateMode() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_CANDIDATE_MODE) return process.env.SCANWORD_CANDIDATE_MODE;
    return window.SCANWORD_CANDIDATE_MODE || "indexed";
  }

  function applyFeasibilityOrdering(state, candidates, phase, targetWords, telemetry, config) {
    if (!candidates.length) return candidates;
    const currentMode = mode();
    const headCount = Math.min(config.candidateLimit, candidates.length);
    const head = candidates.slice(0, headCount);
    const tail = candidates.slice(headCount);
    const base = evaluateState(state, null, config);
    telemetry.placementRounds += 1;
    for (const candidate of head) {
      candidate.clueFeasibility = evaluatePlacement(state, candidate.entry, candidate.placement, base, config);
      telemetry.candidateEvaluations += 1;
      telemetry.hardImpossibleCandidates += Number(candidate.clueFeasibility.hardImpossible);
      telemetry.newlyStrandedClues += candidate.clueFeasibility.newZeroDomainClues;
    }
    if (currentMode === "shadow") return candidates;
    let retained = head;
    if (currentMode === "guard" && phase === "dense") {
      const feasible = head.filter((candidate) => !candidate.clueFeasibility.hardImpossible);
      if (feasible.length) {
        telemetry.candidatesPruned += head.length - feasible.length;
        retained = feasible;
      } else {
        telemetry.candidatesPruned += head.length;
        telemetry.denseStops += 1;
        return [];
      }
    }
    retained.sort((a, b) => {
      const adjustedA = a.score + a.clueFeasibility.utilityDelta * config.rankWeight;
      const adjustedB = b.score + b.clueFeasibility.utilityDelta * config.rankWeight;
      return adjustedB - adjustedA
        || Number(a.clueFeasibility.hardImpossible) - Number(b.clueFeasibility.hardImpossible)
        || a.entry.answer.localeCompare(b.entry.answer, "ru")
        || a.placement.startRow - b.placement.startRow
        || a.placement.startCol - b.placement.startCol;
    });
    if (!retained.length) telemetry.fallbackRounds += 1;
    return [...retained, ...tail];
  }

  function buildAttempt(pool, rows, cols, targetWords, random, poolIndex = solver.buildPoolIndex(pool), requestedMode = candidateMode()) {
    const currentMode = mode();
    if (currentMode === "off" || requestedMode !== "indexed") return originalBuildAttempt(pool, rows, cols, targetWords, random, poolIndex, requestedMode);
    const config = options();
    const telemetry = telemetryForPool(pool);
    telemetry.mode = currentMode;
    telemetry.attemptsBuilt += 1;
    const state = createState(rows, cols);
    state.__clueFeasibilityPool = pool;
    const initialCandidates = pool.filter((entry) => entry.answer.length >= 5 && entry.answer.length <= 8);
    const first = initialCandidates[Math.floor(random() * initialCandidates.length)] || pool[0];
    if (!first || !placeInitialWord(state, first, random)) return state;
    const maxComponents = 1;
    let stalled = 0;
    while (state.placed.length < targetWords && stalled < 8) {
      let candidates = findCrossingCandidatesIndexed(state, poolIndex, random, Math.min(700, pool.length));
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
      candidates = applyFeasibilityOrdering(state, candidates, "target", targetWords, telemetry, config);
      if (!candidates.length) { stalled += 1; continue; }
      const shortlistSize = seeded ? 5 : (remaining <= 5 ? 1 : 4);
      const shortlist = candidates.slice(0, Math.min(shortlistSize, candidates.length));
      const selected = shortlist[Math.floor(random() * shortlist.length)];
      commitPlacement(state, selected.entry, selected.placement);
      if (seeded) state.componentsStarted += 1;
      stalled = 0;
    }
    if (state.placed.length >= targetWords) {
      let denseStalled = 0;
      const denseLimit = 80;
      while (state.placed.length < denseLimit && denseStalled < 6) {
        let candidates = findCrossingCandidatesIndexed(state, poolIndex, random, Math.min(700, pool.length));
        let seeded = false;
        if (!candidates.length && state.componentsStarted < maxComponents) {
          candidates = findSeedCandidates(state, pool, random, Math.min(320, pool.length));
          seeded = candidates.length > 0;
        }
        if (!candidates.length) { denseStalled += 1; continue; }
        if (!seeded) candidates.sort((a, b) => (b.score + 4 * b.placement.newCells) - (a.score + 4 * a.placement.newCells));
        candidates = applyFeasibilityOrdering(state, candidates, "dense", targetWords, telemetry, config);
        if (!candidates.length) { denseStalled += 1; continue; }
        const shortlist = candidates.slice(0, Math.min(seeded ? 4 : 5, candidates.length));
        const selected = shortlist[Math.floor(random() * shortlist.length)];
        commitPlacement(state, selected.entry, selected.placement);
        if (seeded) state.componentsStarted += 1;
        denseStalled = 0;
      }
    }
    state.clueFeasibility = {
      schemaVersion: 1,
      mode: currentMode,
      placement: cloneTelemetry(telemetry),
    };
    return state;
  }

  solver.buildAttempt = buildAttempt;

  if (originalAssignClueTextCells) {
    solver.assignClueTextCellsV2 = (state, random, restarts) => {
      const currentMode = mode();
      if (currentMode === "off") return originalAssignClueTextCells(state, random, restarts);
      const config = options();
      const estimate = evaluateState(state, null, config);
      const layout = originalAssignClueTextCells(state, random, restarts);
      const predictedPass = estimate.completeNecessaryPass;
      const actualPass = layout.clueTextCells >= config.minimumClueTextCells
        && layout.externalClueTexts >= config.minimumExternalClues;
      const calibration = {
        estimate,
        actual: {
          clueTextCells: layout.clueTextCells,
          externalClues: layout.externalClueTexts,
          passedCheckpoint: actualPass,
        },
        predictedPass,
        falsePositive: predictedPass && !actualPass,
        falseNegative: !predictedPass && actualPass,
        clueTextAbsoluteError: Math.abs(estimate.greedyClueTextCells - layout.clueTextCells),
        externalAbsoluteError: Math.abs(estimate.greedyExternalClues - layout.externalClueTexts),
      };
      state.clueFeasibility = {
        ...(state.clueFeasibility || {}),
        schemaVersion: 1,
        mode: currentMode,
        calibration,
      };
      state.grid.__scanwordClueFeasibility = state.clueFeasibility;
      const pool = state.__clueFeasibilityPool;
      const telemetry = pool ? telemetryForPool(pool) : null;
      if (telemetry) {
        telemetry.completeStates += 1;
        telemetry.predictedPasses += Number(predictedPass);
        telemetry.actualPasses += Number(actualPass);
        telemetry.falsePositives += Number(calibration.falsePositive);
        telemetry.falseNegatives += Number(calibration.falseNegative);
        telemetry.clueTextAbsoluteError += calibration.clueTextAbsoluteError;
        telemetry.externalAbsoluteError += calibration.externalAbsoluteError;
      }
      return layout;
    };
  }

  if (originalAttachValidationReport) {
    solver.attachValidationReport = (result, ...args) => {
      const attached = originalAttachValidationReport(result, ...args);
      const selected = attached?.grid?.__scanwordClueFeasibility || null;
      const aggregate = attached?.pool ? poolTelemetry.get(attached.pool) : null;
      if (selected || aggregate) {
        attached.clueFeasibility = {
          schemaVersion: 1,
          mode: mode(),
          selected,
          aggregate: aggregate ? cloneTelemetry(aggregate) : null,
        };
      }
      return attached;
    };
  }

  Object.assign(solver, {
    evaluateClueFeasibilityV1: evaluateState,
    evaluatePlacementClueFeasibilityV1: evaluatePlacement,
    __clueFeasibilityV1Installed: true,
  });

  window.ScanwordClueFeasibilityV1 = {
    version: 1,
    mode,
    options,
    evaluateState,
    evaluatePlacement,
    footprintCandidates,
    greedyFootprintEstimate,
  };
})();
