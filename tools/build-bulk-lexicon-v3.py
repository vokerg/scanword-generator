#!/usr/bin/env python3
"""Build the vocabulary-first 1.1 corpus.

This script deliberately imports the accepted 1.0 builder and extends it with:
- sourced, descriptive geography clues;
- explicit clue-kind metadata;
- bounded natural and administrative GeoNames entities;
- manifest metrics that distinguish generic templates from factual templates.
"""
from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import math
import sys
import zipfile
from dataclasses import asdict
from pathlib import Path
from typing import Iterable

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("scanword_bulk_v2", HERE / "build-bulk-lexicon.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load build-bulk-lexicon.py")
base = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = base
SPEC.loader.exec_module(base)

Entry = base.Entry

FEATURES = {
    "STM": ("river", "Река", 76),
    "STMI": ("river", "Река", 74),
    "STMS": ("river", "Речная система", 72),
    "LK": ("lake", "Озеро", 76),
    "LKS": ("lake", "Группа озёр", 72),
    "SEA": ("sea", "Море", 82),
    "BAY": ("bay", "Залив", 76),
    "GLCR": ("glacier", "Ледник", 72),
    "WTRH": ("water-body", "Водоём", 68),
    "MT": ("mountain", "Гора", 78),
    "MTS": ("mountain-range", "Горный хребет", 80),
    "PK": ("peak", "Горная вершина", 78),
    "PKS": ("peaks", "Группа горных вершин", 74),
    "HLL": ("hill", "Холм", 68),
    "HLLS": ("hills", "Группа холмов", 66),
    "VLC": ("volcano", "Вулкан", 80),
    "VAL": ("valley", "Долина", 70),
    "PLAT": ("plateau", "Плато", 72),
    "ISL": ("island", "Остров", 76),
    "ISLS": ("islands", "Группа островов", 72),
    "ADM1": ("region", "Регион", 74),
    "ADM2": ("district", "Административный район", 68),
}


def attach(entry: Entry, **extra):
    payload = asdict(entry)
    if entry.frequency is None:
        payload.pop("frequency", None)
    payload.update(extra)
    return payload


def population_phrase(population: int) -> str:
    if population >= 10_000_000:
        return f"около {round(population / 1_000_000):d} млн жителей"
    if population >= 1_000_000:
        value = round(population / 100_000) / 10
        return f"около {str(value).replace('.', ',')} млн жителей"
    if population >= 100_000:
        return f"около {round(population / 10_000) * 10:d} тыс. жителей"
    return f"около {max(15, round(population / 1_000)):d} тыс. жителей"


def area_phrase(area: float) -> str:
    if area >= 1_000_000:
        value = round(area / 100_000) / 10
        return f"площадь около {str(value).replace('.', ',')} млн км²"
    if area >= 10_000:
        return f"площадь около {round(area / 1_000):d} тыс. км²"
    return f"площадь около {max(1, round(area / 100) * 100):d} км²"


def descriptive_city_clue(country: str, population: int, capital: bool) -> str:
    subject = f"Столица государства {country}" if capital else f"Город в {country}"
    return f"{subject}, {population_phrase(population)}"


def load_geography_v3(zip_path: Path, target: int, existing: set[str]) -> list[dict]:
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
                feature_code, country_code = fields[7], fields[8]
                try:
                    population = int(fields[14] or 0)
                except ValueError:
                    population = 0
                chosen = base.choose_cyrillic_name(name, alternates)
                if not chosen:
                    continue
                answer = base.normalize(chosen)
                if answer in existing:
                    continue
                country = territories.get(country_code, country_code or "неуказанной стране")
                capital = feature_code == "PPLC"
                entry = Entry(
                    answer=answer,
                    clue=descriptive_city_clue(country, population, capital),
                    category="capital" if capital else "city",
                    lexicalQuality=min(
                        90,
                        (78 if capital else 68 if population >= 100_000 else 62)
                        + int(math.log10(max(population, 1))),
                    ),
                    lexicalSource="geonames-cities15000",
                    license="CC BY 4.0 GeoNames",
                    sourceId=geoname_id,
                    frequency=None,
                )
                score = math.log10(max(population, 1)) * 20 + (20 if capital else 0)
                payload = attach(
                    entry,
                    clueKind="descriptive-template",
                    genericTemplate=False,
                    generatedTemplate=True,
                    clueFacts={"countryCode": country_code, "population": population},
                )
                current = candidates.get(answer)
                if current is None or score > current[0]:
                    candidates[answer] = (score, payload)
    return [entry for _, entry in sorted(candidates.values(), key=lambda item: (-item[0], item[1]["answer"]))[:target]]


