(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || solver.__boundedPartialSearchFallbackV1Installed) return;

  const previousBuildAttempt = solver.buildAttempt.bind(solver);

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function mode() {
    return String(environmentOption("SCANWORD_PARTIAL_SEARCH", "off")).toLowerCase();
  }

  function withMode(value, callback) {
    if (typeof process !== "undefined") {
      const previous = process.env.SCANWORD_PARTIAL_SEARCH;
      process.env.SCANWORD_PARTIAL_SEARCH = value;
      try {
        return callback();
      } finally {
        if (previous == null) delete process.env.SCANWORD_PARTIAL_SEARCH;
        else process.env.SCANWORD_PARTIAL_SEARCH = previous;
      }
    }
    const previous = window.SCANWORD_PARTIAL_SEARCH;
    window.SCANWORD_PARTIAL_SEARCH = value;
    try {
      return callback();
    } finally {
      window.SCANWORD_PARTIAL_SEARCH = previous;
    }
  }

  function replayRandom(values) {
    let cursor = 0;
    return () => {
      if (cursor >= values.length) {
        throw new Error(`Phase 6 baseline replay exhausted after ${values.length} random values`);
      }
      return values[cursor++];
    };
  }

  function attachWordProvenance(state) {
    const provenance = {
      schemaVersion: 1,
      search: "late-placement-beam-v1",
      selectedVariant: "beam",
      sampled: Boolean(state.partialSearch?.sampled),
      baselineRank: state.partialSearch?.baselineRank || null,
      beamRank: state.partialSearch?.beamRank || null,
      ancestry: [...(state.partialSearch?.ancestry || [])],
    };
    for (const word of state.placed || []) word.phase6Search = provenance;
    return provenance;
  }

  solver.buildAttempt = (pool, rows, cols, targetWords, random, poolIndex, requestedMode) => {
    if (mode() !== "beam") {
      return previousBuildAttempt(pool, rows, cols, targetWords, random, poolIndex, requestedMode);
    }

    const values = [];
    const state = previousBuildAttempt(
      pool,
      rows,
      cols,
      targetWords,
      () => {
        const value = random();
        values.push(value);
        return value;
      },
      poolIndex,
      requestedMode,
    );

    if (state?.partialSearch?.selectedVariant !== "beam") return state;
    attachWordProvenance(state);

    const baseline = withMode("off", () => previousBuildAttempt(
      pool,
      rows,
      cols,
      targetWords,
      replayRandom(values),
      poolIndex,
      requestedMode,
    ));
    baseline.partialSearch = {
      schemaVersion: 1,
      search: "late-placement-beam-v1",
      mode: "beam",
      sampled: true,
      selectedVariant: "baseline-fallback",
      comparedBeam: state.partialSearch?.beamRank || null,
      baselineRank: state.partialSearch?.baselineRank || null,
      ancestry: [],
    };
    baseline.grid.__scanwordPartialSearch = baseline.partialSearch;
    Object.defineProperty(state, "__phase6BaselineState", {
      value: baseline,
      enumerable: false,
      configurable: true,
    });
    return state;
  };

  Object.assign(solver, {
    __boundedPartialSearchFallbackV1Installed: true,
  });

  window.ScanwordBoundedPartialSearchFallbackV1 = {
    version: 1,
    strategy: "exact-random-replay",
  };
})();
