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
    clueDensity: document.querySelector("#clueDensity"),
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

  function randomInt(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
  }

  function shuffle(items, random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function normalizeWord(value) {
    return String(value).trim().toUpperCase().replaceAll("Ё", "Е");
  }

  function generateWordPool(count, random) {
    const source = Array.isArray(window.RUSSIAN_WORDS) ? window.RUSSIAN_WORDS : [];
    const clues = window.RUSSIAN_CLUES || {};
    const unique = [];
    const seen = new Set();

    for (const rawWord of source) {
      const answer = normalizeWord(rawWord);
      if (!/^[А-Я]+$/.test(answer) || answer.length < 3 || answer.length > 12 || seen.has(answer)) continue;

      seen.add(answer);
      const key = String(rawWord).trim().toLowerCase().replaceAll("ё", "е");
      const exactClue = clues[key];
      unique.push({
        id: unique.length + 1,
        answer,
        clue: exactClue || `Ответ из ${answer.length} букв`,
        hasExactClue: Boolean(exactClue),
      });
    }

    const exact = shuffle(unique.filter((entry) => entry.hasExactClue), random);
    const fallback = shuffle(unique.filter((entry) => !entry.hasExactClue), random);
    return [...exact, ...fallback].slice(0, Math.min(count, unique.length));
  }

  function createMask(rows, cols, random, densityPercent) {
    const mask = Array.from({ length: rows }, () => Array(cols).fill(false));
    const density = Math.max(0.16, Math.min(0.34, densityPercent / 100));
    const averageGap = Math.max(3, Math.min(7, Math.round(1 / density) - 1));

    for (let row = 0; row < rows; row += 1) {
      let col = row === 0 || random() < 0.56 ? 0 : randomInt(random, 1, Math.min(3, cols - 1));
      while (col < cols) {
        mask[row][col] = true;
        col += randomInt(random, Math.max(4, averageGap), Math.min(8, averageGap + 3));
      }

      const lastClue = mask[row].lastIndexOf(true);
      if (lastClue >= 0 && cols - lastClue - 1 > 10) {
        mask[row][lastClue + randomInt(random, 5, 8)] = true;
      }
    }

    for (let col = 0; col < cols; col += 1) {
      if (!mask[0][col] && random() < 0.3) mask[0][col] = true;
    }

    for (let row = 0; row < rows - 1; row += 1) {
      for (let col = 0; col < cols - 1; col += 1) {
        if (mask[row][col] && mask[row + 1][col] && mask[row][col + 1] && mask[row + 1][col + 1]) {
          const choices = [[row, col], [row + 1, col], [row, col + 1], [row + 1, col + 1]];
          const [clearRow, clearCol] = choices[randomInt(random, 0, choices.length - 1)];
          mask[clearRow][clearCol] = false;
        }
      }
    }

    return mask;
  }

  function slotCells(mask, clueRow, clueCol, direction) {
    const rows = mask.length;
    const cols = mask[0].length;
    const { dr, dc } = DIRECTIONS[direction];
    const cells = [];
    let row = clueRow + dr;
    let col = clueCol + dc;

    while (row >= 0 && row < rows && col >= 0 && col < cols && !mask[row][col]) {
      cells.push({ row, col });
      row += dr;
      col += dc;
    }
    return cells;
  }

  function extractSlots(mask, availableLengths) {
    const rows = mask.length;
    const cols = mask[0].length;
    const slots = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!mask[row][col]) continue;
        for (const direction of ["right", "down"]) {
          const cells = slotCells(mask, row, col, direction);
          if (cells.length < 3 || cells.length > 12 || !availableLengths.has(cells.length)) continue;
          slots.push({
            id: slots.length + 1,
            clueRow: row,
            clueCol: col,
            direction,
            cells,
            length: cells.length,
            crossings: [],
          });
        }
      }
    }

    const usage = new Map();
    slots.forEach((slot, slotIndex) => {
      slot.cells.forEach((cell, position) => {
        const key = `${cell.row}:${cell.col}`;
        if (!usage.has(key)) usage.set(key, []);
        usage.get(key).push({ slotIndex, position });
      });
    });

    for (const refs of usage.values()) {
      if (refs.length < 2) continue;
      for (const ref of refs) {
        for (const other of refs) {
          if (ref.slotIndex === other.slotIndex) continue;
          slots[ref.slotIndex].crossings.push({
            slotIndex: other.slotIndex,
            ownPosition: ref.position,
            otherPosition: other.position,
          });
        }
      }
    }

    return slots;
  }

  function candidateMatches(slot, entry, letters) {
    for (let index = 0; index < slot.cells.length; index += 1) {
      const cell = slot.cells[index];
      const known = letters.get(`${cell.row}:${cell.col}`);
      if (known && known !== entry.answer[index]) return false;
    }
    return true;
  }

  function countKnownLetters(slot, letters) {
    return slot.cells.reduce((count, cell) => count + (letters.has(`${cell.row}:${cell.col}`) ? 1 : 0), 0);
  }

  function scoreCandidate(slot, entry, slots, assignments, supportIndex, random) {
    let score = entry.hasExactClue ? 80 : 0;
    score += new Set(entry.answer).size * 0.45;

    for (const crossing of slot.crossings) {
      if (assignments.has(crossing.slotIndex)) continue;
      const other = slots[crossing.slotIndex];
      const required = entry.answer[crossing.ownPosition];
      const support = supportIndex.get(`${other.length}:${crossing.otherPosition}:${required}`) || 0;
      score += Math.min(18, support) * 0.9;
    }

    return score + random() * 3;
  }

  function buildFilledGrid(mask, slots, assignments) {
    const rows = mask.length;
    const cols = mask[0].length;
    const grid = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: cols }, (_, col) => ({
        type: mask[row][col] ? "clue" : "inactive",
        char: null,
        slotIds: [],
        clues: [],
      })),
    );

    const placed = [];
    for (const [slotIndex, entry] of assignments.entries()) {
      const slot = slots[slotIndex];
      slot.cells.forEach((cell, position) => {
        const target = grid[cell.row][cell.col];
        target.type = "letter";
        target.char = entry.answer[position];
        target.slotIds.push(slot.id);
      });

      grid[slot.clueRow][slot.clueCol].clues.push({
        slotId: slot.id,
        direction: slot.direction,
        text: entry.clue,
        answer: entry.answer,
      });

      placed.push({
        id: slot.id,
        answer: entry.answer,
        clue: entry.clue,
        hasExactClue: entry.hasExactClue,
        direction: slot.direction,
        length: slot.length,
        clueRow: slot.clueRow,
        clueCol: slot.clueCol,
        startRow: slot.cells[0].row,
        startCol: slot.cells[0].col,
        cells: slot.cells,
      });
    }

    placed.sort((a, b) => a.id - b.id);
    return { grid, placed };
  }

  function solutionScore(mask, slots, assignments) {
    const occupiedCells = new Map();
    let exactClues = 0;

    for (const [slotIndex, entry] of assignments.entries()) {
      if (entry.hasExactClue) exactClues += 1;
      for (const cell of slots[slotIndex].cells) {
        const key = `${cell.row}:${cell.col}`;
        occupiedCells.set(key, (occupiedCells.get(key) || 0) + 1);
      }
    }

    const intersections = [...occupiedCells.values()].filter((count) => count > 1).length;
    const doubleClueCells = new Map();
    for (const slotIndex of assignments.keys()) {
      const slot = slots[slotIndex];
      const key = `${slot.clueRow}:${slot.clueCol}`;
      doubleClueCells.set(key, (doubleClueCells.get(key) || 0) + 1);
    }
    const doubles = [...doubleClueCells.values()].filter((count) => count > 1).length;
    const area = mask.length * mask[0].length;
    const coverage = occupiedCells.size / area;

    return {
      score: assignments.size * 10000 + intersections * 240 + exactClues * 30 + doubles * 55 + coverage * 800,
      intersections,
      exactClues,
      doubles,
      coverage,
    };
  }

  function fillSlots(mask, slots, entries, targetWords, random, restarts = 16) {
    const wordsByLength = new Map();
    for (const entry of entries) {
      if (!wordsByLength.has(entry.answer.length)) wordsByLength.set(entry.answer.length, []);
      wordsByLength.get(entry.answer.length).push(entry);
    }

    const supportIndex = new Map();
    for (const entry of entries) {
      for (let position = 0; position < entry.answer.length; position += 1) {
        const key = `${entry.answer.length}:${position}:${entry.answer[position]}`;
        supportIndex.set(key, (supportIndex.get(key) || 0) + 1);
      }
    }

    let best = null;

    for (let restart = 0; restart < restarts; restart += 1) {
      const runRandom = makeRandom(`${random()}:${restart}`);
      const assignments = new Map();
      const letters = new Map();
      const usedAnswers = new Set();
      const blocked = new Set();

      while (assignments.size < targetWords) {
        let chosen = null;

        for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
          if (assignments.has(slotIndex) || blocked.has(slotIndex)) continue;
          const slot = slots[slotIndex];
          const candidates = (wordsByLength.get(slot.length) || []).filter(
            (entry) => !usedAnswers.has(entry.answer) && candidateMatches(slot, entry, letters),
          );

          if (candidates.length === 0) {
            blocked.add(slotIndex);
            continue;
          }

          const known = countKnownLetters(slot, letters);
          const rank = known * 1000 + slot.crossings.length * 14 - candidates.length + runRandom() * 8;
          if (!chosen || rank > chosen.rank) chosen = { slotIndex, slot, candidates, rank };
        }

        if (!chosen) break;

        const ranked = chosen.candidates
          .map((entry) => ({
            entry,
            score: scoreCandidate(chosen.slot, entry, slots, assignments, supportIndex, runRandom),
          }))
          .sort((a, b) => b.score - a.score);

        const shortlist = ranked.slice(0, Math.min(4, ranked.length));
        const selected = shortlist[Math.floor(runRandom() * shortlist.length)].entry;
        assignments.set(chosen.slotIndex, selected);
        usedAnswers.add(selected.answer);
        chosen.slot.cells.forEach((cell, position) => {
          letters.set(`${cell.row}:${cell.col}`, selected.answer[position]);
        });
      }

      const metrics = solutionScore(mask, slots, assignments);
      const candidate = { assignments, ...metrics };
      if (!best || candidate.score > best.score) best = candidate;
    }

    return best;
  }

  function generateBest(seed, poolSize, rows, cols, targetWords, densityPercent) {
    const poolRandom = makeRandom(`${seed}:pool`);
    const pool = generateWordPool(poolSize, poolRandom);
    const availableLengths = new Set(pool.map((entry) => entry.answer.length));
    let best = null;
    const templateAttempts = 8;

    for (let attempt = 0; attempt < templateAttempts; attempt += 1) {
      const random = makeRandom(`${seed}:template:${attempt}`);
      const mask = createMask(rows, cols, random, densityPercent);
      const slots = extractSlots(mask, availableLengths);
      if (slots.length < Math.max(12, Math.floor(targetWords * 0.55))) continue;

      const filled = fillSlots(mask, slots, pool, Math.min(targetWords, slots.length), random);
      if (!filled) continue;
      const rendered = buildFilledGrid(mask, slots, filled.assignments);
      const candidate = {
        rows,
        cols,
        pool,
        mask,
        slots,
        grid: rendered.grid,
        placed: rendered.placed,
        attempt,
        score: filled.score,
        intersections: filled.intersections,
        exactClues: filled.exactClues,
        doubles: filled.doubles,
        coverage: filled.coverage,
      };

      if (!best || candidate.score > best.score) best = candidate;
    }

    if (best) return best;

    const random = makeRandom(`${seed}:fallback`);
    const mask = createMask(rows, cols, random, densityPercent);
    const slots = extractSlots(mask, availableLengths);
    const filled = fillSlots(mask, slots, pool, Math.min(targetWords, slots.length), random, 20);
    const rendered = buildFilledGrid(mask, slots, filled?.assignments || new Map());
    return {
      rows,
      cols,
      pool,
      mask,
      slots,
      grid: rendered.grid,
      placed: rendered.placed,
      attempt: 0,
      score: filled?.score || 0,
      intersections: filled?.intersections || 0,
      exactClues: filled?.exactClues || 0,
      doubles: filled?.doubles || 0,
      coverage: filled?.coverage || 0,
    };
  }

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function wrapText(text, maxChars, maxLines) {
    const queue = String(text).split(/\s+/).filter(Boolean);
    const tokens = [];

    for (const rawWord of queue) {
      let word = rawWord;
      while (word.length > maxChars) {
        const cut = Math.max(2, maxChars - 1);
        tokens.push(`${word.slice(0, cut)}-`);
        word = word.slice(cut);
      }
      if (word) tokens.push(word);
    }

    const lines = [];
    let current = "";
    let consumed = 0;

    for (const token of tokens) {
      const test = current ? `${current} ${token}` : token;
      if (test.length <= maxChars) {
        current = test;
      } else {
        if (current) {
          lines.push(current);
          consumed += 1;
        }
        current = token;
      }
      if (lines.length >= maxLines) break;
    }

    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length === maxLines && tokens.length > consumed + 1) {
      const last = lines[maxLines - 1].replace(/[.…,;:!?-]+$/, "");
      lines[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 1))}…`;
    }
    return lines.slice(0, maxLines);
  }

  function svgTextLines(lines, x, startY, fontSize, lineHeight, options = {}) {
    const anchor = options.anchor || "middle";
    const weight = options.weight || "400";
    return `<text x="${x.toFixed(3)}" y="${startY.toFixed(3)}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${fontSize.toFixed(3)}" font-weight="${weight}" fill="#111">${lines
      .map((line, index) => `<tspan x="${x.toFixed(3)}" dy="${index === 0 ? 0 : lineHeight.toFixed(3)}">${escapeXml(line)}</tspan>`)
      .join("")}</text>`;
  }

  function renderArrow(x, y, cell, direction, dual = false) {
    if (direction === "right") {
      const yy = y + cell * (dual ? 0.46 : 0.82);
      const x1 = x + cell * (dual ? 0.59 : 0.6);
      const x2 = x + cell * 0.94;
      return `<path d="M ${x1.toFixed(3)} ${yy.toFixed(3)} L ${x2.toFixed(3)} ${yy.toFixed(3)}" fill="none" stroke="#111" stroke-width="${Math.max(0.18, cell * 0.025).toFixed(3)}" marker-end="url(#arrowhead)"/>`;
    }

    const xx = x + cell * (dual ? 0.46 : 0.82);
    const y1 = y + cell * (dual ? 0.59 : 0.6);
    const y2 = y + cell * 0.94;
    return `<path d="M ${xx.toFixed(3)} ${y1.toFixed(3)} L ${xx.toFixed(3)} ${y2.toFixed(3)}" fill="none" stroke="#111" stroke-width="${Math.max(0.18, cell * 0.025).toFixed(3)}" marker-end="url(#arrowhead)"/>`;
  }

  function renderClueContent(data, x, y, cell) {
    if (!data.clues.length) return "";

    if (data.clues.length === 1) {
      const clue = data.clues[0];
      const fontSize = Math.max(1.25, cell * 0.17);
      const maxChars = Math.max(7, Math.floor(cell / (fontSize * 0.53)));
      const lines = wrapText(clue.text, maxChars, 4);
      const text = svgTextLines(lines, x + cell * 0.48, y + cell * 0.18, fontSize, fontSize * 1.08);
      return `${text}${renderArrow(x, y, cell, clue.direction)}`;
    }

    const rightClue = data.clues.find((clue) => clue.direction === "right") || data.clues[0];
    const downClue = data.clues.find((clue) => clue.direction === "down") || data.clues[1];
    const fontSize = Math.max(1.02, cell * 0.118);
    const rightLines = wrapText(rightClue.text, 9, 3);
    const downLines = wrapText(downClue.text, 9, 3);
    const diagonal = `<path d="M ${x.toFixed(3)} ${(y + cell).toFixed(3)} L ${(x + cell).toFixed(3)} ${y.toFixed(3)}" fill="none" stroke="#111" stroke-width="${Math.max(0.16, cell * 0.02).toFixed(3)}"/>`;
    const topText = svgTextLines(rightLines, x + cell * 0.36, y + cell * 0.12, fontSize, fontSize * 1.03);
    const bottomText = svgTextLines(downLines, x + cell * 0.65, y + cell * 0.61, fontSize, fontSize * 1.03);
    return `${diagonal}${topText}${bottomText}${renderArrow(x, y, cell, "right", true)}${renderArrow(x, y, cell, "down", true)}`;
  }

  function renderSvg(result, showAnswers) {
    const pageWidth = 148;
    const pageHeight = 210;
    const margin = 4;
    const cell = Math.min((pageWidth - margin * 2) / result.cols, (pageHeight - margin * 2) / result.rows);
    const gridWidth = cell * result.cols;
    const gridHeight = cell * result.rows;
    const left = (pageWidth - gridWidth) / 2;
    const top = (pageHeight - gridHeight) / 2;
    const lineWidth = Math.max(0.18, cell * 0.025);
    const letterSize = cell * 0.48;

    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210" role="img" aria-label="Сгенерированный сканворд">`,
      `<defs><marker id="arrowhead" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L5,2.5 L0,5 Z" fill="#111"/></marker></defs>`,
      `<rect width="148" height="210" fill="#fff"/>`,
    ];

    for (let row = 0; row < result.rows; row += 1) {
      for (let col = 0; col < result.cols; col += 1) {
        const x = left + col * cell;
        const y = top + row * cell;
        const data = result.grid[row][col];
        const fill = data.type === "clue" ? "#e4e4e4" : "#fff";

        parts.push(
          `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${cell.toFixed(3)}" height="${cell.toFixed(3)}" fill="${fill}" stroke="#111" stroke-width="${lineWidth.toFixed(3)}"/>`,
        );

        if (data.type === "letter" && showAnswers) {
          parts.push(
            `<text x="${(x + cell / 2).toFixed(3)}" y="${(y + cell * 0.68).toFixed(3)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${letterSize.toFixed(3)}" font-weight="700" fill="#111">${escapeXml(data.char)}</text>`,
          );
        }

        if (data.clues.length) parts.push(renderClueContent(data, x, y, cell));
      }
    }

    parts.push("</svg>");
    return parts.join("");
  }

  function renderStats(result) {
    const values = [
      [result.pool.length, "слов в пуле"],
      [result.placed.length, "размещено"],
      [result.intersections, "пересечений"],
      [result.doubles, "двойных клеток"],
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
          <td>${escapeXml(word.clue)}</td>
          <td class="word">${word.answer}</td>
          <td>${word.length}</td>
          <td>${DIRECTIONS[word.direction].label} ${DIRECTIONS[word.direction].arrow}</td>
          <td>${word.startRow + 1}:${word.startCol + 1}</td>
        </tr>
      `)
      .join("");

    els.wordsTable.innerHTML = `
      <table>
        <thead>
          <tr><th>№</th><th>Определение</th><th>Ответ</th><th>Длина</th><th>Направление</th><th>Старт</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function exportResult(result) {
    return {
      version: "0.2.0",
      page: { format: "A5", orientation: "portrait", widthMm: 148, heightMm: 210 },
      grid: { rows: result.rows, cols: result.cols },
      seed: els.seed.value.trim(),
      generatedPoolSize: result.pool.length,
      placedWords: result.placed,
      cells: result.grid.map((row) =>
        row.map((cell) => ({
          type: cell.type,
          char: cell.char,
          slotIds: cell.slotIds,
          clues: cell.clues,
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
      cols: Math.max(11, Math.min(19, Number(els.cols.value) || 13)),
      rows: Math.max(13, Math.min(27, Number(els.rows.value) || 17)),
      poolSize: Math.max(100, Math.min(window.RUSSIAN_WORDS?.length || 500, Number(els.poolSize.value) || 500)),
      targetWords: Math.max(12, Math.min(60, Number(els.targetWords.value) || 42)),
      clueDensity: Math.max(16, Math.min(34, Number(els.clueDensity.value) || 23)),
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
        settings.clueDensity,
      );
      rerenderSvg();
      renderStats(currentResult);
      renderWords(currentResult);
      els.generationStatus.textContent = `шаблон ${currentResult.attempt + 1}/8`;
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

  window.ScanwordGenerator = { generateBest, renderSvg, exportResult, createMask, extractSlots };
  runGeneration();
})();
