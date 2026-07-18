(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver?.repackClueFootprints || solver.__constructionAdaptiveClueRepackInstalled) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

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
        clue: typeof word.clue === "string" ? word.clue : "",
        cells: word.cells.map((cell) => ({ ...cell })),
      })),
      clueFootprints: (result.clueFootprints || []).map((footprint) => ({
        ...footprint,
        cells: footprint.cells.map((cell) => ({ ...cell })),
      })),
    };
  }

  function stripPadding(result) {
    for (const row of result.grid || []) {
      for (const cell of row) {
        cell.clues = (cell.clues || []).map((clue) => ({
          ...clue,
          text: typeof clue.text === "string" ? clue.text.trimEnd() : clue.text,
        }));
      }
    }
    result.placed = (result.placed || []).map((word) => ({
      ...word,
      clue: typeof word.clue === "string" ? word.clue.trimEnd() : word.clue,
    }));
    return result;
  }

  function padEligibleClues(result, minimumLength, targetLength) {
    let eligible = 0;
    const seenSlots = new Set();
    for (const row of result.grid) {
      for (const cell of row) {
        if (cell.type !== "clue") continue;
        cell.clues = (cell.clues || []).map((clue) => {
          const visible = String(clue.text || "").trimEnd();
          if (visible.length < minimumLength || visible.length >= targetLength) return clue;
          if (!seenSlots.has(clue.slotId)) {
            eligible += 1;
            seenSlots.add(clue.slotId);
          }
          return { ...clue, text: visible.padEnd(targetLength, " ") };
        });
      }
    }
    return eligible;
  }

  function adaptiveRepack(result, seed) {
    const minimumPanels = numericOption("SCANWORD_ADAPTIVE_REPACK_PANELS", 8);
    const minimumLength = numericOption("SCANWORD_ADAPTIVE_CLUE_LENGTH", 22);
    const targetLength = numericOption("SCANWORD_ADAPTIVE_CLUE_TARGET", 38);
    const baseTelemetry = result.constructionV2?.clueRepack || null;
    const telemetry = {
      mode: "adaptive-four-cell-clue-repack-v1",
      thresholdPanels: minimumPanels,
      minimumClueLength: minimumLength,
      panelsBefore: result.panelCells,
      panelsAfter: result.panelCells,
      eligibleClues: 0,
      attempted: false,
      accepted: false,
      inner: null,
    };
    if (result.panelCells <= minimumPanels) {
      result.constructionV2 = { ...(result.constructionV2 || {}), adaptiveClueRepack: telemetry };
      return result;
    }

    const padded = cloneResult(result);
    telemetry.eligibleClues = padEligibleClues(padded, minimumLength, targetLength);
    if (!telemetry.eligibleClues) {
      result.constructionV2 = { ...(result.constructionV2 || {}), adaptiveClueRepack: telemetry };
      return result;
    }

    telemetry.attempted = true;
    const candidate = stripPadding(solver.repackClueFootprints(padded, seed));
    telemetry.inner = candidate.constructionV2?.clueRepack || null;
    telemetry.panelsAfter = candidate.panelCells;
    telemetry.accepted = Boolean(candidate.validation?.valid
      && candidate.components === 1
      && candidate.panelCells < result.panelCells
      && candidate.clueTextCells >= result.clueTextCells
      && candidate.externalClueTexts >= result.externalClueTexts);

    const selected = telemetry.accepted ? candidate : result;
    selected.constructionV2 = {
      ...(selected.constructionV2 || result.constructionV2 || {}),
      clueRepack: baseTelemetry,
      adaptiveClueRepack: telemetry,
    };
    return selected;
  }

  solver.generateBest = (...args) => {
    const generated = previousGenerateBest(...args);
    if (modeFromEnvironment() !== "portfolio") return generated;
    try {
      return adaptiveRepack(generated, args[0]);
    } catch (error) {
      generated.constructionV2 = {
        ...(generated.constructionV2 || {}),
        adaptiveClueRepack: {
          mode: "adaptive-four-cell-clue-repack-error",
          error: String(error?.stack || error),
        },
      };
      return generated;
    }
  };

  Object.assign(solver, {
    adaptiveRepackClueFootprints: adaptiveRepack,
    __constructionAdaptiveClueRepackInstalled: true,
  });
})();
