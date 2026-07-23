"use strict";

if (!global.window?.ScanwordSolver?.partialSearchAdaptiveBeamLimitsV1) {
  throw new Error("Run with tools/node-benchmark-bootstrap-v1.cjs preloaded through NODE_OPTIONS");
}

const plan = window.ScanwordSolver.partialSearchAdaptiveBeamLimitsV1;
const candidate = (activeLimit, panels, answers, crossings, editorialPenalty) => ({
  summary: {
    activeLimit,
    searchVariant: "baseline",
    panels,
    answers,
    crossings,
    rawLetterPercent: 50,
    formulaicShortCount: 0,
    editorialPenalty,
    score: 0,
    validationValid: true,
    components: 1,
  },
});

const strong = plan([
  candidate(2500, 4, 47, 50, 400),
  candidate(3500, 7, 48, 51, 300),
]);
if (strong.length !== 0) throw new Error(`Expected no probe for sub-five-panel baseline: ${JSON.stringify(strong)}`);

const selectedOnly = plan([
  candidate(2500, 6, 50, 52, 420),
  candidate(3500, 7, 48, 50, 360),
]);
if (JSON.stringify(selectedOnly) !== JSON.stringify([2500])) {
  throw new Error(`Expected strongest-limit-only probe: ${JSON.stringify(selectedOnly)}`);
}

const tailRescue = plan([
  candidate(2500, 5, 50, 52, 420),
  candidate(3500, 8, 45, 48, 380),
]);
if (JSON.stringify(tailRescue) !== JSON.stringify([2500, 3500])) {
  throw new Error(`Expected three-panel tail rescue: ${JSON.stringify(tailRescue)}`);
}

const editorialRescue = plan([
  candidate(2500, 7, 49, 52, 460),
  candidate(3500, 7, 45, 48, 348),
]);
if (JSON.stringify(editorialRescue) !== JSON.stringify([2500, 3500])) {
  throw new Error(`Expected equal-panel editorial rescue: ${JSON.stringify(editorialRescue)}`);
}

console.log(JSON.stringify({ passed: true, strong, selectedOnly, tailRescue, editorialRescue }));
