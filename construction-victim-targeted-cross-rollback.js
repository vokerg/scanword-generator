(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  const closedFill = window.ScanwordClosedFill;
  if (!solver?.generateTargetedVictimVariants
    || !solver?.generateDirectCrossVariants
    || !solver?.stripClueLayoutForTargetedVictim
    || !solver?.rollbackInlineWord
    || !solver?.resultMetrics
    || !closedFill?.extractResidualRegions
    || !closedFill?.measureCoverage
    || solver.__constructionTargetedCrossRollbackInstalled) return;

  const previousGenerateVariants = solver.generateTargetedVictimVariants.bind(solver);

  function signature(state) {
    return (state.placed || [])
      .map((word) => `${word.direction}:${word.clueRow},${word.clueCol}:${word.answer}`)
      .sort()
      .join("|");
  }

  function directTelemetry() {
    return {
      mode: "isolated-direct-cross-v2",
      regionsConsidered: 0,
      junctionRegions: 0,
      horizontalUnavailable: 0,
      verticalUnavailable: 0,
      horizontalSlots: 0,
      verticalSlots: 0,
      slotPairsBuilt: 0,
      entryPairsConsidered: 0,
      characterPairsMatched: 0,
      applyRejected: 0,
      validationRejected: 0,
      weakBudgetRejected: 0,
      statesAccepted: 0,
      finalistsReserved: 0,
      patternLookups: 0,
      patternChecks: 0,
      emptyPatterns: [],
    };
  }

  function addCounters(target, source) {
    for (const [key, value] of Object.entries(source || {})) {
      if (typeof value === "number") target[key] = Number(target[key] || 0) + value;
    }
    target.emptyPatterns.push(...(source?.emptyPatterns || []));
  }

  solver.generateTargetedVictimVariants = (result, pool, suppliedOptions = {}) => {
    const previous = previousGenerateVariants(result, pool, suppliedOptions);
    const options = {
      crossRollbackRegions: 3,
      crossRollbackVictims: 5,
      crossRollbackFinalists: 2,
      directCrossRegions: 12,
      directCrossDomain: 10,
      directCrossCandidateSlots: 8,
      directCrossMaxLength: 8,
      directCrossMaxNewPanels: 3,
      directCrossMaxVariants: 6,
      ...suppliedOptions,
    };
    const telemetry = {
      mode: "rollback-assisted-direct-cross-v1",
      regionsConsidered: 0,
      victimsConsidered: 0,
      victimsRolledBack: 0,
      disconnectedRollbacks: 0,
      rollbackRejected: 0,
      rollbackInvalid: 0,
      directSearches: 0,
      candidateStates: 0,
      validationRejected: 0,
      answerCountRejected: 0,
      nonImprovingRejected: 0,
      statesAccepted: 0,
      finalistsReserved: 0,
      direct: directTelemetry(),
    };

    const structural = solver.stripClueLayoutForTargetedVictim(result);
    const baselineAnswers = structural.placed.length;
    const baselinePanels = closedFill.measureCoverage(structural.grid).panelCells;
    const regions = closedFill.extractResidualRegions(structural)
      .filter((region) => region.boundaryWords?.length)
      .sort((a, b) => b.size - a.size || b.boundaryWords.length - a.boundaryWords.length || a.id - b.id)
      .slice(0, options.crossRollbackRegions);
    telemetry.regionsConsidered = regions.length;

    const victims = [];
    const seenVictims = new Set();
    for (const region of regions) {
      for (const victimId of region.boundaryWords || []) {
        if (seenVictims.has(victimId)) continue;
        seenVictims.add(victimId);
        victims.push(victimId);
        if (victims.length >= options.crossRollbackVictims) break;
      }
      if (victims.length >= options.crossRollbackVictims) break;
    }
    telemetry.victimsConsidered = victims.length;

    const collected = new Map();
    for (const victimId of victims) {
      const victim = structural.placed.find((word) => word.id === victimId);
      const rolled = solver.rollbackInlineWord(structural, victimId);
      if (!victim || !rolled) {
        telemetry.rollbackRejected += 1;
        continue;
      }
      rolled.usedAnswers = new Set(rolled.placed.map((word) => word.answer));
      rolled.clueFootprints = [];
      const rolledMetrics = solver.resultMetrics(rolled);
      if (!rolledMetrics.validation.valid) {
        telemetry.rollbackInvalid += 1;
        continue;
      }
      telemetry.victimsRolledBack += 1;
      if (rolledMetrics.components !== 1) telemetry.disconnectedRollbacks += 1;

      const inner = directTelemetry();
      telemetry.directSearches += 1;
      const states = solver.generateDirectCrossVariants(rolled, pool, options, inner) || [];
      addCounters(telemetry.direct, inner);
      telemetry.candidateStates += states.length;
      for (const state of states) {
        const metrics = solver.resultMetrics(state);
        if (!metrics.validation.valid || metrics.components !== 1 || state.placed.some((word) => !word.hasExactClue)) {
          telemetry.validationRejected += 1;
          continue;
        }
        if (state.placed.length < baselineAnswers) {
          telemetry.answerCountRejected += 1;
          continue;
        }
        const panels = closedFill.measureCoverage(state.grid).panelCells;
        if (panels >= baselinePanels) {
          telemetry.nonImprovingRejected += 1;
          continue;
        }
        state.targetedVictimMeta = {
          ...(state.targetedVictimMeta || {}),
          rollbackAssistedCross: true,
          victimSlotId: victim.id,
          victimAnswer: victim.answer,
          panelsBefore: baselinePanels,
          panelsAfter: panels,
        };
        const key = signature(state);
        if (!collected.has(key)) collected.set(key, state);
      }
    }

    const rollbackStates = [...collected.values()]
      .sort((a, b) => closedFill.measureCoverage(a.grid).panelCells - closedFill.measureCoverage(b.grid).panelCells
        || b.placed.length - a.placed.length
        || signature(a).localeCompare(signature(b)))
      .slice(0, options.crossRollbackFinalists);
    telemetry.statesAccepted = rollbackStates.length;
    telemetry.direct.emptyPatterns = [...new Set(telemetry.direct.emptyPatterns)].sort();

    const merged = new Map();
    for (const state of previous.states || []) merged.set(signature(state), state);
    for (const state of rollbackStates) if (!merged.has(signature(state))) merged.set(signature(state), state);
    telemetry.finalistsReserved = [...merged.values()].length - (previous.states || []).length;
    return {
      states: [...merged.values()],
      telemetry: {
        ...(previous.telemetry || {}),
        rollbackAssistedCross: telemetry,
        statesAccepted: merged.size,
      },
    };
  };

  solver.__constructionTargetedCrossRollbackInstalled = true;
})();