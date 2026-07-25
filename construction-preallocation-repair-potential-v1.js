(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver
    || typeof solver.generatePortfolio !== "function"
    || !solver.__preallocationStructuralFrontierV1Installed
    || solver.__preallocationRepairPotentialV1Installed) return;

  const previousGeneratePortfolio = solver.generatePortfolio.bind(solver);
  const sessions = new Map();
  let latestAggregate = null;
  let active = false;

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function mode() {
    const value = String(environmentOption("SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER", "off")).toLowerCase();
    return value === "shadow" ? "shadow" : "off";
  }

  function configuredWidth() {
    const value = Number(environmentOption("SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH", 16));
    return Math.min(256, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 16));
  }

  function diagnosticWidths() {
    const configured = String(environmentOption(
      "SCANWORD_PREALLOCATION_DIAGNOSTIC_WIDTHS",
      "8,16,24,32,48,64,96,128,192,256",
    )).split(",")
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.min(256, Math.floor(value)));
    configured.push(configuredWidth());
    return [...new Set(configured)].sort((a, b) => a - b);
  }

  function vectorFor(observation) {
    return observation?.vector
      || solver.preallocationStructuralVectorV1?.(observation)
      || {};
  }

  function compareRepairPotential(first, second) {
    const a = vectorFor(first);
    const b = vectorFor(second);
    return Number(a.panels || 0) - Number(b.panels || 0)
      || Number(b.letters || 0) - Number(a.letters || 0)
      || Number(b.answers || 0) - Number(a.answers || 0)
      || Number(b.crossings || 0) - Number(a.crossings || 0)
      || Number(a.panelRegions || 0) - Number(b.panelRegions || 0)
      || Number(a.isolatedPanels || 0) - Number(b.isolatedPanels || 0)
      || Number(b.residualConcentration || 0) - Number(a.residualConcentration || 0)
      || Number(b.necessaryPass) - Number(a.necessaryPass)
      || Number(a.hardImpossible) - Number(b.hardImpossible)
      || Number(a.hardFailures || 0) - Number(b.hardFailures || 0)
      || Number(b.clueTextUpperBound || 0) - Number(a.clueTextUpperBound || 0)
      || Number(b.externalUpperBound || 0) - Number(a.externalUpperBound || 0)
      || Number(b.greedyClueTextCells || 0) - Number(a.greedyClueTextCells || 0)
      || Number(b.greedyExternalClues || 0) - Number(a.greedyExternalClues || 0)
      || Number(a.overlapPressure || 0) - Number(b.overlapPressure || 0)
      || Number(a.zeroDomainClues || 0) - Number(b.zeroDomainClues || 0)
      || Number(a.longClueImpossible || 0) - Number(b.longClueImpossible || 0)
      || Number(first?.allocationIndex || 0) - Number(second?.allocationIndex || 0);
  }

  function dominatesRepairPotential(first, second) {
    const a = vectorFor(first);
    const b = vectorFor(second);
    const noWorse = Number(a.panels || 0) <= Number(b.panels || 0)
      && Number(a.letters || 0) >= Number(b.letters || 0)
      && Number(a.answers || 0) >= Number(b.answers || 0)
      && Number(a.crossings || 0) >= Number(b.crossings || 0)
      && Number(a.panelRegions || 0) <= Number(b.panelRegions || 0)
      && Number(a.isolatedPanels || 0) <= Number(b.isolatedPanels || 0)
      && Number(a.residualConcentration || 0) >= Number(b.residualConcentration || 0)
      && Number(a.clueTextUpperBound || 0) >= Number(b.clueTextUpperBound || 0)
      && Number(a.externalUpperBound || 0) >= Number(b.externalUpperBound || 0)
      && Number(a.greedyClueTextCells || 0) >= Number(b.greedyClueTextCells || 0)
      && Number(a.greedyExternalClues || 0) >= Number(b.greedyExternalClues || 0)
      && Number(a.necessaryPass) >= Number(b.necessaryPass)
      && Number(a.hardImpossible) <= Number(b.hardImpossible);
    if (!noWorse) return false;
    return Number(a.panels || 0) < Number(b.panels || 0)
      || Number(a.letters || 0) > Number(b.letters || 0)
      || Number(a.answers || 0) > Number(b.answers || 0)
      || Number(a.crossings || 0) > Number(b.crossings || 0)
      || Number(a.panelRegions || 0) < Number(b.panelRegions || 0)
      || Number(a.isolatedPanels || 0) < Number(b.isolatedPanels || 0)
      || Number(a.residualConcentration || 0) > Number(b.residualConcentration || 0)
      || Number(a.clueTextUpperBound || 0) > Number(b.clueTextUpperBound || 0)
      || Number(a.externalUpperBound || 0) > Number(b.externalUpperBound || 0)
      || Number(a.greedyClueTextCells || 0) > Number(b.greedyClueTextCells || 0)
      || Number(a.greedyExternalClues || 0) > Number(b.greedyExternalClues || 0)
      || Number(a.necessaryPass) > Number(b.necessaryPass)
      || Number(a.hardImpossible) < Number(b.hardImpossible);
  }

  function selectRepairPotential(observations, requestedWidth = configuredWidth()) {
    const ranked = [...(observations || [])].sort(compareRepairPotential);
    if (!ranked.length) return { members: [], rejected: [], width: requestedWidth, considered: 0, retained: 0 };
    const selected = [ranked[0]];
    const rejected = [];
    for (let index = 1; index < ranked.length; index += 1) {
      const candidate = ranked[index];
      const dominatorIndex = selected.findIndex((retained) => dominatesRepairPotential(retained, candidate));
      if (dominatorIndex >= 0) {
        rejected.push({
          allocationIndex: candidate.allocationIndex,
          provenance: candidate.provenance,
          reason: "dominated",
          dominatedByAllocationIndex: selected[dominatorIndex].allocationIndex,
        });
        continue;
      }
      for (let selectedIndex = selected.length - 1; selectedIndex >= 1; selectedIndex -= 1) {
        if (!dominatesRepairPotential(candidate, selected[selectedIndex])) continue;
        rejected.push({
          allocationIndex: selected[selectedIndex].allocationIndex,
          provenance: selected[selectedIndex].provenance,
          reason: "dominated-by-later-frontier-member",
          dominatedByAllocationIndex: candidate.allocationIndex,
        });
        selected.splice(selectedIndex, 1);
      }
      selected.push(candidate);
      selected.sort(compareRepairPotential);
      if (selected.length > requestedWidth) {
        const removed = selected.pop();
        rejected.push({
          allocationIndex: removed.allocationIndex,
          provenance: removed.provenance,
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

  function provenanceKey(provenance) {
    const variant = provenance?.partialSearchVariant || "default";
    if (provenance?.attempt != null) return `${provenance.attempt}:${variant}`;
    return `build:${provenance?.buildIndex ?? "unknown"}:${variant}`;
  }

  function isVictim(observation) {
    return observation?.provenance?.source === "victim-replacement";
  }

  function phase10Observations(result, observations) {
    const candidates = result?.__completePipelineFrontierV1?.candidates || [];
    const matched = [];
    for (const candidate of candidates) {
      const observation = observations.find((entry) => entry.state?.grid === candidate.grid
        || entry.state?.placed === candidate.placed);
      if (observation && !matched.includes(observation)) matched.push(observation);
    }
    return matched;
  }

  function evaluateWidth(result, observations, requestedWidth) {
    const baseObservations = observations.filter((observation) => !isVictim(observation));
    const victimObservations = observations.filter(isVictim);
    const baseSelection = selectRepairPotential(baseObservations, requestedWidth);
    const retainedBaseKeys = new Set(baseSelection.members.map((observation) => provenanceKey(observation.provenance)));
    const eligibleVictims = victimObservations.filter((observation) => retainedBaseKeys.has(provenanceKey(observation.provenance)));
    const finalSelection = selectRepairPotential([...baseSelection.members, ...eligibleVictims], requestedWidth);
    const retainedIndexes = new Set(finalSelection.members.map((observation) => observation.allocationIndex));
    const phase10 = phase10Observations(result, observations);
    const phase10Indexes = phase10.map((observation) => observation.allocationIndex);
    const phase10Retained = phase10.filter((observation) => retainedIndexes.has(observation.allocationIndex));
    const requiredBaseKeys = [...new Set(phase10.map((observation) => provenanceKey(observation.provenance)))];
    const requiredBasesRetained = requiredBaseKeys.filter((key) => retainedBaseKeys.has(key));
    const projectedCallsSaved = Math.max(0, observations.length - finalSelection.retained);
    const allocationElapsedMs = observations.reduce((sum, observation) => sum + Number(observation.allocationElapsedMs || 0), 0);
    const projectedAllocationElapsedMsSaved = observations
      .filter((observation) => !retainedIndexes.has(observation.allocationIndex))
      .reduce((sum, observation) => sum + Number(observation.allocationElapsedMs || 0), 0);
    return {
      width: requestedWidth,
      baseConsidered: baseSelection.considered,
      basesRetained: baseSelection.retained,
      victimVariantsObserved: victimObservations.length,
      eligibleVictimVariants: eligibleVictims.length,
      retained: finalSelection.retained,
      allocationCalls: observations.length,
      projectedCallsSaved,
      projectedCallReduction: observations.length ? +(projectedCallsSaved / observations.length).toFixed(4) : 0,
      allocationElapsedMs: +allocationElapsedMs.toFixed(3),
      projectedAllocationElapsedMsSaved: +projectedAllocationElapsedMsSaved.toFixed(3),
      projectedAllocationTimeReduction: allocationElapsedMs
        ? +(projectedAllocationElapsedMsSaved / allocationElapsedMs).toFixed(4)
        : 0,
      phase10FrontierAllocationCount: phase10Indexes.length,
      phase10FrontierRetained: phase10Retained.length,
      phase10FrontierRecall: phase10Indexes.length
        ? +(phase10Retained.length / phase10Indexes.length).toFixed(4)
        : null,
      phase10RequiredBaseCount: requiredBaseKeys.length,
      phase10RequiredBasesRetained: requiredBasesRetained.length,
      phase10BaseRecall: requiredBaseKeys.length
        ? +(requiredBasesRetained.length / requiredBaseKeys.length).toFixed(4)
        : null,
      safeToFilterObservedPhase10Frontier: phase10Indexes.length > 0
        && phase10Retained.length === phase10Indexes.length
        && requiredBasesRetained.length === requiredBaseKeys.length,
      memberAllocationIndexes: finalSelection.members.map((observation) => observation.allocationIndex),
      memberProvenance: finalSelection.members.map((observation) => observation.provenance),
    };
  }

  function sessionKey(args) {
    return JSON.stringify([
      args[0] ?? null,
      Number(args[1] || 0),
      Number(args[2] || 0),
      Number(args[3] || 0),
      Number(args[4] || 0),
      Number(args[5] || 0),
    ]);
  }

  function runKey() {
    return JSON.stringify([
      String(environmentOption("SCANWORD_ACTIVE_POOL_LIMIT", "default")),
      String(environmentOption("SCANWORD_PARTIAL_SEARCH", "off")),
      String(environmentOption("SCANWORD_PORTFOLIO_ATTEMPTS", "default")),
      String(environmentOption("SCANWORD_PORTFOLIO_ATTEMPT_OFFSET", "0")),
    ]);
  }

  function aggregateRuns(session, currentWidth) {
    const currentRuns = session.runs.map((run) => run.current);
    const allocationCalls = currentRuns.reduce((sum, run) => sum + run.allocationCalls, 0);
    const retainedAllocations = currentRuns.reduce((sum, run) => sum + run.retained, 0);
    const projectedCallsSaved = currentRuns.reduce((sum, run) => sum + run.projectedCallsSaved, 0);
    const allocationElapsedMs = currentRuns.reduce((sum, run) => sum + run.allocationElapsedMs, 0);
    const projectedAllocationElapsedMsSaved = currentRuns.reduce(
      (sum, run) => sum + run.projectedAllocationElapsedMsSaved,
      0,
    );
    const phase10FrontierAllocationCount = currentRuns.reduce(
      (sum, run) => sum + run.phase10FrontierAllocationCount,
      0,
    );
    const phase10FrontierRetained = currentRuns.reduce((sum, run) => sum + run.phase10FrontierRetained, 0);
    const phase10RequiredBaseCount = currentRuns.reduce((sum, run) => sum + run.phase10RequiredBaseCount, 0);
    const phase10RequiredBasesRetained = currentRuns.reduce((sum, run) => sum + run.phase10RequiredBasesRetained, 0);
    const sweep = diagnosticWidths().map((requestedWidth) => {
      const entries = session.runs.map((run) => run.sweep.find((entry) => entry.width === requestedWidth)).filter(Boolean);
      const calls = entries.reduce((sum, entry) => sum + entry.allocationCalls, 0);
      const saved = entries.reduce((sum, entry) => sum + entry.projectedCallsSaved, 0);
      const frontierCount = entries.reduce((sum, entry) => sum + entry.phase10FrontierAllocationCount, 0);
      const frontierRetained = entries.reduce((sum, entry) => sum + entry.phase10FrontierRetained, 0);
      const baseCount = entries.reduce((sum, entry) => sum + entry.phase10RequiredBaseCount, 0);
      const basesRetained = entries.reduce((sum, entry) => sum + entry.phase10RequiredBasesRetained, 0);
      return {
        width: requestedWidth,
        runCount: entries.length,
        allocationCalls: calls,
        retainedAllocations: entries.reduce((sum, entry) => sum + entry.retained, 0),
        projectedCallsSaved: saved,
        projectedCallReduction: calls ? +(saved / calls).toFixed(4) : 0,
        phase10FrontierAllocationCount: frontierCount,
        phase10FrontierRetained: frontierRetained,
        phase10FrontierRecall: frontierCount ? +(frontierRetained / frontierCount).toFixed(4) : null,
        phase10RequiredBaseCount: baseCount,
        phase10RequiredBasesRetained: basesRetained,
        phase10BaseRecall: baseCount ? +(basesRetained / baseCount).toFixed(4) : null,
        safeToFilterObservedPhase10Frontier: entries.length > 0
          && entries.every((entry) => entry.safeToFilterObservedPhase10Frontier),
      };
    });
    Object.assign(session.aggregate, {
      schemaVersion: 1,
      mode: mode(),
      authoritative: false,
      ordering: "phase10-repair-potential-first-v1",
      stageModel: "base-frontier-then-victim-frontier-v1",
      runCount: session.runs.length,
      width: currentWidth,
      allocationCalls,
      retainedAllocations,
      projectedCallsSaved,
      projectedCallReduction: allocationCalls ? +(projectedCallsSaved / allocationCalls).toFixed(4) : 0,
      allocationElapsedMs: +allocationElapsedMs.toFixed(3),
      projectedAllocationElapsedMsSaved: +projectedAllocationElapsedMsSaved.toFixed(3),
      projectedAllocationTimeReduction: allocationElapsedMs
        ? +(projectedAllocationElapsedMsSaved / allocationElapsedMs).toFixed(4)
        : 0,
      phase10FrontierAllocationCount,
      phase10FrontierRetained,
      phase10FrontierRecall: phase10FrontierAllocationCount
        ? +(phase10FrontierRetained / phase10FrontierAllocationCount).toFixed(4)
        : null,
      phase10RequiredBaseCount,
      phase10RequiredBasesRetained,
      phase10BaseRecall: phase10RequiredBaseCount
        ? +(phase10RequiredBasesRetained / phase10RequiredBaseCount).toFixed(4)
        : null,
      safeToFilterObservedPhase10Frontier: currentRuns.length > 0
        && currentRuns.every((run) => run.safeToFilterObservedPhase10Frontier),
      runs: session.runs.map((run) => ({
        activePoolLimit: run.activePoolLimit,
        current: run.current,
      })),
      sweep,
    });
    latestAggregate = session.aggregate;
  }

  function attach(result, telemetry) {
    const apply = (candidate) => {
      if (!candidate || typeof candidate !== "object") return;
      candidate.constructionV2 = {
        ...(candidate.constructionV2 || {}),
        preallocationRepairPotentialFrontier: telemetry,
      };
    };
    apply(result);
    for (const candidate of result?.__completePipelineFrontierV1?.candidates || []) apply(candidate);
  }

  function generatePortfolio(...args) {
    if (mode() !== "shadow" || active) return previousGeneratePortfolio(...args);
    active = true;
    try {
      const result = previousGeneratePortfolio(...args);
      const sourceTelemetry = result?.constructionV2?.preallocationStructuralFrontier;
      const observations = sourceTelemetry?.__observations;
      if (!Array.isArray(observations) || !observations.length) return result;
      const currentWidth = configuredWidth();
      const current = evaluateWidth(result, observations, currentWidth);
      const sweep = diagnosticWidths().map((requestedWidth) => evaluateWidth(result, observations, requestedWidth));
      const telemetry = {
        schemaVersion: 1,
        mode: "shadow",
        authoritative: false,
        ordering: "phase10-repair-potential-first-v1",
        stageModel: "base-frontier-then-victim-frontier-v1",
        current,
        sweep,
      };
      attach(result, telemetry);

      const key = sessionKey(args);
      const currentRunKey = runKey();
      let session = sessions.get(key);
      if (!session || session.runKeys.has(currentRunKey)) {
        session = { runKeys: new Set(), runs: [], results: [], aggregate: {} };
        sessions.set(key, session);
      }
      session.runKeys.add(currentRunKey);
      session.runs.push({
        activePoolLimit: String(environmentOption("SCANWORD_ACTIVE_POOL_LIMIT", "default")),
        current,
        sweep,
      });
      session.results.push(result);
      aggregateRuns(session, currentWidth);
      for (const previousResult of session.results) {
        previousResult.constructionV2 = {
          ...(previousResult.constructionV2 || {}),
          preallocationRepairPotentialFrontierPortfolio: session.aggregate,
        };
        for (const candidate of previousResult.__completePipelineFrontierV1?.candidates || []) {
          candidate.constructionV2 = {
            ...(candidate.constructionV2 || {}),
            preallocationRepairPotentialFrontierPortfolio: session.aggregate,
          };
        }
      }
      return result;
    } finally {
      active = false;
    }
  }

  solver.generatePortfolio = generatePortfolio;
  Object.assign(solver, {
    selectPreallocationRepairPotentialFrontierV1: selectRepairPotential,
    comparePreallocationRepairPotentialV1: compareRepairPotential,
    dominatesPreallocationRepairPotentialV1: dominatesRepairPotential,
    currentPreallocationRepairPotentialPortfolioV1: () => latestAggregate,
    __preallocationRepairPotentialV1Installed: true,
  });

  window.ScanwordPreallocationRepairPotentialV1 = {
    version: 1,
    mode,
    width: configuredWidth,
    diagnosticWidths,
    select: selectRepairPotential,
    compare: compareRepairPotential,
    dominates: dominatesRepairPotential,
    currentPortfolioAggregate: () => latestAggregate,
  };
})();