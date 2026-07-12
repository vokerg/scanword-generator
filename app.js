(() => {
  "use strict";

  const DIRECTIONS = {
    right: { dr: 0, dc: 1, arrow: "→", label: "вправо" },
    down: { dr: 1, dc: 0, arrow: "↓", label: "вниз" },
  };

  const els = {
    seed: document.querySelector("#seed"),
    cols: document.querySelector("#cols"),
    rows: document.querySelector("#rows"),
    poolSize: document.querySelector("#poolSize"),
    targetWords: document.querySelector("#targetWords"),
    showAnswers: document.querySelector("#showAnswers"),
    generate: document.querySelector("#generate"),
    downloadSvg: document.querySelector("#downloadSvg"),
    downloadJson: document.querySelector("#downloadJson"),
    stats: document.querySelector("#stats"),
    preview: document.querySelector("#preview"),
    wordsTable: document.querySelector("#wordsTable"),
    generationStatus: document.querySelector("#generationStatus"),
  };

  let currentResult = null;

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

  function pick(items, random) {
    return items[Math.floor(random() * items.length)];
  }

  function shuffle(items, random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function generatePseudoWords(count, random) {
    const starts = [
      "Б", "В", "Г", "Д", "Ж", "З", "К", "Л", "М", "Н", "П", "Р", "С", "Т", "Ф", "Х",
      "БР", "ВЛ", "ГР", "ДР", "КЛ", "КР", "ПЛ", "ПР", "СТ", "ТР", "ХР", "Ш",
    ];
    const vowels = ["А", "Е", "И", "О", "У", "Ы", "Э", "Я"];
    const middles = [
      "Б", "В", "Г", "Д", "Ж", "З", "К", "Л", "М", "Н", "П", "Р", "С", "Т", "Ф", "Х", "Ч", "Ш",
      "БР", "ВР", "ГЛ", "ГР", "ДР", "КЛ", "КР", "ЛЬ", "МН", "НТ", "ПР", "РТ", "СК", "СТ", "ТР",
    ];
    const endings = [
      "А", "АН", "АР", "АС", "АТ", "ЕН", "ЕР", "ИК", "ИН", "ИР", "ИС", "ИТ", "ИЯ", "ОН", "ОР", "ОС",
      "ОТ", "УН", "УР", "УС", "КА", "НА", "РА", "ТА", "НИК", "ЛИЯ", "РИЯ", "ТОР",
    ];

    const result = new Set();
    let guard = 0;

    while (result.size < count && guard < count * 100) {
      guard += 1;
      const syllables = random() < 0.6 ? 2 : random() < 0.88 ? 3 : 4;
      let word = pick(starts, random) + pick(vowels, random);

      for (let i = 1; i < syllables; i += 1) {
        word += pick(middles, random) + pick(vowels, random);
      }

      if (random() < 0.85) word += pick(endings, random);
      word = word.replace(/([АЕИОУЫЭЯ])\1+/g, "$1");

      if (word.length >= 4 && word.length <= 12) result.add(word);
    }

    return [...result].map((answer, index) => ({
      id: index + 1,
      answer,
      clue: `Синтетическое слово №${index + 1}`,
      priority: 3,
    }));
  }

  function createGrid(rows, cols) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ type: "empty", char: null, wordIds: [] })),
    );
  }

  function inBounds(rows, cols, r, c) {
    return r >= 0 && r < rows && c >= 0 && c < cols;
  }

  function cluePosition(startRow, startCol, direction) {
    return direction === "right"
      ? { row: startRow, col: startCol - 1 }
      : { row: startRow - 1, col: startCol };
  }

  function validatePlacement(state, word, startRow, startCol, direction, requireIntersection = true) {
    const { rows, cols, grid } = state;
    const { dr, dc } = DIRECTIONS[direction];
    const clue = cluePosition(startRow, startCol, direction);

    if (!inBounds(rows, cols, clue.row, clue.col)) return null;
    if (grid[clue.row][clue.col].type !== "empty") return null;

    const endRow = startRow + dr * (word.answer.length - 1);
    const endCol = startCol + dc * (word.answer.length - 1);
    if (!inBounds(rows, cols, startRow, startCol) || !inBounds(rows, cols, endRow, endCol)) return null;

    const afterRow = endRow + dr;
    const afterCol = endCol + dc;
    if (inBounds(rows, cols, afterRow, afterCol) && grid[afterRow][afterCol].type === "letter") return null;

    let intersections = 0;
    let newLetters = 0;

    for (let i = 0; i < word.answer.length; i += 1) {
      const row = startRow + dr * i;
      const col = startCol + dc * i;
      const cell = grid[row][col];
      const char = word.answer[i];

      if (cell.type === "clue") return null;
      if (cell.type === "letter" && cell.char !== char) return null;

      if (cell.type === "letter") {
        const alreadySameDirection = cell.wordIds.some((id) => {
          const placed = state.placedById.get(id);
          return placed && placed.direction === direction;
        });
        if (alreadySameDirection) return null;
        intersections += 1;
      } else {
        newLetters += 1;
        const sideA = direction === "right" ? { row: row - 1, col } : { row, col: col - 1 };
        const sideB = direction === "right" ? { row: row + 1, col } : { row, col: col + 1 };

        for (const side of [sideA, sideB]) {
          if (inBounds(rows, cols, side.row, side.col) && grid[side.row][side.col].type === "letter") {
            return null;
          }
        }
      }
    }

    if (requireIntersection && intersections === 0) return null;

    const centerRow = startRow + dr * ((word.answer.length - 1) / 2);
    const centerCol = startCol + dc * ((word.answer.length - 1) / 2);
    const distance = Math.abs(centerRow - (rows - 1) / 2) + Math.abs(centerCol - (cols - 1) / 2);
    const score = intersections * 120 + newLetters * 2 - distance * 0.55 + word.answer.length * 0.3;

    return { startRow, startCol, direction, clue, intersections, newLetters, score };
  }

  function commitPlacement(state, word, placement) {
    const id = state.placed.length + 1;
    const { dr, dc } = DIRECTIONS[placement.direction];
    const placed = {
      id,
      sourceId: word.id,
      answer: word.answer,
      clue: word.clue,
      direction: placement.direction,
      startRow: placement.startRow,
      startCol: placement.startCol,
      clueRow: placement.clue.row,
      clueCol: placement.clue.col,
      intersections: placement.intersections,
    };

    state.grid[placement.clue.row][placement.clue.col] = {
      type: "clue",
      clueId: id,
      direction: placement.direction,
      char: null,
      wordIds: [],
    };

    for (let i = 0; i < word.answer.length; i += 1) {
      const row = placement.startRow + dr * i;
      const col = placement.startCol + dc * i;
      const cell = state.grid[row][col];
      if (cell.type === "empty") {
        state.grid[row][col] = { type: "letter", char: word.answer[i], wordIds: [id] };
      } else {
        cell.wordIds.push(id);
      }
    }

    state.placed.push(placed);
    state.placedById.set(id, placed);
    return placed;
  }

  function existingLetterCells(state, char) {
    const matches = [];
    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.grid[row][col];
        if (cell.type === "letter" && cell.char === char) matches.push({ row, col });
      }
    }
    return matches;
  }

  function findBestPlacement(state, word, random) {
    const candidates = [];

    for (let index = 0; index < word.answer.length; index += 1) {
      const matches = existingLetterCells(state, word.answer[index]);
      for (const match of matches) {
        for (const direction of shuffle(["right", "down"], random)) {
          const { dr, dc } = DIRECTIONS[direction];
          const startRow = match.row - dr * index;
          const startCol = match.col - dc * index;
          const placement = validatePlacement(state, word, startRow, startCol, direction, true);
          if (placement) candidates.push(placement);
        }
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    const shortlist = candidates.slice(0, Math.min(6, candidates.length));
    return pick(shortlist, random);
  }

  function placeInitialWord(state, word, random) {
    const directions = shuffle(["right", "down"], random);
    const candidates = [];

    for (const direction of directions) {
      const startRow = direction === "right"
        ? Math.floor(state.rows / 2)
        : Math.max(1, Math.floor((state.rows - word.answer.length) / 2));
      const startCol = direction === "right"
        ? Math.max(1, Math.floor((state.cols - word.answer.length) / 2))
        : Math.floor(state.cols / 2);
      const placement = validatePlacement(state, word, startRow, startCol, direction, false);
      if (placement) candidates.push(placement);
    }

    if (candidates.length === 0) return null;
    return commitPlacement(state, word, candidates[0]);
  }

  function buildGrid(words, rows, cols, targetWords, random) {
    const state = {
      rows,
      cols,
      grid: createGrid(rows, cols),
      placed: [],
      placedById: new Map(),
    };

    const ordered = shuffle(words, random).sort((a, b) => b.answer.length - a.answer.length);
    const first = ordered.find((word) => word.answer.length <= Math.max(rows, cols) - 3);
    if (!first || !placeInitialWord(state, first, random)) return state;

    const remaining = ordered.filter((word) => word !== first);
    let stagnantPasses = 0;

    while (state.placed.length < targetWords && remaining.length > 0 && stagnantPasses < 4) {
      let placedThisPass = 0;
      const pass = shuffle(remaining, random);

      for (const word of pass) {
        if (state.placed.length >= targetWords) break;
        const placement = findBestPlacement(state, word, random);
        if (!placement) continue;

        commitPlacement(state, word, placement);
        const index = remaining.indexOf(word);
        if (index >= 0) remaining.splice(index, 1);
        placedThisPass += 1;
      }

      stagnantPasses = placedThisPass === 0 ? stagnantPasses + 1 : 0;
    }

    return state;
  }

  function stateScore(state, targetWords) {
    const intersections = state.placed.reduce((sum, word) => sum + word.intersections, 0);
    const usedCells = state.grid.flat().filter((cell) => cell.type !== "empty").length;
    const fillRatio = usedCells / (state.rows * state.cols);
    return state.placed.length * 1000 + intersections * 40 + fillRatio * 500 - Math.abs(targetWords - state.placed.length) * 70;
  }

  function generateBest(seed, poolSize, rows, cols, targetWords) {
    let best = null;
    const attempts = 18;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const random = makeRandom(`${seed}:attempt:${attempt}`);
      const words = generatePseudoWords(poolSize, random);
      const state = buildGrid(words, rows, cols, targetWords, random);
      const score = stateScore(state, targetWords);
      const candidate = { ...state, pool: words, score, attempt };
      if (!best || candidate.score > best.score) best = candidate;
    }

    return best;
  }

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function renderSvg(result, showAnswers) {
    const pageWidth = 148;
    const pageHeight = 210;
    const marginX = 6;
    const top = 13;
    const bottom = 6;
    const cell = Math.min(
      (pageWidth - marginX * 2) / result.cols,
      (pageHeight - top - bottom) / result.rows,
    );
    const gridWidth = cell * result.cols;
    const left = (pageWidth - gridWidth) / 2;
    const lineWidth = Math.max(0.18, cell * 0.035);
    const letterSize = cell * 0.5;
    const clueSize = Math.max(1.5, cell * 0.23);

    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210" role="img" aria-label="Сгенерированный сканворд">`,
      `<rect width="148" height="210" fill="#fffdf8"/>`,
      `<text x="${marginX}" y="7.5" font-family="Arial, sans-serif" font-size="3.4" font-weight="700" fill="#161616">SCANWORD GENERATOR · MVP</text>`,
      `<text x="${148 - marginX}" y="7.5" text-anchor="end" font-family="Arial, sans-serif" font-size="2.7" fill="#666">${result.placed.length} слов · ${result.cols}×${result.rows}</text>`,
    ];

    for (let row = 0; row < result.rows; row += 1) {
      for (let col = 0; col < result.cols; col += 1) {
        const x = left + col * cell;
        const y = top + row * cell;
        const data = result.grid[row][col];
        let fill = "#1b1b1b";
        if (data.type === "letter") fill = "#ffffff";
        if (data.type === "clue") fill = "#dedbd2";

        parts.push(
          `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${cell.toFixed(3)}" height="${cell.toFixed(3)}" fill="${fill}" stroke="#111" stroke-width="${lineWidth.toFixed(3)}"/>`,
        );

        if (data.type === "letter" && showAnswers) {
          parts.push(
            `<text x="${(x + cell / 2).toFixed(3)}" y="${(y + cell * 0.68).toFixed(3)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${letterSize.toFixed(3)}" font-weight="700" fill="#111">${escapeXml(data.char)}</text>`,
          );
        }

        if (data.type === "clue") {
          const arrow = DIRECTIONS[data.direction].arrow;
          parts.push(
            `<text x="${(x + cell / 2).toFixed(3)}" y="${(y + cell * 0.42).toFixed(3)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${clueSize.toFixed(3)}" font-weight="700" fill="#111">№${data.clueId}</text>`,
            `<text x="${(x + cell / 2).toFixed(3)}" y="${(y + cell * 0.78).toFixed(3)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${(clueSize * 1.25).toFixed(3)}" fill="#111">${arrow}</text>`,
          );
        }
      }
    }

    parts.push(`</svg>`);
    return parts.join("");
  }

  function renderStats(result) {
    const intersections = result.placed.reduce((sum, word) => sum + word.intersections, 0);
    const usedCells = result.grid.flat().filter((cell) => cell.type !== "empty").length;
    const density = Math.round((usedCells / (result.rows * result.cols)) * 100);
    const values = [
      [result.pool.length, "слов в пуле"],
      [result.placed.length, "размещено"],
      [intersections, "пересечений"],
      [`${density}%`, "занято сетки"],
    ];

    els.stats.innerHTML = values
      .map(([value, label]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`)
      .join("");
  }

  function renderWords(result) {
    const rows = result.placed
      .map((word) => `
        <tr>
          <td>${word.id}</td>
          <td class="word">${word.answer}</td>
          <td>${word.answer.length}</td>
          <td>${DIRECTIONS[word.direction].label} ${DIRECTIONS[word.direction].arrow}</td>
          <td>${word.startRow + 1}:${word.startCol + 1}</td>
          <td>${word.intersections}</td>
        </tr>
      `)
      .join("");

    els.wordsTable.innerHTML = `
      <table>
        <thead>
          <tr><th>№</th><th>Ответ</th><th>Длина</th><th>Направление</th><th>Старт</th><th>Пересечения</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function exportResult(result) {
    return {
      version: "0.1.0",
      page: { format: "A5", orientation: "portrait", widthMm: 148, heightMm: 210 },
      grid: { rows: result.rows, cols: result.cols },
      seed: els.seed.value.trim(),
      generatedPoolSize: result.pool.length,
      placedWords: result.placed,
      cells: result.grid.map((row) =>
        row.map((cell) => ({
          type: cell.type,
          char: cell.char,
          clueId: cell.clueId ?? null,
          direction: cell.direction ?? null,
          wordIds: cell.wordIds,
        })),
      ),
    };
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function readSettings() {
    return {
      seed: els.seed.value.trim() || "scanword",
      cols: Math.max(11, Math.min(25, Number(els.cols.value) || 17)),
      rows: Math.max(15, Math.min(35, Number(els.rows.value) || 24)),
      poolSize: Math.max(100, Math.min(3000, Number(els.poolSize.value) || 500)),
      targetWords: Math.max(10, Math.min(90, Number(els.targetWords.value) || 40)),
    };
  }

  function rerenderSvg() {
    if (!currentResult) return;
    els.preview.innerHTML = renderSvg(currentResult, els.showAnswers.checked);
  }

  function runGeneration() {
    const settings = readSettings();
    els.generationStatus.textContent = "генерация…";
    els.generate.disabled = true;

    window.setTimeout(() => {
      currentResult = generateBest(
        settings.seed,
        settings.poolSize,
        settings.rows,
        settings.cols,
        settings.targetWords,
      );
      rerenderSvg();
      renderStats(currentResult);
      renderWords(currentResult);
      els.generationStatus.textContent = `вариант ${currentResult.attempt + 1}/18`;
      els.generate.disabled = false;
    }, 20);
  }

  els.generate.addEventListener("click", runGeneration);
  els.showAnswers.addEventListener("change", rerenderSvg);

  els.downloadSvg.addEventListener("click", () => {
    if (!currentResult) return;
    download("scanword-a5.svg", renderSvg(currentResult, els.showAnswers.checked), "image/svg+xml;charset=utf-8");
  });

  els.downloadJson.addEventListener("click", () => {
    if (!currentResult) return;
    download("scanword-project.json", JSON.stringify(exportResult(currentResult), null, 2), "application/json;charset=utf-8");
  });

  runGeneration();
})();
