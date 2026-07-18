#!/usr/bin/env python3
"""Vocabulary-first 1.1 corpus builder, high-confidence geography pass.

The v4 experiment proved that morphology alone cannot distinguish a geographic
homograph from an ordinary Russian word. This pass tightens admission by:
- canonicalizing every selected proper name to a nominative lemma;
- preserving capitalization while inflecting generated clue text;
- ranking GeoNames entities by alternate-name evidence;
- rejecting high-frequency homographs even when one parse carries `Geox`;
- requiring feature-specific evidence for rivers, mountains, lakes and islands;
- reducing the entity target to a smaller high-confidence expansion.
"""
from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import math
import re
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("scanword_bulk_v4", HERE / "build-bulk-lexicon-v4.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load build-bulk-lexicon-v4.py")
v4 = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = v4
SPEC.loader.exec_module(v4)
v3 = v4.v3
base = v4.base
Entry = v4.Entry
MORPH = v4.MORPH

MAX_ENTITY_FREQUENCY = 4.05
FEATURES = v4.FEATURES
CATEGORY_SHARES = {
    "region": 0.28,
    "river": 0.22,
    "mountain": 0.12,
    "peak": 0.08,
    "mountain-range": 0.07,
    "island": 0.06,
    "lake": 0.05,
    "bay": 0.025,
    "sea": 0.015,
    "volcano": 0.025,
    "valley": 0.025,
    "plateau": 0.02,
    "hill": 0.015,
    "islands": 0.015,
    "peaks": 0.01,
    "hills": 0.01,
    "glacier": 0.01,
    "water-body": 0.005,
}


def candidate_parses(value: str):
    if MORPH is None:
        return []
    try:
        return MORPH.parse(value.lower())
    except Exception:
        return []


def preferred_parse(value: str):
    values = candidate_parses(value)
    if not values:
        return None
    return max(
        values,
        key=lambda parse: (
            1 if "Geox" in parse.tag else 0,
            1 if getattr(parse.tag, "case", None) == "nomn" else 0,
            1 if getattr(parse.tag, "POS", None) in {"NOUN", "ADJF"} else 0,
            parse.score,
        ),
    )


def canonical_name(value: str) -> str | None:
    parse = preferred_parse(value)
    candidate = parse.normal_form if parse is not None else value
    if not base.valid_answer(candidate, 3, 12):
        return None
    return candidate[:1].upper() + candidate[1:].lower()


def alternate_values(primary: str, alternates: str) -> list[str]:
    values: list[str] = []
    seen: set[str] = set()
    for raw in [primary, *(alternates or "").split(",")]:
        value = raw.strip()
        if not base.valid_answer(value, 3, 12):
            continue
        canonical = canonical_name(value)
        if not canonical:
            continue
        normalized = base.normalize(canonical)
        if normalized in seen:
            continue
        seen.add(normalized)
        values.append(canonical)
    return values


def choose_canonical_russian_name(primary: str, alternates: str) -> str | None:
    values = alternate_values(primary, alternates)
    if not values:
        return None

    def score(value: str) -> tuple[float, int, str]:
        parse = preferred_parse(value)
        freq = base.frequency(value)
        geox = bool(parse is not None and "Geox" in parse.tag)
        nominative = bool(parse is not None and getattr(parse.tag, "case", None) == "nomn")
        primary_bonus = 3 if base.normalize(value) == base.normalize(primary) else 0
        unusual_penalty = 20 if re.search(r"Ъ|[ЬЪ]{2}|ЙЙ|ЫЫ", value.upper()) else 0
        lexical_penalty = 8 if freq == 0 else 0
        numeric_score = (
            freq * 10
            + (20 if geox else 0)
            + (4 if nominative else 0)
            + primary_bonus
            - unusual_penalty
            - lexical_penalty
        )
        return numeric_score, -len(value), value

    return max(values, key=score)


def preserve_case(source: str, inflected: str) -> str:
    if source.isupper():
        return inflected.upper()
    if source[:1].isupper():
        return inflected[:1].upper() + inflected[1:]
    return inflected


