(() => {
  "use strict";

  const { DIRECTIONS, createMask, extractSlots, analyzeAssignments } = window.ScanwordCore;
  const { generateBest, validateGrid } = window.ScanwordSolver;
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
    const validity = result.validation?.valid ? "YES" : "NO";
    const values = [
      [result.placed.length, "words"],
      [result.intersections, "crossings"],
      [`${Math.round((1 - result.panelRatio) * 100)}%`, "active cells"],
      [result.panelCells, "panel cells"],
      [result.validation?.accidentalRuns?.length || 0, "accidental runs"],
      [validity, "structurally valid"],
    ];
    els.stats.innerHTML = values
      .map(([value, label]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`)
      .join("");
  }

  function renderWords(result) {
    const rows = result.placed.map((word) => `
      <tr>
        <td>${word.id}</td>
        <td>${escapeXml(word.clue)}</td>
        <td class="word">${word.answer}</td>
        <td>${word.length}</td>
        <td>${DIRECTIONS[word.direction].label} ${DIRECTIONS[word.direction].arrow}</td>
        <td>${word.startRow + 1}:${word.startCol + 1}</td>
      </tr>
    `).join("");

    els.wordsTable.innerHTML = `
      <table>
        <thead><tr><th>#</th><th>Clue</th><th>Answer</th><th>Length</th><th>Direction</th><th>Start</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function exportResult(result) {
    return {
      version: "0.6.0",
      page: { format: "A5", orientation: "portrait", widthMm: 148, heightMm: 210 },
      grid: { rows: result.rows, cols: result.cols },
      seed: els.seed.value.trim(),
      generatedPoolSize: result.pool.length,
      quality: {
        structurallyValid: result.validation?.valid || false,
        accidentalRuns: result.validation?.accidentalRuns?.length || 0,
        conflicts: result.validation?.conflicts || 0,
        orphanLetters: result.validation?.orphanLetters || 0,
        clueDirectionConflicts: result.validation?.clueDirectionConflicts || 0,
        panelCells: result.panelCells,
        panelRatio: result.panelRatio,
        intersections: result.intersections,
      },
      placedWords: result.placed,
      cells: result.grid.map((row) => row.map((cell) => ({
        type: cell.type,
        char: cell.char,
        slotIds: cell.slotIds,
        clues: cell.clues,
      }))),
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
      seed: els.seed.value.trim() || "arrowword",
      cols: Math.max(11, Math.min(19, Number(els.cols.value) || 13)),
      rows: Math.max(13, Math.min(27, Number(els.rows.value) || 17)),
      poolSize: Math.max(100, Math.min(window.RUSSIAN_WORDS?.length || 800, Number(els.poolSize.value) || 800)),
      targetWords: Math.max(12, Math.min(60, Number(els.targetWords.value) || 28)),
      clueDensity: Math.max(16, Math.min(38, Number(els.clueDensity.value) || 27)),
    };
  }

  function rerenderSvg() {
    if (currentResult) els.preview.innerHTML = renderSvg(currentResult, els.showAnswers.checked);
  }

  function runGeneration() {
    const settings = readSettings();
    els.generationStatus.textContent = "generating…";
    els.generate.disabled = true;

    window.setTimeout(() => {
      try {
        currentResult = generateBest(
          settings.seed,
          settings.poolSize,
          settings.rows,
          settings.cols,
          settings.targetWords,
          settings.clueDensity,
        );
        currentResult.validation = validateGrid(currentResult.grid, currentResult.placed);
        rerenderSvg();
        renderStats(currentResult);
        renderWords(currentResult);
        els.generationStatus.textContent = `restart ${currentResult.attempt + 1}/32 · valid · panels ${Math.round(currentResult.panelRatio * 100)}%`;
      } catch (error) {
        currentResult = null;
        els.preview.innerHTML = `<div class="generation-error"><strong>Generation failed.</strong><br>${escapeXml(error.message)}</div>`;
        els.stats.innerHTML = "";
        els.wordsTable.innerHTML = "";
        els.generationStatus.textContent = "no valid grid";
      } finally {
        els.generate.disabled = false;
      }
    }, 20);
  }

  els.generate.addEventListener("click", runGeneration);
  els.showAnswers.addEventListener("change", rerenderSvg);
  els.downloadSvg.addEventListener("click", () => {
    if (currentResult) download("arrowword-a5.svg", renderSvg(currentResult, els.showAnswers.checked), "image/svg+xml;charset=utf-8");
  });
  els.downloadJson.addEventListener("click", () => {
    if (currentResult) download("arrowword-project.json", JSON.stringify(exportResult(currentResult), null, 2), "application/json;charset=utf-8");
  });

  window.ScanwordGenerator = {
    generateBest,
    renderSvg,
    exportResult,
    validateGrid,
    createMask,
    extractSlots,
    analyzeAssignments,
    getCurrentResult: () => currentResult,
  };
  runGeneration();
})();
