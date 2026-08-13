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
    printA5: document.querySelector("#printA5"),
    stats: document.querySelector("#stats"),
    preview: document.querySelector("#preview"),
    wordsTable: document.querySelector("#wordsTable"),
    generationStatus: document.querySelector("#generationStatus"),
  };

  let currentResult = null;
  let currentSettings = null;
  const resultSettings = new WeakMap();

  function setExportEnabled(enabled) {
    els.downloadSvg.disabled = !enabled;
    els.downloadJson.disabled = !enabled;
    els.printA5.disabled = !enabled;
  }

  function setGenerationBusy(busy) {
    els.generate.disabled = busy;
    els.preview.setAttribute("aria-busy", busy ? "true" : "false");
    if (busy) setExportEnabled(false);
  }

  function renderStats(result) {
    const validity = result.validation?.valid ? "YES" : "NO";
    const values = [
      [result.placed.length, "words"],
      [result.intersections, "crossings"],
      [`${(result.fillRatio * 100).toFixed(1)}%`, "active cells"],
      [`${(result.answerCoverage * 100).toFixed(1)}%`, "answer-space coverage"],
      [result.clueTextCells || 0, "clue-footprint cells"],
      [result.panelCells, "residual panels"],
      [result.components, "answer groups"],
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
        <td lang="ru">${escapeXml(word.clue)}</td>
        <td class="word" lang="ru">${escapeXml(word.answer)}</td>
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
    const boundSettings = resultSettings.get(result)
      || (result === currentResult && currentSettings ? currentSettings : null);
    const generatedSeed = boundSettings?.seed || els.seed.value.trim();
    return {
      version: "0.9.0",
      page: { format: "A5", orientation: "portrait", widthMm: 148, heightMm: 210 },
      grid: { rows: result.rows, cols: result.cols },
      seed: generatedSeed,
      generationSettings: boundSettings ? { ...boundSettings } : null,
      generatedPoolSize: result.pool.length,
      quality: {
        structurallyValid: result.validation?.valid || false,
        accidentalRuns: result.validation?.accidentalRuns?.length || 0,
        conflicts: result.validation?.conflicts || 0,
        orphanLetters: result.validation?.orphanLetters || 0,
        clueDirectionConflicts: result.validation?.clueDirectionConflicts || 0,
        panelCells: result.panelCells,
        panelRatio: result.panelRatio,
        activeCoverage: result.fillRatio,
        answerCoverage: result.answerCoverage,
        coverageCheckpoint: result.coverageCheckpoint,
        intersections: result.intersections,
        components: result.components,
        externalClueTexts: result.externalClueTexts || 0,
        clueTextCells: result.clueTextCells || 0,
        panelRegions: result.panelRegions || 0,
        isolatedPanels: result.isolatedPanels || 0,
      },
      placedWords: result.placed,
      cells: result.grid.map((row) => row.map((cell) => ({
        type: cell.type,
        char: cell.char,
        slotIds: cell.slotIds,
        clues: cell.clues,
        footprintId: cell.footprintId || null,
      }))),
      clueFootprints: result.clueFootprints || [],
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

  function readBoundedInteger(element, fallback, runtimeMax = Infinity) {
    const declaredMin = Number(element.min);
    const declaredMax = Number(element.max);
    const min = Number.isFinite(declaredMin) ? declaredMin : -Infinity;
    const max = Math.min(Number.isFinite(declaredMax) ? declaredMax : Infinity, runtimeMax);
    const parsed = Number(element.value);
    const candidate = element.value.trim() && Number.isFinite(parsed) ? Math.round(parsed) : fallback;
    return Math.max(Math.min(min, max), Math.min(max, candidate));
  }

  function readSettings() {
    const corpusSize = Math.max(1, window.RUSSIAN_WORDS?.length || 3500);
    return {
      seed: els.seed.value.trim() || "arrowword",
      cols: readBoundedInteger(els.cols, 13),
      rows: readBoundedInteger(els.rows, 17),
      poolSize: readBoundedInteger(els.poolSize, 3500, corpusSize),
      targetWords: readBoundedInteger(els.targetWords, 30),
      clueDensity: readBoundedInteger(els.clueDensity, 27),
    };
  }

  function syncSettingsControls(settings) {
    els.seed.value = settings.seed;
    els.cols.value = String(settings.cols);
    els.rows.value = String(settings.rows);
    els.poolSize.value = String(settings.poolSize);
    els.targetWords.value = String(settings.targetWords);
    els.clueDensity.value = String(settings.clueDensity);
  }

  function renderAccessibleSvg(result, showAnswers) {
    return renderSvg(result, showAnswers).replace(
      "<svg ",
      '<svg lang="ru" xml:lang="ru" role="img" aria-label="Generated A5 arrowword grid" ',
    );
  }

  function rerenderSvg() {
    if (currentResult) els.preview.innerHTML = renderAccessibleSvg(currentResult, els.showAnswers.checked);
  }

  function runGeneration() {
    const settings = readSettings();
    syncSettingsControls(settings);
    currentResult = null;
    currentSettings = null;
    els.generationStatus.textContent = "generating…";
    setGenerationBusy(true);

    window.setTimeout(() => {
      try {
        const nextResult = generateBest(
          settings.seed,
          settings.poolSize,
          settings.rows,
          settings.cols,
          settings.targetWords,
          settings.clueDensity,
        );
        nextResult.validation = validateGrid(nextResult.grid, nextResult.placed);
        if (!nextResult.validation?.valid) {
          throw new Error("Generated grid did not pass structural validation.");
        }
        currentResult = nextResult;
        currentSettings = { ...settings };
        resultSettings.set(currentResult, currentSettings);
        rerenderSvg();
        renderStats(currentResult);
        renderWords(currentResult);
        setExportEnabled(true);
        els.generationStatus.textContent = `selected attempt ${currentResult.attempt + 1} · searched ${currentResult.attemptBudget || "?"} · valid · ${currentResult.components} component · active ${(currentResult.fillRatio * 100).toFixed(1)}%`;
      } catch (error) {
        currentResult = null;
        currentSettings = null;
        setExportEnabled(false);
        els.preview.innerHTML = `<div class="generation-error" role="alert"><strong>Generation failed.</strong><br>${escapeXml(error.message)}</div>`;
        els.stats.innerHTML = "";
        els.wordsTable.innerHTML = "";
        els.generationStatus.textContent = "no valid grid";
      } finally {
        setGenerationBusy(false);
      }
    }, 20);
  }

  els.generate.addEventListener("click", runGeneration);
  els.showAnswers.addEventListener("change", rerenderSvg);
  els.downloadSvg.addEventListener("click", () => {
    if (currentResult) download("arrowword-a5.svg", renderAccessibleSvg(currentResult, els.showAnswers.checked), "image/svg+xml;charset=utf-8");
  });
  els.downloadJson.addEventListener("click", () => {
    if (currentResult) download("arrowword-project.json", JSON.stringify(exportResult(currentResult), null, 2), "application/json;charset=utf-8");
  });
  els.printA5.addEventListener("click", () => {
    if (currentResult) window.print();
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
    getCurrentSettings: () => currentSettings ? { ...currentSettings } : null,
  };
  els.generationStatus.setAttribute("role", "status");
  els.generationStatus.setAttribute("aria-live", "polite");
  els.generationStatus.setAttribute("aria-atomic", "true");
  setExportEnabled(false);
  runGeneration();
})();
