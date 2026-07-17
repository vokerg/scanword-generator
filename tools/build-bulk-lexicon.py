#!/usr/bin/env python3
"""Build a reproducible, categorized Russian scanword lexicon.

Inputs:
- RuWordNet 2.0 SQLite database
- GeoNames cities15000.zip and countryInfo.txt
- wordfreq + pymorphy3 for frequency ranking and proper-name discovery

Outputs are browser-loadable JS chunks, a generated loader, and a manifest/report.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
import re
import sqlite3
import statistics
import zipfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable

CYRILLIC_RE = re.compile(r"^[А-ЯЁа-яё]+$")
SPACE_RE = re.compile(r"\s+")
MARKUP_RE = re.compile(r"(?:https?://\S+|\[[^\]]*\]|\{[^}]*\}|<[^>]*>)")
BAD_CLUE_RE = re.compile(r"(?:см\.|то же, что|вариант написания|форма слова)", re.I)
CONTINENT_LOCATIVE = {
    "AF": "Африке",
    "AN": "Антарктиде",
    "AS": "Азии",
    "EU": "Европе",
    "NA": "Северной Америке",
    "OC": "Океании",
    "SA": "Южной Америке",
}

try:
    from wordfreq import zipf_frequency, top_n_list
except Exception:
    zipf_frequency = None
    top_n_list = None

try:
    import pymorphy3
except Exception:
    pymorphy3 = None

try:
    from babel import Locale
except Exception:
    Locale = None


@dataclass(frozen=True)
class Entry:
    answer: str
    clue: str
    category: str
    lexicalQuality: int
    lexicalSource: str
    hasExactClue: bool = True
    license: str | None = None
    sourceId: str | None = None
    frequency: float | None = None


def normalize(value: str) -> str:
    return value.strip().upper().replace("Ё", "Е")


def valid_answer(value: str, min_len: int = 2, max_len: int = 12) -> bool:
    raw = value.strip()
    return min_len <= len(normalize(raw)) <= max_len and bool(CYRILLIC_RE.fullmatch(raw))


def clean_clue(value: str, answer: str) -> str | None:
    text = MARKUP_RE.sub(" ", value or "")
    text = SPACE_RE.sub(" ", text).strip(" .;:,-—")
    if not text or len(text) < 4 or BAD_CLUE_RE.search(text):
        return None
    text = re.sub(
        r"^(?:значение|действие по значению|состояние по значению)\s*[:—-]?\s*",
        "",
        text,
        flags=re.I,
    )
    text = text[:1].upper() + text[1:]
    if len(text) > 118:
        text = text[:115].rsplit(" ", 1)[0] + "…"
    if normalize(text.replace(" ", "")) == normalize(answer):
        return None
    return text


def frequency(word: str) -> float:
    if zipf_frequency is None:
        return 0.0
    try:
        return float(zipf_frequency(word.lower(), "ru"))
    except Exception:
        return 0.0


def quality_from_frequency(freq: float, base: int = 64) -> int:
    return max(48, min(88, int(round(base + (freq - 2.5) * 6))))


def load_ruwordnet(db_path: Path, target: int, existing: set[str]) -> list[Entry]:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT s.id AS sense_id, s.name, s.lemma, s.synset_id,
               y.title, y.definition, y.part_of_speech
          FROM sense s
          JOIN synset y ON y.id = s.synset_id
        """
    )
    best: dict[str, tuple[float, Entry]] = {}
    for row in rows:
        lemma = (row["lemma"] or row["name"] or "").strip()
        answer = normalize(lemma)
        if answer in existing or not valid_answer(lemma, 3, 12):
            continue
        pos = str(row["part_of_speech"] or "").upper()
        if pos not in {"N", "NOUN", "S"}:
            continue
        clue = clean_clue(row["definition"] or row["title"] or "", lemma)
        if not clue:
            continue
        freq = frequency(lemma)
        score = freq * 20 - abs(len(answer) - 6) * 0.8 - len(clue) * 0.015
        entry = Entry(
            answer=answer,
            clue=clue,
            category="common-noun" if freq >= 3.3 else "specialist-noun",
            lexicalQuality=quality_from_frequency(freq, 68),
            lexicalSource="ruwordnet-2.0",
            license="RuWordNet project terms; source metadata retained",
            sourceId=str(row["sense_id"]),
            frequency=round(freq, 3),
        )
        current = best.get(answer)
        if current is None or score > current[0]:
            best[answer] = (score, entry)
    conn.close()

    ranked = sorted(best.values(), key=lambda item: (-item[0], item[1].answer))
    selected: list[Entry] = []
    length_counts = collections.Counter()
    desired = {
        3: 0.10,
        4: 0.17,
        5: 0.20,
        6: 0.19,
        7: 0.14,
        8: 0.09,
        9: 0.05,
        10: 0.025,
        11: 0.0125,
        12: 0.0125,
    }
    deferred: list[Entry] = []
    selected_answers: set[str] = set()
    for _, entry in ranked:
        limit = max(30, math.ceil(target * desired.get(len(entry.answer), 0.03) * 1.2))
        if length_counts[len(entry.answer)] < limit:
            selected.append(entry)
            selected_answers.add(entry.answer)
            length_counts[len(entry.answer)] += 1
        else:
            deferred.append(entry)
        if len(selected) >= target:
            break
    if len(selected) < target:
        for entry in deferred:
            if entry.answer not in selected_answers:
                selected.append(entry)
                selected_answers.add(entry.answer)
            if len(selected) >= target:
                break
    return selected[:target]


