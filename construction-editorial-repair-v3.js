(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const policy = window.ScanwordEditorialLexicalPolicyV3;
  if (!solver || !policy || solver.__editorialRepairV3Installed) return;

  const previousGenerateBest = solver.generateBest.bind(solver);

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_EDITORIAL_REPAIR) {
      return process.env.SCANWORD_EDITORIAL_REPAIR;
    }
    return window.SCANWORD_EDITORIAL_REPAIR || "off";
  }

  function applyEditorialRepair(result) {
    if (!result?.grid || !Array.isArray(result.placed)) return result;
    const before = policy.summarize(result.placed);
    const stages = [];

    if (typeof solver.applyEditorialReplacementsV3 === "function") {
      result = solver.applyEditorialReplacementsV3(result);
      stages.push({
        name: "single-pattern-replacement",
        accepted: Number(result.constructionV2?.editorialReplacement?.accepted || 0),
      });
    }
    if (typeof solver.applyEditorialPairRefitsV3 === "function") {
      result = solver.applyEditorialPairRefitsV3(result);
      stages.push({
        name: "crossing-pair-refit",
        accepted: Number(result.constructionV2?.editorialPairRefit?.accepted || 0),
      });
    }
    if (typeof solver.applyEditorialBundleRefitsV3 === "function") {
      result = solver.applyEditorialBundleRefitsV3(result);
      stages.push({
        name: "radius-two-component-csp",
        accepted: Number(result.constructionV2?.editorialBundleRefit?.accepted || 0),
      });
    }

    const metrics = solver.resultMetrics(result);
    const after = policy.summarize(result.placed);
    result.validation = metrics.validation;
    result.intersections = metrics.intersections;
    result.doubles = metrics.doubles;
    result.components = metrics.components;
    result.score = metrics.score;
    result.constructionV2 = {
      ...(result.constructionV2 || {}),
      editorialRepair: {
        mode: "same-geometry-editorial-repair-pipeline-v3",
        stages,
        accepted: stages.reduce((sum, stage) => sum + stage.accepted, 0),
        before,
        after,
        formulaicGain: before.formulaicShortCount - after.formulaicShortCount,
        editorialPenaltyGain: before.editorialPenalty - after.editorialPenalty,
        panelsBefore: result.panelCells,
        panelsAfter: result.panelCells,
        answersBefore: result.placed.length,
        answersAfter: result.placed.length,
        validation: metrics.validation,
      },
    };
    return result;
  }

  solver.generateBest = (...args) => {
    const result = previousGenerateBest(...args);
    if (modeFromEnvironment() !== "on") return result;
    return applyEditorialRepair(result);
  };

  Object.assign(solver, {
    applyEditorialRepairV3: applyEditorialRepair,
    __editorialRepairV3Installed: true,
  });
})();
