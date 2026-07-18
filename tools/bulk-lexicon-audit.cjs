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
const clueKinds = new Map();
const invalid = [];
const missingSourceIds = new Map();
const missingFacts = new Map();

function inferredClueKind(entry) {
  if (entry.clueKind && entry.clueKind !== "unclassified") return entry.clueKind;
  const clue = String(entry.clue || "").trim();
  if (/^(Мужское|Женское|Личное) имя$/.test(clue) || clue === "Фамилия" || clue === "Отчество") return "generic-template";
  if (/^(Город в |Крупный город в |Столица государства |Государство в )/.test(clue)) return "generic-template";
  return "definition";
}

function isGenericTemplate(entry, clueKind) {
  return entry.genericTemplate === true || clueKind === "generic-template";
}

function isGeneratedTemplate(entry, clueKind) {
  if (entry.generatedTemplate === true) return true;
  return clueKind === "generic-template" || clueKind === "descriptive-template";
}

for (const entry of entries) {
  const answer = normalize(entry.answer);
  const clue = String(entry.clue || "").trim();
  const clueKind = inferredClueKind(entry);
  increment(answerCounts, answer);
  increment(clueCounts, clue);
  increment(categories, String(entry.category || "unknown"));
  increment(sources, String(entry.lexicalSource || "unknown"));
  increment(licenses, String(entry.license || "missing"));
  increment(lengths, String(answer.length));
  increment(clueKinds, clueKind);
  if (!entry.sourceId) increment(missingSourceIds, String(entry.category || "unknown"));
  if (clueKind === "descriptive-template" && !entry.clueFacts) increment(missingFacts, String(entry.category || "unknown"));
  if (!/^[А-Я]+$/.test(answer) || answer.length < 2 || answer.length > 12 || clue.length < 3 || !entry.hasExactClue) {
    invalid.push({ answer, clue, category: entry.category, source: entry.lexicalSource });
  }
}

const duplicateAnswers = [...answerCounts.entries()].filter(([, count]) => count > 1);
const duplicateClues = [...clueCounts.entries()]
  .filter(([clue, count]) => count > 1 && count >= 3)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 30);
const genericTemplateCount = entries.filter((entry) => isGenericTemplate(entry, inferredClueKind(entry))).length;
const generatedTemplateCount = entries.filter((entry) => isGeneratedTemplate(entry, inferredClueKind(entry))).length;
const descriptiveTemplateCount = entries.filter((entry) => inferredClueKind(entry) === "descriptive-template").length;
const definitionCount = entries.filter((entry) => inferredClueKind(entry) === "definition").length;
const percent = (count) => entries.length ? +((count / entries.length) * 100).toFixed(2) : 0;

const report = {
  type: "bulk-lexicon-audit-v3",
  entries: entries.length,
  uniqueAnswers: answerCounts.size,
  invalidEntries: invalid.length,
  duplicateAnswerCount: duplicateAnswers.length,
  exactClueCoveragePercent: entries.length ? +(((entries.length - invalid.length) / entries.length) * 100).toFixed(2) : 0,
  genericTemplateEntries: genericTemplateCount,
  genericTemplatePercent: percent(genericTemplateCount),
  descriptiveTemplateEntries: descriptiveTemplateCount,
  descriptiveTemplatePercent: percent(descriptiveTemplateCount),
  generatedTemplateEntries: generatedTemplateCount,
  generatedTemplatePercent: percent(generatedTemplateCount),
  dictionaryDefinitionEntries: definitionCount,
  dictionaryDefinitionPercent: percent(definitionCount),
  categories: sortedObject(categories),
  sources: sortedObject(sources),
  licenses: sortedObject(licenses),
  lengths: Object.fromEntries([...lengths.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
  clueKinds: sortedObject(clueKinds),
  missingSourceIdsByCategory: sortedObject(missingSourceIds),
  descriptiveCluesMissingFactsByCategory: sortedObject(missingFacts),
  repeatedClues: Object.fromEntries(duplicateClues),
  invalidSample: invalid.slice(0, 25),
  duplicateAnswerSample: duplicateAnswers.slice(0, 25),
};

console.log(JSON.stringify(report, null, 2));

if (invalid.length) throw new Error(`Bulk lexicon contains ${invalid.length} invalid entries`);
if (duplicateAnswers.length) throw new Error(`Bulk lexicon contains ${duplicateAnswers.length} duplicate normalized answers`);
if (missingFacts.size) throw new Error("Descriptive generated clues are missing source facts");