def load_names(target: int, existing: set[str]) -> list[Entry]:
    if top_n_list is None or pymorphy3 is None:
        return []
    morph = pymorphy3.MorphAnalyzer()
    candidates: dict[str, tuple[float, Entry]] = {}
    scan_size = max(350_000, target * 100)
    for token in top_n_list("ru", scan_size):
        if not valid_answer(token, 3, 12):
            continue
        parses = morph.parse(token)
        if not parses:
            continue
        parse = max(parses, key=lambda p: p.score)
        normal = parse.normal_form
        answer = normalize(normal)
        if answer in existing or not valid_answer(normal, 3, 12):
            continue
        tag = parse.tag
        category = clue = None
        quality = 64
        if "Name" in tag:
            gender = getattr(tag, "gender", None)
            category = "given-name"
            clue = "Мужское имя" if gender == "masc" else "Женское имя" if gender == "femn" else "Личное имя"
            quality = 72
        elif "Patr" in tag:
            category, clue, quality = "patronymic", "Отчество", 62
        elif "Surn" in tag:
            category, clue, quality = "surname", "Фамилия", 60
        if not category:
            continue
        freq = frequency(token)
        score = freq * 20 + parse.score * 5
        entry = Entry(
            answer=answer,
            clue=clue,
            category=category,
            lexicalQuality=quality_from_frequency(freq, quality),
            lexicalSource="wordfreq+pymorphy3",
            license="Derived frequency/morphology classification",
            sourceId=None,
            frequency=round(freq, 3),
        )
        current = candidates.get(answer)
        if current is None or score > current[0]:
            candidates[answer] = (score, entry)
    return [entry for _, entry in sorted(candidates.values(), key=lambda x: (-x[0], x[1].answer))[:target]]


def russian_territories() -> dict[str, str]:
    if Locale is None:
        return {}
    locale = Locale("ru")
    return {str(code): str(name) for code, name in locale.territories.items()}


def choose_cyrillic_name(primary: str, alternates: str) -> str | None:
    values = [primary, *(alternates or "").split(",")]
    valid = []
    for value in values:
        value = value.strip()
        if valid_answer(value, 3, 12):
            valid.append(value)
    if not valid:
        return None
    return sorted(set(valid), key=lambda x: (0 if "ё" in x.lower() else 1, len(x), x))[0]


def load_geography(zip_path: Path, target: int, existing: set[str]) -> list[Entry]:
    territories = russian_territories()
    candidates: dict[str, tuple[float, Entry]] = {}
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
                chosen = choose_cyrillic_name(name, alternates)
                if not chosen:
                    continue
                answer = normalize(chosen)
                if answer in existing:
                    continue
                country = territories.get(country_code, country_code)
                if feature_code == "PPLC":
                    clue = f"Столица государства {country}"
                    category = "capital"
                    base_quality = 78
                else:
                    if population >= 1_000_000:
                        clue = f"Крупный город в {country}, более миллиона жителей"
                    elif population >= 100_000:
                        clue = f"Город в {country}, более ста тысяч жителей"
                    else:
                        clue = f"Город в {country}"
                    category = "city"
                    base_quality = 70 if population >= 100_000 else 62
                score = math.log10(max(population, 1)) * 20 + (20 if feature_code == "PPLC" else 0)
                entry = Entry(
                    answer=answer,
                    clue=clue,
                    category=category,
                    lexicalQuality=min(88, base_quality + int(math.log10(max(population, 1)))),
                    lexicalSource="geonames-cities15000",
                    license="CC BY 4.0 GeoNames",
                    sourceId=geoname_id,
                    frequency=None,
                )
                current = candidates.get(answer)
                if current is None or score > current[0]:
                    candidates[answer] = (score, entry)
    return [entry for _, entry in sorted(candidates.values(), key=lambda x: (-x[0], x[1].answer))[:target]]


def load_countries(country_info_path: Path, existing: set[str]) -> list[Entry]:
    territories = russian_territories()
    entries: list[Entry] = []
    for line in country_info_path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        fields = line.split("\t")
        if len(fields) < 17:
            continue
        iso = fields[0]
        population_raw = fields[7]
        continent = fields[8]
        geoname_id = fields[16]
        name = territories.get(iso)
        if not name or not valid_answer(name, 3, 12):
            continue
        answer = normalize(name)
        if answer in existing:
            continue
        try:
            population = int(population_raw or 0)
        except ValueError:
            population = 0
        location = CONTINENT_LOCATIVE.get(continent, "мире")
        entries.append(Entry(
            answer=answer,
            clue=f"Государство в {location}",
            category="country",
            lexicalQuality=min(90, 78 + int(math.log10(max(population, 1)))),
            lexicalSource="geonames-country-info",
            license="CC BY 4.0 GeoNames",
            sourceId=geoname_id or iso,
            frequency=None,
        ))
    return sorted(entries, key=lambda entry: (-entry.lexicalQuality, entry.answer))


