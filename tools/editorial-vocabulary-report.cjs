"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
global.window = global;
require(path.join(root, "editorial-lexical-policy-v3.js"));

const policy = window.ScanwordEditorialLexicalPolicyV3;
const inputPath = process.argv[2];
if (!inputPath) throw new Error("A JSONL checkpoint path is required.");

const records = fs.readFileSync(path.resolve(inputPath), "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const seeds = records.filter((record) => record.type === "seed");
if (!seeds.length) throw new Error("No seed records were found.");

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function replacementAssignments(seed) {
  const assignments = [];
  for (const replacement of seed.replacement?.single?.replacements || []) {
    assignments.push({ stage: "single", role: "target", from: replacement.from, to: replacement.to });
  }
  for (const replacement of seed.replacement?.pair?.replacements || []) {
    assignments.push({
      stage: "pair",
      role: "target",
      from: replacement.targetFrom,
      to: replacement.targetTo,
    });
    assignments.push({
      stage: "pair",
      role: "partner",
      from: replacement.partnerFrom,
      to: replacement.partnerTo,
    });
  }
  for (const replacement of seed.replacement?.bundle?.replacements || []) {
    const from = replacement.from || [];
    const to = replacement.to || [];
    for (let index = 0; index < to.length; index += 1) {
      assignments.push({
        stage: "bundle",
        role: index === 0 ? "target" : "component",
        from: from[index] || null,
        to: to[index],
      });
    }
  }
  return assignments;
}

const tierCounts = new Map();
const targetTierCounts = new Map();
const transitions = new Map();
const acceptedByStage = new Map();
const addedEntriesByStage = new Map();
const perSeed = [];

for (const seed of seeds) {
  const assignments = replacementAssignments(seed);
  const localAssignmentTierCounts = new Map();
  for (const assignment of assignments) {
    const classification = policy.classify(assignment.to);
    increment(tierCounts, classification.editorialTier);
    increment(localAssignmentTierCounts, classification.editorialTier);
    increment(acceptedByStage, assignment.stage);
    if (assignment.role === "target") {
      increment(targetTierCounts, classification.editorialTier);
      increment(transitions, `${assignment.from}->${assignment.to}`);
    }
  }
  for (const stage of seed.replacement?.pipeline?.stages || []) {
    const added = Number(stage.added || 0);
    if (added <= 0) continue;
    if (addedEntriesByStage.has(stage.name) && addedEntriesByStage.get(stage.name) !== added) {
      throw new Error(`Vocabulary stage ${stage.name} reported inconsistent pool sizes.`);
    }
    addedEntriesByStage.set(stage.name, added);
  }
  perSeed.push({
    index: seed.index,
    baselineFormulaic: seed.baseline.formulaicShortCount,
    repairedFormulaic: seed.replacement.formulaicShortCount,
    acceptedTargets: Number(seed.replacement?.pipeline?.accepted || 0),
    addedCommonAssignments: Number(localAssignmentTierCounts.get("common-short") || 0),
    addedSpecialistAssignments: Number(localAssignmentTierCounts.get("specialist-short") || 0),
    addedObscureAssignments: Number(localAssignmentTierCounts.get("obscure-short") || 0),
    addedUnclassifiedAssignments: Number(localAssignmentTierCounts.get("unclassified-short") || 0),
  });
}

const residualDistribution = new Map();
for (const seed of seeds) increment(residualDistribution, String(seed.replacement.formulaicShortCount));

const report = {
  type: "editorial-vocabulary-report",
  runs: seeds.length,
  vocabularyAddedPerRepairedSeed: sortedObject(addedEntriesByStage),
  uniqueVocabularyAddedPerRepairedSeed: [...addedEntriesByStage.values()]
    .reduce((sum, value) => sum + value, 0),
  acceptedAssignmentsByStage: sortedObject(acceptedByStage),
  acceptedAssignmentTiers: sortedObject(tierCounts),
  acceptedTargetTiers: sortedObject(targetTierCounts),
  targetTransitions: sortedObject(transitions),
  residualFormulaicDistribution: Object.fromEntries(
    [...residualDistribution.entries()].sort((a, b) => Number(a[0]) - Number(b[0])),
  ),
  maximumAddedObscureAssignmentsPerSeed: Math.max(...perSeed.map((seed) => seed.addedObscureAssignments)),
  averageAddedObscureAssignmentsPerSeed: +(
    perSeed.reduce((sum, seed) => sum + seed.addedObscureAssignments, 0) / seeds.length
  ).toFixed(2),
  averageAddedSpecialistAssignmentsPerSeed: +(
    perSeed.reduce((sum, seed) => sum + seed.addedSpecialistAssignments, 0) / seeds.length
  ).toFixed(2),
  perSeed,
};

console.log(JSON.stringify(report));
