"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`A5 print contract failed: ${message}`);
}

const html = read("index.html");
const styles = read("styles.css");
const ui = read("ui.js");
const renderer = read("renderer.js");

assert(/id=["']printA5["']/.test(html), "Print A5 control is missing from index.html");
assert(/\.button-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s.test(styles), "desktop export actions are not laid out as three controls");

const pageRule = styles.match(/@page\s*\{([\s\S]*?)\}/);
assert(pageRule, "@page rule is missing");
assert(/size:\s*A5 portrait\s*;/.test(pageRule[1]), "@page is not fixed to A5 portrait");
assert(/margin:\s*0\s*;/.test(pageRule[1]), "@page margin is not zero");

const printRule = styles.match(/@media print\s*\{([\s\S]*?)\n\}\n\n@media \(max-width: 900px\)/);
assert(printRule, "@media print contract is missing or not isolated");
const printCss = printRule[1];

for (const selector of [".hero", ".controls-panel", ".preview-toolbar", ".words-panel"]) {
  assert(printCss.includes(selector), `${selector} is not excluded from print output`);
}
assert(/\.hero,[\s\S]*?\.words-panel\s*\{\s*display:\s*none\s*!important\s*;\s*\}/.test(printCss), "non-print UI is not hidden as one print rule");
assert(/\.app-shell\s*\{[^}]*width:\s*148mm\s*;[^}]*padding:\s*0\s*;/s.test(printCss), "print app shell is not exact A5 width without padding");
assert(/\.preview-panel\s*\{[^}]*width:\s*148mm\s*;[^}]*height:\s*210mm\s*;[^}]*border:\s*0\s*;[^}]*box-shadow:\s*none\s*;/s.test(printCss), "print preview panel is not flattened to A5");
assert(/\.paper-wrap\s*\{[^}]*width:\s*148mm\s*;[^}]*height:\s*210mm\s*;[^}]*padding:\s*0\s*;/s.test(printCss), "print paper wrapper is not exact A5 without padding");
assert(/\.paper-wrap svg\s*\{[^}]*width:\s*148mm\s*;[^}]*height:\s*210mm\s*;[^}]*box-shadow:\s*none\s*;[^}]*print-color-adjust:\s*exact\s*;/s.test(printCss), "printed SVG is not exact A5 with print color preservation");

assert(ui.includes('printA5: document.querySelector("#printA5")'), "ui.js does not bind the Print A5 control");
assert(/function setExportEnabled\(enabled\) \{[\s\S]*?els\.downloadSvg\.disabled = !enabled;[\s\S]*?els\.downloadJson\.disabled = !enabled;[\s\S]*?els\.printA5\.disabled = !enabled;[\s\S]*?\}/.test(ui), "Print A5 is not governed by the same valid-result state as exports");
assert(/els\.printA5\.addEventListener\("click", \(\) => \{[\s\S]*?if \(currentResult\) window\.print\(\);[\s\S]*?\}\);/.test(ui), "Print A5 is not guarded by currentResult before window.print()");

for (const expected of [
  'width="148mm"',
  'height="210mm"',
  'viewBox="0 0 148 210"',
]) {
  assert(renderer.includes(expected), `renderer A5 contract drifted: ${expected}`);
}

console.log(JSON.stringify({
  passed: true,
  page: "A5 portrait",
  widthMm: 148,
  heightMm: 210,
  pageMarginMm: 0,
  uiHiddenForPrint: true,
  printColorPreserved: true,
  stateBoundPrintAction: true,
  rendererA5Parity: true,
}));
