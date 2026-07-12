(() => {
  "use strict";

  const { DIRECTIONS, createMask, extractSlots, analyzeAssignments } = window.ScanwordCore;
  const { generateBest } = window.ScanwordSolver;
  const { renderSvg, escapeXml } = window.ScanwordRenderer;

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

  function renderStats(result) {
    const emptyPercent = Math.round((1 - result.fillRatio) * 100);
    const values = [
      [result.placed.length, "размещено"],
      [result.intersections, "пересечений"],
      [`${Math.round(result.fillRatio * 100)}%`, "занято клеток"],
      [`${Math.round(result.answerCoverage * 100)}%`, "белых заполнено"],
      [result.blankClues, "пустых серых"],
      [result.components, "компонентов"],
    ];

    els.stats.innerHTML = values
      .map(([value, label]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`)
      .join("");
    els.stats.dataset.emptyPercent = String(emptyPercent);
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
      version: "0.3.0",
      page: { format: "A5", orientation: "portrait", widthMm: 148, heightMm: 210 },
      grid: { rows: result.rows, cols: result.cols },
      seed: els.seed.value.trim(),
      generatedPoolSize: result.pool.length,
      quality: {
        fillRatio: result.fillRatio,
        answerCoverage: result.answerCoverage,
        clueUsage: result.clueUsage,
        blankClues: result.blankClues,
        emptyCells: result.emptyCells,
        components: result.components,
        intersections: result.intersections,
      },
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
      clueDensity: Math.max(16, Math.min(38, Number(els.clueDensity.value) || 27)),
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
      els.generationStatus.textContent = `шаблон ${currentResult.attempt + 1}/16 · пустых ${Math.round((1 - currentResult.fillRatio) * 100)}%`;
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

  window.ScanwordGenerator = { generateBest, renderSvg, exportResult, createMask, extractSlots, analyzeAssignments, getCurrentResult: () => currentResult };
  runGeneration();
})();
