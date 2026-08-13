"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function assert(condition, message) {
  if (!condition) throw new Error(`UI error-message contract failed: ${message}`);
}

const root = path.resolve(__dirname, "..");
const ui = fs.readFileSync(path.join(root, "ui.js"), "utf8");
const helperMatch = ui.match(/function generationErrorMessage\(error\) \{([\s\S]*?)\n  \}/);
assert(helperMatch, "generationErrorMessage() helper is missing");

const helper = vm.runInNewContext(`(function generationErrorMessage(error) {${helperMatch[1]}\n})`);
assert(helper(new Error("  detailed failure  ")) === "detailed failure", "Error.message was not normalized");
assert(helper("  string failure  ") === "string failure", "thrown string was not normalized");
assert(helper({ code: "opaque" }) === "Unexpected generation error.", "opaque object did not use generic fallback");
assert(helper(null) === "Unexpected generation error.", "null did not use generic fallback");
assert(helper(new Error("   ")) === "Unexpected generation error.", "blank Error.message did not use generic fallback");

const catchBlock = ui.match(/catch \(error\) \{([\s\S]*?)\n\s*\} finally \{/);
assert(catchBlock, "generation catch boundary is missing");
assert(catchBlock[1].includes("const message = generationErrorMessage(error);"), "catch boundary does not normalize failures");
assert(catchBlock[1].includes("escapeXml(message)"), "normalized failure message is not escaped before rendering");
assert(!catchBlock[1].includes("escapeXml(error.message)"), "catch boundary still renders error.message directly");

console.log(JSON.stringify({
  passed: true,
  errorMessageSupported: true,
  thrownStringSupported: true,
  opaqueFallback: "Unexpected generation error.",
  blankFallback: true,
  normalizedMessageEscaped: true,
}));
