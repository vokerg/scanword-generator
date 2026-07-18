"use strict";

const path = require("node:path");

if (path.basename(process.argv[1] || "") !== "benchmark-seed-v3.cjs") return;

process.env.SCANWORD_SELECTED_GRID_CLUE_DISAMBIGUATION =
  process.env.SCANWORD_SELECTED_GRID_CLUE_DISAMBIGUATION
  || process.env.SCANWORD_VOCABULARY_EDITORIAL_TIEBREAK
  || "off";

const root = path.resolve(__dirname, "..");
require(path.join(root, "construction-vocabulary-editorial-tiebreak-v1.js"));
require(path.join(root, "construction-clue-disambiguation-v1.js"));

if (!global.ScanwordSolver?.__vocabularyEditorialTieBreakV1Installed) throw new Error("Editorial portfolio unavailable");
if (!global.ScanwordSolver?.__clueDisambiguationV1Installed) throw new Error("Clue disambiguation unavailable");
