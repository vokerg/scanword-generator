"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
global.window = global;
window.ScanwordCore = {
  normalizeWord(value) {
    return String(value || "").trim().toUpperCase().replaceAll("Ё", "Е");
  },
};
require(path.join(root, "editorial-lexical-policy-v3.js"));
require(path.join(root, "full-corpus-pattern-index-v1.js"));

const retrieval = window.ScanwordFullCorpusPatternIndexV1;
process.env.SCANWORD_FULL_CORPUS_RETRIEVAL = "on";
process.env.SCANWORD_FULL_CORPUS_RETRIEVAL_MODE = "empty";

function installFixture() {
  window.RUSSIAN_WORDS = [
    "алмаз",
    "абзац",
    "архив",
    "арка",
    "айва",
    "блок",
    "безключа",
    "мусор1",
    "алмаз",
  ];
  window.RUSSIAN_CLUES = {
    алмаз: "Природный кристалл углерода",
    абзац: "Часть текста между отступами",
    архив: "Собрание документов",
    арка: "Дугообразное перекрытие",
    айва: "Жёлтый терпкий плод",
    блок: "Запрещённая тестовая запись",
  };
  window.RUSSIAN_LEXICAL_META = {
    алмаз: { lexicalQuality: 95, category: "common-noun", source: "curated", clueKind: "sourced-definition" },
    абзац: { lexicalQuality: 92, category: "common-noun", source: "curated", clueKind: "sourced-definition" },
    архив: { lexicalQuality: 90, category: "common-noun", source: "curated", clueKind: "sourced-definition" },
    арка: { lexicalQuality: 94, category: "common-noun", source: "curated", clueKind: "sourced-definition" },
    айва: { lexicalQuality: 88, category: "common-noun", source: "curated", clueKind: "descriptive-factual" },
    блок: { lexicalQuality: 100, category: "common-noun", source: "blocked", blocked: true },
  };
  retrieval.resetForTests();
}

installFixture();
const index = retrieval.buildIndex();
assert.equal(index.entries.length, 5, "only unique, exact-clue, admitted entries should be indexed");
assert.equal(index.entries.some((entry) => entry.answer === "БЛОК"), false, "blocked metadata must be enforced");
assert.equal(index.entries.some((entry) => entry.answer === "БЕЗКЛЮЧА"), false, "entries without exact clues must be rejected");
assert.equal(index.entries.some((entry) => entry.answer.includes("1")), false, "malformed answers must be rejected");

assert.deepEqual(
  retrieval.query("А?МАЗ").map((entry) => entry.answer),
  ["АЛМАЗ"],
  "position-letter intersection should resolve an exact constrained answer",
);
assert.deepEqual(
  retrieval.query("А??А").map((entry) => entry.answer),
  ["АРКА", "АЙВА"],
  "ranking should be deterministic and prefer stronger sourced entries",
);
assert.deepEqual(retrieval.query("????"), [], "unconstrained full-corpus sampling must remain disabled");

const emptyRescue = retrieval.augmentDomain([], "А?МАЗ", { usedAnswers: new Set(), maximum: 10 });
assert.equal(emptyRescue.trigger, "empty");
assert.deepEqual(emptyRescue.entries.map((entry) => entry.answer), ["АЛМАЗ"]);
assert.equal(emptyRescue.entries[0].fullCorpusFallback, true);

const usedExclusion = retrieval.augmentDomain([], "А?МАЗ", { usedAnswers: new Set(["АЛМАЗ"]), maximum: 10 });
assert.deepEqual(usedExclusion.entries, [], "used answers must not re-enter through fallback");

const duplicateExclusion = retrieval.augmentDomain(
  [{ answer: "АЛМАЗ", clue: "hot", hasExactClue: true, lexicalQuality: 10 }],
  "А?МАЗ",
  { mode: "small-poor", smallThreshold: 2, usedAnswers: new Set(), maximum: 10 },
);
assert.equal(duplicateExclusion.entries.filter((entry) => entry.answer === "АЛМАЗ").length, 1);

process.env.SCANWORD_FULL_CORPUS_RETRIEVAL_MODE = "small-poor";
const smallRescue = retrieval.augmentDomain(
  [{ answer: "АРКА", clue: "hot", hasExactClue: true, lexicalQuality: 94 }],
  "А??А",
  { smallThreshold: 2, usedAnswers: new Set(), maximum: 10 },
);
assert.equal(smallRescue.trigger, "small");
assert.deepEqual(smallRescue.entries.map((entry) => entry.answer), ["АРКА", "АЙВА"]);

const poorRescue = retrieval.augmentDomain(
  [{ answer: "АЙВА", clue: "hot", hasExactClue: true, lexicalQuality: 20, weakFill: true }],
  "А??А",
  { smallThreshold: 1, poorThreshold: 10, usedAnswers: new Set(), maximum: 10 },
);
assert.equal(poorRescue.trigger, "poor");
assert.equal(poorRescue.entries.some((entry) => entry.answer === "АРКА"), true);

const selected = poorRescue.entries.find((entry) => entry.fullCorpusFallback);
retrieval.recordSelected(selected, { stage: "fixture", slotId: 7 });
const telemetry = retrieval.snapshot();
assert.equal(telemetry.selectedFallbackEntries, 1);
assert.equal(telemetry.selectedFallbackAnswers[0].stage, "fixture");
assert.equal(telemetry.emptyDomainRescues >= 1, true);
assert.equal(telemetry.unconstrainedRejected, 1);

process.env.SCANWORD_FULL_CORPUS_RETRIEVAL = "off";
const disabled = retrieval.augmentDomain([{ answer: "АРКА" }], "А??А");
assert.deepEqual(disabled.entries, [{ answer: "АРКА" }], "disabled mode must preserve the hot domain exactly");

console.log(JSON.stringify({
  status: "ok",
  indexedEntries: index.entries.length,
  telemetry,
}));