def load_countries_v3(country_info_path: Path, existing: set[str]) -> list[dict]:
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
        location = base.CONTINENT_LOCATIVE.get(continent, "мире")
        facts = [f"Государство в {location}"]
        if area > 0:
            facts.append(area_phrase(area))
        elif population > 0:
            facts.append(population_phrase(population))
        entry = Entry(
            answer=answer,
            clue=", ".join(facts),
            category="country",
            lexicalQuality=min(90, 78 + int(math.log10(max(population, 1)))),
            lexicalSource="geonames-country-info",
            license="CC BY 4.0 GeoNames",
            sourceId=geoname_id or iso,
            frequency=None,
        )
        entries.append(attach(
            entry,
            clueKind="descriptive-template",
            genericTemplate=False,
            generatedTemplate=True,
            clueFacts={"iso": iso, "continent": continent, "population": population, "areaKm2": area},
        ))
    return sorted(entries, key=lambda entry: (-entry["lexicalQuality"], entry["answer"]))


def entity_clue(label: str, country: str, elevation: int) -> str:
    clue = f"{label} в {country}"
    if elevation > 250 and label in {"Гора", "Горная вершина", "Вулкан", "Горный хребет"}:
        rounded = max(100, round(elevation / 100) * 100)
        clue += f", высота около {rounded} м"
    return clue


def load_geographic_entities(zip_path: Path, target: int, existing: set[str]) -> list[dict]:
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
                feature_code, country_code = fields[7], fields[8]
                definition = FEATURES.get(feature_code)
                if not definition:
                    continue
                category, label, base_quality = definition
                chosen = base.choose_cyrillic_name(name, alternates)
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
                importance = base_quality + freq * 7 + math.log10(max(population, 1)) * 3
                if feature_code in {"MT", "MTS", "PK", "PKS", "VLC"}:
                    importance += min(12, math.log10(max(elevation, 1)) * 3)
                importance -= abs(len(answer) - 6) * 0.7
                entry = Entry(
                    answer=answer,
                    clue=entity_clue(label, country, elevation),
                    category=category,
                    lexicalQuality=max(54, min(88, int(round(base_quality + (freq - 2.5) * 5)))),
                    lexicalSource="geonames-allcountries",
                    license="CC BY 4.0 GeoNames",
                    sourceId=geoname_id,
                    frequency=round(freq, 3),
                )
                payload = attach(
                    entry,
                    clueKind="descriptive-template" if elevation > 250 else "generic-template",
                    genericTemplate=elevation <= 250,
                    generatedTemplate=True,
                    clueFacts={
                        "countryCode": country_code,
                        "featureCode": feature_code,
                        "elevationM": elevation,
                        "population": population,
                    },
                )
                current = candidates.get(answer)
                if current is None or importance > current[0]:
                    candidates[answer] = (importance, payload)

    ranked = [entry for _, entry in sorted(candidates.values(), key=lambda item: (-item[0], item[1]["answer"]))]
    desired = {3: 0.08, 4: 0.15, 5: 0.20, 6: 0.20, 7: 0.16, 8: 0.10, 9: 0.055, 10: 0.025, 11: 0.007, 12: 0.003}
    selected: list[dict] = []
    deferred: list[dict] = []
    counts = collections.Counter()
    selected_answers: set[str] = set()
    for entry in ranked:
        limit = max(8, math.ceil(target * desired.get(len(entry["answer"]), 0.02) * 1.25))
        if counts[len(entry["answer"])] < limit:
            selected.append(entry)
            selected_answers.add(entry["answer"])
            counts[len(entry["answer"])] += 1
        else:
            deferred.append(entry)
        if len(selected) >= target:
            break
    if len(selected) < target:
        for entry in deferred:
            if entry["answer"] not in selected_answers:
                selected.append(entry)
                selected_answers.add(entry["answer"])
            if len(selected) >= target:
                break
    return selected[:target]


def decorate_base(entries: Iterable[Entry], clue_kind: str, generic: bool, generated: bool) -> list[dict]:
    return [
        attach(
            entry,
            clueKind=clue_kind,
            genericTemplate=generic,
            generatedTemplate=generated,
            clueFacts=None,
        )
        for entry in entries
    ]


