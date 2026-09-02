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
    downloadPdf: document.querySelector("#downloadPdf"),
    downloadJson: document.querySelector("#downloadJson"),
    printA5: document.querySelector("#printA5"),
    stats: document.querySelector("#stats"),
    preview: document.querySelector("#preview"),
    wordsTable: document.querySelector("#wordsTable"),
    generationStatus: document.querySelector("#generationStatus"),
  };

  let currentResult = null;
  let currentSettings = null;
  let pdfExportBusy = false;
  const resultSettings = new WeakMap();

  function setExportEnabled(enabled) {
    els.downloadSvg.disabled = !enabled;
    if (els.downloadPdf) els.downloadPdf.disabled = !enabled || pdfExportBusy;
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
      <table aria-label="Assigned answers">
        <thead><tr><th scope="col">#</th><th scope="col">Clue</th><th scope="col">Answer</th><th scope="col">Length</th><th scope="col">Direction</th><th scope="col">Start</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function exportResult(result) {
    const boundSettings = resultSettings.get(result)
      || (result === currentResult && currentSettings ? currentSettings : null);
    const generatedSeed = result === currentResult && currentSettings
      ? currentSettings.seed
      : boundSettings?.seed || els.seed.value.trim();
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

  const PDF_PAGE = Object.freeze({
    widthMm: 148,
    heightMm: 210,
    widthPt: 419.527559,
    heightPt: 595.275591,
    dpi: 300,
  });

  function asciiBytes(value) {
    return Uint8Array.from(String(value), (character) => character.charCodeAt(0) & 0xff);
  }

  function concatBytes(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }

  function pdfObject(number, content) {
    return concatBytes([
      asciiBytes(`${number} 0 obj\n`),
      typeof content === "string" ? asciiBytes(content) : content,
      asciiBytes("\nendobj\n"),
    ]);
  }

  function pdfStreamObject(number, dictionary, bytes) {
    return concatBytes([
      asciiBytes(`${number} 0 obj\n<< ${dictionary} /Length ${bytes.length} >>\nstream\n`),
      bytes,
      asciiBytes("\nendstream\nendobj\n"),
    ]);
  }

  function buildPdfFromJpegs(pages) {
    if (!Array.isArray(pages) || !pages.length) throw new Error("PDF export requires at least one page.");
    const pageObjects = pages.map((_, index) => 3 + index * 3);
    const objectCount = 2 + pages.length * 3;
    const objects = new Array(objectCount + 1);
    objects[1] = pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
    objects[2] = pdfObject(2, `<< /Type /Pages /Kids [${pageObjects.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`);

    pages.forEach((page, index) => {
      const pageObject = 3 + index * 3;
      const imageObject = pageObject + 1;
      const contentObject = pageObject + 2;
      const imageBytes = page.bytes instanceof Uint8Array ? page.bytes : new Uint8Array(page.bytes);
      if (!Number.isInteger(page.width) || page.width < 1 || !Number.isInteger(page.height) || page.height < 1) {
        throw new Error("PDF page image dimensions are invalid.");
      }
      objects[pageObject] = pdfObject(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE.widthPt} ${PDF_PAGE.heightPt}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
      objects[imageObject] = pdfStreamObject(
        imageObject,
        `/Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
        imageBytes,
      );
      const commands = asciiBytes(`q\n${PDF_PAGE.widthPt} 0 0 ${PDF_PAGE.heightPt} 0 0 cm\n/Im0 Do\nQ\n`);
      objects[contentObject] = pdfStreamObject(contentObject, "", commands);
    });

    const header = asciiBytes("%PDF-1.4\n% Scanword Generator\n");
    const body = [header];
    const offsets = new Array(objectCount + 1).fill(0);
    let length = header.length;
    for (let number = 1; number <= objectCount; number += 1) {
      offsets[number] = length;
      body.push(objects[number]);
      length += objects[number].length;
    }
    const xrefOffset = length;
    const xrefLines = ["xref", `0 ${objectCount + 1}`, "0000000000 65535 f "];
    for (let number = 1; number <= objectCount; number += 1) {
      xrefLines.push(`${String(offsets[number]).padStart(10, "0")} 00000 n `);
    }
    const trailer = `${xrefLines.join("\n")}\ntrailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    body.push(asciiBytes(trailer));
    return concatBytes(body);
  }

  function svgToJpegPage(svg, dpi = PDF_PAGE.dpi) {
    const width = Math.round(PDF_PAGE.widthMm / 25.4 * dpi);
    const height = Math.round(PDF_PAGE.heightMm / 25.4 * dpi);
    const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas 2D context is unavailable.");
          context.fillStyle = "#fff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          canvas.toBlob(async (blob) => {
            if (!blob) {
              reject(new Error("Browser could not encode the PDF page image."));
              return;
            }
            try {
              resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), width, height });
            } catch (error) {
              reject(error);
            }
          }, "image/jpeg", 0.96);
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => {
        reject(new Error("Browser could not rasterize the A5 SVG for PDF export."));
      };
      image.src = source;
    });
  }

  async function renderPdfBlob(result) {
    const puzzle = await svgToJpegPage(renderAccessibleSvg(result, false));
    const solution = await svgToJpegPage(renderAccessibleSvg(result, true));
    const bytes = buildPdfFromJpegs([puzzle, solution]);
    return new Blob([bytes], { type: "application/pdf" });
  }

  function downloadBlob(name, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function download(name, content, type) {
    downloadBlob(name, new Blob([content], { type }));
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
      '<svg lang="ru" xml:lang="ru" ',
    );
  }

  function rerenderSvg() {
    if (currentResult) els.preview.innerHTML = renderAccessibleSvg(currentResult, els.showAnswers.checked);
  }

  function generationErrorMessage(error) {
    if (error && typeof error.message === "string" && error.message.trim()) return error.message.trim();
    if (typeof error === "string" && error.trim()) return error.trim();
    return "Unexpected generation error.";
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
        const message = generationErrorMessage(error);
        els.preview.innerHTML = `<div class="generation-error" role="alert"><strong>Generation failed.</strong><br>${escapeXml(message)}</div>`;
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
  els.downloadPdf?.addEventListener("click", async () => {
    if (!currentResult || pdfExportBusy) return;
    const result = currentResult;
    const label = els.downloadPdf.textContent;
    pdfExportBusy = true;
    setExportEnabled(true);
    els.downloadPdf.textContent = "Building PDF…";
    try {
      const blob = await renderPdfBlob(result);
      if (currentResult === result) downloadBlob("arrowword-a5-puzzle-solution.pdf", blob);
    } catch (error) {
      if (currentResult === result) {
        els.generationStatus.textContent = `PDF export failed · ${generationErrorMessage(error)}`;
      }
    } finally {
      pdfExportBusy = false;
      els.downloadPdf.textContent = label;
      setExportEnabled(Boolean(currentResult));
    }
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
    buildPdfFromJpegs,
    renderPdfBlob,
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
