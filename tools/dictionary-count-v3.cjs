"use strict";

const path = require("node:path");
const root = path.resolve(__dirname, "..");
global.window = global;

const normalize = (value) => String(value || "")
  .trim()
  .toUpperCase()
  .replaceAll("Ё", "Е");
const unique = (values) => new Set(values.map(normalize).filter(Boolean));

require(path.join(root, "words.js"));
const coreRaw = window.RUSSIAN_WORDS.length;
const coreUnique = unique(window.RUSSIAN_WORDS).size;

require(path.join(root, "short-words.js"));
const afterShortRaw = window.RUSSIAN_WORDS.length;
const afterShortUnique = unique(window.RUSSIAN_WORDS).size;

require(path.join(root, "clues.js"));
require(path.join(root, "extra-dictionary.js"));
const afterExtraRaw = window.RUSSIAN_WORDS.length;
const afterExtraUnique = unique(window.RUSSIAN_WORDS).size;
const extraAdded = Array.isArray(window.EXTRA_DICTIONARY_WORDS)
  ? window.EXTRA_DICTIONARY_WORDS.length
  : afterExtraRaw - afterShortRaw;

require(path.join(root, "two-letter-words.js"));
const productionWords = [...window.RUSSIAN_WORDS];
const productionSet = unique(productionWords);

for (const file of [
  "editorial-demand-lexicon-v3.js",
  "editorial-demand-lexicon-supplement-v3.js",
  "editorial-demand-short-lexicon-v3.js",
  "editorial-demand-tail-lexicon-v3.js",
]) require(path.join(root, file));

const batches = [
  ["demand", window.ScanwordEditorialDemandLexiconV3],
  ["supplement", window.ScanwordEditorialDemandLexiconSupplementV3],
  ["short", window.ScanwordEditorialDemandShortLexiconV3],
  ["tail", window.ScanwordEditorialDemandTailLexiconV3],
];
const repairEntries = batches.flatMap(([, batch]) => batch?.entries || []);
const repairAnswers = repairEntries.map((entry) => entry.answer);
const repairSet = unique(repairAnswers);
const repairOverlap = [...repairSet].filter((answer) => productionSet.has(answer)).length;
const effectiveSet = new Set([...productionSet, ...repairSet]);

const byLength = {};
for (const answer of effectiveSet) {
  byLength[answer.length] = (byLength[answer.length] || 0) + 1;
}

console.log(JSON.stringify({
  core: {
    raw: coreRaw,
    unique: coreUnique,
  },
  shortWords: {
    declared: afterShortRaw - coreRaw,
    uniqueAdded: afterShortUnique - coreUnique,
  },
  extraDictionary: {
    declaredEntriesAdded: extraAdded,
    uniqueAdded: afterExtraUnique - afterShortUnique,
  },
  twoLetterWords: {
    declared: Array.isArray(window.TWO_LETTER_WORDS) ? window.TWO_LETTER_WORDS.length : 0,
    uniqueAdded: productionSet.size - afterExtraUnique,
  },
  production: {
    raw: productionWords.length,
    unique: productionSet.size,
    duplicates: productionWords.length - productionSet.size,
  },
  repairVocabulary: {
    declared: repairEntries.length,
    unique: repairSet.size,
    overlapWithProduction: repairOverlap,
    uniqueAddedToProduction: effectiveSet.size - productionSet.size,
    batches: Object.fromEntries(batches.map(([name, batch]) => [name, batch?.entries?.length || 0])),
  },
  effective: {
    unique: effectiveSet.size,
    byLength,
  },
}, null, 2));
