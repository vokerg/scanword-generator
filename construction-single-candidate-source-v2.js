(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || solver.__singleCandidateSourceV2Installed) return;

  const legacyWrapperSource = solver.generateBest.bind(solver);

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function sourceMode() {
    return String(environmentOption("SCANWORD_SINGLE_CANDIDATE_SOURCE", "legacy-wrappers")).toLowerCase();
  }

  function generateSingleCandidate(...args) {
    if (sourceMode() === "explicit-stages") {
      if (typeof solver.generateExplicitSingleCandidateV2 !== "function") {
        throw new Error("Explicit single-candidate stage runtime is unavailable");
      }
      return solver.generateExplicitSingleCandidateV2(...args);
    }
    return legacyWrapperSource(...args);
  }

  solver.generateBest = generateSingleCandidate;
  Object.assign(solver, {
    legacyWrapperSingleCandidateV2: legacyWrapperSource,
    generateSelectedSingleCandidateV2: generateSingleCandidate,
    singleCandidateSourceModeV2: sourceMode,
    __singleCandidateSourceV2Installed: true,
  });

  window.ScanwordSingleCandidateSourceV2 = {
    version: 2,
    sourceMode,
  };
})();
