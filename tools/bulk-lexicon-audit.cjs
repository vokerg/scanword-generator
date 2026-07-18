"use strict";

const path = require("node:path");
const root = path.resolve(__dirname, "..");
global.window = global;
window.RUSSIAN_WORDS = [];
window.RUSSIAN_CLUES = {};
window.RUSSIAN_LEXICAL_META = {};

require(path.join(root, "bulk-lexicon-runtime.js"));
require(path.join(root, "bulk-lexicon", "loader.js"));

const entries = window.ScanwordBulkLexiconV1?.state?.entries || [];
const normalize = (value) => String(value || "").trim().toUpperCase().replaceAll("Ё", "Е");
const increment = (map, key, amount = 1) => map.set(key, (map.get(key) || 0) + amount);
const sortedObject = (map) => Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));

const answerCounts = new Map();
const clueCounts = new Map();
const categories = new Map();
const sources = new Map();
const licenses = new Map();
const lengths = new Map();
const invalid = [];
const missingSourceIds = new Map();

function clueFamily(clue) {
  if (/^(Мужское|Женское|Личное) имя$/.test(clue)) return "generic-name";
  if (clue === "Фамилия") return "generic-surname";
  if (clue === "Отчество") return "generic-patronymic";
  if (/^Город в /.test(clue) || /^Крупный город в /.test(clue)) return "generated-city";
  if (/^Столица государства /.test(clue)) return "generated-capital";
  if (/^Государство в /.test(clue)) return "generated-country";
  return "dictionary-definition";
}

const clueFamilies = new Map();
for (const entry of entries) {
  const answer = normalize(entry.answer);
  const clue = String(entry.clue || "").trim();
  increment(answerCounts, answer);
  increment(clueCounts, clue);
  increment(categories, String(entry.category || "unknown"));
  increment(sources, String(entry.lexicalSource || "unknown"));
  increment(licenses, String(entry.license || "missing"));
  increment(lengths, String(answer.length));
  increment(clueFamilies, clueFamily(clue));
  if (!entry.sourceId) increment(missingSourceIds, String(entry.category || "unknown"));
  if (!/^[А-Я]+$/.test(answer) || answer.length < 2 || answer.length > 12 || clue.length < 3 || !entry.hasExactClue) {
    invalid.push({ answer, clue, category: entry.category, source: entry.lexicalSource });
  }
}

const duplicateAnswers = [...answerCounts.entries()].filter(([, count]) => count > 1);
const duplicateClues = [...clueCounts.entries()]
  .filter(([clue, count]) => count > 1 && clueFamily(clue) === "dictionary-definition")
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 30);
const genericCount = [...clueFamilies.entries()]
  .filter(([family]) => family !== "dictionary-definition")
  .reduce((sum, [, count]) => sum + count, 0);

const report = {
  type: "bulk-lexicon-audit",
  entries: entries.length,
  uniqueAnswers: answerCounts.size,
  invalidEntries: invalid.length,
  duplicateAnswerCount: duplicateAnswers.length,
  exactClueCoveragePercent: entries.length ? +(((entries.length - invalid.length) / entries.length) * 100).toFixed(2) : 0,
  genericClueEntries: genericCount,
  genericCluePercent: entries.length ? +((genericCount / entries.length) * 100).toFixed(2) : 0,
  categories: sortedObject(categories),
  sources: sortedObject(sources),
  licenses: sortedObject(licenses),
  lengths: Object.fromEntries([...lengths.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
  clueFamilies: sortedObject(clueFamilies),
  missingSourceIdsByCategory: sortedObject(missingSourceIds),
  repeatedDictionaryClues: Object.fromEntries(duplicateClues),
  invalidSample: invalid.slice(0, 25),
  duplicateAnswerSample: duplicateAnswers.slice(0, 25),
};

console.log(JSON.stringify(report, null, 2));

if (invalid.length) throw new Error(`Bulk lexicon contains ${invalid.length} invalid entries`);
if (duplicateAnswers.length) throw new Error(`Bulk lexicon contains ${duplicateAnswers.length} duplicate normalized answers`);