def write_chunks(entries: list[Entry], output_dir: Path, prefix: str, chunk_size: int) -> list[dict]:
    records = []
    for index in range(0, len(entries), chunk_size):
        chunk = entries[index:index + chunk_size]
        number = index // chunk_size + 1
        filename = f"{prefix}-{number:02d}.js"
        payload = [asdict(entry) for entry in chunk]
        for item, original in zip(payload, chunk):
            if original.frequency is None:
                item.pop("frequency", None)
        content = (
            "window.ScanwordBulkLexiconV1.register(\n"
            + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            + f",\n  \"{prefix}-{number:02d}\"\n);\n"
        )
        path = output_dir / filename
        path.write_text(content, encoding="utf-8")
        records.append({
            "file": filename,
            "entries": len(chunk),
            "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        })
    return records


def write_loader(files: list[dict], output_dir: Path) -> dict:
    names = [record["file"] for record in files]
    content = f'''(() => {{
  "use strict";
  const files = {json.dumps(names, ensure_ascii=False, separators=(",", ":"))};
  window.SCANWORD_BULK_LEXICON_FILES = files;
  if (typeof require === "function") {{
    for (const file of files) require(`./${{file}}`);
    return;
  }}
  const current = document.currentScript?.src || "";
  const base = current.slice(0, current.lastIndexOf("/") + 1);
  document.write(files.map((file) => `<script src="${{base}}${{file}}"><\\/script>`).join(""));
}})();
'''
    path = output_dir / "loader.js"
    path.write_text(content, encoding="utf-8")
    return {
        "file": path.name,
        "entries": len(names),
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def summarize(entries: Iterable[Entry]) -> dict:
    entries = list(entries)
    return {
        "entries": len(entries),
        "categories": dict(sorted(collections.Counter(e.category for e in entries).items())),
        "lengths": {str(k): v for k, v in sorted(collections.Counter(len(e.answer) for e in entries).items())},
        "quality": {
            "min": min((e.lexicalQuality for e in entries), default=0),
            "max": max((e.lexicalQuality for e in entries), default=0),
            "average": round(statistics.mean([e.lexicalQuality for e in entries]), 2) if entries else 0,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ruwordnet-db", type=Path, required=True)
    parser.add_argument("--geonames-zip", type=Path, required=True)
    parser.add_argument("--country-info", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--common", type=int, default=35000)
    parser.add_argument("--names", type=int, default=5000)
    parser.add_argument("--geography", type=int, default=10000)
    parser.add_argument("--chunk-size", type=int, default=2500)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for old in args.out_dir.glob("*.js"):
        old.unlink()

    existing: set[str] = set()
    common = load_ruwordnet(args.ruwordnet_db, args.common, existing)
    existing.update(e.answer for e in common)
    names = load_names(args.names, existing)
    existing.update(e.answer for e in names)
    geography = load_geography(args.geonames_zip, args.geography, existing)
    existing.update(e.answer for e in geography)
    countries = load_countries(args.country_info, existing)
    existing.update(e.answer for e in countries)

    files = []
    files += write_chunks(common, args.out_dir, "ruwordnet-common", args.chunk_size)
    files += write_chunks(names, args.out_dir, "proper-names", args.chunk_size)
    files += write_chunks(geography, args.out_dir, "geography", args.chunk_size)
    files += write_chunks(countries, args.out_dir, "countries", args.chunk_size)
    loader = write_loader(files, args.out_dir)
    all_entries = [*common, *names, *geography, *countries]
    manifest = {
        "version": 2,
        "generatedBy": "tools/build-bulk-lexicon.py",
        "sources": {
            "ruwordnet": {
                "url": "https://github.com/avidale/python-ruwordnet/releases/download/0.0.4/ruwordnet-2021.db",
                "role": "single-word noun senses and definitions",
            },
            "geonames-cities": {
                "url": "https://download.geonames.org/export/dump/cities15000.zip",
                "license": "CC BY 4.0",
                "role": "cities and capitals",
            },
            "geonames-countries": {
                "url": "https://download.geonames.org/export/dump/countryInfo.txt",
                "license": "CC BY 4.0",
                "role": "country metadata and continent classification",
            },
            "wordfreq+pymorphy3": {"role": "frequency ranking and proper-name morphology"},
        },
        "requested": {
            "common": args.common,
            "names": args.names,
            "geography": args.geography,
            "countries": "all valid single-token Russian territory names",
        },
        "actual": {
            "common": summarize(common),
            "names": summarize(names),
            "geography": summarize(geography),
            "countries": summarize(countries),
            "total": summarize(all_entries),
        },
        "files": files,
        "loader": loader,
    }
    manifest_path = args.out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
