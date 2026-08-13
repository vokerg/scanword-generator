"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function assert(condition, message) {
  if (!condition) throw new Error(`UI pending-settings guard test failed: ${message}`);
}

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scriptMatch = html.match(/<script id="generationSettingsGuard">([\s\S]*?)<\/script>/);
assert(scriptMatch, "generationSettingsGuard inline script is missing");

const controls = new Map([
  ["seed", { value: "seed-a", disabled: false }],
  ["cols", { value: "13", disabled: false }],
  ["rows", { value: "17", disabled: false }],
  ["poolSize", { value: "3500", disabled: false }],
  ["targetWords", { value: "30", disabled: false }],
]);

const previewAttributes = new Map([["aria-busy", "true"]]);
const observers = [];
const preview = {
  getAttribute(name) { return previewAttributes.get(name) ?? null; },
  setAttribute(name, value) {
    previewAttributes.set(name, String(value));
    for (const observer of observers) observer.callback();
  },
};

class FakeMutationObserver {
  constructor(callback) { this.callback = callback; }
  observe(target, options) {
    assert(target === preview, "guard observed the wrong target");
    assert(options?.attributes === true, "guard must observe attributes");
    assert(options?.attributeFilter?.includes("aria-busy"), "guard must observe aria-busy only");
    observers.push(this);
  }
}

const sandbox = {
  document: {
    querySelector(selector) {
      if (selector === "#preview") return preview;
      return controls.get(String(selector).replace(/^#/, "")) || null;
    },
  },
  MutationObserver: FakeMutationObserver,
};

vm.runInNewContext(scriptMatch[1], sandbox, { filename: "generationSettingsGuard.inline.js" });

function assertDisabled(expected, label) {
  for (const [id, control] of controls) {
    assert(control.disabled === expected, `${label}: #${id} disabled=${control.disabled}, expected ${expected}`);
  }
}

function snapshotValues() {
  return Object.fromEntries([...controls].map(([id, control]) => [id, control.value]));
}

function assertValues(expected, label) {
  for (const [id, value] of Object.entries(expected)) {
    assert(controls.get(id).value === value, `${label}: #${id}=${controls.get(id).value}, expected ${value}`);
  }
}

assertDisabled(true, "initial busy state");
const firstCaptured = snapshotValues();
controls.get("seed").value = "mutated-seed";
controls.get("poolSize").value = "9999";
preview.setAttribute("aria-busy", "false");
assertDisabled(false, "initial completion");
assertValues(firstCaptured, "initial completion restore");

controls.get("seed").value = "seed-b";
controls.get("cols").value = "19";
controls.get("poolSize").value = "10000";
const secondCaptured = snapshotValues();
preview.setAttribute("aria-busy", "true");
assertDisabled(true, "retry busy state");
controls.get("seed").value = "retry-mutation";
controls.get("cols").value = "11";
preview.setAttribute("aria-busy", "false");
assertDisabled(false, "retry completion");
assertValues(secondCaptured, "retry completion restore");

console.log(JSON.stringify({
  passed: true,
  busyControlsDisabled: true,
  pendingMutationRestored: true,
  retrySnapshotRefreshes: true,
  observedAttribute: "aria-busy",
}));