def inflect_phrase(value: str, grammeme: str) -> str:
    if MORPH is None:
        return value
    output: list[str] = []
    for token in v4.TOKEN_RE.findall(value):
        if not base.CYRILLIC_RE.fullmatch(token):
            output.append(token)
            continue
        parse = preferred_parse(token)
        if parse is None:
            output.append(token)
            continue
        inflected = parse.inflect({grammeme})
        output.append(preserve_case(token, inflected.word) if inflected else token)
    return "".join(output)


def country_locative(country: str) -> str:
    return inflect_phrase(country, "loct")


def country_genitive(country: str) -> str:
    return inflect_phrase(country, "gent")


def alternate_evidence(primary: str, alternates: str) -> int:
    raw_values = [primary, *(alternates or "").split(",")]
    normalized = {
        base.normalize(value)
        for value in raw_values
        if value.strip() and len(value.strip()) <= 40
    }
    return len(normalized)


def load_admin1_names(zip_path: Path) -> dict[tuple[str, str], str]:
    names: dict[tuple[str, str], tuple[float, str]] = {}
    with zipfile.ZipFile(zip_path) as archive:
        txt_name = next(name for name in archive.namelist() if name.endswith(".txt"))
        with archive.open(txt_name) as stream:
            for raw in stream:
                fields = raw.decode("utf-8", errors="ignore").rstrip("\n").split("\t")
                if len(fields) < 19 or fields[7] != "ADM1":
                    continue
                country_code, admin1_code = fields[8], fields[10]
                if not country_code or not admin1_code:
                    continue
                chosen = choose_canonical_russian_name(fields[1], fields[3])
                if not chosen:
                    continue
                evidence = alternate_evidence(fields[1], fields[3])
                score = base.frequency(chosen) * 5 + evidence + (4 if v4.has_tag(chosen, "Geox") else 0)
                key = (country_code, admin1_code)
                current = names.get(key)
                if current is None or score > current[0]:
                    names[key] = (score, chosen)
    return {key: value for key, (_, value) in names.items()}


def descriptive_city_clue(country: str, population: int, capital: bool, region: str | None) -> str:
    subject = f"Столица {country_genitive(country)}" if capital else f"Город в {country_locative(country)}"
    facts = [subject, v3.population_phrase(population)]
    if region and not capital:
        facts.append(f"регион: {region}")
    return ", ".join(facts)


def load_geography_v5(
    zip_path: Path,
    target: int,
    existing: set[str],
    admin1_names: dict[tuple[str, str], str],
) -> list[dict]:
    territories = base.russian_territories()
    candidates: dict[str, tuple[float, dict]] = {}
    with zipfile.ZipFile(zip_path) as archive:
        txt_name = next(name for name in archive.namelist() if name.endswith(".txt"))
        with archive.open(txt_name) as stream:
            for raw in stream:
                fields = raw.decode("utf-8", errors="ignore").rstrip("\n").split("\t")
                if len(fields) < 15:
                    continue
                geoname_id, name, alternates = fields[0], fields[1], fields[3]
                feature_code, country_code, admin1_code = fields[7], fields[8], fields[10]
                try:
                    population = int(fields[14] or 0)
                except ValueError:
                    population = 0
                chosen = choose_canonical_russian_name(name, alternates)
                if not chosen:
                    continue
                answer = base.normalize(chosen)
                if answer in existing:
                    continue
                country = territories.get(country_code)
                if not country:
                    continue
                capital = feature_code == "PPLC"
                region = admin1_names.get((country_code, admin1_code))
                evidence = alternate_evidence(name, alternates)
                entry = Entry(
                    answer=answer,
                    clue=descriptive_city_clue(country, population, capital, region),
                    category="capital" if capital else "city",
                    lexicalQuality=min(
                        92,
                        (80 if capital else 70 if population >= 100_000 else 64)
                        + int(math.log10(max(population, 1))),
                    ),
                    lexicalSource="geonames-cities15000",
                    license="CC BY 4.0 GeoNames",
                    sourceId=geoname_id,
                    frequency=None,
                )
                score = math.log10(max(population, 1)) * 20 + (24 if capital else 0) + min(20, evidence)
                payload = v3.attach(
                    entry,
                    clueKind="descriptive-template",
                    genericTemplate=False,
                    generatedTemplate=True,
                    clueFacts={
                        "countryCode": country_code,
                        "admin1Code": admin1_code,
                        "region": region,
                        "population": population,
                        "alternateNameCount": evidence,
                    },
                )
                current = candidates.get(answer)
                if current is None or score > current[0]:
                    candidates[answer] = (score, payload)
    return [entry for _, entry in sorted(candidates.values(), key=lambda item: (-item[0], item[1]["answer"]))[:target]]


