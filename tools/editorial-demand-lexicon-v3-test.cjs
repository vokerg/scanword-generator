"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;
require(path.resolve(__dirname, "..", "editorial-demand-lexicon-v3.js"));

const lexicon = window.ScanwordEditorialDemandLexiconV3;
assert.ok(lexicon);
assert.ok(lexicon.entries.length >= 350);
assert.equal(new Set(lexicon.entries.map((entry) => entry.answer)).size, lexicon.entries.length);
assert.ok(lexicon.entries.every((entry) => /^[А-Я]+$/.test(entry.answer)));
assert.ok(lexicon.entries.every((entry) => entry.hasExactClue && entry.clue.length > 2));
assert.equal(lexicon.metadata.sourcePatterns, 105);
assert.equal(lexicon.metadata.coveredPatterns, 101);
assert.deepEqual(lexicon.metadata.uncoveredPatterns, ["?К", "?Л", "?М", "П?"]);

const result = {
  pool: [
    { answer: "ТЕМА", clue: "Existing clue", hasExactClue: true },
    { answer: "РЕ", clue: "Existing short answer", hasExactClue: true },
  ],
  constructionV2: {},
};
const before = result.pool.length;
lexicon.extendPool(result);
assert.ok(result.pool.length > before + 350);
assert.equal(result.pool.filter((entry) => entry.answer === "ТЕМА").length, 1);
assert.ok(result.pool.some((entry) => entry.answer === "ВАРЕНИКИ"));
assert.ok(result.pool.some((entry) => entry.answer === "ЛАДОГА"));
assert.equal(result.constructionV2.editorialDemandLexicon.availableEntries, lexicon.entries.length);
assert.equal(
  result.constructionV2.editorialDemandLexicon.addedEntries
    + result.constructionV2.editorialDemandLexicon.skippedDuplicateEntries,
  lexicon.entries.length,
);

console.log(JSON.stringify({
  demandLexicon: true,
  entries: lexicon.entries.length,
  sourcePatterns: lexicon.metadata.sourcePatterns,
  coveredPatterns: lexicon.metadata.coveredPatterns,
  addedEntries: result.constructionV2.editorialDemandLexicon.addedEntries,
}));
