from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Patch target not found: {label}")
    return text.replace(old, new, 1)


# solver.js
path = ROOT / "solver.js"
text = path.read_text(encoding="utf-8")
text = replace_once(text, "const maxComponents = 6;", "const maxComponents = 3;", "solver max components")
text = replace_once(text, "const attempts = 8;", "const attempts = 12;", "solver attempts")

panel_marker = "  function resultMetrics(state) {\n"
clue_layout = r'''  function assignClueTextCells(state) {
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

'''
text = replace_once(text, panel_marker, clue_layout + panel_marker, "solver clue layout insertion")
text = replace_once(
    text,
    '    const clueCells = state.grid.flat().filter((cell) => cell.type === "clue").length;\n    const panelCells = total - letterCells - clueCells;',
    '    const clueCells = state.grid.flat().filter((cell) => cell.type === "clue").length;\n    const clueTextCells = state.grid.flat().filter((cell) => cell.type === "clueText").length;\n    const panelCells = total - letterCells - clueCells - clueTextCells;',
    "solver clue text metrics",
)
text = replace_once(
    text,
    '''    const fillRatio = (letterCells + clueCells) / total;
    const score = state.placed.length * 12000 + intersections * 320 + fillRatio * 9000 + doubles * 90 - Math.max(0, components - 1) * 1800;
    return { letterCells, clueCells, panelCells, intersections, doubles, components, fillRatio, validation, score };''',
    '''    const fillRatio = (letterCells + clueCells + clueTextCells) / total;
    const panels = panelTopology(state.grid);
    const score = state.placed.length * 12000 + intersections * 320 + fillRatio * 9000 + doubles * 90
      - Math.max(0, components - 1) * 2400 - panels.regions * 180 - panels.isolated * 220;
    return { letterCells, clueCells, clueTextCells, panelCells, intersections, doubles, components, fillRatio, validation, panelRegions: panels.regions, isolatedPanels: panels.isolated, largestPanelRegion: panels.largest, score };''',
    "solver result metrics",
)
text = replace_once(
    text,
    '''      const state = buildAttempt(pool, rows, cols, targetWords, makeRandom(`${seed}:placement:${attempt}`));
      const metrics = resultMetrics(state);''',
    '''      const state = buildAttempt(pool, rows, cols, targetWords, makeRandom(`${seed}:placement:${attempt}`));
      const externalClueTexts = assignClueTextCells(state);
      const metrics = resultMetrics(state);''',
    "solver decoration call",
)
text = replace_once(
    text,
    '''        components: metrics.components,
        validation: metrics.validation,''',
    '''        components: metrics.components,
        externalClueTexts,
        clueTextCells: metrics.clueTextCells,
        panelRegions: metrics.panelRegions,
        isolatedPanels: metrics.isolatedPanels,
        largestPanelRegion: metrics.largestPanelRegion,
        validation: metrics.validation,''',
    "solver exported metrics",
)
path.write_text(text, encoding="utf-8")
