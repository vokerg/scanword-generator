(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || typeof solver.generatePortfolio !== "function" || solver.__preallocationStructuralFrontierV1Installed) return;

  const originalGeneratePortfolio = solver.generatePortfolio.bind(solver);
  let active = false;

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function mode() {
    const value = String(environmentOption("SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER", "off")).toLowerCase();
    return ["off", "shadow"].includes(value) ? value : "off";
  }

  function width() {
    const value = Number(environmentOption("SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH", 16));
    return Math.min(64, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 16));
  }

  function now() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function partialSearchVariant(state) {
    return String(state?.partialSearch?.selectedVariant
      || state?.grid?.__scanwordPartialSearch?.selectedVariant
      || "default");
  }

  function geometryCounts(state) {
    let panels = 0;
    let letters = 0;
    let clues = 0;
    let crossings = 0;
    for (const row of state?.grid || []) {
      for (const cell of row || []) {
        if (cell?.type === "panel") panels += 1;
        else if (cell?.type === "letter") {
          letters += 1;
          if ((cell.slotIds || []).length > 1) crossings += 1;
        } else if (cell?.type === "clue") clues += 1;
      }
    }
    return { panels, letters, clues, crossings };
  }

  function structuralVector(observation) {
    const estimate = observation.estimate || {};
    const geometry = observation.geometry || {};
    const panels = Number(estimate.panelCells ?? geometry.panels ?? 0);
    const largestPanelRegion = Number(estimate.largestPanelRegion || 0);
    return {
      necessaryPass: Boolean(estimate.completeNecessaryPass),
      hardImpossible: Boolean(estimate.hardImpossible),
      hardFailures: Number(estimate.hardFailures?.length || 0),
      zeroDomainClues: Number(estimate.zeroDomainClues || 0),
      longClueImpossible: Number(estimate.longClueImpossible || 0),
      panels,
      letters: Number(geometry.letters || 0),
      answers: Number(observation.answers || 0),
      crossings: Number(geometry.crossings || 0),
      greedyClueTextCells: Number(estimate.greedyClueTextCells || 0),
      greedyExternalClues: Number(estimate.greedyExternalClues || 0),
      clueTextUpperBound: Number(estimate.clueTextUpperBound || 0),
      externalUpperBound: Number(estimate.externalUpperBound || 0),
      panelRegions: Number(estimate.panelRegions || 0),
      isolatedPanels: Number(estimate.isolatedPanels || 0),
      largestPanelRegion,
      residualConcentration: panels > 0 ? +(largestPanelRegion / panels).toFixed(6) : 1,
      overlapPressure: Number(estimate.overlapPressure || 0),
      maximumCellPressure: Number(estimate.maximumCellPressure || 0),
    };
  }

  function compareStructural(first, second) {
    const a = first.vector || structuralVector(first);
    const b = second.vector || structuralVector(second);
    return Number(b.necessaryPass) - Number(a.necessaryPass)
      || Number(a.hardImpossible) - Number(b.hardImpossible)
      || a.hardFailures - b.hardFailures
      || a.zeroDomainClues - b.zeroDomainClues
      || a.longClueImpossible - b.longClueImpossible
      || a.panels - b.panels
      || b.greedyClueTextCells - a.greedyClueTextCells
      || b.greedyExternalClues - a.greedyExternalClues
      || b.letters - a.letters
      || b.answers - a.answers
      || b.crossings - a.crossings
      || a.panelRegions - b.panelRegions
      || a.isolatedPanels - b.isolatedPanels
      || b.residualConcentration - a.residualConcentration
      || a.overlapPressure - b.overlapPressure
      || a.maximumCellPressure - b.maximumCellPressure
      || first.allocationIndex - second.allocationIndex;
  }

  function dominatesStructural(first, second) {
    const noWorse = Number(first.necessaryPass) >= Number(second.necessaryPass)
      && Number(first.hardImpossible) <= Number(second.hardImpossible)
      && first.hardFailures <= second.hardFailures
      && first.zeroDomainClues <= second.zeroDomainClues
      && first.longClueImpossible <= second.longClueImpossible
      && first.panels <= second.panels
      && first.letters >= second.letters
      && first.answers >= second.answers
      && first.crossings >= second.crossings
      && first.greedyClueTextCells >= second.greedyClueTextCells
      && first.greedyExternalClues >= second.greedyExternalClues
      && first.panelRegions <= second.panelRegions
      && first.isolatedPanels <= second.isolatedPanels
      && first.residualConcentration >= second.residualConcentration
      && first.overlapPressure <= second.overlapPressure;
    if (!noWorse) return false;
    return Number(first.necessaryPass) > Number(second.necessaryPass)
      || Number(first.hardImpossible) < Number(second.hardImpossible)
      || first.hardFailures < second.hardFailures
      || first.zeroDomainClues < second.zeroDomainClues
      || first.longClueImpossible < second.longClueImpossible
      || first.panels < second.panels
      || first.letters > second.letters
      || first.answers > second.answers
      || first.crossings > second.crossings
      || first.greedyClueTextCells > second.greedyClueTextCells
      || first.greedyExternalClues > second.greedyExternalClues
      || first.panelRegions < second.panelRegions
      || first.isolatedPanels < second.isolatedPanels
      || first.residualConcentration > second.residualConcentration
      || first.overlapPressure < second.overlapPressure;
  }

  function compactObservation(observation) {
    return {
      allocationIndex: observation.allocationIndex,
      provenance: observation.provenance,
      vector: observation.vector,
      estimatorElapsedMs: observation.estimatorElapsedMs,
      allocationElapsedMs: observation.allocationElapsedMs,
      exactLayout: observation.exactLayout,
      estimatorError: observation.estimatorError || null,
    };
  }

  function selectStructuralFrontier(observations, requestedWidth = width()) {
    const ranked = observations.map((observation) => ({
      ...observation,
      vector: observation.vector || structuralVector(observation),
    })).sort(compareStructural);
    if (!ranked.length) {
      return { members: [], rejected: [], width: requestedWidth, considered: 0, retained: 0 };
    }

    const selected = [ranked[0]];
    const rejected = [];
    for (let index = 1; index < ranked.length; index += 1) {
      const candidate = ranked[index];
      const dominatorIndex = selected.findIndex((retained) => dominatesStructural(retained.vector, candidate.vector));
      if (dominatorIndex >= 0) {
        rejected.push({
          allocationIndex: candidate.allocationIndex,
          provenance: candidate.provenance,
          vector: candidate.vector,
          reason: "dominated",
          dominatedByAllocationIndex: selected[dominatorIndex].allocationIndex,
        });
        continue;
      }

      for (let selectedIndex = selected.length - 1; selectedIndex >= 1; selectedIndex -= 1) {
        const retained = selected[selectedIndex];
        if (!dominatesStructural(candidate.vector, retained.vector)) continue;
        selected.splice(selectedIndex, 1);
        rejected.push({
          allocationIndex: retained.allocationIndex,
          provenance: retained.provenance,
          vector: retained.vector,
          reason: "dominated-by-later-frontier-member",
          dominatedByAllocationIndex: candidate.allocationIndex,
        });
      }

      selected.push(candidate);
      selected.sort(compareStructural);
      if (selected.length > requestedWidth) {
        const removed = selected.pop();
        rejected.push({
          allocationIndex: removed.allocationIndex,
          provenance: removed.provenance,
          vector: removed.vector,
          reason: "frontier-width",
        });
      }
    }

    return {
      members: selected,
      rejected,
      width: requestedWidth,
      considered: ranked.length,
      retained: selected.length,
    };
  }

  function provenanceFor(state, metadata, allocationIndex) {
    const known = metadata.get(state) || {};
    return {
      source: known.source || "allocation-input",
      buildIndex: known.buildIndex ?? null,
      attempt: known.attempt ?? null,
      attemptNumber: known.attempt == null ? null : known.attempt + 1,
      partialSearchVariant: known.partialSearchVariant || partialSearchVariant(state),
      victimVariantIndex: known.victimVariantIndex ?? null,
      allocationIndex,
    };
  }

  function attachTelemetry(result, telemetry) {
    if (!result || typeof result !== "object") return result;
    const attach = (candidate) => {
      if (!candidate || typeof candidate !== "object") return;
      candidate.constructionV2 = {
        ...(candidate.constructionV2 || {}),
        preallocationStructuralFrontier: telemetry,
      };
    };
    attach(result);
    for (const candidate of result.__completePipelineFrontierV1?.candidates || []) attach(candidate);
    return result;
  }

  function phase10FrontierIndexes(result, observations) {
    const candidates = result?.__completePipelineFrontierV1?.candidates || [];
    if (!candidates.length) return [];
    const indexes = [];
    for (const candidate of candidates) {
      const observation = observations.find((entry) => entry.state?.grid === candidate.grid
        || entry.state?.placed === candidate.placed);
      if (observation) indexes.push(observation.allocationIndex);
    }
    return [...new Set(indexes)].sort((a, b) => a - b);
  }

  function generatePortfolio(...args) {
    const currentMode = mode();
    if (currentMode === "off" || active) return originalGeneratePortfolio(...args);

    active = true;
    const originalAssign = solver.assignClueTextCellsV2;
    const originalBuild = solver.buildAttempt;
    const originalClone = solver.cloneVictimState;
    const originalVictimVariants = solver.generateVictimReplacementVariants;
    const metadata = new WeakMap();
    const observations = [];
    const errors = [];
    let buildIndex = 0;
    const attemptOffsetRaw = Number(environmentOption("SCANWORD_PORTFOLIO_ATTEMPT_OFFSET", 0));
    const attemptOffset = Number.isFinite(attemptOffsetRaw) && attemptOffsetRaw >= 0 ? Math.floor(attemptOffsetRaw) : 0;

    try {
      if (typeof originalBuild === "function") {
        solver.buildAttempt = (...buildArgs) => {
          const state = originalBuild.apply(solver, buildArgs);
          const attempt = attemptOffset + buildIndex;
          if (state && typeof state === "object") {
            metadata.set(state, {
              source: "build-attempt",
              buildIndex,
              attempt,
              partialSearchVariant: partialSearchVariant(state),
            });
            const fallback = state.__phase6BaselineState;
            if (fallback && typeof fallback === "object") {
              metadata.set(fallback, {
                source: "build-attempt-fallback",
                buildIndex,
                attempt,
                partialSearchVariant: "baseline-fallback",
              });
            }
          }
          buildIndex += 1;
          return state;
        };
      }

      if (typeof originalClone === "function") {
        solver.cloneVictimState = (state, ...cloneArgs) => {
          const clone = originalClone.call(solver, state, ...cloneArgs);
          const known = metadata.get(state);
          if (clone && known) metadata.set(clone, { ...known, source: `${known.source}-clone` });
          return clone;
        };
      }

      if (typeof originalVictimVariants === "function") {
        solver.generateVictimReplacementVariants = (state, ...variantArgs) => {
          const generated = originalVictimVariants.call(solver, state, ...variantArgs);
          const known = metadata.get(state) || {};
          for (let index = 0; index < (generated?.states || []).length; index += 1) {
            metadata.set(generated.states[index], {
              ...known,
              source: "victim-replacement",
              victimVariantIndex: index,
            });
          }
          return generated;
        };
      }

      if (typeof originalAssign === "function") {
        solver.assignClueTextCellsV2 = (state, random, restarts) => {
          const allocationIndex = observations.length;
          const geometry = geometryCounts(state);
          let estimate = null;
          let estimatorError = null;
          const estimatorStarted = now();
          try {
            estimate = typeof solver.evaluateClueFeasibilityV1 === "function"
              ? solver.evaluateClueFeasibilityV1(state)
              : null;
          } catch (error) {
            estimatorError = String(error?.stack || error);
            errors.push({ allocationIndex, stage: "estimate", error: estimatorError });
          }
          const estimatorElapsedMs = +(now() - estimatorStarted).toFixed(3);
          const observation = {
            allocationIndex,
            state,
            provenance: provenanceFor(state, metadata, allocationIndex),
            geometry,
            answers: Number(state?.placed?.length || 0),
            estimate,
            estimatorError,
            vector: null,
            estimatorElapsedMs,
            allocationElapsedMs: 0,
            exactLayout: null,
          };
          observation.vector = structuralVector(observation);
          observations.push(observation);
          const started = now();
          const layout = originalAssign.call(solver, state, random, restarts);
          observation.allocationElapsedMs = +(now() - started).toFixed(3);
          observation.exactLayout = {
            clueTextCells: Number(layout?.clueTextCells || 0),
            externalClueTexts: Number(layout?.externalClueTexts || 0),
          };
          return layout;
        };
      }

      const result = originalGeneratePortfolio(...args);
      const selection = selectStructuralFrontier(observations, width());
      const retainedIndexes = new Set(selection.members.map((entry) => entry.allocationIndex));
      const phase10Indexes = phase10FrontierIndexes(result, observations);
      const phase10Retained = phase10Indexes.filter((index) => retainedIndexes.has(index));
      const allocationElapsedMs = observations.reduce((sum, entry) => sum + entry.allocationElapsedMs, 0);
      const estimatorElapsedMs = observations.reduce((sum, entry) => sum + entry.estimatorElapsedMs, 0);
      const projectedCallsSaved = Math.max(0, observations.length - selection.members.length);
      const projectedAllocationElapsedMsSaved = observations
        .filter((entry) => !retainedIndexes.has(entry.allocationIndex))
        .reduce((sum, entry) => sum + entry.allocationElapsedMs, 0);
      const telemetry = {
        schemaVersion: 1,
        mode: currentMode,
        authoritative: false,
        estimator: "regional-bounds-local-delta-v1",
        boundary: "immediately-before-assignClueTextCellsV2",
        width: selection.width,
        allocationCalls: observations.length,
        estimatorElapsedMs: +estimatorElapsedMs.toFixed(3),
        allocationElapsedMs: +allocationElapsedMs.toFixed(3),
        structuralEvaluations: observations.length - errors.filter((entry) => entry.stage === "estimate").length,
        retained: selection.retained,
        projectedCallsSaved,
        projectedCallReduction: observations.length
          ? +(projectedCallsSaved / observations.length).toFixed(4)
          : 0,
        projectedAllocationElapsedMsSaved: +projectedAllocationElapsedMsSaved.toFixed(3),
        projectedAllocationTimeReduction: allocationElapsedMs
          ? +(projectedAllocationElapsedMsSaved / allocationElapsedMs).toFixed(4)
          : 0,
        phase10FrontierAllocationIndexes: phase10Indexes,
        phase10FrontierRetained: phase10Retained.length,
        phase10FrontierRecall: phase10Indexes.length
          ? +(phase10Retained.length / phase10Indexes.length).toFixed(4)
          : null,
        safeToFilterObservedPhase10Frontier: phase10Indexes.length > 0 && phase10Retained.length === phase10Indexes.length,
        members: selection.members.map(compactObservation),
        rejected: selection.rejected,
        errors,
      };
      Object.defineProperty(telemetry, "__observations", {
        value: observations,
        enumerable: false,
        configurable: true,
      });
      return attachTelemetry(result, telemetry);
    } finally {
      if (originalAssign) solver.assignClueTextCellsV2 = originalAssign;
      if (originalBuild) solver.buildAttempt = originalBuild;
      if (originalClone) solver.cloneVictimState = originalClone;
      if (originalVictimVariants) solver.generateVictimReplacementVariants = originalVictimVariants;
      active = false;
    }
  }

  solver.generatePortfolio = generatePortfolio;
  Object.assign(solver, {
    selectPreallocationStructuralFrontierV1: selectStructuralFrontier,
    preallocationStructuralVectorV1: structuralVector,
    preallocationStructuralDominatesV1: dominatesStructural,
    preallocationStructuralFrontierModeV1: mode,
    preallocationStructuralFrontierWidthV1: width,
    __preallocationStructuralFrontierV1Installed: true,
  });

  window.ScanwordPreallocationStructuralFrontierV1 = {
    version: 1,
    mode,
    width,
    select: selectStructuralFrontier,
    vector: structuralVector,
    dominates: dominatesStructural,
  };
})();
