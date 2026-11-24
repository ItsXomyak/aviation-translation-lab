#!/usr/bin/env python3
"""Convert the author's corpus tables (the data/ folder of Aviation_Corpus_v0.2.zip) into the CSV tables in data/.

Usage:  python3 tools/import_corpus.py path/to/author/data [--data data]

Reads the author's CSV files (UTF-8 with BOM): sources, terms, units, annotations, ref_topics, ref_difficulties,
ref_strategies, corpus_version. Overwrites the CSV tables here (not methodology.html). Run tools/build.py afterwards
to validate.
"""
import argparse
import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import LANGS, ROOT, SCHEMA  # noqa: E402

# The corpus description (docx §6) scores U003 with the rubric as a training example, so it is marked scorable.
TRAINING_UNITS = {"U003"}


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def table(folder, name):
    with (folder / f"{name}.csv").open(encoding="utf-8-sig", newline="") as f:
        # the author writes a dash for "no locator" / "no audience"
        return [{k: "" if v.strip() in ("—", "-") else v.strip() for k, v in r.items()} for r in csv.DictReader(f)]


def occurrence(text, span, start):
    """Which occurrence of span starts at start (same search as build.find_nth)."""
    n, i = 0, -1
    while True:
        i = text.find(span, i + 1)
        n += 1
        if i == start:
            return n
        if i < 0:
            raise ValueError(f"'{span}' not at {start} in '{text}'")


def convert(folder):
    terms, units, anns = table(folder, "terms"), table(folder, "units"), table(folder, "annotations")
    sources = table(folder, "sources")
    author = {s["source_id"] for s in sources if s["organization"] == "author"}
    by_unit = {u["unit_id"]: u for u in units}
    out = {
        "vocab/difficulties": [{"id": d["difficulty_id"], "code": d["code"], "label": d["label_en"],
                                "label_ru": d["label_ru"], "label_kk": d["label_kk"], "description": d["description_ru"]}
                               for d in table(folder, "ref_difficulties")],
        "vocab/strategies": [{"id": s["strategy_id"], "code": s["code"], "label": s["label_en"],
                              "label_ru": s["label_ru"], "label_kk": s["label_kk"]}
                             for s in table(folder, "ref_strategies")],
        # one topic list (TP01…) for terms and units
        "vocab/topics": [{"id": t["topic_id"], "label": t["label_en"]} for t in table(folder, "ref_topics")],
        "vocab/genres": [{"id": slug(g), "label": g} for g in dict.fromkeys(u["genre"] for u in units)],
        "sources": [{"source_id": s["source_id"], "title": s["title"], "organization": s["organization"],
                     "lang": s["language"].lower(), "genre": s["genre"], "audience": s["audience"], "url": s["url"],
                     "accessed": s["access_date"], "edition": s["edition"], "note": s["verification_note"],
                     "is_document": "no" if s["source_id"] in author else "yes"}
                    for s in sources],
        # definitions are written in Russian; their source is taken from the Russian form
        "terms": [{"term_id": t["term_id"], "topic_id": t["topic_id"], "definition": t["definition_ru"],
                   "definition_lang": "ru", "definition_source_id": t["source_ru"], "context": t["context_en"],
                   "difficulty_ids": t["difficulty_ids"], "difficulty_note": t["translation_note"], "dataset": "research"}
                  for t in terms],
        "term_forms": [{"term_id": t["term_id"], "lang": lang, "form": t[lang], "abbreviation": t[f"{lang}_abbr"],
                        "source_id": t[f"source_{lang}"], "check_status": t[f"status_{lang}"]}
                       for t in terms for lang in LANGS if t[lang]],
        "units": [{"unit_id": u["unit_id"], "genre_id": slug(u["genre"]), "topic_id": u["topic_id"],
                   "subtopic": u["subtopic"], "term_ids": u["term_ids"],
                   **{f"link_type_{lang}": u[f"link_type_{lang}"] for lang in LANGS},
                   "source_lang": u["original_lang"].lower(), "direction_basis": u["direction_basis"],
                   "alignment_status": u["alignment_status"],
                   "training": "yes" if u["unit_id"] in TRAINING_UNITS else "no", "dataset": u["dataset"],
                   "note": u["note"]} for u in units],
        "fragments": [{"unit_id": u["unit_id"], "lang": lang, "seq": 1, "text": u[f"text_{lang}"],
                       "source_id": u[f"source_{lang}"], "locator": u.get(f"locator_{lang}", "")}
                      for u in units for lang in LANGS if u[f"text_{lang}"]],
        "annotations": [],
        "versions": [{"version": v["version"], "date": v["date"], "changes": v["description"]}
                     for v in table(folder, "corpus_version")],
    }
    for a in anns:
        lang = a["target_lang"].lower()
        text = by_unit[a["unit_id"]][f"text_{lang}"]
        start = int(a["span_start"])
        if text[start:int(a["span_end"])] != a["span_text"]:
            sys.exit(f"{a['annotation_id']}: span_start/span_end do not match span_text")
        pair = a["language_pair"].lower().split("-")
        out["annotations"].append({
            "annotation_id": a["annotation_id"], "unit_id": a["unit_id"], "lang": lang, "seq": 1,
            "span_text": a["span_text"], "occurrence": occurrence(text, a["span_text"], start),
            "compared_with": next((x for x in pair if x != lang), ""), "difficulty_ids": a["difficulty_ids"],
            "strategy_ids": a["strategy_ids"], "explanation": a["explanation"], "check_status": a["review_status"]})
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("folder", type=Path, help="the author's data/ folder")
    p.add_argument("--data", type=Path, default=ROOT / "data")
    a = p.parse_args()
    for name, rows in convert(a.folder).items():
        path = a.data / f"{name}.csv"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, SCHEMA[name][0].split())
            writer.writeheader()
            writer.writerows(rows)
        print(f"{path}: {len(rows)} rows")


if __name__ == "__main__":
    main()
