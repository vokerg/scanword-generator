(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const supplemental = window.SCANWORD_TARGETED_SHORT_FILL || [];
  if (!solver?.generateTargetedVictimVariants || !supplemental.length || solver.__constructionTargetedDemandInstalled) return;

  const previousGenerateVariants = solver.generateTargetedVictimVariants.bind(solver);
  const supplementalByAnswer = new Map(supplemental.map((entry) => [entry.answer, entry]));

  function weakCount(result, poolByAnswer) {
    return (result.placed || []).reduce((sum, word) => {
      const metadata = poolByAnswer.get(word.answer);
      return sum + Number(Boolean(word.weakFill || metadata?.weakFill));
    }, 0);
  }

  function cloneEntryForSearch(entry) {
    return {
      ...entry,
      // The core targeted search currently excludes weak entries before its
      // bundle-level weak-count guard. Expose these entries to pattern search,
      // then restore their weak status and enforce the invariant below.
      weakFill: false,
      lexicalQuality: Math.min(24, Number(entry.lexicalQuality || 24)),
      lexicalSource: `${entry.lexicalSource || "targeted-short-fill"}:search-view`,
    };
  }

  function augmentPool(pool) {
    const byAnswer = new Map((pool || []).map((entry) => [entry.answer, entry]));
    for (const entry of supplemental) {
      if (!byAnswer.has(entry.answer)) byAnswer.set(entry.answer, cloneEntryForSearch(entry));
    }
    return [...byAnswer.values()];
  }

  function restoreWeakMetadata(state) {
    let supplementalWords = 0;
    state.placed = (state.placed || []).map((word) => {
      const metadata = supplementalByAnswer.get(word.answer);
      if (!metadata) return word;
      supplementalWords += 1;
      return {
        ...word,
        weakFill: true,
        lexicalQuality: metadata.lexicalQuality,
        lexicalSource: metadata.lexicalSource,
      };
    });
    return supplementalWords;
  }

  solver.generateTargetedVictimVariants = (result, pool, options = {}) => {
    const originalPoolByAnswer = new Map((pool || []).map((entry) => [entry.answer, entry]));
    const baselineWeak = weakCount(result, originalPoolByAnswer);
    const augmented = augmentPool(pool);
    const searched = previousGenerateVariants(result, augmented, options);
    let supplementalStates = 0;
    let weakBudgetRejected = 0;
    const states = [];

    for (const state of searched.states || []) {
      const supplementalWords = restoreWeakMetadata(state);
      if (supplementalWords) supplementalStates += 1;
      const augmentedByAnswer = new Map(augmented.map((entry) => [entry.answer, entry]));
      for (const entry of supplemental) augmentedByAnswer.set(entry.answer, entry);
      const candidateWeak = weakCount(state, augmentedByAnswer);
      if (candidateWeak > baselineWeak) {
        weakBudgetRejected += 1;
        continue;
      }
      state.targetedVictimMeta = {
        ...(state.targetedVictimMeta || {}),
        supplementalShortFill: (state.placed || [])
          .filter((word) => supplementalByAnswer.has(word.answer))
          .map((word) => word.answer)
          .sort(),
        baselineWeakFill: baselineWeak,
        candidateWeakFill: candidateWeak,
      };
      states.push(state);
    }

    return {
      states,
      telemetry: {
        ...(searched.telemetry || {}),
        supplementalShortFillEntries: supplemental.length,
        supplementalShortFillStates: supplementalStates,
        weakFillBudget: baselineWeak,
        weakFillBudgetRejected: weakBudgetRejected,
        statesAcceptedBeforeWeakBudget: (searched.states || []).length,
        statesAccepted: states.length,
      },
    };
  };

  solver.__constructionTargetedDemandInstalled = true;
})();
