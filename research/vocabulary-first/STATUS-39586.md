# Vocabulary milestone: 39,586 source entries

## Corpus

The second reproducible corpus build produced **39,586 clue-bearing source entries**:

| category | entries |
| --- | ---: |
| common nouns | 4,358 |
| specialist nouns | 20,099 |
| given names | 2,798 |
| surnames | 2,087 |
| patronymics | 115 |
| cities | 9,830 |
| capitals | 170 |
| countries | 129 |
| **total** | **39,586** |

Length distribution:

| length | entries |
| ---: | ---: |
| 3 | 823 |
| 4 | 2,479 |
| 5 | 4,784 |
| 6 | 5,879 |
| 7 | 6,391 |
| 8 | 5,658 |
| 9 | 4,676 |
| 10 | 3,708 |
| 11 | 2,904 |
| 12 | 2,284 |

The complete source list, categories, source IDs, licenses, chunk hashes and generated loader are pinned in `bulk-lexicon/manifest.json`.

The application does **not** expose all entries indiscriminately to one greedy generation pass. Each seed derives a deterministic, length-balanced **3,500-entry active working set** from the full source corpus.

## Twenty-seed identical-seed A/B

Validated head: `87a2d2bb5dfc4933d295aa6bd738cc359ca0712f`.

- workflow run: `29615439907`;
- artifact: `8420363373`;
- artifact name: `vocabulary-confirmation-ec0337e792466e08a1d1b44121db5d88792adba0`;
- digest: `sha256:8342abdb6d06991499ceef3e225ac412ae2f7fa0d706d789a65ad562be40110d`.

| metric | original 887-word working pool | 39,586 source / 3,500 active | delta |
| --- | ---: | ---: | ---: |
| residual panels | 7.35 | **6.20** | **−1.15** |
| answers | 44.90 | **47.35** | **+2.45** |
| crossings | 47.20 | **52.00** | **+4.80** |
| active coverage | 96.67% | **97.19%** | **+0.52 pp** |
| answer-space coverage | 93.72% | **94.85%** | **+1.13 pp** |
| raw-letter coverage | 49.21% | **51.55%** | **+2.34 pp** |
| formulaic short answers | 4.00 | **1.55** | **−2.45** |
| editorial penalty | 544.95 | **478.70** | **−66.25** |
| elapsed time | 8.44 s | 10.48 s | +2.03 s |

Outcomes:

- fewer panels: **13/20**;
- more answers: **14/20**;
- more crossings: **16/20**;
- higher raw-letter coverage: **18/20**;
- panel regressions: **5/20**;
- answer regressions: **4/20**;
- structural coverage checkpoint: **20/20**;
- valid, connected grids with exact clues: **20/20**.

The benchmark explicitly verified that the expanded process loaded exactly **39,586 source entries** before deriving its active working set.

## Placed-answer composition

Average answers per expanded grid:

| category | average |
| --- | ---: |
| common nouns | 18.95 |
| cities | 7.55 |
| specialist nouns | 7.25 |
| given names | 6.50 |
| core-reviewed | 5.20 |
| capitals | 0.80 |
| surnames | 0.65 |
| countries | 0.45 |

The larger corpus gives a strong structural improvement, but city and given-name use is editorially high. A separate same-corpus A/B now tests soft category caps inside the 3,500-entry working-set selector. Those caps must not become default until they preserve the density gains.

## Conclusion

The vocabulary-first hypothesis is confirmed at nearly forty thousand source entries:

- vocabulary expansion is not merely reducing a lexical penalty;
- it adds answers and crossings;
- it reduces residual panels on average;
- it increases raw-letter and answer-space coverage;
- it preserves validation on every tested grid.

The next bottleneck is no longer raw dictionary size alone. It is the **composition of the seed-specific active domain**: enough names and geography for pattern coverage, but not enough to dominate the page.
