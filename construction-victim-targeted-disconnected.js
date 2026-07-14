(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver?.generateTargetedVictimVariants
    || !solver?.stripClueLayoutForTargetedVictim
    || !solver?.resultMetrics
    || solver.__constructionTargetedDisconnectedInstalled) return;

  const previousGenerateVariants = solver.generateTargetedVictimVariants.bind(solver);

  solver.generateTargetedVictimVariants = (result, pool, options = {}) => {
    const structural = solver.stripClueLayoutForTargetedVictim(result);
    const rollbackAnswerCount = Math.max(0, structural.placed.length - 1);
    const originalResultMetrics = solver.resultMetrics;
    let disconnectedRollbackRelaxed = 0;

    solver.resultMetrics = (state) => {
      const metrics = originalResultMetrics(state);
      if (state?.placed?.length === rollbackAnswerCount
        && metrics?.validation?.valid
        && Number(metrics.components || 0) > 1) {
        disconnectedRollbackRelaxed += 1;
        return {
          ...metrics,
          components: 1,
          targetedTemporaryComponents: metrics.components,
        };
      }
      return metrics;
    };

    try {
      const searched = previousGenerateVariants(result, pool, options);
      searched.telemetry = {
        ...(searched.telemetry || {}),
        disconnectedRollbackRelaxed,
      };
      if (searched.telemetry.atomicPair) {
        searched.telemetry.atomicPair = {
          ...searched.telemetry.atomicPair,
          disconnectedRollbackRelaxed,
        };
      }
      return searched;
    } finally {
      solver.resultMetrics = originalResultMetrics;
    }
  };

  solver.__constructionTargetedDisconnectedInstalled = true;
})();
