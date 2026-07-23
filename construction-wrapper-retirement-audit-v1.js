(() => {
  "use strict";

  if (window.ScanwordWrapperRetirementAuditV1) return;

  const solver = window.ScanwordSolver;
  if (!solver) throw new Error("ScanwordSolver is unavailable for wrapper retirement audit");

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function snapshot() {
    const explicitMode = String(environmentOption("SCANWORD_EXPLICIT_PIPELINE", "off")).toLowerCase();
    const stageRuntime = String(environmentOption("SCANWORD_PIPELINE_STAGE_RUNTIME", "legacy")).toLowerCase();
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
    const passed = rollbackMode
      ? Object.values(operationalChecks).every(Boolean)
      : Object.values({ ...defaultChecks, ...operationalChecks }).every(Boolean);
    return {
      schemaVersion: 1,
      mode: rollbackMode ? "legacy-wrapper-chain-rollback-v1" : "explicit-default-rollback-only-legacy-v1",
      explicitMode,
      stageRuntime,
      installationLock,
      executionOwner,
      activeGenerateBestOwner: operationalChecks.activeGenerateBestOwnerExplicit ? "construction-pipeline-v1" : "unknown",
      rollbackOwner: operationalChecks.rollbackChainRetained ? "legacy-wrapper-chain" : null,
      rollbackMode,
      checks: { ...defaultChecks, ...operationalChecks },
      passed,
    };
  }

  const report = snapshot();
  if (!report.passed) {
    throw new Error(`Explicit wrapper-retirement audit failed: ${JSON.stringify(report)}`);
  }

  window.ScanwordWrapperRetirementAuditV1 = {
    version: 1,
    snapshot,
    report,
  };
})();
