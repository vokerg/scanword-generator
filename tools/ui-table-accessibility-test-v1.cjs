"use strict";

const fs = require("node:fs");
const path = require("node:path");

function assert(condition, message) {
  if (!condition) throw new Error(`UI table accessibility test failed: ${message}`);
}

const root = path.resolve(__dirname, "..");
const ui = fs.readFileSync(path.join(root, "ui.js"), "utf8");
const renderWords = ui.match(/function renderWords\(result\) \{([\s\S]*?)\n  \}\n\n  function exportResult/);
assert(renderWords, "renderWords() boundary is missing");

const block = renderWords[1];
assert(block.includes('<table aria-label="Assigned answers">'), "result table must expose accessible name Assigned answers");
const scopedHeaders = block.match(/<th scope="col">/g) || [];
assert(scopedHeaders.length === 6, `expected 6 scoped column headers, got ${scopedHeaders.length}`);
for (const heading of ["#", "Clue", "Answer", "Length", "Direction", "Start"]) {
  assert(block.includes(`>${heading}</th>`), `missing result column header: ${heading}`);
}
assert(block.includes('<td lang="ru">${escapeXml(word.clue)}</td>'), "Russian clue cell semantics changed unexpectedly");
assert(block.includes('<td class="word" lang="ru">${escapeXml(word.answer)}</td>'), "Russian answer cell semantics/escaping changed unexpectedly");

console.log(JSON.stringify({
  passed: true,
  tableAccessibleName: "Assigned answers",
  scopedColumnHeaders: 6,
  languageSemanticsPreserved: true,
  escapedTextBoundaryPreserved: true,
}));
