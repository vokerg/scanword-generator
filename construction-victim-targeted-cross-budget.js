(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver?.generateTargetedVictimVariants
    || !solver?.generateRelaxedRollbackCrossVariants
    || solver.__constructionRelaxedCrossBudgetInstalled) return;

  const previousGenerateVariants = solver.generateTargetedVictimVariants.bind(solver);

  function stateSignature(state) {
    return (state.placed || [])
      .map((word) => `${word.direction}:${word.clueRow},${word.clueCol}:${word.answer}`)
      .sort()
      .join("|");
  }

  function actualPool(pool) {
    const byAnswer = new Map((pool || []).map((entry) => [entry.answer, entry]));
    for (const entry of window.SCANWORD_TARGETED_SHORT_FILL || []) {
      if (!byAnswer.has(entry.answer)) byAnswer.set(entry.answer, entry);
    }
    return byAnswer;
  }

  function weakCount(state, poolByAnswer) {
    return (state.placed || []).reduce((sum, word) => {
      const metadata = poolByAnswer.get(word.answer);
      return sum + Number(Boolean(word.weakFill || metadata?.weakFill));
    }, 0);
  }

  function restoreLexicalMetadata(state, poolByAnswer) {
    for (const word of state.placed || []) {
      const metadata = poolByAnswer.get(word.answer);
      if (!metadata) continue;
      word.weakFill = Boolean(metadata.weakFill);
      word.lexicalQuality = metadata.lexicalQuality;
      word.lexicalSource = metadata.lexicalSource;
    }
    return state;
  }

  function candidateDetail(state, candidateWeak) {
    const meta = state.targetedVictimMeta || {};
    return {
      victimAnswer: meta.victimAnswer || null,
      pairAnswers: meta.pairAnswers || [],
      horizontalPattern: meta.horizontalPattern || null,
      verticalPattern: meta.verticalPattern || null,
      panelsBefore: Number(meta.panelsBefore ?? 0),
      panelsAfter: Number(meta.panelsAfter ?? 0),
      panelGain: Number(meta.panelsBefore ?? 0) - Number(meta.panelsAfter ?? 0),
      weakFillAfter: candidateWeak,
    };
  }

  function telemetryTemplate() {
    return {
      mode: "rollback-aware-cross-pair-budget-v2",
      regionsConsidered: 0,
      victimsConsidered: 0,
      victimsRolledBack: 0,
      disconnectedRollbacks: 0,
      rollbackRejected: 0,
      rollbackInvalid: 0,
      horizontalSlots: 0,
      verticalSlots: 0,
      slotPairsBuilt: 0,
      entryPairsConsidered: 0,
      characterPairsMatched: 0,
      applyRejected: 0,
      validationRejected: 0,
      answerCountRejected: 0,
      weakBudgetRejected: 0,
      nonImprovingRejected: 0,
      statesAccepted: 0,
      statesAcceptedBeforeBudget: 0,
      weakBudgetFiltered: 0,
      baselineWeakFill: 0,
      weakFillLimit: 0,
      acceptedWeakFillCounts: [],
      rejectedWeakFillCounts: [],
      acceptedCandidates: [],
      rejectedCandidates: [],
      finalistsReserved: 0,
      patternLookups: 0,
      patternChecks: 0,
      emptyPatterns: [],
    };
  }

  solver.generateTargetedVictimVariants = (result, pool, suppliedOptions = {}) => {
    const previous = previousGenerateVariants(result, pool, {
      ...suppliedOptions,
      relaxedCrossRegions: 0,
    });
    const options = {
      relaxedCrossRegions: 4,
      relaxedCrossVictims: 6,
      relaxedCrossDomain: 16,
      relaxedCrossCandidateSlots: 12,
      relaxedCrossMaxLength: 9,
      relaxedCrossMaxNewPanels: 5,
      relaxedCrossMaxVariants: 8,
      relaxedCrossFinalists: 2,
      relaxedCrossWeakBudget: 2,
      ...suppliedOptions,
    };

    const poolByAnswer = actualPool(pool);
    const baselineWeak = weakCount(result, poolByAnswer);
    const weakLimit = Math.max(baselineWeak, Number(options.relaxedCrossWeakBudget || 0));
    const permissivePool = [...poolByAnswer.values()].map((entry) => ({ ...entry, weakFill: false }));
    const telemetry = telemetryTemplate();
    telemetry.baselineWeakFill = baselineWeak;
    telemetry.weakFillLimit = weakLimit;
    const generated = solver.generateRelaxedRollbackCrossVariants(result, permissivePool, options, telemetry)
      .map((state) => restoreLexicalMetadata(state, poolByAnswer));
    telemetry.statesAcceptedBeforeBudget = generated.length;

    const accepted = [];
    for (const state of generated) {
      const candidateWeak = weakCount(state, poolByAnswer);
      const detail = candidateDetail(state, candidateWeak);
      if (candidateWeak > weakLimit) {
        telemetry.weakBudgetFiltered += 1;
        telemetry.weakBudgetRejected += 1;
        telemetry.rejectedWeakFillCounts.push(candidateWeak);
        telemetry.rejectedCandidates.push(detail);
        continue;
      }
      telemetry.acceptedWeakFillCounts.push(candidateWeak);
      telemetry.acceptedCandidates.push(detail);
      state.targetedVictimMeta = {
        ...(state.targetedVictimMeta || {}),
        weakFillBefore: baselineWeak,
        weakFillAfter: candidateWeak,
        weakFillLimit: weakLimit,
      };
      accepted.push(state);
    }
    telemetry.acceptedWeakFillCounts.sort((a, b) => a - b);
    telemetry.rejectedWeakFillCounts.sort((a, b) => a - b);
    telemetry.acceptedCandidates.sort((a, b) => b.panelGain - a.panelGain || a.weakFillAfter - b.weakFillAfter);
    telemetry.rejectedCandidates.sort((a, b) => b.panelGain - a.panelGain || a.weakFillAfter - b.weakFillAfter);
    telemetry.statesAccepted = accepted.length;

    const merged = new Map();
    for (const state of previous.states || []) merged.set(stateSignature(state), state);
    const reserved = accepted.slice(0, options.relaxedCrossFinalists);
    telemetry.finalistsReserved = reserved.length;
    for (const state of reserved) {
      const signature = stateSignature(state);
      if (!merged.has(signature)) merged.set(signature, state);
    }

    return {
      states: [...merged.values()],
      telemetry: {
        ...(previous.telemetry || {}),
        relaxedRollbackCross: telemetry,
        statesAccepted: merged.size,
      },
    };
  };

  solver.__constructionRelaxedCrossBudgetInstalled = true;
})();
