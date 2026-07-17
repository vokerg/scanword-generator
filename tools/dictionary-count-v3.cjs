"use strict";

const path = require("node:path");
const fs = require("node:fs");
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

const previousBulkMode = process.env.SCANWORD_BULK_LEXICON;
process.env.SCANWORD_BULK_LEXICON = "off";
require(path.join(root, "two-letter-words.js"));
if (previousBulkMode == null) delete process.env.SCANWORD_BULK_LEXICON;
else process.env.SCANWORD_BULK_LEXICON = previousBulkMode;

const baseWords = [...window.RUSSIAN_WORDS];
const baseSet = unique(baseWords);

require(path.join(root, "bulk-lexicon-runtime.js"));
const bulkFiles = [
  "ruwordnet-common-01.js",
  "ruwordnet-common-02.js",
  "ruwordnet-common-03.js",
  "ruwordnet-common-04.js",
  "ruwordnet-common-05.js",
  "ruwordnet-common-06.js",
  "proper-names-01.js",
  "geography-01.js",
  "geography-02.js",
];
for (const file of bulkFiles) require(path.join(root, "bulk-lexicon", file));
const constructionWords = [...window.RUSSIAN_WORDS];
const constructionSet = unique(constructionWords);
const bulkState = window.ScanwordBulkLexiconV1?.state || {};

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
const repairOverlap = [...repairSet].filter((answer) => constructionSet.has(answer)).length;
const effectiveSet = new Set([...constructionSet, ...repairSet]);

const byLength = {};
for (const answer of effectiveSet) byLength[answer.length] = (byLength[answer.length] || 0) + 1;

const bulkManifestPath = path.join(root, "bulk-lexicon", "manifest.json");
const bulkManifest = fs.existsSync(bulkManifestPath)
  ? JSON.parse(fs.readFileSync(bulkManifestPath, "utf8"))
  : null;

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
    uniqueAdded: baseSet.size - afterExtraUnique,
  },
  baseConstructionDictionary: {
    raw: baseWords.length,
    unique: baseSet.size,
    duplicates: baseWords.length - baseSet.size,
  },
  bulkSourceCorpus: {
    declared: Number(bulkManifest?.actual?.total?.entries || bulkState.entries?.length || 0),
    registeredUnique: Number(bulkState.entries?.length || 0),
    uniqueAddedToBase: constructionSet.size - baseSet.size,
    overlapWithBase: Number(bulkState.entries?.length || 0) - (constructionSet.size - baseSet.size),
    categories: bulkManifest?.actual?.total?.categories || {},
    lengths: bulkManifest?.actual?.total?.lengths || {},
    files: bulkFiles.length,
  },
  preConstructionCorpus: {
    raw: constructionWords.length,
    unique: constructionSet.size,
    duplicates: constructionWords.length - constructionSet.size,
    defaultActiveWorkingSet: Number(process.env.SCANWORD_ACTIVE_POOL_LIMIT || 3500),
  },
  repairVocabulary: {
    declared: repairEntries.length,
    unique: repairSet.size,
    overlapWithPreConstruction: repairOverlap,
    uniqueAddedToPreConstruction: effectiveSet.size - constructionSet.size,
    batches: Object.fromEntries(batches.map(([name, batch]) => [name, batch?.entries?.length || 0])),
  },
  effectiveAllLayers: {
    unique: effectiveSet.size,
    byLength,
  },
}, null, 2));
