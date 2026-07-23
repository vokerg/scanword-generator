(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const stateApi = window.ScanwordCandidateStateV1;
  const telemetryApi = window.ScanwordConstructionPipelineTelemetryV1;
  const stages = window.ScanwordConstructionPipelineStagesV1;
  const retrieval = window.ScanwordFullCorpusPatternIndexV1;
  const clueFeasibility = window.ScanwordClueFeasibilityV1;
  const partialSearch = window.ScanwordBoundedPartialSearchV1;
  if (!solver || !stateApi || !telemetryApi || !stages || solver.__explicitPipelineV1Installed) return;

  const legacyGenerateBest = solver.generateBest.bind(solver);

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function withEnvironment(name, value, callback) {
    if (typeof process !== "undefined") {
      const previous = process.env[name];
      if (value == null) delete process.env[name];
      else process.env[name] = String(value);
      try {
        return callback();
      } finally {
        if (previous == null) delete process.env[name];
        else process.env[name] = previous;
      }
    }
    const previous = window[name];
    window[name] = value;
    try {
      return callback();
    } finally {
      window[name] = previous;
    }
  }

  function explicitModeEnabled() {
    return String(environmentOption("SCANWORD_EXPLICIT_PIPELINE", "off")).toLowerCase() === "on";
  }

  function generateDirectProductionResult(args) {
    if (typeof solver.generateVocabularyPortfolioV1 !== "function") {
      throw new Error("Vocabulary portfolio v1 is unavailable for the explicit stage runtime");
    }
    if (typeof solver.generateExplicitSingleCandidateV2 !== "function") {
      throw new Error("Direct single-candidate stage runtime v2 is unavailable");
    }
    return withEnvironment("SCANWORD_PIPELINE_STAGE_RUNTIME", "explicit", () => (
      solver.generateVocabularyPortfolioV1(...args)
    ));
  }

  function runExplicitPipeline(...args) {
    const telemetry = telemetryApi.create({
      seed: args[0] ?? null,
      rows: Number(args[2] || 0),
      cols: Number(args[3] || 0),
      targetWords: Number(args[4] || 0),
      legacyBoundary: "rollback-only-wrapper-chain",
      executionOwner: "direct-production-stage-runtime-v2",
    });

    let state = telemetry.runSource("production-stage-source", () => {
      const result = generateDirectProductionResult(args);
      return stateApi.create(result, {
        sourceStage: "direct-production-stage-runtime-v2",
        seed: args[0],
        arguments: args,
      });
    }, {
      ownership: "explicit ordered production stages",
      rollback: "SCANWORD_EXPLICIT_PIPELINE=off",
    });
    state = telemetry.runStage("base-construction", state, stages.observeBaseConstruction, {
      mode: "direct-stage-observation",
    });
    state = telemetry.runStage("clue-allocation", state, stages.observeClueAllocation, {
      mode: "direct-stage-observation",
    });
    state = telemetry.runStage("current-repair-chain", state, stages.observeRepairChain, {
      mode: "direct-stage-observation",
    });
    if (clueFeasibility && clueFeasibility.mode() !== "off") {
      state = telemetry.runStage("clue-feasibility", state, stages.observeClueFeasibility, {
        mode: clueFeasibility.mode(),
        ownership: "incremental construction estimate and complete-state calibration",
      });
    }
    if (partialSearch && partialSearch.mode() !== "off") {
      state = telemetry.runStage("bounded-partial-search", state, stages.observeBoundedPartialSearch, {
        mode: partialSearch.mode(),
        ownership: "bounded placement alternatives plus complete-pipeline fallback comparison",
      });
    }
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
    const feasibilityMode = clueFeasibility?.mode?.() || "off";
    const partialSearchMode = partialSearch?.mode?.() || "off";
    return telemetryApi.attach(result, telemetry.summary({
      selectedSignature: stateApi.signature(selected),
      executionOwner: "direct-production-stage-runtime-v2",
      exactOutputParityExpected: !retrieval?.enabled?.()
        && ["off", "shadow"].includes(feasibilityMode)
        && ["off", "shadow"].includes(partialSearchMode),
      fullCorpusRetrieval: retrieval?.enabled?.()
        ? { enabled: true, mode: retrieval.retrievalMode() }
        : { enabled: false },
      clueFeasibility: feasibilityMode !== "off"
        ? { enabled: true, mode: feasibilityMode }
        : { enabled: false },
      boundedPartialSearch: partialSearchMode !== "off"
        ? { enabled: true, mode: partialSearchMode }
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
    explicitPipelineExecutionOwnerV1: () => "direct-production-stage-runtime-v2",
    __explicitPipelineV1Installed: true,
  });

  window.SCANWORD_WRAPPER_INSTALLATION_LOCK = explicitModeEnabled()
    ? "explicit-pipeline-v1"
    : window.SCANWORD_WRAPPER_INSTALLATION_LOCK || null;
})();
