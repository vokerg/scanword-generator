"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ui = fs.readFileSync(path.join(root, "ui.js"), "utf8");

function fail(message) {
  throw new Error(`UI accessibility contract failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

for (const expected of [
  'els.generationStatus.setAttribute("role", "status")',
  'els.generationStatus.setAttribute("aria-live", "polite")',
  'els.generationStatus.setAttribute("aria-atomic", "true")',
]) {
  assert(ui.includes(expected), `missing generation status accessibility contract: ${expected}`);
}

assert(
  /els\.preview\.innerHTML = `<div class="generation-error" role="alert"><strong>Generation failed\.<\/strong><br>\$\{escapeXml\(error\.message\)\}<\/div>`;/.test(ui),
  "generation failure boundary must expose role=alert",
);

assert(
  /els\.generationStatus\.textContent = "generating…";[\s\S]*?els\.generationStatus\.textContent = `selected attempt/.test(ui),
  "generation status must continue to publish pending and success text through the live region",
);
assert(
  ui.includes('els.generationStatus.textContent = "no valid grid";'),
  "generation failure status text is missing",
);
assert(
  /function setGenerationBusy\(busy\) \{[\s\S]*?els\.preview\.setAttribute\("aria-busy", busy \? "true" : "false"\);/.test(ui),
  "preview busy state must remain exposed with aria-busy",
);

console.log(JSON.stringify({
  passed: true,
  generationStatusRole: "status",
  generationStatusLive: "polite",
  generationStatusAtomic: true,
  failureRole: "alert",
  previewBusyState: true,
}));
