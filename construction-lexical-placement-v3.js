(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const core = window.ScanwordCore;
  if (!solver || !core || solver.__lexicalPlacementV3Installed) return;

  const previousBuildAttempt = solver.buildAttempt.bind(solver);
  const { DIRECTIONS } = core;

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_LEXICAL_PLACEMENT) {
      return process.env.SCANWORD_LEXICAL_PLACEMENT;
    }
    return window.SCANWORD_LEXICAL_PLACEMENT || "off";
  }

  function numericOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  function lexicalPlacementAdjustment(entry, phase = "growth") {
    const answer = String(entry?.answer || "");
    const quality = Number(entry?.lexicalQuality || (answer.length >= 4 ? 80 : 65));
    const weakPenalty = numericOption("SCANWORD_WEAK_PLACEMENT_PENALTY", 12);
    const twoLetterPenalty = numericOption("SCANWORD_TWO_LETTER_PLACEMENT_PENALTY", 8);
    const threeLetterPenalty = numericOption("SCANWORD_THREE_LETTER_PLACEMENT_PENALTY", 4);
    const qualityPenaltyWeight = numericOption("SCANWORD_LEXICAL_QUALITY_PENALTY", 0.25);
    const growthMultiplier = numericOption("SCANWORD_GROWTH_LEXICAL_MULTIPLIER", 0);
    const denseMultiplier = numericOption("SCANWORD_DENSE_LEXICAL_MULTIPLIER", 0.65);
    const lengthBonusWeight = numericOption("SCANWORD_LENGTH_PLACEMENT_BONUS", 0);
    const lengthBonus = Math.min(30, Math.max(0, answer.length - 3) * lengthBonusWeight);

    let penalty = Math.max(0, 80 - quality) * qualityPenaltyWeight;
    if (entry?.weakFill) penalty += weakPenalty;
    if (answer.length === 2) penalty += twoLetterPenalty;
    else if (answer.length === 3) penalty += threeLetterPenalty;

    const multiplier = phase === "dense" ? denseMultiplier : growthMultiplier;
    return lengthBonus - penalty * multiplier;
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
      lexicalPlacementV3: {
        weakPlaced: 0,
        twoLetterPlaced: 0,
        threeLetterPlaced: 0,
        cumulativeAdjustment: 0,
      },
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

  function commitPlacement(state, entry, placement, adjustment = 0) {
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
      weakFill: Boolean(entry.weakFill),
      lexicalQuality: Number(entry.lexicalQuality || (entry.answer.length >= 4 ? 80 : 65)),
      lexicalSource: entry.lexicalSource || null,
      direction: placement.direction,
      length: entry.answer.length,
      clueRow: placement.clue.row,
      clueCol: placement.clue.col,
      startRow: placement.startRow,
      startCol: placement.startCol,
      cells,
      intersections: placement.intersections,
      lexicalPlacementAdjustment: adjustment,
    });
    state.usedAnswers.add(entry.answer);
    state.lexicalPlacementV3.cumulativeAdjustment += adjustment;
    if (entry.weakFill) state.lexicalPlacementV3.weakPlaced += 1;
    if (entry.answer.length === 2) state.lexicalPlacementV3.twoLetterPlaced += 1;
    if (entry.answer.length === 3) state.lexicalPlacementV3.threeLetterPlaced += 1;
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
    commitPlacement(state, entry, options[Math.floor(random() * options.length)], lexicalPlacementAdjustment(entry, "growth"));
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

  function findCrossingCandidatesIndexed(state, poolIndex, random, sampleLimit, phase) {
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
        const adjustment = lexicalPlacementAdjustment(entry, phase);
        insertTopCandidate(top, {
          entry,
          placement,
          adjustment,
          score: placement.score + rarityBonus + adjustment + random() * 5,
        });
      }
    }
    return top;
  }

  function findSeedCandidates(state, pool, random, sampleLimit, phase) {
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
            const adjustment = lexicalPlacementAdjustment(entry, phase);
            const seedScore = placement.score + placement.newCells * 14 + edgeSpread * 1.5 + adjustment + random() * 5;
            insertTopCandidate(top, { entry, placement, adjustment, score: seedScore }, 32);
          }
        }
      }
    }
    return top;
  }

  function buildAttemptLexical(pool, rows, cols, targetWords, random, poolIndex, mode) {
    if (mode !== "indexed") return previousBuildAttempt(pool, rows, cols, targetWords, random, poolIndex, mode);

    const state = createState(rows, cols);
    const initialCandidates = pool.filter((entry) => entry.answer.length >= 5 && entry.answer.length <= 8);
    const first = initialCandidates[Math.floor(random() * initialCandidates.length)] || pool[0];
    if (!first || !placeInitialWord(state, first, random)) return state;

    const maxComponents = 1;
    let stalled = 0;
    while (state.placed.length < targetWords && stalled < 8) {
      let candidates = findCrossingCandidatesIndexed(state, poolIndex, random, Math.min(700, pool.length), "growth");
      let seeded = false;
      if (!candidates.length && state.componentsStarted < maxComponents) {
        candidates = findSeedCandidates(state, pool, random, Math.min(320, pool.length), "growth");
        seeded = candidates.length > 0;
      }
      if (!candidates.length) { stalled += 1; continue; }
      const remaining = targetWords - state.placed.length;
      if (!seeded) {
        const newCellPenalty = remaining <= 5 ? 6 : 3;
        candidates.sort((a, b) => (b.score - newCellPenalty * b.placement.newCells) - (a.score - newCellPenalty * a.placement.newCells));
      }
      const shortlistSize = seeded ? 5 : (remaining <= 5 ? 1 : 4);
      const shortlist = candidates.slice(0, Math.min(shortlistSize, candidates.length));
      const selected = shortlist[Math.floor(random() * shortlist.length)];
      commitPlacement(state, selected.entry, selected.placement, selected.adjustment || 0);
      if (seeded) state.componentsStarted += 1;
      stalled = 0;
    }

    if (state.placed.length >= targetWords) {
      let denseStalled = 0;
      const denseLimit = 80;
      while (state.placed.length < denseLimit && denseStalled < 6) {
        let candidates = findCrossingCandidatesIndexed(state, poolIndex, random, Math.min(700, pool.length), "dense");
        let seeded = false;
        if (!candidates.length && state.componentsStarted < maxComponents) {
          candidates = findSeedCandidates(state, pool, random, Math.min(320, pool.length), "dense");
          seeded = candidates.length > 0;
        }
        if (!candidates.length) { denseStalled += 1; continue; }
        if (!seeded) {
          candidates.sort((a, b) => (b.score + 4 * b.placement.newCells) - (a.score + 4 * a.placement.newCells));
        }
        const shortlist = candidates.slice(0, Math.min(seeded ? 4 : 5, candidates.length));
        const selected = shortlist[Math.floor(random() * shortlist.length)];
        commitPlacement(state, selected.entry, selected.placement, selected.adjustment || 0);
        if (seeded) state.componentsStarted += 1;
        denseStalled = 0;
      }
    }
    return state;
  }

  solver.buildAttempt = (...args) => {
    if (modeFromEnvironment() !== "on") return previousBuildAttempt(...args);
    return buildAttemptLexical(...args);
  };

  Object.assign(solver, {
    lexicalPlacementAdjustmentV3: lexicalPlacementAdjustment,
    buildAttemptLexicalV3: buildAttemptLexical,
    __lexicalPlacementV3Installed: true,
  });
})();
