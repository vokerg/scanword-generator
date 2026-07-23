(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || solver.__constructionStageSourceAnchorV2Installed) return;

  const source = solver.generateBest.bind(solver);
  Object.assign(solver, {
    generateLegacySingleCandidateV2: source,
    __constructionStageSourceAnchorV2Installed: true,
  });

  window.ScanwordConstructionStageSourceAnchorV2 = {
    version: 2,
    source: "pre-portfolio-single-candidate-generator",
  };
})();
