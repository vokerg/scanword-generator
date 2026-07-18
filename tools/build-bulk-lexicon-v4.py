#!/usr/bin/env python3
"""Vocabulary-first 1.1 corpus builder, editorial pass 2.

This pass keeps the v3 factual-clue architecture but adds:
- Russian-name selection by morphology/frequency instead of shortest spelling;
- grammatical country inflection in generated clues;
- homograph/function-word rejection for geographic entities;
- category quotas so rivers and US districts cannot dominate the expansion;
- first-level region context when GeoNames provides it.
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
SPEC = importlib.util.spec_from_file_location("scanword_bulk_v3", HERE / "build-bulk-lexicon-v3.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load build-bulk-lexicon-v3.py")
v3 = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = v3
SPEC.loader.exec_module(v3)
base = v3.base
Entry = v3.Entry

MORPH = base.pymorphy3.MorphAnalyzer() if base.pymorphy3 is not None else None
TOKEN_RE = re.compile(r"[А-ЯЁа-яё]+|[^А-ЯЁа-яё]+")
BAD_POS = {"PREP", "CONJ", "PRCL", "NPRO", "VERB", "INFN", "GRND", "ADVB", "PRED", "NUMR"}
FEATURES = {
    code: value
    for code, value in v3.FEATURES.items()
    if code != "ADM2"
}
CATEGORY_SHARES = {
    "river": 0.30,
    "region": 0.16,
    "mountain": 0.12,
    "peak": 0.08,
    "mountain-range": 0.06,
    "island": 0.06,
    "lake": 0.05,
    "volcano": 0.035,
    "sea": 0.025,
    "bay": 0.025,
    "glacier": 0.02,
    "valley": 0.02,
    "plateau": 0.015,
    "hill": 0.015,
    "islands": 0.01,
    "peaks": 0.01,
    "hills": 0.01,
    "water-body": 0.01,
}


def parses(value: str):
    if MORPH is None:
        return []
    try:
        return MORPH.parse(value.lower())
    except Exception:
        return []


def has_tag(value: str, marker: str) -> bool:
    return any(marker in parse.tag for parse in parses(value))


def best_pos(value: str) -> str | None:
    values = parses(value)
    return getattr(values[0].tag, "POS", None) if values else None


def choose_russian_name(primary: str, alternates: str) -> str | None:
    values = []
    seen = set()
    for raw in [primary, *(alternates or "").split(",")]:
        value = raw.strip()
        normalized = base.normalize(value)
        if normalized in seen or not base.valid_answer(value, 3, 12):
            continue
        seen.add(normalized)
        values.append(value)
    if not values:
        return None

    def score(value: str):
        freq = base.frequency(value)
        geox = has_tag(value, "Geox")
        name = has_tag(value, "Name")
        primary_bonus = 2 if value == primary and base.CYRILLIC_RE.fullmatch(primary or "") else 0
        hard_sign_penalty = value.upper().count("Ъ") * 10
        unusual_penalty = 4 if re.search(r"[ЬЪ]{2}|ЙЙ|ЫЫ", value.upper()) else 0
        return (
            freq * 12
            + (18 if geox else 0)
            + (3 if name else 0)
            + primary_bonus
            - hard_sign_penalty
            - unusual_penalty
            - abs(len(base.normalize(value)) - 7) * 0.12
        )

    return max(values, key=lambda value: (score(value), -len(value), value))


def inflect_phrase(value: str, grammeme: str) -> str:
    if MORPH is None:
        return value
    output = []
    for token in TOKEN_RE.findall(value):
        if not base.CYRILLIC_RE.fullmatch(token):
            output.append(token)
            continue
        candidates = parses(token)
        if not candidates:
            output.append(token)
            continue
        preferred = max(
            candidates,
            key=lambda parse: (
                1 if "Geox" in parse.tag else 0,
                1 if getattr(parse.tag, "POS", None) in {"NOUN", "ADJF"} else 0,
                parse.score,
            ),
        )
        inflected = preferred.inflect({grammeme})
        output.append(inflected.word if inflected else token)
    text = "".join(output)
    return text[:1].upper() + text[1:]


def country_locative(country: str) -> str:
    return inflect_phrase(country, "loct")


def country_genitive(country: str) -> str:
    return inflect_phrase(country, "gent")


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
                chosen = choose_russian_name(fields[1], fields[3])
                if not chosen:
                    continue
                score = base.frequency(chosen) + (2 if has_tag(chosen, "Geox") else 0)
                key = (country_code, admin1_code)
                current = names.get(key)
                if current is None or score > current[0]:
                    names[key] = (score, chosen)
    return {key: value for key, (_, value) in names.items()}


def descriptive_city_clue(country: str, population: int, capital: bool, region: str | None) -> str:
    if capital:
        subject = f"Столица {country_genitive(country)}"
    else:
        subject = f"Город в {country_locative(country)}"
    facts = [subject, v3.population_phrase(population)]
    if region and not capital:
        facts.append(f"регион: {region}")
    return ", ".join(facts)


def load_geography_v4(
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
                chosen = choose_russian_name(name, alternates)
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
                score = math.log10(max(population, 1)) * 20 + (24 if capital else 0)
                if has_tag(chosen, "Geox"):
                    score += 8
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
                    },
                )
                current = candidates.get(answer)
                if current is None or score > current[0]:
                    candidates[answer] = (score, payload)
    return [entry for _, entry in sorted(candidates.values(), key=lambda item: (-item[0], item[1]["answer"]))[:target]]


def admissible_entity(answer: str, feature_code: str, frequency: float, population: int) -> bool:
    geox = has_tag(answer, "Geox")
    pos = best_pos(answer)
    if "Ъ" in answer or re.search(r"[ЬЪ]{2}|ЙЙ|ЫЫ", answer):
        return False
    if pos in BAD_POS and not geox:
        return False
    if len(answer) == 3 and frequency == 0 and not geox:
        return False
    if frequency > 4.0 and not geox:
        return False
    if feature_code in {"STM", "STMI", "STMS"} and frequency > 3.5 and not geox:
        return False
    if feature_code == "ADM1" and population < 50_000 and not geox:
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
    descriptive = len(facts) > 1
    return ", ".join(facts), descriptive


def load_geographic_entities_v4(
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
                chosen = choose_russian_name(name, alternates)
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
                if not admissible_entity(answer, feature_code, freq, population):
                    continue
                region = admin1_names.get((country_code, admin1_code))
                clue, descriptive = entity_clue(label, country, region, elevation, answer)
                geox = has_tag(chosen, "Geox")
                importance = (
                    base_quality
                    + min(freq, 4.0) * 5
                    + (18 if geox else 0)
                    + math.log10(max(population, 1)) * 4
                    - abs(len(answer) - 6) * 0.5
                )
                if feature_code in {"MT", "MTS", "PK", "PKS", "VLC"}:
                    importance += min(14, math.log10(max(elevation, 1)) * 3)
                if region:
                    importance += 2
                entry = Entry(
                    answer=answer,
                    clue=clue,
                    category=category,
                    lexicalQuality=max(
                        56,
                        min(90, int(round(base_quality + (min(freq, 4.0) - 2.0) * 4 + (4 if geox else 0)))),
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
        quota = min(len(values), max(4, round(target * share)))
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
    parser.add_argument("--entities", type=int, default=3000)
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

    geography = load_geography_v4(args.geonames_cities_zip, args.geography, existing, admin1_names)
    existing.update(entry["answer"] for entry in geography)

    countries = v3.load_countries_v3(args.country_info, existing)
    existing.update(entry["answer"] for entry in countries)

    entities = load_geographic_entities_v4(args.geonames_features_zip, args.entities, existing, admin1_names)
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
        "version": 4,
        "generatedBy": "tools/build-bulk-lexicon-v4.py",
        "sources": {
            "ruwordnet": {
                "url": "https://github.com/avidale/python-ruwordnet/releases/download/0.0.4/ruwordnet-2021.db",
                "role": "single-word noun senses and definitions",
            },
            "geonames-cities": {
                "url": "https://download.geonames.org/export/dump/cities15000.zip",
                "license": "CC BY 4.0",
                "role": "cities and capitals with population and region context",
            },
            "geonames-features": {
                "url": "https://download.geonames.org/export/dump/allCountries.zip",
                "license": "CC BY 4.0",
                "role": "morphology-filtered natural and first-level administrative entities",
            },
            "geonames-countries": {
                "url": "https://download.geonames.org/export/dump/countryInfo.txt",
                "license": "CC BY 4.0",
                "role": "country metadata, continent, population and area",
            },
            "wordfreq+pymorphy3": {
                "role": "Russian-name selection, homograph rejection, inflection and frequency ranking",
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
