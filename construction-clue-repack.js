(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  if (!solver || !closedFill || solver.__constructionClueRepackInstalled) return;

  const previousGenerateBest = solver.generateBest.bind(solver);
  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_CONSTRUCTION_MODE) {
      return process.env.SCANWORD_CONSTRUCTION_MODE;
    }
    return window.SCANWORD_CONSTRUCTION_MODE || "legacy";
  }

  function numericOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
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

  function releaseClueFootprints(result) {
    const state = cloneResult(result);
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.grid[row][col];
        if (cell.type === "clueText" || cell.type === "clueTextContinuation") {
          state.grid[row][col] = {
            type: "panel",
            char: null,
            slotIds: [],
            directions: [],
            clues: [],
          };
          continue;
        }
        if (cell.type !== "clue") continue;
        cell.clues = cell.clues.map((clue) => {
          const cleaned = { ...clue };
          delete cleaned.externalText;
          delete cleaned.textRow;
          delete cleaned.textCol;
          delete cleaned.textCells;
          return cleaned;
        });
      }
    }
    state.clueFootprints = [];
    return state;
  }

  function panelRegionSizeMap(state) {
    const sizes = new Map();
    const seen = new Set();
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        if (state.grid[row][col].type !== "panel") continue;
        const start = cellKey(row, col);
        if (seen.has(start)) continue;
        const queue = [{ row, col }];
        const cells = [];
        seen.add(start);
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
        signature,
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
    return candidates.sort((a, b) => b.cells.length - a.cells.length || b.score - a.score || a.signature.localeCompare(b.signature));
  }

  function buildItems(structural, baseline, candidateCap) {
    const regionSizes = panelRegionSizeMap(structural);
    const footprintBySlot = new Map((baseline.clueFootprints || []).map((footprint) => [footprint.slotId, footprint]));
    const items = [];
    for (let row = 0; row < structural.rows; row += 1) {
      for (let col = 0; col < structural.cols; col += 1) {
        const cell = structural.grid[row][col];
        if (cell.type !== "clue") continue;
        for (let clueIndex = 0; clueIndex < cell.clues.length; clueIndex += 1) {
          const clue = cell.clues[clueIndex];
          const maxSize = clue.text.length >= 38 ? 4 : 3;
          const generated = footprintCandidates(structural, row, col, maxSize, regionSizes).slice(0, candidateCap);
          const baselineFootprint = footprintBySlot.get(clue.slotId);
          if (baselineFootprint) {
            const cells = baselineFootprint.cells.map((target) => ({ ...target }));
            const keys = cells.map((target) => cellKey(target.row, target.col)).sort();
            const signature = keys.join("|");
            if (!generated.some((candidate) => candidate.signature === signature)) {
              generated.push({ cells, keys, signature, score: cells.length * 100 });
            }
          }
          generated.sort((a, b) => b.cells.length - a.cells.length || b.score - a.score || a.signature.localeCompare(b.signature));
          items.push({ row, col, clueIndex, clue, candidates: generated });
        }
      }
    }
    return items;
  }

  function baselineAssignment(items, baseline) {
    const footprintBySlot = new Map((baseline.clueFootprints || []).map((footprint) => [footprint.slotId, footprint]));
    const assigned = new Map();
    const occupied = new Set();
    items.forEach((item, index) => {
      const footprint = footprintBySlot.get(item.clue.slotId);
      if (!footprint) return;
      const cells = footprint.cells.map((target) => ({ ...target }));
      const keys = cells.map((target) => cellKey(target.row, target.col)).sort();
      assigned.set(index, { cells, keys, signature: keys.join("|"), score: cells.length * 100 });
      keys.forEach((key) => occupied.add(key));
    });
    return { assigned, occupied, covered: occupied.size, assignedCount: assigned.size };
  }

  function buildConflictComponents(items) {
    const graph = Array.from({ length: items.length }, () => new Set());
    const cellToItems = new Map();
    items.forEach((item, itemIndex) => {
      const possibleCells = new Set(item.candidates.flatMap((candidate) => candidate.keys));
      for (const key of possibleCells) {
        if (!cellToItems.has(key)) cellToItems.set(key, []);
        cellToItems.get(key).push(itemIndex);
      }
    });
    for (const references of cellToItems.values()) {
      for (let left = 0; left < references.length; left += 1) {
        for (let right = left + 1; right < references.length; right += 1) {
          const a = references[left];
          const b = references[right];
          graph[a].add(b);
          graph[b].add(a);
        }
      }
    }

    const components = [];
    const seen = new Set();
    for (let start = 0; start < items.length; start += 1) {
      if (seen.has(start)) continue;
      const stack = [start];
      const component = [];
      seen.add(start);
      while (stack.length) {
        const current = stack.pop();
        component.push(current);
        for (const next of graph[current]) {
          if (seen.has(next)) continue;
          seen.add(next);
          stack.push(next);
        }
      }
      component.sort((a, b) => a - b);
      components.push(component);
    }
    components.sort((a, b) => b.length - a.length || a[0] - b[0]);
    return components;
  }

  function assignmentSignature(assigned) {
    return [...assigned.entries()]
      .map(([index, candidate]) => `${index}:${candidate.signature}`)
      .sort()
      .join(";");
  }

  function solveComponent(items, component, baselineAssigned, options, budget) {
    const baseline = new Map();
    const baselineOccupied = new Set();
    for (const itemIndex of component) {
      const candidate = baselineAssigned.get(itemIndex);
      if (!candidate) continue;
      baseline.set(itemIndex, candidate);
      candidate.keys.forEach((key) => baselineOccupied.add(key));
    }

    let best = {
      covered: baselineOccupied.size,
      assignedCount: baseline.size,
      assigned: new Map(baseline),
      signature: assignmentSignature(baseline),
    };
    const occupied = new Set();
    const assigned = new Map();
    let nodes = 0;
    let prunes = 0;
    let exhausted = false;

    function availableCandidates(itemIndex) {
      return items[itemIndex].candidates.filter((candidate) => candidate.keys.every((key) => !occupied.has(key)));
    }

    function updateBest() {
      const covered = occupied.size;
      const assignedCount = assigned.size;
      if (covered < best.covered || (covered === best.covered && assignedCount < best.assignedCount)) return;
      const signature = assignmentSignature(assigned);
      if (covered === best.covered && assignedCount === best.assignedCount && signature >= best.signature) return;
      best = { covered, assignedCount, assigned: new Map(assigned), signature };
    }

    function visit(remaining) {
      budget.nodes += 1;
      nodes += 1;
      if (budget.nodes > budget.limit) {
        exhausted = true;
        return;
      }
      if (!remaining.length) {
        updateBest();
        return;
      }

      const choices = [];
      const possibleCells = new Set(occupied);
      let maximumAssignments = assigned.size;
      for (const itemIndex of remaining) {
        const available = availableCandidates(itemIndex);
        const localCells = new Set();
        for (const candidate of available) {
          candidate.keys.forEach((key) => {
            localCells.add(key);
            possibleCells.add(key);
          });
        }
        if (available.length) maximumAssignments += 1;
        choices.push({ itemIndex, available, possibleCells: localCells.size });
      }
      if (possibleCells.size < best.covered
        || (possibleCells.size === best.covered && maximumAssignments < best.assignedCount)) {
        prunes += 1;
        return;
      }

      choices.sort((a, b) => a.available.length - b.available.length
        || b.possibleCells - a.possibleCells
        || a.itemIndex - b.itemIndex);
      const current = choices[0];
      const nextRemaining = remaining.filter((itemIndex) => itemIndex !== current.itemIndex);
      if (!current.available.length) {
        visit(nextRemaining);
        return;
      }

      const ordered = current.available
        .map((candidate) => ({
          candidate,
          gain: candidate.keys.reduce((sum, key) => sum + Number(!occupied.has(key)), 0),
        }))
        .sort((a, b) => b.gain - a.gain
          || b.candidate.score - a.candidate.score
          || a.candidate.signature.localeCompare(b.candidate.signature));

      for (const { candidate } of ordered.slice(0, options.branchLimit)) {
        assigned.set(current.itemIndex, candidate);
        candidate.keys.forEach((key) => occupied.add(key));
        visit(nextRemaining);
        candidate.keys.forEach((key) => occupied.delete(key));
        assigned.delete(current.itemIndex);
        if (exhausted) break;
      }
      if (!exhausted) visit(nextRemaining);
    }

    visit([...component]);
    return { ...best, nodes, prunes, exhausted };
  }

  function solvePacking(items, baseline, options) {
    const initial = baselineAssignment(items, baseline);
    const components = buildConflictComponents(items);
    const combined = new Map(initial.assigned);
    const budget = { nodes: 0, limit: options.nodeBudget };
    let prunes = 0;
    let solvedComponents = 0;
    let exhaustedComponents = 0;
    let largestComponentItems = 0;
    let largestComponentCells = 0;

    for (const component of components) {
      largestComponentItems = Math.max(largestComponentItems, component.length);
      const componentCells = new Set(component.flatMap((itemIndex) => items[itemIndex].candidates.flatMap((candidate) => candidate.keys))).size;
      largestComponentCells = Math.max(largestComponentCells, componentCells);
      if (budget.nodes >= budget.limit) {
        exhaustedComponents += 1;
        continue;
      }
      const solved = solveComponent(items, component, initial.assigned, options, budget);
      prunes += solved.prunes;
      if (solved.exhausted) exhaustedComponents += 1;
      else solvedComponents += 1;
      component.forEach((itemIndex) => combined.delete(itemIndex));
      solved.assigned.forEach((candidate, itemIndex) => combined.set(itemIndex, candidate));
    }

    const occupied = new Set();
    combined.forEach((candidate) => candidate.keys.forEach((key) => occupied.add(key)));
    return {
      covered: occupied.size,
      assignedCount: combined.size,
      assigned: combined,
      signature: assignmentSignature(combined),
      nodes: budget.nodes,
      prunes,
      baselineCovered: initial.covered,
      baselineAssigned: initial.assignedCount,
      componentCount: components.length,
      solvedComponents,
      exhaustedComponents,
      largestComponentItems,
      largestComponentCells,
    };
  }

  function applyAssignment(structural, items, assignment) {
    const state = cloneResult(structural);
    const footprints = [];
    for (const [itemIndex, footprint] of assignment.entries()) {
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
    }
    state.clueFootprints = footprints;
    return {
      state,
      externalClueTexts: footprints.length,
      clueTextCells: footprints.reduce((sum, footprint) => sum + footprint.cells.length, 0),
    };
  }

  function repack(result, seed) {
    if (!result || !result.grid || !result.placed || !result.clueFootprints) return result;
    const options = {
      candidateCap: numericOption("SCANWORD_REPACK_CANDIDATES", 24),
      branchLimit: numericOption("SCANWORD_REPACK_BRANCH", 10),
      nodeBudget: numericOption("SCANWORD_REPACK_NODES", 60000),
    };
    const structural = releaseClueFootprints(result);
    const items = buildItems(structural, result, options.candidateCap);
    const solved = solvePacking(items, result, options);
    const telemetry = {
      mode: "clue-footprint-component-bnb-v2",
      items: items.length,
      candidates: items.reduce((sum, item) => sum + item.candidates.length, 0),
      nodeBudget: options.nodeBudget,
      nodes: solved.nodes,
      prunes: solved.prunes,
      componentCount: solved.componentCount,
      solvedComponents: solved.solvedComponents,
      exhaustedComponents: solved.exhaustedComponents,
      largestComponentItems: solved.largestComponentItems,
      largestComponentCells: solved.largestComponentCells,
      baselineClueTextCells: result.clueTextCells,
      optimizedClueTextCells: solved.covered,
      baselineExternalClues: result.externalClueTexts,
      optimizedExternalClues: solved.assignedCount,
      panelsBefore: result.panelCells,
      panelsAfter: result.panelCells,
      accepted: false,
    };
    result.constructionV2 = { ...(result.constructionV2 || {}), clueRepack: telemetry };
    if (solved.covered <= result.clueTextCells || solved.assignedCount < result.externalClueTexts) return result;

    const applied = applyAssignment(structural, items, solved.assigned);
    const metrics = solver.resultMetrics(applied.state);
    const coverage = closedFill.measureCoverage(applied.state.grid);
    if (!metrics.validation.valid || metrics.components !== 1) return result;
    if (coverage.panelCells >= result.panelCells) return result;
    if (applied.clueTextCells < result.clueTextCells || applied.externalClueTexts < result.externalClueTexts) return result;

    const improved = {
      ...result,
      grid: applied.state.grid,
      placed: applied.state.placed,
      clueFootprints: applied.state.clueFootprints,
      score: metrics.score,
      intersections: metrics.intersections,
      doubles: metrics.doubles,
      fillRatio: coverage.activeCoverage,
      answerCoverage: coverage.answerSpaceCoverage,
      rawLetterCoverage: coverage.rawLetterCoverage,
      letterCells: coverage.letterCells,
      panelCells: coverage.panelCells,
      panelRatio: coverage.panelCells / Math.max(1, coverage.totalCells),
      components: metrics.components,
      externalClueTexts: applied.externalClueTexts,
      clueTextCells: applied.clueTextCells,
      panelRegions: metrics.panelRegions,
      isolatedPanels: metrics.isolatedPanels,
      largestPanelRegion: metrics.largestPanelRegion,
      validation: metrics.validation,
      availableSlots: applied.state.placed.length,
    };
    telemetry.panelsAfter = improved.panelCells;
    telemetry.accepted = true;
    improved.constructionV2 = { ...(result.constructionV2 || {}), clueRepack: telemetry };
    return solver.attachValidationReport(improved, seed, {
      ...(result.closedFill || {}),
      clueRepack: telemetry,
      panelsBefore: result.panelCells,
      panelsAfter: improved.panelCells,
    });
  }

  solver.generateBest = (...args) => {
    const generated = previousGenerateBest(...args);
    if (modeFromEnvironment() !== "portfolio") return generated;
    try {
      return repack(generated, args[0]);
    } catch (error) {
      generated.constructionV2 = {
        ...(generated.constructionV2 || {}),
        clueRepack: { mode: "clue-footprint-component-bnb-error", error: String(error?.stack || error) },
      };
      return generated;
    }
  };

  Object.assign(solver, {
    repackClueFootprints: repack,
    __constructionClueRepackInstalled: true,
  });
})();