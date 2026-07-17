"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
global.window = global;
for (const file of [
  "editorial-lexical-policy-v3.js",
  "editorial-demand-lexicon-v3.js",
  "editorial-demand-lexicon-supplement-v3.js",
  "editorial-demand-short-lexicon-v3.js",
]) require(path.join(root, file));

const policy = window.ScanwordEditorialLexicalPolicyV3;
const batches = [
  window.ScanwordEditorialDemandLexiconV3,
  window.ScanwordEditorialDemandLexiconSupplementV3,
  window.ScanwordEditorialDemandShortLexiconV3,
];

for (const batch of batches) {
  assert.ok(batch);
  assert.ok(batch.entries.length > 0);
  assert.equal(new Set(batch.entries.map((entry) => entry.answer)).size, batch.entries.length);
  assert.ok(batch.entries.every((entry) => /^[А-Я]+$/.test(entry.answer)));
  assert.ok(batch.entries.every((entry) => entry.hasExactClue && entry.clue.length > 2));
}

const result = { pool: [], constructionV2: {} };
for (const batch of batches) batch.extendPool(result);
assert.ok(result.pool.length >= 500);
assert.equal(new Set(result.pool.map((entry) => entry.answer)).size, result.pool.length);
assert.equal(result.constructionV2.editorialDemandLexicon.addedEntries, batches[0].entries.length);
assert.ok(result.constructionV2.editorialDemandLexiconSupplement.addedEntries >= 100);
assert.equal(result.constructionV2.editorialDemandShortLexicon.addedEntries, 13);

assert.equal(policy.classify("ДА").editorialTier, "common-short");
assert.equal(policy.classify("ДИ").editorialTier, "specialist-short");
assert.equal(policy.classify("БА").editorialTier, "obscure-short");
assert.ok(policy.classify("БА").editorialPenalty > policy.classify("ДИ").editorialPenalty);
assert.ok(policy.classify("ДИ").editorialPenalty > policy.classify("ДА").editorialPenalty);
assert.ok(policy.classify("БА").editorialPenalty < policy.classify("ФА").editorialPenalty);

console.log(JSON.stringify({
  editorialDemandLexicons: true,
  availableEntries: batches.reduce((sum, batch) => sum + batch.entries.length, 0),
  uniqueAddedEntries: result.pool.length,
  commonPenalty: policy.classify("ДА").editorialPenalty,
  specialistPenalty: policy.classify("ДИ").editorialPenalty,
  obscurePenalty: policy.classify("БА").editorialPenalty,
  formulaicPenalty: policy.classify("ФА").editorialPenalty,
}));