def summarize(entries: Iterable[dict]) -> dict:
    entries = list(entries)
    qualities = [int(entry.get("lexicalQuality", 0)) for entry in entries]
    return {
        "entries": len(entries),
        "categories": dict(sorted(collections.Counter(str(entry.get("category", "unknown")) for entry in entries).items())),
        "lengths": {
            str(length): count
            for length, count in sorted(collections.Counter(len(str(entry.get("answer", ""))) for entry in entries).items())
        },
        "clueKinds": dict(sorted(collections.Counter(str(entry.get("clueKind", "unknown")) for entry in entries).items())),
        "genericTemplateEntries": sum(bool(entry.get("genericTemplate")) for entry in entries),
        "generatedTemplateEntries": sum(bool(entry.get("generatedTemplate")) for entry in entries),
        "quality": {
            "min": min(qualities, default=0),
            "max": max(qualities, default=0),
            "average": round(sum(qualities) / max(1, len(qualities)), 2),
        },
    }


def write_chunks(entries: list[dict], output_dir: Path, prefix: str, chunk_size: int) -> list[dict]:
    records = []
    for index in range(0, len(entries), chunk_size):
        chunk = entries[index:index + chunk_size]
        number = index // chunk_size + 1
        filename = f"{prefix}-{number:02d}.js"
        content = (
            "window.ScanwordBulkLexiconV1.register(\n"
            + json.dumps(chunk, ensure_ascii=False, separators=(",", ":"))
            + f",\n  \"{prefix}-{number:02d}\"\n);\n"
        )
        path = output_dir / filename
        path.write_text(content, encoding="utf-8")
        records.append({
            "file": filename,
            "entries": len(chunk),
            "bytes": path.stat().st_size,
            "sha256": base.hashlib.sha256(path.read_bytes()).hexdigest(),
        })
    return records


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

    existing: set[str] = set()
    common_raw = base.load_ruwordnet(args.ruwordnet_db, args.common, existing)
    common = decorate_base(common_raw, "definition", False, False)
    existing.update(entry["answer"] for entry in common)

    names_raw = base.load_names(args.names, existing)
    names = decorate_base(names_raw, "generic-template", True, True)
    existing.update(entry["answer"] for entry in names)

    geography = load_geography_v3(args.geonames_cities_zip, args.geography, existing)
    existing.update(entry["answer"] for entry in geography)

    countries = load_countries_v3(args.country_info, existing)
    existing.update(entry["answer"] for entry in countries)

    entities = load_geographic_entities(args.geonames_features_zip, args.entities, existing)
    existing.update(entry["answer"] for entry in entities)

    files: list[dict] = []
    files += write_chunks(common, args.out_dir, "ruwordnet-common", args.chunk_size)
    files += write_chunks(names, args.out_dir, "proper-names", args.chunk_size)
    files += write_chunks(geography, args.out_dir, "geography", args.chunk_size)
    files += write_chunks(countries, args.out_dir, "countries", args.chunk_size)
    files += write_chunks(entities, args.out_dir, "geographic-entities", args.chunk_size)
    loader = base.write_loader(files, args.out_dir)

    all_entries = [*common, *names, *geography, *countries, *entities]
    total = summarize(all_entries)
    manifest = {
        "version": 3,
        "generatedBy": "tools/build-bulk-lexicon-v3.py",
        "sources": {
            "ruwordnet": {
                "url": "https://github.com/avidale/python-ruwordnet/releases/download/0.0.4/ruwordnet-2021.db",
                "role": "single-word noun senses and definitions",
            },
            "geonames-cities": {
                "url": "https://download.geonames.org/export/dump/cities15000.zip",
                "license": "CC BY 4.0",
                "role": "cities and capitals with sourced population descriptors",
            },
            "geonames-features": {
                "url": "https://download.geonames.org/export/dump/allCountries.zip",
                "license": "CC BY 4.0",
                "role": "bounded natural and administrative entities",
            },
            "geonames-countries": {
                "url": "https://download.geonames.org/export/dump/countryInfo.txt",
                "license": "CC BY 4.0",
                "role": "country metadata, continent, population and area",
            },
            "wordfreq+pymorphy3": {
                "role": "frequency ranking and proper-name morphology",
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
            "common": summarize(common),
            "names": summarize(names),
            "geography": summarize(geography),
            "countries": summarize(countries),
            "entities": summarize(entities),
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
    manifest_path = args.out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
