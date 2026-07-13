"use strict";

const path = require("node:path");
const root = path.resolve(__dirname, "..");
global.window = global;

require(path.join(root, "words.js"));
require(path.join(root, "short-words.js"));
require(path.join(root, "clues.js"));
require(path.join(root, "extra-dictionary.js"));

const normalize = (value) => String(value).trim().toUpperCase().replaceAll("Ё", "Е");
const clueKey = (value) => String(value).trim().toLowerCase().replaceAll("ё", "е");
const seen = new Map();
const failures = [];
const warnings = [];
const lengths = new Map();
let withClue = 0;

for (const raw of window.RUSSIAN_WORDS) {
  const answer = normalize(raw);
  const clue = window.RUSSIAN_CLUES[clueKey(raw)];

  if (!/^[А-Я]+$/.test(answer)) failures.push(`${raw}: invalid characters`);
  if (answer.length < 3 || answer.length > 12) failures.push(`${raw}: unsupported length ${answer.length}`);
  if (seen.has(answer)) failures.push(`${raw}: duplicate of ${seen.get(answer)}`);
  else seen.set(answer, raw);

  if (clue && String(clue).trim()) withClue += 1;
  else warnings.push(`${raw}: no reviewed clue; fallback clue remains available`);

  lengths.set(answer.length, (lengths.get(answer.length) || 0) + 1);
}

for (const raw of window.EXTRA_DICTIONARY_WORDS || []) {
  const clue = window.RUSSIAN_CLUES[clueKey(raw)];
  if (!clue || !String(clue).trim()) failures.push(`${raw}: expansion entry is missing a clue`);
  if (clue && String(clue).length > 68) failures.push(`${raw}: clue is too long (${String(clue).length})`);

  const escaped = String(raw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const answerPattern = new RegExp(`(^|[^а-яё])${escaped}([^а-яё]|$)`, "i");
  if (clue && answerPattern.test(String(clue))) failures.push(`${raw}: clue contains the answer`);
}

console.table([...lengths.entries()].sort((a, b) => a[0] - b[0]).map(([length, count]) => ({ length, count })));
console.log({
  sourceEntries: window.RUSSIAN_WORDS.length,
  normalizedUnique: seen.size,
  expansionAdded: (window.EXTRA_DICTIONARY_WORDS || []).length,
  reviewedClues: withClue,
  clueCoveragePercent: Math.round((withClue / Math.max(1, window.RUSSIAN_WORDS.length)) * 100),
  fallbackClueWarnings: warnings.length,
});

if (warnings.length) console.warn(warnings.slice(0, 20).join("\n"));
if (warnings.length > 20) console.warn(`...and ${warnings.length - 20} more fallback-clue warnings`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
