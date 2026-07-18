#!/usr/bin/env python3
"""Vocabulary-first 1.1 corpus builder, selected candidate.

This pass keeps the preferred Russian GeoNames from v7 and closes the last
observed alias failure modes:
- when a preferred Russian answer collides with an already admitted answer,
  drop the fallback alias instead of retaining a misspelling or historical name;
- allow a small, source-id keyed letters-only override map for canonical Russian
  names that GeoNames stores only with punctuation or a non-Russian fallback.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("scanword_bulk_v7", HERE / "build-bulk-lexicon-v7.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load build-bulk-lexicon-v7.py")
v7 = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = v7
SPEC.loader.exec_module(v7)
v6 = v7.v6
v5 = v7.v5
v3 = v7.v3
base = v7.base

CANONICAL_ANSWER_OVERRIDES = {
    # GeoNames preferred Russian name is `Улан-Батор`, while crossword answers
    # are letters-only. The fallback surface form is Mongolian `Улаанбаатар`.
    "2028462": "УЛАНБАТОР",
}

EXPECTED_CANONICAL_ANSWERS = {
    "3530597": "МЕХИКО",
    "3688689": "БОГОТА",
    "2365267": "ЛОМЕ",
    "1581130": "ХАНОЙ",
    "1668341": "ТАЙБЕЙ",
    "964137": "ПРЕТОРИЯ",
    "2220957": "ЯУНДЕ",
    "2028462": "УЛАНБАТОР",
}


def apply_selected_names(
    entries: list[dict],
    preferred_by_id: dict[str, dict],
    reserved: set[str],
) -> tuple[list[dict], dict]:
    output: list[dict] = []
    used = set(reserved)
    replaced = 0
    preferred_available = 0
    collision_drops = 0
    duplicate_drops = 0
    override_uses = 0

    for raw in entries:
        entry = dict(raw)
        source_id = str(entry.get("sourceId") or "")
        original = base.normalize(entry["answer"])
        preferred = preferred_by_id.get(source_id)
        override = CANONICAL_ANSWER_OVERRIDES.get(source_id)
        candidate = base.normalize(override or (preferred["answer"] if preferred else original))

        if preferred:
            preferred_available += 1
        if override:
            override_uses += 1

        if candidate in used and candidate != original:
            collision_drops += 1
            continue
        if candidate in used:
            duplicate_drops += 1
            continue
        if candidate != original:
            replaced += 1

        entry["answer"] = candidate
        facts = dict(entry.get("clueFacts") or {})
        facts.update({
            "preferredRussianNameAvailable": bool(preferred),
            "preferredRussianName": preferred["surface"] if preferred else None,
            "canonicalOverride": override,
        })
        entry["clueFacts"] = facts
        used.add(candidate)
        output.append(entry)

    return output, {
        "preferredAvailable": preferred_available,
        "answersReplaced": replaced,
        "canonicalOverrideUses": override_uses,
        "collisionDrops": collision_drops,
        "duplicateDrops": duplicate_drops,
    }


def assert_canonical_examples(entries: list[dict]) -> None:
    by_source = {str(entry.get("sourceId") or ""): entry for entry in entries}
    failures = []
    for source_id, expected in EXPECTED_CANONICAL_ANSWERS.items():
        actual = by_source.get(source_id, {}).get("answer")
        if actual != expected:
            failures.append({"sourceId": source_id, "expected": expected, "actual": actual})
    if failures:
        raise RuntimeError(f"Canonical geography regression: {json.dumps(failures, ensure_ascii=False)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ruwordnet-db", type=Path, required=True)
    parser.add_argument("--geonames-cities-zip", type=Path, required=True)
    parser.add_argument("--geonames-features-zip", type=Path, required=True)
    parser.add_argument("--geonames-alternates-zip", type=Path, required=True)
    parser.add_argument("--country-info", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--common", type=int, default=35000)
    parser.add_argument("--names", type=int, default=5000)
    parser.add_argument("--geography", type=int, default=10000)
    parser.add_argument("--entities", type=int, default=1500)
    parser.add_argument("--chunk-size", type=int, default=2500)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for old in args.out_dir.glob("*.js"):
        old.unlink()

    preferred_by_id = v7.load_preferred_russian_names(args.geonames_alternates_zip)
    admin1_names = v7.load_admin1_names_v7(args.geonames_features_zip, preferred_by_id)
    existing: set[str] = set()

    common = v3.decorate_base(base.load_ruwordnet(args.ruwordnet_db, args.common, existing), "definition", False, False)
    existing.update(entry["answer"] for entry in common)

    names = v3.decorate_base(base.load_names(args.names, existing), "generic-template", True, True)
    existing.update(entry["answer"] for entry in names)

    geography_raw = v5.load_geography_v5(args.geonames_cities_zip, args.geography, existing, admin1_names)
    geography, geography_selected = apply_selected_names(geography_raw, preferred_by_id, existing)
    assert_canonical_examples(geography)
    existing.update(entry["answer"] for entry in geography)

    countries = v6.load_countries_v6(args.country_info, existing)
    existing.update(entry["answer"] for entry in countries)

    entities_raw = v5.load_geographic_entities_v5(args.geonames_features_zip, args.entities, existing, admin1_names)
    entities, entity_selected = apply_selected_names(entities_raw, preferred_by_id, existing)
    existing.update(entry["answer"] for entry in entities)

    files: list[dict] = []
    files += v3.write_chunks(common, args.out_dir, "ruwordnet-common", args.chunk_size)
    files += v3.write_chunks(names, args.out_dir, "proper-names", args.chunk_size)
    files += v3.write_chunks(geography, args.out_dir, "geography", args.chunk_size)
    files += v3.write_chunks(countries, args.out_dir, "countries", args.chunk_size)
    files += v3.write_chunks(entities, args.out_dir, "geographic-entities", args.chunk_size)
    loader = base.write_loader(files, args.out_dir)

    all_entries = [*common, *names, *geography, *countries, *entities]
    total = v3.summarize(all_entries)
    manifest = {
        "version": 8,
        "generatedBy": "tools/build-bulk-lexicon-v8.py",
        "sources": {
            "ruwordnet": {
                "url": "https://github.com/avidale/python-ruwordnet/releases/download/0.0.4/ruwordnet-2021.db",
                "role": "single-word noun senses and definitions",
            },
            "geonames-cities": {
                "url": "https://download.geonames.org/export/dump/cities15000.zip",
                "license": "CC BY 4.0",
                "role": "cities and capitals with population and region facts",
            },
            "geonames-features": {
                "url": "https://download.geonames.org/export/dump/allCountries.zip",
                "license": "CC BY 4.0",
                "role": "high-confidence natural and first-level administrative entities",
            },
            "geonames-alternate-names": {
                "url": "https://download.geonames.org/export/dump/alternateNamesV2.zip",
                "license": "CC BY 4.0",
                "role": "language-tagged preferred Russian surface names",
            },
            "geonames-countries": {
                "url": "https://download.geonames.org/export/dump/countryInfo.txt",
                "license": "CC BY 4.0",
                "role": "countries with continent, population and area facts",
            },
            "wordfreq+pymorphy3": {
                "role": "fallback surface-name clustering, homograph control and frequency ranking",
            },
            "project-overrides": {
                "role": "small source-id keyed letters-only canonical-answer exceptions",
                "entries": len(CANONICAL_ANSWER_OVERRIDES),
            },
        },
        "requested": {
            "common": args.common,
            "names": args.names,
            "geography": args.geography,
            "entities": args.entities,
            "countries": "all valid single-token Russian territory names",
        },
        "actual": {
            "common": v3.summarize(common),
            "names": v3.summarize(names),
            "geography": v3.summarize(geography),
            "countries": v3.summarize(countries),
            "entities": v3.summarize(entities),
            "total": total,
        },
        "preferredRussianNames": {
            "availableMappings": len(preferred_by_id),
            "geography": geography_selected,
            "entities": entity_selected,
        },
        "canonicalExamples": EXPECTED_CANONICAL_ANSWERS,
        "editorialDebt": {
            "genericTemplateEntries": total["genericTemplateEntries"],
            "genericTemplatePercent": round(total["genericTemplateEntries"] / max(1, total["entries"]) * 100, 2),
            "generatedTemplateEntries": total["generatedTemplateEntries"],
            "generatedTemplatePercent": round(total["generatedTemplateEntries"] / max(1, total["entries"]) * 100, 2),
        },
        "admission": {
            "maximumEntityFrequency": v5.MAX_ENTITY_FREQUENCY,
            "usesPreferredRussianGeoNames": True,
            "dropsCollidingFallbackAliases": True,
            "usesCanonicalSourceOverrides": True,
            "usesSurfaceAlternateClustersAsFallback": True,
            "usesAlternateNameEvidence": True,
            "featureSpecificEvidenceThresholds": True,
            "generatedCluesAvoidInflection": True,
        },
        "files": files,
        "loader": loader,
    }
    (args.out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
