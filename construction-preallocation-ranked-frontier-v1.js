(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver
    || typeof solver.generatePortfolio !== "function"
    || !solver.__preallocationRepairPotentialV1Installed
    || solver.__preallocationRankedFrontierV1Installed) return;

  const previousGeneratePortfolio = solver.generatePortfolio.bind(solver);
  const sessions = new Map();
  let latestAggregate = null;
  let latestError = null;
  let active = false;

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function mode() {
    return String(environmentOption("SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER", "off")).toLowerCase() === "shadow"
      ? "shadow"
      : "off";
  }

  function configuredWidth() {
    const value = Number(environmentOption("SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH", 16));
    return Math.min(512, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 16));
  }

  function diagnosticWidths() {
    const values = String(environmentOption(
      "SCANWORD_PREALLOCATION_DIAGNOSTIC_WIDTHS",
      "8,16,24,32,48,64,96,128,160,192,224,256,288,320",
    )).split(",")
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.min(512, Math.floor(value)));
    values.push(configuredWidth());
    return [...new Set(values)].sort((a, b) => a - b);
  }

  function compare(first, second) {
    return solver.comparePreallocationRepairPotentialV1(first, second);
  }

  function selectRanked(observations, requestedWidth = configuredWidth()) {
    const ranked = [...(observations || [])].sort(compare);
    return {
      width: requestedWidth,
      considered: ranked.length,
      retained: Math.min(requestedWidth, ranked.length),
      members: ranked.slice(0, requestedWidth),
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
    const matched = [];
    for (const candidate of result?.__completePipelineFrontierV1?.candidates || []) {
      const observation = observations.find((entry) => entry.state?.grid === candidate.grid
        || entry.state?.placed === candidate.placed);
      if (observation && !matched.includes(observation)) matched.push(observation);
    }
    return matched;
  }

  function evaluateWidth(result, observations, requestedWidth) {
    const baseObservations = observations.filter((observation) => !isVictim(observation));
    const victimObservations = observations.filter(isVictim);
    const baseSelection = selectRanked(baseObservations, requestedWidth);
    const retainedBaseKeys = new Set(baseSelection.members.map((entry) => provenanceKey(entry.provenance)));
    const eligibleVictims = victimObservations.filter((entry) => retainedBaseKeys.has(provenanceKey(entry.provenance)));
    const finalSelection = selectRanked([...baseSelection.members, ...eligibleVictims], requestedWidth);
    const retainedIndexes = new Set(finalSelection.members.map((entry) => entry.allocationIndex));
    const phase10 = phase10Observations(result, observations);
    const requiredBaseKeys = [...new Set(phase10.map((entry) => provenanceKey(entry.provenance)))];
    const requiredBasesRetained = requiredBaseKeys.filter((key) => retainedBaseKeys.has(key));
    const phase10Retained = phase10.filter((entry) => retainedIndexes.has(entry.allocationIndex));
    const allocationElapsedMs = observations.reduce((sum, entry) => sum + Number(entry.allocationElapsedMs || 0), 0);
    const projectedAllocationElapsedMsSaved = observations
      .filter((entry) => !retainedIndexes.has(entry.allocationIndex))
      .reduce((sum, entry) => sum + Number(entry.allocationElapsedMs || 0), 0);
    const projectedCallsSaved = Math.max(0, observations.length - finalSelection.retained);
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
      phase10FrontierAllocationCount: phase10.length,
      phase10FrontierRetained: phase10Retained.length,
      phase10FrontierRecall: phase10.length ? +(phase10Retained.length / phase10.length).toFixed(4) : null,
      phase10RequiredBaseCount: requiredBaseKeys.length,
      phase10RequiredBasesRetained: requiredBasesRetained.length,
      phase10BaseRecall: requiredBaseKeys.length
        ? +(requiredBasesRetained.length / requiredBaseKeys.length).toFixed(4)
        : null,
      safeToFilterObservedPhase10Frontier: phase10.length > 0
        && phase10Retained.length === phase10.length
        && requiredBasesRetained.length === requiredBaseKeys.length,
      memberAllocationIndexes: finalSelection.members.map((entry) => entry.allocationIndex),
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

  function aggregate(session, currentWidth) {
    const currentRuns = session.runs.map((run) => run.current);
    const allocationCalls = currentRuns.reduce((sum, entry) => sum + entry.allocationCalls, 0);
    const projectedCallsSaved = currentRuns.reduce((sum, entry) => sum + entry.projectedCallsSaved, 0);
    const allocationElapsedMs = currentRuns.reduce((sum, entry) => sum + entry.allocationElapsedMs, 0);
    const projectedAllocationElapsedMsSaved = currentRuns.reduce(
      (sum, entry) => sum + entry.projectedAllocationElapsedMsSaved,
      0,
    );
    const phase10Count = currentRuns.reduce((sum, entry) => sum + entry.phase10FrontierAllocationCount, 0);
    const phase10Retained = currentRuns.reduce((sum, entry) => sum + entry.phase10FrontierRetained, 0);
    const baseCount = currentRuns.reduce((sum, entry) => sum + entry.phase10RequiredBaseCount, 0);
    const basesRetained = currentRuns.reduce((sum, entry) => sum + entry.phase10RequiredBasesRetained, 0);
    const sweep = diagnosticWidths().map((requestedWidth) => {
      const entries = session.runs.map((run) => run.sweep.find((item) => item.width === requestedWidth)).filter(Boolean);
      const calls = entries.reduce((sum, entry) => sum + entry.allocationCalls, 0);
      const saved = entries.reduce((sum, entry) => sum + entry.projectedCallsSaved, 0);
      const frontierCount = entries.reduce((sum, entry) => sum + entry.phase10FrontierAllocationCount, 0);
      const frontierRetained = entries.reduce((sum, entry) => sum + entry.phase10FrontierRetained, 0);
      const requiredCount = entries.reduce((sum, entry) => sum + entry.phase10RequiredBaseCount, 0);
      const requiredRetained = entries.reduce((sum, entry) => sum + entry.phase10RequiredBasesRetained, 0);
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
        phase10RequiredBaseCount: requiredCount,
        phase10RequiredBasesRetained: requiredRetained,
        phase10BaseRecall: requiredCount ? +(requiredRetained / requiredCount).toFixed(4) : null,
        safeToFilterObservedPhase10Frontier: entries.length > 0
          && entries.every((entry) => entry.safeToFilterObservedPhase10Frontier),
      };
    });
    Object.assign(session.aggregate, {
      schemaVersion: 1,
      mode: mode(),
      authoritative: false,
      ordering: "phase10-repair-potential-ranked-no-dominance-v1",
      stageModel: "base-rank-then-victim-rank-v1",
      runCount: session.runs.length,
      width: currentWidth,
      allocationCalls,
      retainedAllocations: currentRuns.reduce((sum, entry) => sum + entry.retained, 0),
      projectedCallsSaved,
      projectedCallReduction: allocationCalls ? +(projectedCallsSaved / allocationCalls).toFixed(4) : 0,
      allocationElapsedMs: +allocationElapsedMs.toFixed(3),
      projectedAllocationElapsedMsSaved: +projectedAllocationElapsedMsSaved.toFixed(3),
      projectedAllocationTimeReduction: allocationElapsedMs
        ? +(projectedAllocationElapsedMsSaved / allocationElapsedMs).toFixed(4)
        : 0,
      phase10FrontierAllocationCount: phase10Count,
      phase10FrontierRetained: phase10Retained,
      phase10FrontierRecall: phase10Count ? +(phase10Retained / phase10Count).toFixed(4) : null,
      phase10RequiredBaseCount: baseCount,
      phase10RequiredBasesRetained: basesRetained,
      phase10BaseRecall: baseCount ? +(basesRetained / baseCount).toFixed(4) : null,
      safeToFilterObservedPhase10Frontier: currentRuns.length > 0
        && currentRuns.every((entry) => entry.safeToFilterObservedPhase10Frontier),
      runs: session.runs.map((run) => ({ activePoolLimit: run.activePoolLimit, current: run.current })),
      sweep,
    });
    latestAggregate = session.aggregate;
  }

  function attach(result, telemetry) {
    const apply = (candidate) => {
      if (!candidate || typeof candidate !== "object") return;
      candidate.constructionV2 = {
        ...(candidate.constructionV2 || {}),
        preallocationRankedFrontier: telemetry,
      };
    };
    apply(result);
    for (const candidate of result?.__completePipelineFrontierV1?.candidates || []) apply(candidate);
  }

  function attachError(result, error) {
    const report = {
      schemaVersion: 1,
      mode: "shadow",
      authoritative: false,
      failOpen: true,
      error: String(error?.stack || error),
    };
    latestError = report;
    const apply = (candidate) => {
      if (!candidate || typeof candidate !== "object") return;
      candidate.constructionV2 = {
        ...(candidate.constructionV2 || {}),
        preallocationRankedFrontierError: report,
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
      try {
        const observations = result?.constructionV2?.preallocationStructuralFrontier?.__observations;
        if (!Array.isArray(observations) || !observations.length) return result;
        const currentWidth = configuredWidth();
        const current = evaluateWidth(result, observations, currentWidth);
        const sweep = diagnosticWidths().map((requestedWidth) => evaluateWidth(result, observations, requestedWidth));
        const telemetry = {
          schemaVersion: 1,
          mode: "shadow",
          authoritative: false,
          ordering: "phase10-repair-potential-ranked-no-dominance-v1",
          stageModel: "base-rank-then-victim-rank-v1",
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
        aggregate(session, currentWidth);
        for (const previousResult of session.results) {
          previousResult.constructionV2 = {
            ...(previousResult.constructionV2 || {}),
            preallocationRankedFrontierPortfolio: session.aggregate,
          };
          for (const candidate of previousResult.__completePipelineFrontierV1?.candidates || []) {
            candidate.constructionV2 = {
              ...(candidate.constructionV2 || {}),
              preallocationRankedFrontierPortfolio: session.aggregate,
            };
          }
        }
        latestError = null;
        return result;
      } catch (error) {
        attachError(result, error);
        return result;
      }
    } finally {
      active = false;
    }
  }

  solver.generatePortfolio = generatePortfolio;
  Object.assign(solver, {
    selectPreallocationRankedFrontierV1: selectRanked,
    currentPreallocationRankedFrontierPortfolioV1: () => latestAggregate,
    currentPreallocationRankedFrontierErrorV1: () => latestError,
    __preallocationRankedFrontierV1Installed: true,
  });

  window.ScanwordPreallocationRankedFrontierV1 = {
    version: 1,
    mode,
    width: configuredWidth,
    diagnosticWidths,
    select: selectRanked,
    currentPortfolioAggregate: () => latestAggregate,
    currentError: () => latestError,
  };
})();