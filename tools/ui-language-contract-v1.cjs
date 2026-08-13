"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ui = fs.readFileSync(path.join(root, "ui.js"), "utf8");

function fail(message) {
  throw new Error(`UI language contract failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

assert(
  ui.includes('<td lang="ru">${escapeXml(word.clue)}</td>'),
  "generated Russian clue cells must declare lang=ru",
);
assert(
  ui.includes('<td class="word" lang="ru">${escapeXml(word.answer)}</td>'),
  "generated Russian answer cells must declare lang=ru and preserve the escaped render boundary",
);
assert(
  /function renderAccessibleSvg\(result, showAnswers\) \{[\s\S]*?renderSvg\(result, showAnswers\)\.replace\("<svg ", '<svg lang="ru" xml:lang="ru" '\);[\s\S]*?\}/.test(ui),
  "preview/export SVG must receive Russian lang and xml:lang metadata",
);
assert(
  /function rerenderSvg\(\) \{[\s\S]*?renderAccessibleSvg\(currentResult, els\.showAnswers\.checked\)/.test(ui),
  "browser preview must use the accessible SVG wrapper",
);
assert(
  /download\("arrowword-a5\.svg", renderAccessibleSvg\(currentResult, els\.showAnswers\.checked\)/.test(ui),
  "standalone SVG download must use the accessible SVG wrapper",
);
assert(
  !/<table lang="ru">/.test(ui),
  "English result table headings must not be globally mislabeled as Russian",
);

console.log(JSON.stringify({
  passed: true,
  clueLanguage: "ru",
  answerLanguage: "ru",
  answerEscapingBoundary: true,
  previewSvgLanguage: "ru",
  exportedSvgLanguage: "ru",
  englishTableContextPreserved: true,
}));
