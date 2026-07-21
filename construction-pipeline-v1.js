(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const stateApi = window.ScanwordCandidateStateV1;
  const telemetryApi = window.ScanwordConstructionPipelineTelemetryV1;
  const stages = window.ScanwordConstructionPipelineStagesV1;
  const retrieval = window.ScanwordFullCorpusPatternIndexV1;
  if (!solver || !stateApi || !telemetryApi || !stages || solver.__explicitPipelineV1Installed) return;

  const legacyGenerateBest = solver.generateBest.bind(solver);
  const legacySource = stages.createLegacySource(legacyGenerateBest);

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function explicitModeEnabled() {
    return String(environmentOption("SCANWORD_EXPLICIT_PIPELINE", "off")).toLowerCase() === "on";
  }

  function runExplicitPipeline(...args) {
    const telemetry = telemetryApi.create({
      seed: args[0] ?? null,
      rows: Number(args[2] || 0),
      cols: Number(args[3] || 0),
      targetWords: Number(args[4] || 0),
      legacyBoundary: "complete-production-generator",
    });
    const context = { arguments: args };

    let state = telemetry.runSource("legacy-source", () => legacySource(context), {
      ownership: "existing production wrapper chain",
    });
    state = telemetry.runStage("base-construction", state, stages.observeBaseConstruction, {
      mode: "legacy-observation",
    });
    state = telemetry.runStage("clue-allocation", state, stages.observeClueAllocation, {
      mode: "legacy-observation",
    });
    state = telemetry.runStage("current-repair-chain", state, stages.observeRepairChain, {
      mode: "legacy-observation",
    });
    if (retrieval?.enabled?.()) {
      state = telemetry.runStage("full-corpus-retrieval", state, stages.observeFullCorpusRetrieval, {
        mode: retrieval.retrievalMode(),
        ownership: "bounded constrained-domain retrieval",
      });
    }
    state = telemetry.runStage("validation", state, stages.validate, {
      validator: "ScanwordSolver.resultMetrics",
    });
    const ranked = telemetry.runStage("comparison", [state], stages.compare, {
      candidateCount: 1,
      selection: "identity-parity",
    });
    const selected = ranked[0];
    const result = stateApi.toLegacyResult(selected);
    return telemetryApi.attach(result, telemetry.summary({
      selectedSignature: stateApi.signature(selected),
      exactOutputParityExpected: !retrieval?.enabled?.(),
      fullCorpusRetrieval: retrieval?.enabled?.()
        ? { enabled: true, mode: retrieval.retrievalMode() }
        : { enabled: false },
    }));
  }

  solver.generateBest = (...args) => {
    if (!explicitModeEnabled()) return legacyGenerateBest(...args);
    return runExplicitPipeline(...args);
  };

  Object.assign(solver, {
    generateExplicitPipelineV1: runExplicitPipeline,
    legacyGenerateBestV1: legacyGenerateBest,
    explicitPipelineModeEnabledV1: explicitModeEnabled,
    __explicitPipelineV1Installed: true,
  });

  window.SCANWORD_WRAPPER_INSTALLATION_LOCK = explicitModeEnabled()
    ? "explicit-pipeline-v1"
    : window.SCANWORD_WRAPPER_INSTALLATION_LOCK || null;
})();
