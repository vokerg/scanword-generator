(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || solver.__constructionStageSourceAnchorV2Installed) return;

  solver.generateLegacySingleCandidateV2 = solver.generateBest.bind(solver);
  solver.__constructionStageSourceAnchorV2Installed = true;

  window.ScanwordConstructionStageSourceAnchorV2 = {
    version: 2,
    source: "construction-v2-pre-wrapper",
  };
})();
