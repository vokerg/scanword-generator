(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const core = window.ScanwordCore;
  const feasibilityApi = window.ScanwordClueFeasibilityV1;
  if (!solver || !core || solver.__boundedPartialSearchV1Installed) return;

  const { DIRECTIONS } = core;
  const originalBuildAttempt = solver.buildAttempt.bind(solver);
  const originalAttachValidationReport = typeof solver.attachValidationReport === "function"
    ? solver.attachValidationReport.bind(solver)
    : null;
  const poolTelemetry = new WeakMap();

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function numericOption(name, fallback, minimum = 0) {
    const value = Number(environmentOption(name, fallback));
    return Number.isFinite(value) && value >= minimum ? value : fallback;
  }

  function mode() {
    const value = String(environmentOption("SCANWORD_PARTIAL_SEARCH", "off")).toLowerCase();
    return ["off", "shadow", "beam"].includes(value) ? value : "off";
  }

  function options(targetWords = 30) {
    return {
      sampleRate: Math.min(1, Math.max(0, numericOption("SCANWORD_PARTIAL_SEARCH_RATE", 0.20, 0))),
      branchStart: Math.max(4, Math.floor(numericOption(
        "SCANWORD_PARTIAL_SEARCH_START",
        Math.max(18, targetWords - 4),
        4,
      ))),
      depth: Math.max(1, Math.floor(numericOption("SCANWORD_PARTIAL_SEARCH_DEPTH", 4, 1))),
      beamWidth: Math.max(1, Math.floor(numericOption("SCANWORD_PARTIAL_SEARCH_BEAM", 4, 1))),
      branching: Math.max(1, Math.floor(numericOption("SCANWORD_PARTIAL_SEARCH_BRANCHING", 3, 1))),
      maxNodes: Math.max(1, Math.floor(numericOption("SCANWORD_PARTIAL_SEARCH_NODES", 48, 1))),
      denseLimit: Math.max(targetWords, Math.floor(numericOption("SCANWORD_PARTIAL_SEARCH_DENSE_LIMIT", 80, targetWords))),
      maxWeakFill: Math.max(0, Math.floor(numericOption("SCANWORD_PARTIAL_SEARCH_WEAK_FILL", 3, 0))),
    };
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
      usedAnswers: new Set(state.usedAnswers || state.placed.map((word) => word.answer)),
      clueFootprints: (state.clueFootprints || []).map((footprint) => ({
        ...footprint,
        cells: footprint.cells.map((cell) => ({ ...cell })),
      })),
      __phase6Ancestry: [...(state.__phase6Ancestry || [])],
    };
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
      __phase6Ancestry: [],
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
        if (cell.char !== char || cell.directions.includes(direction)) return null;
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
      lexicalQuality: entry.lexicalQuality,
      weakFill: Boolean(entry.weakFill),
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
        anchors.push({ row, col, direction, bucket, jitter: random() });
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

  function stateSignature(state) {
    return state.placed.map((word) => (
      `${word.direction}:${word.clueRow},${word.clueCol}:${word.answer}`
    )).sort().join("|");
  }

  function weakFillCount(state) {
    return state.placed.reduce((sum, word) => sum + Number(Boolean(word.weakFill)), 0);
  }

  function evaluateState(state) {
    const metrics = solver.resultMetrics(state);
    const feasibility = feasibilityApi?.evaluateState
      ? feasibilityApi.evaluateState(state)
      : {
          panelCells: metrics.panelCells,
          greedyClueTextCells: 0,
          greedyExternalClues: 0,
          zeroDomainClues: 0,
          longClueImpossible: 0,
          overlapPressure: 0,
          isolatedPanels: metrics.isolatedPanels,
          completeNecessaryPass: true,
        };
    return {
      valid: Boolean(metrics.validation?.valid && metrics.components === 1),
      necessaryPass: Boolean(feasibility.completeNecessaryPass),
      projectedPanels: Math.max(0, Number(feasibility.panelCells || 0) - Number(feasibility.greedyClueTextCells || 0)),
      panelCells: Number(feasibility.panelCells || metrics.panelCells || 0),
      placed: state.placed.length,
      intersections: metrics.intersections,
      letterCells: metrics.letterCells,
      greedyClueTextCells: Number(feasibility.greedyClueTextCells || 0),
      greedyExternalClues: Number(feasibility.greedyExternalClues || 0),
      zeroDomainClues: Number(feasibility.zeroDomainClues || 0),
      longClueImpossible: Number(feasibility.longClueImpossible || 0),
      overlapPressure: Number(feasibility.overlapPressure || 0),
      isolatedPanels: Number(feasibility.isolatedPanels || metrics.isolatedPanels || 0),
      weakFill: weakFillCount(state),
      signature: stateSignature(state),
    };
  }

  function compareStates(a, b) {
    const ar = evaluateState(a);
    const br = evaluateState(b);
    return Number(br.valid) - Number(ar.valid)
      || Number(br.necessaryPass) - Number(ar.necessaryPass)
      || ar.projectedPanels - br.projectedPanels
      || br.placed - ar.placed
      || br.intersections - ar.intersections
      || br.letterCells - ar.letterCells
      || br.greedyClueTextCells - ar.greedyClueTextCells
      || br.greedyExternalClues - ar.greedyExternalClues
      || ar.zeroDomainClues - br.zeroDomainClues
      || ar.longClueImpossible - br.longClueImpossible
      || ar.overlapPressure - br.overlapPressure
      || ar.isolatedPanels - br.isolatedPanels
      || ar.weakFill - br.weakFill
      || ar.signature.localeCompare(br.signature);
  }

  function preparedCandidates(state, pool, poolIndex, random, targetWords) {
    const candidates = findCrossingCandidatesIndexed(state, poolIndex, random, Math.min(700, pool.length));
    if (!candidates.length) return [];
    if (state.placed.length < targetWords) {
      const remaining = targetWords - state.placed.length;
      const penalty = remaining <= 5 ? 6 : 3;
      candidates.sort((a, b) => (b.score - penalty * b.placement.newCells) - (a.score - penalty * a.placement.newCells)
        || a.entry.answer.localeCompare(b.entry.answer, "ru"));
    } else {
      candidates.sort((a, b) => (b.score + 4 * b.placement.newCells) - (a.score + 4 * a.placement.newCells)
        || a.entry.answer.localeCompare(b.entry.answer, "ru"));
    }
    return candidates;
  }

  function greedyStep(state, pool, poolIndex, random, targetWords) {
    const candidates = preparedCandidates(state, pool, poolIndex, random, targetWords);
    if (!candidates.length) return false;
    const remaining = targetWords - state.placed.length;
    const shortlistSize = state.placed.length < targetWords ? (remaining <= 5 ? 1 : 4) : 5;
    const shortlist = candidates.slice(0, Math.min(shortlistSize, candidates.length));
    const selected = shortlist[Math.floor(random() * shortlist.length)];
    commitPlacement(state, selected.entry, selected.placement);
    state.__phase6Ancestry.push({
      kind: "greedy",
      answer: selected.entry.answer,
      direction: selected.placement.direction,
      startRow: selected.placement.startRow,
      startCol: selected.placement.startCol,
    });
    return true;
  }

  function greedyPrefix(state, pool, poolIndex, random, targetWords, stopAt) {
    let stalled = 0;
    while (state.placed.length < stopAt && stalled < 8) {
      if (greedyStep(state, pool, poolIndex, random, targetWords)) stalled = 0;
      else stalled += 1;
    }
    return state;
  }

  function greedyComplete(state, pool, poolIndex, random, targetWords, denseLimit) {
    let stalled = 0;
    while (state.placed.length < targetWords && stalled < 8) {
      if (greedyStep(state, pool, poolIndex, random, targetWords)) stalled = 0;
      else stalled += 1;
    }
    if (state.placed.length >= targetWords) {
      let denseStalled = 0;
      while (state.placed.length < denseLimit && denseStalled < 6) {
        if (greedyStep(state, pool, poolIndex, random, targetWords)) denseStalled = 0;
        else denseStalled += 1;
      }
    }
    return state;
  }

  function seedToken(values) {
    return values.slice(0, 24).map((value) => Math.floor(value * 0x7fffffff).toString(36)).join("-");
  }

  function beamSearch(pool, rows, cols, targetWords, poolIndex, token, config, telemetry) {
    const initialRandom = core.makeRandom(`phase6:${token}:initial`);
    const state = createState(rows, cols);
    const initialCandidates = pool.filter((entry) => entry.answer.length >= 5 && entry.answer.length <= 8);
    const first = initialCandidates[Math.floor(initialRandom() * initialCandidates.length)] || pool[0];
    if (!first || !placeInitialWord(state, first, initialRandom)) return null;
    state.__phase6Ancestry.push({ kind: "initial", answer: first.answer });
    greedyPrefix(state, pool, poolIndex, initialRandom, targetWords, config.branchStart);

    let beam = [state];
    for (let depth = 0; depth < config.depth && telemetry.nodes < config.maxNodes; depth += 1) {
      const next = [];
      const seen = new Set();
      for (const parent of beam) {
        const signature = stateSignature(parent);
        const random = core.makeRandom(`phase6:${token}:beam:${depth}:${signature}`);
        const candidates = preparedCandidates(parent, pool, poolIndex, random, targetWords)
          .slice(0, config.branching);
        telemetry.branchRounds += 1;
        telemetry.candidatesConsidered += candidates.length;
        for (let branch = 0; branch < candidates.length && telemetry.nodes < config.maxNodes; branch += 1) {
          const candidate = candidates[branch];
          const child = cloneState(parent);
          commitPlacement(child, candidate.entry, candidate.placement);
          child.__phase6Ancestry.push({
            kind: "beam",
            depth,
            branch,
            answer: candidate.entry.answer,
            direction: candidate.placement.direction,
            startRow: candidate.placement.startRow,
            startCol: candidate.placement.startCol,
          });
          telemetry.nodes += 1;
          const childSignature = stateSignature(child);
          if (seen.has(childSignature)) {
            telemetry.deduplicated += 1;
            continue;
          }
          if (weakFillCount(child) > config.maxWeakFill) {
            telemetry.weakFillPruned += 1;
            continue;
          }
          seen.add(childSignature);
          next.push(child);
        }
      }
      if (!next.length) break;
      next.sort(compareStates);
      beam = next.slice(0, config.beamWidth);
      telemetry.depthReached = depth + 1;
      telemetry.beamPeak = Math.max(telemetry.beamPeak, beam.length);
    }

    const completed = [];
    for (let index = 0; index < beam.length; index += 1) {
      const finalist = cloneState(beam[index]);
      const random = core.makeRandom(`phase6:${token}:complete:${index}:${stateSignature(finalist)}`);
      greedyComplete(finalist, pool, poolIndex, random, targetWords, config.denseLimit);
      completed.push(finalist);
    }
    telemetry.finalists = completed.length;
    completed.sort(compareStates);
    return completed[0] || state;
  }

  function telemetryForPool(pool) {
    let telemetry = poolTelemetry.get(pool);
    if (!telemetry) {
      telemetry = {
        schemaVersion: 1,
        search: "late-placement-beam-v1",
        mode: mode(),
        attemptsObserved: 0,
        attemptsSampled: 0,
        branchRounds: 0,
        candidatesConsidered: 0,
        nodes: 0,
        deduplicated: 0,
        weakFillPruned: 0,
        depthReached: 0,
        beamPeak: 0,
        finalists: 0,
        beamPreferred: 0,
        baselinePreferred: 0,
        beamReturned: 0,
        baselineReturned: 0,
      };
      poolTelemetry.set(pool, telemetry);
    }
    return telemetry;
  }

  function cloneTelemetry(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function buildAttempt(pool, rows, cols, targetWords, random, poolIndex = solver.buildPoolIndex(pool), requestedMode) {
    const currentMode = mode();
    if (currentMode === "off" || String(requestedMode || "indexed") !== "indexed") {
      return originalBuildAttempt(pool, rows, cols, targetWords, random, poolIndex, requestedMode);
    }

    const aggregate = telemetryForPool(pool);
    aggregate.mode = currentMode;
    aggregate.attemptsObserved += 1;
    const recorded = [];
    const baseline = originalBuildAttempt(
      pool,
      rows,
      cols,
      targetWords,
      () => {
        const value = random();
        recorded.push(value);
        return value;
      },
      poolIndex,
      requestedMode,
    );
    const config = options(targetWords);
    const sampled = Number(recorded[0] || 1) < config.sampleRate;
    const attemptTelemetry = {
      schemaVersion: 1,
      search: "late-placement-beam-v1",
      mode: currentMode,
      sampled,
      config,
      branchRounds: 0,
      candidatesConsidered: 0,
      nodes: 0,
      deduplicated: 0,
      weakFillPruned: 0,
      depthReached: 0,
      beamPeak: 0,
      finalists: 0,
      baselineRank: evaluateState(baseline),
      beamRank: null,
      selectedVariant: "baseline",
      ancestry: [],
    };

    if (!sampled || recorded.length === 0) {
      aggregate.baselineReturned += 1;
      baseline.partialSearch = attemptTelemetry;
      baseline.grid.__scanwordPartialSearch = attemptTelemetry;
      return baseline;
    }

    aggregate.attemptsSampled += 1;
    const candidate = beamSearch(
      pool,
      rows,
      cols,
      targetWords,
      poolIndex,
      seedToken(recorded),
      config,
      attemptTelemetry,
    );
    aggregate.branchRounds += attemptTelemetry.branchRounds;
    aggregate.candidatesConsidered += attemptTelemetry.candidatesConsidered;
    aggregate.nodes += attemptTelemetry.nodes;
    aggregate.deduplicated += attemptTelemetry.deduplicated;
    aggregate.weakFillPruned += attemptTelemetry.weakFillPruned;
    aggregate.depthReached = Math.max(aggregate.depthReached, attemptTelemetry.depthReached);
    aggregate.beamPeak = Math.max(aggregate.beamPeak, attemptTelemetry.beamPeak);
    aggregate.finalists += attemptTelemetry.finalists;

    if (candidate) {
      attemptTelemetry.beamRank = evaluateState(candidate);
      const beamBetter = compareStates(candidate, baseline) < 0;
      if (beamBetter) aggregate.beamPreferred += 1;
      else aggregate.baselinePreferred += 1;
      if (currentMode === "beam" && beamBetter) {
        attemptTelemetry.selectedVariant = "beam";
        attemptTelemetry.ancestry = candidate.__phase6Ancestry || [];
        candidate.partialSearch = attemptTelemetry;
        candidate.grid.__scanwordPartialSearch = attemptTelemetry;
        aggregate.beamReturned += 1;
        return candidate;
      }
    }

    aggregate.baselineReturned += 1;
    baseline.partialSearch = attemptTelemetry;
    baseline.grid.__scanwordPartialSearch = attemptTelemetry;
    return baseline;
  }

  solver.buildAttempt = buildAttempt;

  if (originalAttachValidationReport) {
    solver.attachValidationReport = (result, ...args) => {
      const attached = originalAttachValidationReport(result, ...args);
      const selected = attached?.grid?.__scanwordPartialSearch || null;
      const aggregate = attached?.pool ? poolTelemetry.get(attached.pool) : null;
      if (selected || aggregate) {
        attached.partialSearch = {
          schemaVersion: 1,
          search: "late-placement-beam-v1",
          mode: mode(),
          selected,
          aggregate: aggregate ? cloneTelemetry(aggregate) : null,
        };
      }
      return attached;
    };
  }

  Object.assign(solver, {
    comparePartialSearchStatesV1: compareStates,
    evaluatePartialSearchStateV1: evaluateState,
    __boundedPartialSearchV1Installed: true,
  });

  window.ScanwordBoundedPartialSearchV1 = {
    version: 1,
    search: "late-placement-beam-v1",
    mode,
    options,
    cloneState,
    stateSignature,
    evaluateState,
    compareStates,
  };
})();
