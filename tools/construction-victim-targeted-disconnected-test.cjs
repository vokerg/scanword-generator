"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;

const base = { placed: [{ id: 1 }, { id: 2 }] };
const rolled = { placed: [{ id: 2 }] };
const repaired = { placed: [{ id: 2 }, { id: 3 }, { id: 4 }] };

window.ScanwordSolver = {
  stripClueLayoutForTargetedVictim: () => base,
  resultMetrics(state) {
    if (state === rolled) return { validation: { valid: true }, components: 2 };
    return { validation: { valid: true }, components: 1 };
  },
  generateTargetedVictimVariants() {
    const rolledMetrics = window.ScanwordSolver.resultMetrics(rolled);
    if (rolledMetrics.components !== 1) return { states: [], telemetry: {} };
    const repairedMetrics = window.ScanwordSolver.resultMetrics(repaired);
    return {
      states: repairedMetrics.components === 1 ? [repaired] : [],
      telemetry: { atomicPair: {} },
    };
  },
};

require(path.resolve(__dirname, "..", "construction-victim-targeted-disconnected.js"));
const searched = window.ScanwordSolver.generateTargetedVictimVariants(base, []);
assert.equal(searched.states.length, 1);
assert.equal(searched.telemetry.disconnectedRollbackRelaxed, 1);
assert.equal(searched.telemetry.atomicPair.disconnectedRollbackRelaxed, 1);
assert.equal(window.ScanwordSolver.resultMetrics(rolled).components, 2, "real component count must be restored after search");
console.log(JSON.stringify({
  temporaryDisconnectAllowed: true,
  finalConnectivityRequired: true,
  relaxedRollbacks: searched.telemetry.disconnectedRollbackRelaxed,
}));