def feature_evidence_required(feature_code: str, answer: str, elevation: int) -> int:
    if feature_code in {"STM", "STMI", "STMS"}:
        return 5 if len(answer) <= 4 else 3
    if feature_code == "ADM1":
        return 2
    if feature_code in {"MT", "PK", "VLC"}:
        return 2 if elevation < 1000 else 1
    if feature_code in {"MTS", "PKS", "ISL", "ISLS", "LK", "LKS", "SEA", "BAY"}:
        return 2
    return 2


def admissible_entity(
    answer: str,
    feature_code: str,
    frequency: float,
    population: int,
    elevation: int,
    evidence: int,
) -> bool:
    parse = preferred_parse(answer)
    pos = getattr(parse.tag, "POS", None) if parse is not None else None
    geox = bool(parse is not None and "Geox" in parse.tag)
    if "Ъ" in answer or re.search(r"[ЬЪ]{2}|ЙЙ|ЫЫ", answer):
        return False
    if frequency > MAX_ENTITY_FREQUENCY:
        return False
    if pos in v4.BAD_POS and not geox:
        return False
    if len(answer) == 3 and evidence < 5:
        return False
    if evidence < feature_evidence_required(feature_code, answer, elevation):
        return False
    if feature_code == "ADM1" and population < 50_000 and not geox:
        return False
    if feature_code in {"MT", "PK", "VLC"} and elevation < 250 and evidence < 5:
        return False
    return True


def entity_clue(
    label: str,
    country: str,
    region: str | None,
    elevation: int,
    answer: str,
) -> tuple[str, bool]:
    facts = [f"{label} в {country_locative(country)}"]
    if region and base.normalize(region) != answer:
        facts.append(f"регион: {region}")
    if elevation > 250 and label in {"Гора", "Горная вершина", "Вулкан", "Горный хребет"}:
        rounded = max(100, round(elevation / 100) * 100)
        facts.append(f"высота около {rounded} м")
    return ", ".join(facts), len(facts) > 1


