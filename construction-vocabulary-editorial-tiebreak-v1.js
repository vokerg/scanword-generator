(() => {
  "use strict";
  const solver = window.ScanwordSolver;
  if (!solver || solver.__vocabularyEditorialTieBreakV1Installed) return;
  const previousGenerateBest = solver.generateBest.bind(solver);
  function enabled() {
    const value = typeof process !== "undefined"
      ? process?.env?.SCANWORD_VOCABULARY_EDITORIAL_TIEBREAK
      : window.SCANWORD_VOCABULARY_EDITORIAL_TIEBREAK;
    return String(value || "off").toLowerCase() === "on";
  }
  solver.generateBest = (...args) => previousGenerateBest(...args);
  solver.vocabularyEditorialTieBreakEnabledV1 = enabled;
  solver.__vocabularyEditorialTieBreakV1Installed = true;
})();
