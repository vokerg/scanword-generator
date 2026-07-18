(() => {
  "use strict";

  const DIRECTIONS = window.ScanwordCore?.DIRECTIONS || {
    right: { dr: 0, dc: 1 },
    down: { dr: 1, dc: 0 },
  };
  const ORTHOGONAL = [[-1, 0], [0, -1], [0, 1], [1, 0]];

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function compareCells(a, b) {
    return a.row - b.row || a.col - b.col;
  }

  function inBounds(grid, row, col) {
    return row >= 0 && row < grid.length && col >= 0 && col < grid[0].length;
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

  function cloneResult(result) {
    return {
      ...result,
      grid: result.grid.map((row) => row.map(cloneCell)),
      placed: result.placed.map((word) => ({
        ...word,
        cells: word.cells.map((cell) => ({ ...cell })),
      })),
      clueFootprints: (result.clueFootprints || []).map((footprint) => ({
        ...footprint,
        cells: footprint.cells.map((cell) => ({ ...cell })),
      })),
    };
  }

  function measureCoverage(grid) {
    const cells = grid.flat();
    const totalCells = cells.length;
    const letterCells = cells.filter((cell) => cell.type === "letter").length;
    const clueCells = cells.filter((cell) => cell.type === "clue").length;
    const clueTextCells = cells.filter((cell) => cell.type === "clueText" || cell.type === "clueTextContinuation").length;
    const panelCells = cells.filter((cell) => cell.type === "panel").length;
    const activeCells = letterCells + clueCells + clueTextCells;
    const answerSpaceCells = Math.max(1, totalCells - clueCells - clueTextCells);
    return {
      totalCells,
      letterCells,
      clueCells,
      clueTextCells,
      panelCells,
      activeCells,
      rawLetterCoverage: totalCells ? letterCells / totalCells : 0,
      activeCoverage: totalCells ? activeCells / totalCells : 0,
      answerSpaceCoverage: letterCells / answerSpaceCells,
    };
  }

  function extractResidualRegions(subject) {
    const grid = subject.grid || subject;
    const rows = grid.length;
    const cols = grid[0]?.length || 0;
    const seen = new Set();
    const regions = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (grid[row][col].type !== "panel") continue;
        const startKey = cellKey(row, col);
        if (seen.has(startKey)) continue;

        const queue = [{ row, col }];
        const cells = [];
        const boundary = new Map();
        const boundaryWords = new Set();
        const neighboringClues = new Map();
        let perimeter = 0;
        let touchesEdge = false;
        seen.add(startKey);

        for (let index = 0; index < queue.length; index += 1) {
          const current = queue[index];
          cells.push(current);
          for (const [dr, dc] of ORTHOGONAL) {
            const nextRow = current.row + dr;
            const nextCol = current.col + dc;
            if (!inBounds(grid, nextRow, nextCol)) {
              perimeter += 1;
              touchesEdge = true;
              continue;
            }
            const next = grid[nextRow][nextCol];
            const nextKey = cellKey(nextRow, nextCol);
            if (next.type === "panel") {
              if (!seen.has(nextKey)) {
                seen.add(nextKey);
                queue.push({ row: nextRow, col: nextCol });
              }
              continue;
            }

            perimeter += 1;
            if (!boundary.has(nextKey)) {
              boundary.set(nextKey, {
                row: nextRow,
                col: nextCol,
                type: next.type,
                char: next.char || null,
                slotIds: [...(next.slotIds || [])].sort((a, b) => a - b),
                directions: [...(next.directions || [])].sort(),
                clueDirections: (next.clues || []).map((clue) => clue.direction).sort(),
              });
            }
            for (const slotId of next.slotIds || []) boundaryWords.add(slotId);
            if (next.type === "clue") neighboringClues.set(nextKey, boundary.get(nextKey));
          }
        }

        cells.sort(compareCells);
        const minRow = Math.min(...cells.map((cell) => cell.row));
        const maxRow = Math.max(...cells.map((cell) => cell.row));
        const minCol = Math.min(...cells.map((cell) => cell.col));
        const maxCol = Math.max(...cells.map((cell) => cell.col));
        const boundaryCells = [...boundary.values()].sort(compareCells);
        const boundaryLetterCount = boundaryCells.filter((cell) => cell.type === "letter").length;
        const difficulty = cells.length * 100 + perimeter * 4 - boundaryLetterCount * 9 + boundaryWords.size * 3;

        regions.push({
          id: regions.length + 1,
          cells,
          boundaryCells,
          boundaryWords: [...boundaryWords].sort((a, b) => a - b),
          neighboringClues: [...neighboringClues.values()].sort(compareCells),
          size: cells.length,
          perimeter,
          touchesEdge,
          difficulty,
          boundingBox: {
            minRow,
            maxRow,
            minCol,
            maxCol,
            rows: maxRow - minRow + 1,
            cols: maxCol - minCol + 1,
          },
        });
      }
    }

    return regions;
  }

  function buildPatternIndex(pool) {
    const entries = [];
    const seen = new Set();
    for (const entry of pool || []) {
      if (!entry?.hasExactClue || !entry.answer || seen.has(entry.answer)) continue;
      seen.add(entry.answer);
      entries.push(entry);
    }
    entries.sort((a, b) => a.answer.length - b.answer.length || a.answer.localeCompare(b.answer, "ru"));

    const byLength = new Map();
    const byPositionLetter = new Map();
    for (const entry of entries) {
      if (!byLength.has(entry.answer.length)) byLength.set(entry.answer.length, []);
      byLength.get(entry.answer.length).push(entry);
      for (let position = 0; position < entry.answer.length; position += 1) {
        const key = `${entry.answer.length}:${position}:${entry.answer[position]}`;
        if (!byPositionLetter.has(key)) byPositionLetter.set(key, []);
        byPositionLetter.get(key).push(entry);
      }
    }
    return { entries, byLength, byPositionLetter };
  }

  function queryPattern(index, pattern, usedAnswers = new Set(), telemetry = null) {
    const normalized = Array.isArray(pattern) ? pattern : [...String(pattern)].map((char) => char === "?" ? null : char);
    const lengthBucket = index.byLength.get(normalized.length) || [];
    const buckets = [lengthBucket];
    for (let position = 0; position < normalized.length; position += 1) {
      const char = normalized[position];
      if (!char) continue;
      buckets.push(index.byPositionLetter.get(`${normalized.length}:${position}:${char}`) || []);
    }
    buckets.sort((a, b) => a.length - b.length);
    const base = buckets[0] || [];
    if (telemetry) telemetry.lookups += 1;
    const result = [];
    for (const entry of base) {
      if (telemetry) telemetry.checks += 1;
      if (usedAnswers.has(entry.answer)) continue;
      let matches = true;
      for (let position = 0; position < normalized.length; position += 1) {
        if (normalized[position] && normalized[position] !== entry.answer[position]) {
          matches = false;
          break;
        }
      }
      if (matches) result.push(entry);
    }
    return result;
  }

  function candidateSignature(candidate) {
    return `${candidate.direction}:${candidate.clueRow},${candidate.clueCol}:${candidate.startRow},${candidate.startCol}:${candidate.length}`;
  }

  function enumerateRegionSlots(result, region, patternIndex, usedAnswers, options, telemetry) {
    const grid = result.grid;
    const regionKeys = new Set(region.cells.map((cell) => cellKey(cell.row, cell.col)));
    const anchorMap = new Map(region.cells.map((cell) => [cellKey(cell.row, cell.col), cell]));
    for (const cell of region.boundaryCells) {
      if (cell.type === "clue") anchorMap.set(cellKey(cell.row, cell.col), { row: cell.row, col: cell.col });
    }
    const anchors = [...anchorMap.values()].sort(compareCells);
    const lengths = [...patternIndex.byLength.keys()].sort((a, b) => a - b);
    const candidates = [];

    for (const anchor of anchors) {
      const clueCell = grid[anchor.row][anchor.col];
      for (const direction of ["right", "down"]) {
        if (clueCell.type !== "panel" && clueCell.type !== "clue") continue;
        if (clueCell.type === "panel" && !regionKeys.has(cellKey(anchor.row, anchor.col))) continue;
        if ((clueCell.clues || []).some((clue) => clue.direction === direction)) continue;
        if ((clueCell.clues || []).length >= 2) continue;
        const { dr, dc } = DIRECTIONS[direction];

        for (const length of lengths) {
          const startRow = anchor.row + dr;
          const startCol = anchor.col + dc;
          const endRow = startRow + dr * (length - 1);
          const endCol = startCol + dc * (length - 1);
          if (!inBounds(grid, startRow, startCol) || !inBounds(grid, endRow, endCol)) continue;

          const cells = [];
          const pattern = [];
          const regionLetterKeys = [];
          const forbiddenLetterKeys = new Set();
          let existingIntersections = 0;
          let invalid = false;

          for (let position = 0; position < length; position += 1) {
            const row = startRow + dr * position;
            const col = startCol + dc * position;
            const key = cellKey(row, col);
            const cell = grid[row][col];
            if (cell.type === "clue" || cell.type === "clueText" || cell.type === "clueTextContinuation") {
              invalid = true;
              break;
            }
            if (cell.type === "letter") {
              if ((cell.directions || []).includes(direction) || (cell.directions || []).length >= 2) {
                invalid = true;
                break;
              }
              pattern.push(cell.char);
              existingIntersections += 1;
            } else if (cell.type === "panel" && regionKeys.has(key)) {
              pattern.push(null);
              regionLetterKeys.push(key);
              const sideOffsets = direction === "right" ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
              for (const [sideDr, sideDc] of sideOffsets) {
                const sideRow = row + sideDr;
                const sideCol = col + sideDc;
                if (!inBounds(grid, sideRow, sideCol)) continue;
                const side = grid[sideRow][sideCol];
                const sideKey = cellKey(sideRow, sideCol);
                if (side.type === "letter") {
                  invalid = true;
                  break;
                }
                if (side.type === "panel" && regionKeys.has(sideKey)) forbiddenLetterKeys.add(sideKey);
              }
              if (invalid) break;
            } else {
              invalid = true;
              break;
            }
            cells.push({ row, col });
          }
          if (invalid || !regionLetterKeys.length) continue;

          const afterRow = endRow + dr;
          const afterCol = endCol + dc;
          if (inBounds(grid, afterRow, afterCol)) {
            const after = grid[afterRow][afterCol];
            const afterKey = cellKey(afterRow, afterCol);
            if (after.type === "letter") continue;
            if (after.type === "panel" && regionKeys.has(afterKey)) forbiddenLetterKeys.add(afterKey);
          }
          for (const key of regionLetterKeys) forbiddenLetterKeys.delete(key);
          const clueKey = cellKey(anchor.row, anchor.col);
          if (regionLetterKeys.includes(clueKey)) continue;

          const domain = queryPattern(patternIndex, pattern, usedAnswers, telemetry);
          if (!domain.length) continue;
          const candidate = {
            id: candidates.length,
            clueRow: anchor.row,
            clueCol: anchor.col,
            clueKey,
            direction,
            startRow,
            startCol,
            length,
            cells,
            pattern,
            regionLetterKeys,
            regionLetterKeySet: new Set(regionLetterKeys),
            forbiddenLetterKeys: [...forbiddenLetterKeys].sort(),
            existingIntersections,
            baseDomain: domain.slice(0, options.maxDomainSize),
          };
          candidate.signature = candidateSignature(candidate);
          candidates.push(candidate);
        }
      }
    }

    candidates.sort((a, b) =>
      b.regionLetterKeys.length - a.regionLetterKeys.length
      || b.existingIntersections - a.existingIntersections
      || a.baseDomain.length - b.baseDomain.length
      || a.signature.localeCompare(b.signature));
    candidates.forEach((candidate, index) => { candidate.id = index; });
    return candidates.slice(0, options.maxSlotCandidates);
  }

  function slotsConflict(a, b) {
    if (a.clueKey === b.clueKey && a.direction === b.direction) return true;
    if (a.regionLetterKeySet.has(b.clueKey) || b.regionLetterKeySet.has(a.clueKey)) return true;
    if (a.forbiddenLetterKeys.some((key) => b.regionLetterKeySet.has(key))) return true;
    if (b.forbiddenLetterKeys.some((key) => a.regionLetterKeySet.has(key))) return true;

    let sharedLetters = 0;
    for (const key of a.regionLetterKeys) {
      if (!b.regionLetterKeySet.has(key)) continue;
      sharedLetters += 1;
      if (a.direction === b.direction || sharedLetters > 1) return true;
    }
    return false;
  }

  function topologyConnected(slots) {
    if (!slots.length) return false;
    const root = slots.length;
    const graph = Array.from({ length: slots.length + 1 }, () => new Set());
    for (let index = 0; index < slots.length; index += 1) {
      if (slots[index].existingIntersections > 0) {
        graph[index].add(root);
        graph[root].add(index);
      }
      for (let other = index + 1; other < slots.length; other += 1) {
        const shared = slots[index].cells.some((cell) => slots[other].cells.some((target) => target.row === cell.row && target.col === cell.col));
        if (shared) {
          graph[index].add(other);
          graph[other].add(index);
        }
      }
    }
    const seen = new Set([root]);
    const stack = [root];
    while (stack.length) {
      const current = stack.pop();
      for (const next of graph[current]) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    return seen.size === slots.length + 1;
  }

  function enumerateTopologies(region, candidates, options, telemetry) {
    const regionKeys = region.cells.map((cell) => cellKey(cell.row, cell.col));
    const candidatesByCell = new Map(regionKeys.map((key) => [key, []]));
    for (const candidate of candidates) {
      if (candidatesByCell.has(candidate.clueKey)) candidatesByCell.get(candidate.clueKey).push(candidate);
      for (const key of candidate.regionLetterKeys) candidatesByCell.get(key)?.push(candidate);
    }
    for (const values of candidatesByCell.values()) values.sort((a, b) => a.id - b.id);

    const topologies = [];
    const seen = new Set();
    function visit(selected, roles, mustBeClue) {
      telemetry.topologyNodes += 1;
      if (telemetry.topologyNodes > options.maxTopologyNodes || topologies.length >= options.maxTopologies) return;

      const uncovered = regionKeys.filter((key) => !roles.has(key));
      if (!uncovered.length) {
        if ([...mustBeClue].some((key) => roles.get(key) !== "clue")) return;
        if (!topologyConnected(selected)) return;
        const signature = selected.map((slot) => slot.signature).sort().join("|");
        if (seen.has(signature)) return;
        seen.add(signature);
        topologies.push([...selected].sort((a, b) => a.signature.localeCompare(b.signature)));
        return;
      }
      if (selected.length >= options.maxSlotsPerTopology) return;

      const choices = uncovered.map((key) => {
        const compatible = (candidatesByCell.get(key) || []).filter((candidate) => {
          if (selected.includes(candidate)) return false;
          if (selected.some((slot) => slotsConflict(slot, candidate))) return false;
          if (roles.get(candidate.clueKey) === "letter") return false;
          if (candidate.regionLetterKeys.some((letterKey) => roles.get(letterKey) === "clue" || mustBeClue.has(letterKey))) return false;
          return true;
        });
        return { key, compatible };
      }).sort((a, b) => a.compatible.length - b.compatible.length || a.key.localeCompare(b.key));

      const next = choices[0];
      if (!next?.compatible.length) return;
      const ordered = [...next.compatible].sort((a, b) => {
        const newCoverageA = a.regionLetterKeys.filter((key) => !roles.has(key)).length + (roles.has(a.clueKey) ? 0 : 1);
        const newCoverageB = b.regionLetterKeys.filter((key) => !roles.has(key)).length + (roles.has(b.clueKey) ? 0 : 1);
        return newCoverageB - newCoverageA || a.baseDomain.length - b.baseDomain.length || a.signature.localeCompare(b.signature);
      });

      for (const candidate of ordered) {
        const nextRoles = new Map(roles);
        const nextMustBeClue = new Set(mustBeClue);
        nextRoles.set(candidate.clueKey, "clue");
        for (const key of candidate.regionLetterKeys) nextRoles.set(key, "letter");
        for (const key of candidate.forbiddenLetterKeys) {
          if (regionKeys.includes(key)) nextMustBeClue.add(key);
        }
        visit([...selected, candidate], nextRoles, nextMustBeClue);
        if (telemetry.topologyNodes > options.maxTopologyNodes || topologies.length >= options.maxTopologies) break;
      }
    }

    visit([], new Map(), new Set());
    topologies.sort((a, b) => {
      const lettersA = new Set(a.flatMap((slot) => slot.regionLetterKeys)).size;
      const lettersB = new Set(b.flatMap((slot) => slot.regionLetterKeys)).size;
      return lettersB - lettersA || a.length - b.length || a.map((slot) => slot.signature).join("|").localeCompare(b.map((slot) => slot.signature).join("|"));
    });
    return topologies;
  }

  function buildCrossings(slots) {
    const usage = new Map();
    slots.forEach((slot, slotIndex) => {
      slot.cells.forEach((cell, position) => {
        const key = cellKey(cell.row, cell.col);
        if (!usage.has(key)) usage.set(key, []);
        usage.get(key).push({ slotIndex, position });
      });
    });
    const crossings = Array.from({ length: slots.length }, () => []);
    for (const refs of usage.values()) {
      if (refs.length !== 2) continue;
      const [a, b] = refs;
      if (slots[a.slotIndex].direction === slots[b.slotIndex].direction) continue;
      crossings[a.slotIndex].push({ other: b.slotIndex, ownPosition: a.position, otherPosition: b.position });
      crossings[b.slotIndex].push({ other: a.slotIndex, ownPosition: b.position, otherPosition: a.position });
    }
    return crossings;
  }

  function solveLocalCsp(slots, usedAnswers = new Set(), options = {}, telemetry = null) {
    const limits = { maxCspNodes: 8000, ...options };
    const stats = telemetry || { cspNodes: 0, forwardPrunes: 0 };
    const crossings = buildCrossings(slots);
    const assignments = new Map();
    const chosenAnswers = new Set(usedAnswers);
    const domains = slots.map((slot) => [...slot.baseDomain]);

    function filteredDomain(slotIndex) {
      return domains[slotIndex].filter((entry) => {
        if (chosenAnswers.has(entry.answer)) return false;
        for (const crossing of crossings[slotIndex]) {
          const other = assignments.get(crossing.other);
          if (other && entry.answer[crossing.ownPosition] !== other.answer[crossing.otherPosition]) return false;
        }
        return true;
      });
    }

    function visit() {
      stats.cspNodes += 1;
      if (stats.cspNodes > limits.maxCspNodes) return null;
      if (assignments.size === slots.length) return new Map(assignments);

      const remaining = [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        if (assignments.has(slotIndex)) continue;
        const domain = filteredDomain(slotIndex);
        if (!domain.length) return null;
        remaining.push({ slotIndex, domain, degree: crossings[slotIndex].filter((crossing) => !assignments.has(crossing.other)).length });
      }
      remaining.sort((a, b) => a.domain.length - b.domain.length || b.degree - a.degree || slots[a.slotIndex].signature.localeCompare(slots[b.slotIndex].signature));
      const current = remaining[0];
      const values = [...current.domain].sort((a, b) => {
        const exactDelta = Number(Boolean(b.hasExactClue)) - Number(Boolean(a.hasExactClue));
        if (exactDelta) return exactDelta;
        const qualityA = Number(a.lexicalQuality || 0);
        const qualityB = Number(b.lexicalQuality || 0);
        return qualityB - qualityA || a.answer.localeCompare(b.answer, "ru");
      });

      for (const entry of values) {
        assignments.set(current.slotIndex, entry);
        chosenAnswers.add(entry.answer);
        let viable = true;
        for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
          if (assignments.has(slotIndex)) continue;
          if (!filteredDomain(slotIndex).length) {
            stats.forwardPrunes += 1;
            viable = false;
            break;
          }
        }
        if (viable) {
          const solution = visit();
          if (solution) return solution;
        }
        chosenAnswers.delete(entry.answer);
        assignments.delete(current.slotIndex);
      }
      return null;
    }

    return { assignments: visit(), stats };
  }

  function applyLocalSolution(result, slots, assignments) {
    const candidate = cloneResult(result);
    const beforeCoverage = measureCoverage(candidate.grid);
    let nextId = candidate.placed.reduce((maximum, word) => Math.max(maximum, Number(word.id) || 0), 0) + 1;

    const ordered = slots.map((slot, slotIndex) => ({ slot, entry: assignments.get(slotIndex) }))
      .sort((a, b) => a.slot.signature.localeCompare(b.slot.signature));
    for (const { slot, entry } of ordered) {
      if (!entry) return null;
      const id = nextId++;
      const clueCell = candidate.grid[slot.clueRow][slot.clueCol];
      if (clueCell.type === "panel") {
        clueCell.type = "clue";
        clueCell.char = null;
        clueCell.slotIds = [];
        clueCell.directions = [];
        clueCell.clues = [];
      }
      clueCell.clues.push({ slotId: id, direction: slot.direction, text: entry.clue, answer: entry.answer });

      const wordCells = [];
      let intersections = 0;
      for (let position = 0; position < slot.cells.length; position += 1) {
        const target = slot.cells[position];
        const cell = candidate.grid[target.row][target.col];
        if (cell.type === "letter") intersections += 1;
        else {
          cell.type = "letter";
          cell.char = entry.answer[position];
          cell.clues = [];
        }
        if (cell.char !== entry.answer[position]) return null;
        cell.slotIds = [...(cell.slotIds || []), id];
        cell.directions = [...(cell.directions || []), slot.direction];
        wordCells.push({ ...target });
      }
      candidate.placed.push({
        id,
        answer: entry.answer,
        clue: entry.clue,
        hasExactClue: true,
        direction: slot.direction,
        length: entry.answer.length,
        clueRow: slot.clueRow,
        clueCol: slot.clueCol,
        startRow: slot.startRow,
        startCol: slot.startCol,
        cells: wordCells,
        intersections,
      });
    }

    const metrics = window.ScanwordSolver.resultMetrics({
      rows: candidate.rows,
      cols: candidate.cols,
      grid: candidate.grid,
      placed: candidate.placed,
    });
    const afterCoverage = measureCoverage(candidate.grid);
    if (!metrics.validation.valid || metrics.components !== 1 || afterCoverage.panelCells >= beforeCoverage.panelCells) return null;
    if (candidate.placed.some((entry) => !entry.hasExactClue)) return null;

    Object.assign(candidate, {
      score: metrics.score,
      intersections: metrics.intersections,
      doubles: metrics.doubles,
      fillRatio: afterCoverage.activeCoverage,
      answerCoverage: afterCoverage.answerSpaceCoverage,
      rawLetterCoverage: afterCoverage.rawLetterCoverage,
      letterCells: afterCoverage.letterCells,
      panelCells: afterCoverage.panelCells,
      panelRatio: afterCoverage.panelCells / Math.max(1, afterCoverage.totalCells),
      components: metrics.components,
      clueTextCells: afterCoverage.clueTextCells,
      panelRegions: metrics.panelRegions,
      isolatedPanels: metrics.isolatedPanels,
      largestPanelRegion: metrics.largestPanelRegion,
      validation: metrics.validation,
      availableSlots: candidate.placed.length,
    });
    return candidate;
  }

  function solveRegion(result, region, patternIndex, options, telemetry) {
    const usedAnswers = new Set(result.placed.map((entry) => entry.answer));
    const slots = enumerateRegionSlots(result, region, patternIndex, usedAnswers, options, telemetry);
    telemetry.slotsEnumerated += slots.length;
    if (!slots.length) return null;
    const topologies = enumerateTopologies(region, slots, options, telemetry);
    telemetry.topologiesEnumerated += topologies.length;

    let best = null;
    for (const topology of topologies) {
      telemetry.topologiesTried += 1;
      const cspStats = { cspNodes: 0, forwardPrunes: 0 };
      const solved = solveLocalCsp(topology, usedAnswers, options, cspStats);
      telemetry.cspNodes += cspStats.cspNodes;
      telemetry.forwardPrunes += cspStats.forwardPrunes;
      if (!solved.assignments) continue;
      const applied = applyLocalSolution(result, topology, solved.assignments);
      if (!applied) continue;
      const coverage = measureCoverage(applied.grid);
      const clueAnchors = new Set(topology.map((slot) => slot.clueKey)).size;
      const score = {
        panels: coverage.panelCells,
        letters: coverage.letterCells,
        clues: clueAnchors,
        signature: topology.map((slot) => slot.signature).join("|"),
      };
      if (!best
        || score.panels < best.score.panels
        || (score.panels === best.score.panels && score.letters > best.score.letters)
        || (score.panels === best.score.panels && score.letters === best.score.letters && score.clues < best.score.clues)
        || (score.panels === best.score.panels && score.letters === best.score.letters && score.clues === best.score.clues && score.signature < best.score.signature)) {
        best = { result: applied, score };
      }
    }
    return best?.result || null;
  }

  function closeResidualRegions(result, pool, suppliedOptions = {}) {
    const options = {
      maxRegions: 4,
      maxSlotCandidates: 160,
      maxDomainSize: 256,
      maxTopologyNodes: 5000,
      maxTopologies: 64,
      maxSlotsPerTopology: 6,
      maxCspNodes: 8000,
      ...suppliedOptions,
    };
    const patternIndex = buildPatternIndex(pool);
    const telemetry = {
      mode: "local-indexed-csp",
      rollbackDepthUsed: 0,
      regionsBefore: extractResidualRegions(result).length,
      panelsBefore: measureCoverage(result.grid).panelCells,
      regionsAttempted: 0,
      regionsSolved: 0,
      slotsEnumerated: 0,
      topologyNodes: 0,
      topologiesEnumerated: 0,
      topologiesTried: 0,
      cspNodes: 0,
      forwardPrunes: 0,
      patternLookups: 0,
      patternChecks: 0,
      lookups: 0,
      checks: 0,
    };
    let current = result;
    const attempted = new Set();

    for (let pass = 0; pass < options.maxRegions; pass += 1) {
      const regions = extractResidualRegions(current)
        .sort((a, b) => a.difficulty - b.difficulty || a.cells[0].row - b.cells[0].row || a.cells[0].col - b.cells[0].col);
      const region = regions.find((item) => !attempted.has(item.cells.map((cell) => cellKey(cell.row, cell.col)).join("|")));
      if (!region) break;
      const signature = region.cells.map((cell) => cellKey(cell.row, cell.col)).join("|");
      attempted.add(signature);
      telemetry.regionsAttempted += 1;
      const solved = solveRegion(current, region, patternIndex, options, telemetry);
      if (solved) {
        current = solved;
        telemetry.regionsSolved += 1;
      }
    }

    telemetry.patternLookups = telemetry.lookups;
    telemetry.patternChecks = telemetry.checks;
    delete telemetry.lookups;
    delete telemetry.checks;
    telemetry.regionsAfter = extractResidualRegions(current).length;
    telemetry.panelsAfter = measureCoverage(current.grid).panelCells;
    return { result: current, telemetry };
  }

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_CLOSED_FILL) return process.env.SCANWORD_CLOSED_FILL;
    return window.SCANWORD_CLOSED_FILL || "diagnostic";
  }

  function attachReport(result, seed, telemetry = null) {
    const coverage = measureCoverage(result.grid);
    const regions = extractResidualRegions(result);
    result.letterCells = coverage.letterCells;
    result.rawLetterCoverage = coverage.rawLetterCoverage;
    result.fillRatio = coverage.activeCoverage;
    result.answerCoverage = coverage.answerSpaceCoverage;
    result.panelCells = coverage.panelCells;
    result.residualRegions = regions;
    if (telemetry) result.closedFill = telemetry;
    result.validationReport = {
      seed,
      valid: Boolean(result.validation?.valid),
      rows: result.rows,
      cols: result.cols,
      answers: result.placed.length,
      letterCells: coverage.letterCells,
      rawLetterCoverage: coverage.rawLetterCoverage,
      activeCoverage: coverage.activeCoverage,
      answerSpaceCoverage: coverage.answerSpaceCoverage,
      residualPanels: coverage.panelCells,
      residualRegions: regions.length,
      components: result.components,
      accidentalRuns: result.validation?.accidentalRuns?.length || 0,
      conflicts: result.validation?.conflicts || 0,
      orphanLetters: result.validation?.orphanLetters || 0,
      fallbackClues: result.placed.filter((entry) => !entry.hasExactClue).length,
      attemptsUsed: result.attemptBudget,
      closedFillRegionsSolved: telemetry?.regionsSolved || 0,
      rollbackDepthUsed: telemetry?.rollbackDepthUsed || 0,
    };
    return result;
  }

  function install() {
    const solver = window.ScanwordSolver;
    if (!solver || solver.__closedFillInstalled) return;
    const originalGenerateBest = solver.generateBest.bind(solver);
    solver.generateBest = (...args) => {
      const seed = args[0];
      const generated = originalGenerateBest(...args);
      const mode = modeFromEnvironment();
      if (mode !== "on") {
        const regions = extractResidualRegions(generated);
        const coverage = measureCoverage(generated.grid);
        return attachReport(generated, seed, {
          mode,
          rollbackDepthUsed: 0,
          regionsBefore: regions.length,
          regionsAfter: regions.length,
          panelsBefore: coverage.panelCells,
          panelsAfter: coverage.panelCells,
          regionsAttempted: 0,
          regionsSolved: 0,
        });
      }
      try {
        const closed = closeResidualRegions(generated, generated.pool);
        return attachReport(closed.result, seed, closed.telemetry);
      } catch (error) {
        const regions = extractResidualRegions(generated);
        const coverage = measureCoverage(generated.grid);
        return attachReport(generated, seed, {
          mode,
          rollbackDepthUsed: 0,
          regionsBefore: regions.length,
          regionsAfter: regions.length,
          panelsBefore: coverage.panelCells,
          panelsAfter: coverage.panelCells,
          regionsAttempted: 0,
          regionsSolved: 0,
          error: String(error?.stack || error),
        });
      }
    };
    Object.assign(solver, {
      measureCoverage,
      extractResidualRegions,
      buildPatternIndex,
      queryPattern,
      enumerateRegionSlots,
      enumerateTopologies,
      solveLocalCsp,
      closeResidualRegions,
      attachValidationReport: attachReport,
      __closedFillInstalled: true,
    });
  }

  window.ScanwordClosedFill = {
    measureCoverage,
    extractResidualRegions,
    buildPatternIndex,
    queryPattern,
    enumerateRegionSlots,
    enumerateTopologies,
    solveLocalCsp,
    closeResidualRegions,
    install,
  };
  install();
})();