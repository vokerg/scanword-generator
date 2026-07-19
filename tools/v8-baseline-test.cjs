"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const {
  compactSample,
  median,
  nearestRank,
  numericSummary,
  summarize,
} = require("./v8-baseline-checkpoint.cjs");

const seedFiles = [
  ["development-20.json", 20],
  ["promotion-50.json", 50],
  ["stability-100.json", 100],
];
const allSeeds = [];
for (const [file, expected] of seedFiles) {
  const value = JSON.parse(fs.readFileSync(path.join(root, "research", "baselines", "seed-sets", file), "utf8"));
  assert.equal(value.seeds.length, expected);
  assert.equal(new Set(value.seeds).size, expected);
  allSeeds.push(...value.seeds);
}
assert.equal(new Set(allSeeds).size, allSeeds.length, "locked seed sets must be disjoint");

assert.equal(median([1, 2, 3, 4]), 2.5);
assert.equal(median([1, 2, 3]), 2);
assert.equal(nearestRank([1, 2, 3, 4, 100], 0.95), 100);
assert.deepEqual(numericSummary([1, 2, 3, 4]), {
  average: 2.5,
  median: 2.5,
  p95: 4,
  minimum: 1,
  maximum: 4,
});

const sample = {
  validation: { valid: true },
  components: 1,
  exactCluesOnly: true,
  coverageCheckpointPassed: true,
  sourceCorpusEntries: 40966,
  elapsedMs: 1000,
  panelCells: 0,
  answers: 2,
  crossings: 1,
  activePercent: 95,
  answerPercent: 94,
  rawLetterPercent: 53,
  letterCells: 10,
  twoLetterCount: 1,
  formulaicShortCount: 0,
  editorialPenalty: 2,
  lexicalEntries: [
    { answer: "АННА", lexicalCategory: "given-name", lexicalSource: "names" },
    { answer: "МОСТ", lexicalCategory: "common-noun", lexicalSource: "ruwordnet" },
  ],
  constructionV2: {
    selectedGridClues: {
      genericClueCount: 1,
      generatedClueCount: 1,
      factualTemplateCount: 0,
      repeatedClueCount: 1,
      repeatedClueKinds: 1,
      repeatedGenericClueCount: 1,
      repeatedGenericClueKinds: 1,
      overRevealingGeneratedClueCount: 0,
    },
    vocabularyPortfolio: { selectedLimit: 2500 },
  },
};
const compact = compactSample(sample, "development", 0, "fixture");
assert.equal(compact.selectedGridClueDebt, 2);
assert.equal(compact.properNameCount, 1);
assert.equal(compact.properNameShare, 0.5);
assert.equal(compact.zeroPanel, true);
assert.equal(compact.dominantCategoryShare, 0.5);

const seedSet = { name: "fixture", role: "development", seeds: ["a", "b"] };
const environment = { environmentDigest: "sha256:fixture" };
const second = { ...compact, index: 1, seed: "b", panels: 2, zeroPanel: false, elapsedMs: 3000 };
const aggregate = summarize("development", seedSet, [compact, second], environment);
assert.equal(aggregate.validity.validRate, 1);
assert.equal(aggregate.panels.average, 1);
assert.equal(aggregate.panels.zeroPanelRate, 0.5);
assert.equal(aggregate.runtimeMs.median, 2000);
assert.deepEqual(aggregate.panels.distribution, { "0": 1, "2": 1 });

const config = JSON.parse(fs.readFileSync(path.join(root, "research", "baselines", "v8-production-1.1", "config.json"), "utf8"));
assert.equal(config.corpus.expectedVersion, 8);
assert.equal(config.corpus.expectedEntries, 40966);
assert.equal(config.environment.SCANWORD_SELECTED_GRID_CLUE_DISAMBIGUATION, "off");
assert.equal(config.environment.SCANWORD_VOCABULARY_PORTFOLIO_LIMITS, "2500,3500");

console.log(JSON.stringify({
  passed: true,
  seedSets: seedFiles.map(([file, count]) => ({ file, count })),
  aggregate,
}));
