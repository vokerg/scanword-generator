(() => {
  "use strict";

  if (window.ScanwordConstructionPipelineStagesV1) return;

  const stateApi = window.ScanwordCandidateStateV1;
  if (!stateApi) throw new Error("CandidateState v1 must load before pipeline stages");

  function createLegacySource(legacyGenerateBest) {
    if (typeof legacyGenerateBest !== "function") throw new TypeError("legacyGenerateBest must be a function");
    return function legacySource(context) {
      const result = legacyGenerateBest(...context.arguments);
      return stateApi.create(result, {
        sourceStage: "legacy-production-generator",
        seed: context.arguments[0],
        arguments: context.arguments,
      });
    };
  }

  function observeBaseConstruction(state) {
    stateApi.assert(state);
    if (!state.grid.length || !state.answers.length) {
      throw new Error("Legacy base construction produced an empty candidate");
    }
    return stateApi.transition(state, "base-construction-observed", {
      structuralMetrics: {
        ...state.structuralMetrics,
        baseConstructionObserved: true,
      },
    });
  }

  function observeClueAllocation(state) {
    stateApi.assert(state);
    const exactCluesOnly = state.answers.every((answer) => answer.hasExactClue);
    const clueCount = state.clueAnchors.reduce((sum, anchor) => sum + anchor.clues.length, 0);
    if (clueCount !== state.answers.length) {
      throw new Error(`Clue allocation mismatch: ${clueCount} clues for ${state.answers.length} answers`);
    }
    return stateApi.transition(state, "clue-allocation-observed", {
      clueMetrics: {
        ...state.clueMetrics,
        allocatedClues: clueCount,
        exactCluesOnly,
      },
    });
  }

  function observeRepairChain(state) {
    stateApi.assert(state);
    const construction = state.result.constructionV2 || {};
    return stateApi.transition(state, "repair-chain-observed", {
      provenance: {
        ...state.provenance,
        repairChain: {
          closedFill: state.result.closedFill?.mode || null,
          editorialRepair: construction.editorialRepair?.mode || null,
          vocabularyPortfolio: construction.vocabularyPortfolio?.mode || null,
        },
      },
    });
  }

  function validate(state) {
    stateApi.assert(state);
    const solver = window.ScanwordSolver;
    if (typeof solver?.resultMetrics !== "function") throw new Error("Solver resultMetrics is unavailable");
    const metrics = solver.resultMetrics(state.result);
    const expected = state.structuralMetrics;
    const actual = {
      valid: Boolean(metrics.validation?.valid),
      components: Number(metrics.components || 0),
      panels: Number(metrics.panelCells || 0),
      answers: state.answers.length,
      crossings: Number(metrics.intersections || 0),
    };
    const mismatches = [];
    for (const key of ["valid", "components", "panels", "answers", "crossings"]) {
      if (actual[key] !== expected[key]) mismatches.push({ key, expected: expected[key], actual: actual[key] });
    }
    if (mismatches.length) {
      throw new Error(`Explicit validation disagrees with legacy result: ${JSON.stringify(mismatches)}`);
    }
    return stateApi.transition(state, "validation-complete", {
      structuralMetrics: {
        ...state.structuralMetrics,
        validationAudit: actual,
      },
    });
  }

  function compare(states) {
    const candidates = Array.isArray(states) ? [...states] : [states];
    candidates.forEach(stateApi.assert);
    if (candidates.length <= 1) return candidates;
    return candidates.sort((first, second) => {
      const a = first.structuralMetrics;
      const b = second.structuralMetrics;
      return Number(b.valid) - Number(a.valid)
        || Number(a.components !== 1) - Number(b.components !== 1)
        || a.panels - b.panels
        || b.answers - a.answers
        || b.crossings - a.crossings
        || b.rawLetterCoverage - a.rawLetterCoverage
        || stateApi.signature(first).localeCompare(stateApi.signature(second));
    });
  }

  window.ScanwordConstructionPipelineStagesV1 = {
    createLegacySource,
    observeBaseConstruction,
    observeClueAllocation,
    observeRepairChain,
    validate,
    compare,
  };
})();
