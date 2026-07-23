(() => {
  "use strict";

  if (window.ScanwordWrapperRetirementAuditV1) return;

  const solver = window.ScanwordSolver;
  if (!solver) throw new Error("ScanwordSolver is unavailable for wrapper retirement audit");

  function rawOption(name) {
    return typeof process !== "undefined" ? process?.env?.[name] : window[name];
  }

  function setOption(name, value) {
    if (typeof process !== "undefined") process.env[name] = String(value);
    else window[name] = value;
  }

  if (rawOption("SCANWORD_EXPLICIT_PIPELINE") == null || rawOption("SCANWORD_EXPLICIT_PIPELINE") === "") {
    setOption("SCANWORD_EXPLICIT_PIPELINE", "on");
  }
  if (rawOption("SCANWORD_PIPELINE_STAGE_RUNTIME") == null || rawOption("SCANWORD_PIPELINE_STAGE_RUNTIME") === "") {
    setOption("SCANWORD_PIPELINE_STAGE_RUNTIME", "explicit");
  }

  function environmentOption(name, fallback) {
    const raw = rawOption(name);
    return raw == null || raw === "" ? fallback : raw;
  }

  function snapshot() {
    const explicitMode = String(environmentOption("SCANWORD_EXPLICIT_PIPELINE", "on")).toLowerCase();
    const stageRuntime = String(environmentOption("SCANWORD_PIPELINE_STAGE_RUNTIME", "explicit")).toLowerCase();
    if (!window.SCANWORD_WRAPPER_INSTALLATION_LOCK) {
      window.SCANWORD_WRAPPER_INSTALLATION_LOCK = "explicit-pipeline-v1";
    }
    const installationLock = window.SCANWORD_WRAPPER_INSTALLATION_LOCK || null;
    const executionOwner = solver.explicitPipelineExecutionOwnerV1?.() || null;
    const operationalChecks = {
      explicitPipelineInstalled: Boolean(solver.__explicitPipelineV1Installed),
      directStageRuntimeInstalled: Boolean(solver.__constructionStageRuntimeV2Installed),
      sourceAnchorInstalled: Boolean(solver.__constructionStageSourceAnchorV2Installed),
      executionOwnerDirect: executionOwner === "direct-production-stage-runtime-v2",
      activeGenerateBestOwnerExplicit: Boolean(solver.__explicitPipelineV1Installed),
      rollbackChainRetained: typeof solver.legacyGenerateBestV1 === "function",
      installationLockExplicit: installationLock === "explicit-pipeline-v1",
    };
    const defaultChecks = {
      explicitDefault: explicitMode === "on",
      directStageRuntimeDefault: stageRuntime === "explicit",
    };
    const rollbackMode = explicitMode === "off";
    const rollbackChecks = {
      explicitPipelineInstalled: operationalChecks.explicitPipelineInstalled,
      directStageRuntimeInstalled: operationalChecks.directStageRuntimeInstalled,
      sourceAnchorInstalled: operationalChecks.sourceAnchorInstalled,
      executionOwnerDirect: operationalChecks.executionOwnerDirect,
      activeGenerateBestOwnerExplicit: operationalChecks.activeGenerateBestOwnerExplicit,
      rollbackChainRetained: operationalChecks.rollbackChainRetained,
      installationLockExplicit: operationalChecks.installationLockExplicit,
    };
    const passed = rollbackMode
      ? Object.values(rollbackChecks).every(Boolean)
      : Object.values({ ...defaultChecks, ...operationalChecks }).every(Boolean);
    return {
      schemaVersion: 4,
      mode: rollbackMode ? "legacy-wrapper-chain-rollback-v1" : "explicit-default-rollback-only-legacy-v1",
      explicitMode,
      stageRuntime,
      installationLock,
      executionOwner,
      activeGenerateBestOwner: operationalChecks.activeGenerateBestOwnerExplicit ? "construction-pipeline-v1" : "unknown",
      rollbackOwner: operationalChecks.rollbackChainRetained ? "legacy-wrapper-chain" : null,
      rollbackMode,
      checks: rollbackMode ? { ...defaultChecks, ...rollbackChecks } : { ...defaultChecks, ...operationalChecks },
      passed,
    };
  }

  const report = snapshot();
  if (!report.passed) {
    throw new Error(`Explicit wrapper-retirement audit failed: ${JSON.stringify(report)}`);
  }

  window.ScanwordWrapperRetirementAuditV1 = {
    version: 4,
    snapshot,
    report,
  };
})();
