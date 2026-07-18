#!/usr/bin/env python3
"""Vocabulary-first 1.1 corpus builder using preferred Russian GeoNames.

The v6 surface-cluster pass removed inflected answers but could still choose a
nonstandard transliteration. GeoNames publishes language-tagged alternate names
with an explicit preferred-name flag. This pass uses the preferred Russian name
when one exists, retaining v6 only as a fallback.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("scanword_bulk_v6", HERE / "build-bulk-lexicon-v6.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load build-bulk-lexicon-v6.py")
v6 = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = v6
SPEC.loader.exec_module(v6)
v5 = v6.v5
v3 = v6.v3
base = v6.base
Entry = v6.Entry


def load_preferred_russian_names(zip_path: Path) -> dict[str, dict]:
    selected: dict[str, tuple[float, dict]] = {}
    with zipfile.ZipFile(zip_path) as archive:
        txt_name = next(name for name in archive.namelist() if name.endswith(".txt"))
        with archive.open(txt_name) as stream:
            for raw in stream:
                fields = raw.decode("utf-8", errors="ignore").rstrip("\n").split("\t")
                if len(fields) < 8 or fields[2] != "ru":
                    continue
                geoname_id, value = fields[1], fields[3].strip()
                preferred = fields[4] == "1"
                short = fields[5] == "1"
                colloquial = fields[6] == "1"
                historic = fields[7] == "1"
                if historic or colloquial or not base.valid_answer(value, 3, 12):
                    continue
                answer = base.normalize(value)
                frequency = base.frequency(value)
                score = (
                    (100 if preferred else 0)
                    + (12 if short else 0)
                    + frequency * 8
                    + (8 if v5.v4.has_tag(value, "Geox") else 0)
                    - (20 if frequency >= 4.8 and not preferred else 0)
                )
                payload = {
                    "answer": answer,
                    "surface": value[:1].upper() + value[1:].lower(),
                    "preferred": preferred,
                    "short": short,
                    "frequency": round(frequency, 3),
                }
                current = selected.get(geoname_id)
                if current is None or score > current[0]:
                    selected[geoname_id] = (score, payload)
    return {geoname_id: payload for geoname_id, (_, payload) in selected.items()}


def load_admin1_names_v7(
    features_zip: Path,
    preferred_by_id: dict[str, dict],
) -> dict[tuple[str, str], str]:
    names: dict[tuple[str, str], tuple[float, str]] = {}
    with zipfile.ZipFile(features_zip) as archive:
        txt_name = next(name for name in archive.namelist() if name.endswith(".txt"))
        with archive.open(txt_name) as stream:
            for raw in stream:
                fields = raw.decode("utf-8", errors="ignore").rstrip("\n").split("\t")
                if len(fields) < 19 or fields[7] != "ADM1":
                    continue
                geoname_id = fields[0]
                country_code, admin1_code = fields[8], fields[10]
                if not country_code or not admin1_code:
                    continue
                preferred = preferred_by_id.get(geoname_id)
                chosen = preferred["surface"] if preferred else v6.choose_surface_russian_name(fields[1], fields[3])
                if not chosen:
                    continue
                evidence = v5.alternate_evidence(fields[1], fields[3])
                score = (
                    (120 if preferred and preferred["preferred"] else 0)
                    + base.frequency(chosen) * 5
                    + evidence
                    + (4 if v5.v4.has_tag(chosen, "Geox") else 0)
                )
                key = (country_code, admin1_code)
                current = names.get(key)
                if current is None or score > current[0]:
                    names[key] = (score, chosen)
    return {key: value for key, (_, value) in names.items()}


def apply_preferred_names(
    entries: list[dict],
    preferred_by_id: dict[str, dict],
    reserved: set[str],
) -> tuple[list[dict], dict]:
    output: list[dict] = []
    used = set(reserved)
    replaced = 0
    preferred_available = 0
    collision_fallbacks = 0
    dropped = 0

    for raw in entries:
        entry = dict(raw)
        original = base.normalize(entry["answer"])
        preferred = preferred_by_id.get(str(entry.get("sourceId") or ""))
        candidate = original
        if preferred:
            preferred_available += 1
            preferred_answer = base.normalize(preferred["answer"])
            if preferred_answer == original or preferred_answer not in used:
                candidate = preferred_answer
                if candidate != original:
                    replaced += 1
            elif original not in used:
                collision_fallbacks += 1
            else:
                dropped += 1
                continue
        elif original in used:
            dropped += 1
            continue

        entry["answer"] = candidate
        facts = dict(entry.get("clueFacts") or {})
        facts.update({
            "preferredRussianNameAvailable": bool(preferred),
            "preferredRussianName": preferred["surface"] if preferred else None,
        })
        entry["clueFacts"] = facts
        used.add(candidate)
        output.append(entry)

    return output, {
        "preferredAvailable": preferred_available,
        "answersReplaced": replaced,
        "collisionFallbacks": collision_fallbacks,
        "droppedDuplicates": dropped,
    }


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

    preferred_by_id = load_preferred_russian_names(args.geonames_alternates_zip)
    admin1_names = load_admin1_names_v7(args.geonames_features_zip, preferred_by_id)
    existing: set[str] = set()

    common = v3.decorate_base(base.load_ruwordnet(args.ruwordnet_db, args.common, existing), "definition", False, False)
    existing.update(entry["answer"] for entry in common)

    names = v3.decorate_base(base.load_names(args.names, existing), "generic-template", True, True)
    existing.update(entry["answer"] for entry in names)

    geography_raw = v5.load_geography_v5(args.geonames_cities_zip, args.geography, existing, admin1_names)
    geography, geography_preferred = apply_preferred_names(geography_raw, preferred_by_id, existing)
    existing.update(entry["answer"] for entry in geography)

    countries = v6.load_countries_v6(args.country_info, existing)
    existing.update(entry["answer"] for entry in countries)

    entities_raw = v5.load_geographic_entities_v5(args.geonames_features_zip, args.entities, existing, admin1_names)
    entities, entity_preferred = apply_preferred_names(entities_raw, preferred_by_id, existing)
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
        "version": 7,
        "generatedBy": "tools/build-bulk-lexicon-v7.py",
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
            "geography": geography_preferred,
            "entities": entity_preferred,
        },
        "editorialDebt": {
            "genericTemplateEntries": total["genericTemplateEntries"],
            "genericTemplatePercent": round(total["genericTemplateEntries"] / max(1, total["entries"]) * 100, 2),
            "generatedTemplateEntries": total["generatedTemplateEntries"],
            "generatedTemplatePercent": round(total["generatedTemplateEntries"] / max(1, total["entries"]) * 100, 2),
        },
        "admission": {
            "maximumEntityFrequency": v5.MAX_ENTITY_FREQUENCY,
            "usesPreferredRussianGeoNames": True,
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
