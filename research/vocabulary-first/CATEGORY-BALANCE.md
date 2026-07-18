# Category-balance experiment

## Question

Can soft caps on cities, names, surnames and specialist nouns reduce repetitive proper-name fill without sacrificing the structural gain of the 39,586-entry source corpus?

The corpus and active working-set size were held constant:

- source corpus: 39,586 entries;
- active working set: 3,500 entries;
- same ten seeds;
- same construction parameters;
- editorial repair disabled for the first isolation experiment.

## Caps tested

For answers of length four or greater:

- specialist nouns: at most 35% of the active set;
- given names: 6%;
- surnames: 3%;
- patronymics: 1%;
- cities: 5%;
- capitals: 1.2%;
- countries: 1.2%.

Two- and three-letter answers bypassed the caps so structural bridge domains would not be artificially removed. Caps were soft: a relaxed fallback could fill any remaining active-set capacity.

## Ten-seed result without repair

Validated head: `53957dc8518d5fa1632e6c749ec6b56d2a234acb`.

- workflow run: `29615741258`;
- artifact: `8420450263`;
- digest: `sha256:f9ba0dab768e4347edbed69e4ee60a5b880cef9bd528344ecce84e6cb6020548`.

| metric | uncapped | category-balanced | delta |
| --- | ---: | ---: | ---: |
| panels | 6.00 | **5.90** | −0.10 |
| answers | 46.50 | **48.10** | +1.60 |
| crossings | 52.00 | **52.40** | +0.40 |
| raw-letter coverage | **51.67%** | 51.54% | −0.13 pp |
| formulaic short answers | **1.10** | 1.90 | +0.80 |
| editorial penalty | **436.10** | 506.10 | +70.00 |
| elapsed time | 13.71 s | **13.25 s** | −0.46 s |

Average placed categories:

| category | uncapped | balanced | delta |
| --- | ---: | ---: | ---: |
| common nouns | 19.10 | 20.40 | +1.30 |
| specialist nouns | 5.60 | 8.00 | +2.40 |
| cities | 7.90 | 7.00 | −0.90 |
| given names | 6.20 | 5.40 | −0.80 |
| surnames | 1.00 | 0.50 | −0.50 |
| core-reviewed | 5.60 | 6.10 | +0.50 |

Structural checkpoint: 10/10 for both variants.

## Interpretation

The caps achieved the intended composition change and slightly improved panels, answers and crossings. They also changed the greedy trajectory toward more short structural answers, raising formulaic-short usage and therefore the editorial penalty.

This is a mixed result, not a default-setting decision. Category balancing remains opt-in while a second A/B applies the proven same-geometry editorial repair after construction. The desired final combination is:

1. category caps reduce excessive cities and personal names;
2. repair removes the extra formulaic short answers;
3. structural density gains remain intact.
