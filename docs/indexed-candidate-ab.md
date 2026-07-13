# Indexed candidate retrieval A/B report

## Scope

This experiment replaces random scanning of up to 700 dictionary entries at every placement step with a reusable index:

- `letter -> (entry, character position)` occurrences;
- `length -> entries` buckets for later CSP work;
- rare-anchor-first traversal of open crossing cells;
- bounded deterministic sampling inside large letter buckets;
- duplicate placement suppression;
- candidate-retrieval telemetry.

The legacy algorithm remains available through `SCANWORD_CANDIDATE_MODE=legacy` for regression comparisons. Indexed mode is the default on this R&D branch.

## Current reviewed lexicon

- reviewed entries available to the production solver: 803;
- every selected entry has a reviewed clue;
- supported answer lengths: 2–12 letters.

## Direct three-seed A/B

| Metric | Legacy | Indexed |
|---|---:|---:|
| Average wall time | 8.03 s | 1.90 s |
| Average candidate checks | 1,610,529 | 80,546 |
| Answers, seed 0 | 43 | 46 |
| Answers, seed 13 | 44 | 46 |
| Answers, seed 24 | 43 | 46 |
| Residual panels, seed 0 | 19 | 19 |
| Residual panels, seed 13 | 19 | 16 |
| Residual panels, seed 24 | 15 | 13 |

Candidate checks fell by roughly 95% while the three comparison grids gained between zero and three answers and never lost structural validity.

## Indexed 40-seed regression

- valid seeds: 40/40;
- answers: 42–49, average 44.33;
- active coverage: 91.4–95.0%, average 92.95%;
- answer-space coverage: 85.3–91.1%, average 87.31%;
- residual panels: 11–19, average 15.60;
- candidate checks: 64,873–99,844, average 76,433;
- generation time: 0.69–3.08 seconds, average 1.20 seconds;
- one connected answer component on every seed;
- zero accidental runs and zero fallback clues.

Compared with checkpoint 0.9's published 40-seed baseline, indexed retrieval changes the averages by:

- answers: `44.08 -> 44.33`;
- active coverage: `92.44% -> 92.95%`;
- answer-space coverage: `87.14% -> 87.31%`;
- residual panels: `16.70 -> 15.60`.

## Independent 100-seed stability run

- valid seeds: 100/100;
- answers: 40–49, average 44.63;
- active coverage: 91.0–95.5%, average 93.03%;
- answer-space coverage: 84.6–91.8%, average 87.50%;
- residual panels: 10–20, average 15.42;
- attempts used: 24–120, average 51.26;
- generation time: 0.69–3.34 seconds, average 1.43 seconds;
- one connected answer component on every seed;
- zero accidental runs and zero fallback clues.

## Conclusion

Indexed retrieval is safe to retain. It is not sufficient for complete coverage by itself, but it removes the main scaling obstacle to a lexicon in the low tens of thousands. The next experiment should mine the remaining 10–20 panel cells into explicit pattern demands and solve those regions with bounded rollback or local CSP rather than adding more global random restarts.
