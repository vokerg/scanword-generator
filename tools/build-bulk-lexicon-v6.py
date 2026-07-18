#!/usr/bin/env python3
"""Vocabulary-first 1.1 corpus builder, canonical surface-name pass.

The v5 artifact eliminated most homographs, but lemmatizing every candidate
also damaged valid indeclinable and foreign place names (for example, an
oblique form could win as a false lemma). This pass keeps the high-confidence
v5 admission policy while selecting a surface form supported by the cluster of
Cyrillic GeoNames alternates. Generated clues use factual semicolon fields and
therefore do not depend on fragile grammatical inflection.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("scanword_bulk_v5", HERE / "build-bulk-lexicon-v5.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load build-bulk-lexicon-v5.py")
v5 = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = v5
SPEC.loader.exec_module(v5)
v4 = v5.v4
v3 = v5.v3
base = v5.base
Entry = v5.Entry
MORPH = v5.MORPH


def raw_cyrillic_candidates(primary: str, alternates: str) -> list[str]:
    values: list[str] = []
    seen: set[str] = set()
    for raw in [primary, *(alternates or "").split(",")]:
        value = raw.strip()
        if not base.valid_answer(value, 3, 12):
            continue
        normalized = base.normalize(value)
        if normalized in seen:
            continue
        seen.add(normalized)
        values.append(value[:1].upper() + value[1:].lower())
    return values


def levenshtein(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)
    previous = list(range(len(right) + 1))
    for i, lchar in enumerate(left, 1):
        current = [i]
        for j, rchar in enumerate(right, 1):
            current.append(min(
                current[-1] + 1,
                previous[j] + 1,
                previous[j - 1] + (lchar != rchar),
            ))
        previous = current
    return previous[-1]


def parse_record(value: str) -> dict:
    parses = v5.candidate_parses(value)
    preferred = v5.preferred_parse(value)
    lemma = base.normalize(preferred.normal_form) if preferred is not None else base.normalize(value)
    return {
        "value": value,
        "answer": base.normalize(value),
        "lemma": lemma,
        "geox": bool(preferred is not None and "Geox" in preferred.tag),
        "case": getattr(preferred.tag, "case", None) if preferred is not None else None,
        "pos": getattr(preferred.tag, "POS", None) if preferred is not None else None,
        "frequency": base.frequency(value),
        "parseCount": len(parses),
    }


def choose_surface_russian_name(primary: str, alternates: str) -> str | None:
    values = raw_cyrillic_candidates(primary, alternates)
    if not values:
        return None
    records = [parse_record(value) for value in values]
    lengths = sorted(len(record["answer"]) for record in records)
    median_length = lengths[len(lengths) // 2]
    primary_answer = base.normalize(primary) if base.CYRILLIC_RE.fullmatch(primary or "") else None

    for record in records:
        support = 0.0
        for other in records:
            if other["answer"] == record["answer"]:
                support += 3.0
            elif other["lemma"] == record["answer"]:
                support += 4.0
            elif record["lemma"] == other["answer"]:
                support += 1.5
            elif record["answer"][:1] == other["answer"][:1]:
                distance = levenshtein(record["answer"], other["answer"])
                if distance == 1:
                    support += 2.5
                elif distance == 2 and max(len(record["answer"]), len(other["answer"])) >= 6:
                    support += 1.0
        record["support"] = support
        record["score"] = (
            support * 5
            + min(record["frequency"], 4.2) * 4
            + (12 if record["geox"] else 0)
            + (8 if record["case"] in {None, "nomn"} else -8)
            + (10 if primary_answer == record["answer"] else 0)
            - abs(len(record["answer"]) - median_length) * 2
            - (14 if record["frequency"] >= 4.8 and not record["geox"] else 0)
            - (30 if re.search(r"Ъ|[ЬЪ]{2}|ЙЙ|ЫЫ", record["answer"]) else 0)
        )

    selected = max(records, key=lambda record: (record["score"], record["support"], len(record["answer"]), record["answer"]))
    return selected["value"]


# The imported v5 loaders resolve this symbol through their module globals.
v5.choose_canonical_russian_name = choose_surface_russian_name


def location_fields(label: str, country: str, region: str | None = None) -> list[str]:
    fields = [label, f"страна: {country}"]
    if region:
        fields.append(f"регион: {region}")
    return fields


def descriptive_city_clue(country: str, population: int, capital: bool, region: str | None) -> str:
    fields = location_fields("Столица" if capital else "Город", country, None if capital else region)
    fields.append(v3.population_phrase(population))
    return "; ".join(fields)


v5.descriptive_city_clue = descriptive_city_clue


def entity_clue(
    label: str,
    country: str,
    region: str | None,
    elevation: int,
    answer: str,
) -> tuple[str, bool]:
    fields = location_fields(label, country, region if region and base.normalize(region) != answer else None)
    if elevation > 250 and label in {"Гора", "Горная вершина", "Вулкан", "Горный хребет"}:
        rounded = max(100, round(elevation / 100) * 100)
        fields.append(f"высота: около {rounded} м")
    return "; ".join(fields), len(fields) > 2


v5.entity_clue = entity_clue


def load_countries_v6(country_info_path: Path, existing: set[str]) -> list[dict]:
    territories = base.russian_territories()
    entries: list[dict] = []
    for line in country_info_path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        fields = line.split("\t")
        if len(fields) < 17:
            continue
        iso = fields[0]
        try:
            area = float(fields[6] or 0)
        except ValueError:
            area = 0
        try:
            population = int(fields[7] or 0)
        except ValueError:
            population = 0
        continent = fields[8]
        geoname_id = fields[16]
        name = territories.get(iso)
        if not name or not base.valid_answer(name, 3, 12):
            continue
        answer = base.normalize(name)
        if answer in existing:
            continue
        continent_name = base.CONTINENT_LOCATIVE.get(continent, "мире")
        facts = ["Государство", f"часть света: {continent_name}"]
        if area > 0:
            facts.append(v3.area_phrase(area))
        elif population > 0:
            facts.append(v3.population_phrase(population))
        entry = Entry(
            answer=answer,
            clue="; ".join(facts),
            category="country",
            lexicalQuality=min(90, 78 + int(math.log10(max(population, 1)))),
            lexicalSource="geonames-country-info",
            license="CC BY 4.0 GeoNames",
            sourceId=geoname_id or iso,
            frequency=None,
        )
        entries.append(v3.attach(
            entry,
            clueKind="descriptive-template",
            genericTemplate=False,
            generatedTemplate=True,
            clueFacts={"iso": iso, "continent": continent, "population": population, "areaKm2": area},
        ))
    return sorted(entries, key=lambda entry: (-entry["lexicalQuality"], entry["answer"]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ruwordnet-db", type=Path, required=True)
    parser.add_argument("--geonames-cities-zip", type=Path, required=True)
    parser.add_argument("--geonames-features-zip", type=Path, required=True)
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

    admin1_names = v5.load_admin1_names(args.geonames_features_zip)
    existing: set[str] = set()

    common = v3.decorate_base(base.load_ruwordnet(args.ruwordnet_db, args.common, existing), "definition", False, False)
    existing.update(entry["answer"] for entry in common)

    names = v3.decorate_base(base.load_names(args.names, existing), "generic-template", True, True)
    existing.update(entry["answer"] for entry in names)

    geography = v5.load_geography_v5(args.geonames_cities_zip, args.geography, existing, admin1_names)
    existing.update(entry["answer"] for entry in geography)

    countries = load_countries_v6(args.country_info, existing)
    existing.update(entry["answer"] for entry in countries)

    entities = v5.load_geographic_entities_v5(args.geonames_features_zip, args.entities, existing, admin1_names)
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
        "version": 6,
        "generatedBy": "tools/build-bulk-lexicon-v6.py",
        "sources": {
            "ruwordnet": {
                "url": "https://github.com/avidale/python-ruwordnet/releases/download/0.0.4/ruwordnet-2021.db",
                "role": "single-word noun senses and definitions",
            },
            "geonames-cities": {
                "url": "https://download.geonames.org/export/dump/cities15000.zip",
                "license": "CC BY 4.0",
                "role": "surface-form-clustered cities and capitals with population and region facts",
            },
            "geonames-features": {
                "url": "https://download.geonames.org/export/dump/allCountries.zip",
                "license": "CC BY 4.0",
                "role": "high-confidence natural and first-level administrative entities",
            },
            "geonames-countries": {
                "url": "https://download.geonames.org/export/dump/countryInfo.txt",
                "license": "CC BY 4.0",
                "role": "countries with continent, population and area facts",
            },
            "wordfreq+pymorphy3": {
                "role": "surface-name clustering, homograph control and frequency ranking",
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
        "editorialDebt": {
            "genericTemplateEntries": total["genericTemplateEntries"],
            "genericTemplatePercent": round(total["genericTemplateEntries"] / max(1, total["entries"]) * 100, 2),
            "generatedTemplateEntries": total["generatedTemplateEntries"],
            "generatedTemplatePercent": round(total["generatedTemplateEntries"] / max(1, total["entries"]) * 100, 2),
        },
        "admission": {
            "maximumEntityFrequency": v5.MAX_ENTITY_FREQUENCY,
            "usesSurfaceAlternateClusters": True,
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