def load_geographic_entities_v5(
    zip_path: Path,
    target: int,
    existing: set[str],
    admin1_names: dict[tuple[str, str], str],
) -> list[dict]:
    territories = base.russian_territories()
    candidates: dict[str, tuple[float, dict]] = {}
    with zipfile.ZipFile(zip_path) as archive:
        txt_name = next(name for name in archive.namelist() if name.endswith(".txt"))
        with archive.open(txt_name) as stream:
            for raw in stream:
                fields = raw.decode("utf-8", errors="ignore").rstrip("\n").split("\t")
                if len(fields) < 19:
                    continue
                geoname_id, name, alternates = fields[0], fields[1], fields[3]
                feature_code, country_code, admin1_code = fields[7], fields[8], fields[10]
                definition = FEATURES.get(feature_code)
                if not definition:
                    continue
                category, label, base_quality = definition
                chosen = choose_canonical_russian_name(name, alternates)
                if not chosen:
                    continue
                answer = base.normalize(chosen)
                if answer in existing:
                    continue
                country = territories.get(country_code)
                if not country:
                    continue
                try:
                    population = int(fields[14] or 0)
                except ValueError:
                    population = 0
                try:
                    elevation = int(fields[15] or fields[16] or 0)
                except ValueError:
                    elevation = 0
                freq = base.frequency(chosen)
                evidence = alternate_evidence(name, alternates)
                if not admissible_entity(answer, feature_code, freq, population, elevation, evidence):
                    continue
                region = admin1_names.get((country_code, admin1_code))
                clue, descriptive = entity_clue(label, country, region, elevation, answer)
                parse = preferred_parse(chosen)
                geox = bool(parse is not None and "Geox" in parse.tag)
                importance = (
                    base_quality
                    + min(freq, MAX_ENTITY_FREQUENCY) * 5
                    + min(36, evidence * 2.5)
                    + (8 if geox else 0)
                    + math.log10(max(population, 1)) * 4
                    - abs(len(answer) - 6) * 0.5
                )
                if feature_code in {"MT", "MTS", "PK", "PKS", "VLC"}:
                    importance += min(14, math.log10(max(elevation, 1)) * 3)
                entry = Entry(
                    answer=answer,
                    clue=clue,
                    category=category,
                    lexicalQuality=max(
                        58,
                        min(90, int(round(base_quality + min(evidence, 8) + (3 if geox else 0)))),
                    ),
                    lexicalSource="geonames-allcountries",
                    license="CC BY 4.0 GeoNames",
                    sourceId=geoname_id,
                    frequency=round(freq, 3),
                )
                payload = v3.attach(
                    entry,
                    clueKind="descriptive-template" if descriptive else "generic-template",
                    genericTemplate=not descriptive,
                    generatedTemplate=True,
                    clueFacts={
                        "countryCode": country_code,
                        "admin1Code": admin1_code,
                        "region": region,
                        "featureCode": feature_code,
                        "elevationM": elevation,
                        "population": population,
                        "alternateNameCount": evidence,
                        "morphologyGeox": geox,
                    },
                )
                current = candidates.get(answer)
                if current is None or importance > current[0]:
                    candidates[answer] = (importance, payload)

    by_category: dict[str, list[tuple[float, dict]]] = collections.defaultdict(list)
    for score, entry in candidates.values():
        by_category[entry["category"]].append((score, entry))
    for values in by_category.values():
        values.sort(key=lambda item: (-item[0], item[1]["answer"]))

    selected: list[dict] = []
    selected_answers: set[str] = set()
    for category, share in CATEGORY_SHARES.items():
        values = by_category.get(category, [])
        quota = min(len(values), max(3, round(target * share)))
        for _, entry in values[:quota]:
            if entry["answer"] not in selected_answers:
                selected.append(entry)
                selected_answers.add(entry["answer"])

    if len(selected) < target:
        remainder = sorted(
            (
                (score, entry)
                for values in by_category.values()
                for score, entry in values
                if entry["answer"] not in selected_answers
            ),
            key=lambda item: (-item[0], item[1]["answer"]),
        )
        for _, entry in remainder:
            selected.append(entry)
            selected_answers.add(entry["answer"])
            if len(selected) >= target:
                break

    return selected[:target]


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

    admin1_names = load_admin1_names(args.geonames_features_zip)
    existing: set[str] = set()

    common = v3.decorate_base(base.load_ruwordnet(args.ruwordnet_db, args.common, existing), "definition", False, False)
    existing.update(entry["answer"] for entry in common)

    names = v3.decorate_base(base.load_names(args.names, existing), "generic-template", True, True)
    existing.update(entry["answer"] for entry in names)

    geography = load_geography_v5(args.geonames_cities_zip, args.geography, existing, admin1_names)
    existing.update(entry["answer"] for entry in geography)

    countries = v3.load_countries_v3(args.country_info, existing)
    existing.update(entry["answer"] for entry in countries)

    entities = load_geographic_entities_v5(args.geonames_features_zip, args.entities, existing, admin1_names)
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
        "version": 5,
        "generatedBy": "tools/build-bulk-lexicon-v5.py",
        "sources": {
            "ruwordnet": {
                "url": "https://github.com/avidale/python-ruwordnet/releases/download/0.0.4/ruwordnet-2021.db",
                "role": "single-word noun senses and definitions",
            },
            "geonames-cities": {
                "url": "https://download.geonames.org/export/dump/cities15000.zip",
                "license": "CC BY 4.0",
                "role": "canonicalized cities and capitals with population and region context",
            },
            "geonames-features": {
                "url": "https://download.geonames.org/export/dump/allCountries.zip",
                "license": "CC BY 4.0",
                "role": "high-confidence natural and first-level administrative entities",
            },
            "geonames-countries": {
                "url": "https://download.geonames.org/export/dump/countryInfo.txt",
                "license": "CC BY 4.0",
                "role": "country metadata, continent, population and area",
            },
            "wordfreq+pymorphy3": {
                "role": "canonicalization, inflection, homograph control and frequency ranking",
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
            "maximumEntityFrequency": MAX_ENTITY_FREQUENCY,
            "usesCanonicalNominativeLemma": True,
            "usesAlternateNameEvidence": True,
            "featureSpecificEvidenceThresholds": True,
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
