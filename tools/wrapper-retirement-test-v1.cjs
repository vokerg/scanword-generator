"use strict";

if (!global.window?.ScanwordWrapperRetirementAuditV1) {
  throw new Error("Run with tools/node-benchmark-bootstrap-v1.cjs preloaded through NODE_OPTIONS");
}

const report = global.window.ScanwordWrapperRetirementAuditV1.snapshot();
if (!report.passed) throw new Error(`Wrapper retirement audit failed: ${JSON.stringify(report)}`);
if (report.activeGenerateBestOwner !== "construction-pipeline-v1") {
  throw new Error(`Unexpected active generator owner: ${report.activeGenerateBestOwner}`);
}
if (report.executionOwner !== "direct-production-stage-runtime-v2") {
  throw new Error(`Unexpected execution owner: ${report.executionOwner}`);
}
if (report.rollbackOwner !== "legacy-wrapper-chain") {
  throw new Error(`Rollback chain missing: ${JSON.stringify(report)}`);
}
if (typeof global.ScanwordSolver.generateBest !== "function") throw new Error("Production generateBest is unavailable");
if (typeof global.ScanwordSolver.legacyGenerateBestV1 !== "function") throw new Error("Legacy rollback generator is unavailable");
if (global.ScanwordSolver.vocabularyPortfolioStageRuntimeModeV1() !== "explicit") {
  throw new Error("Vocabulary portfolio did not select the explicit stage runtime");
}

console.log(JSON.stringify({ passed: true, report }));
