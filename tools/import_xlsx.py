#!/usr/bin/env python3
"""Convert the author's workbook (Aviation_Corpus_EN_RU_KK.xlsx) into the CSV tables in data/.

Usage:  python3 tools/import_xlsx.py Aviation_Corpus_EN_RU_KK.xlsx [--data data]

Needs openpyxl (pip install openpyxl) — only for this import; the site build stays stdlib-only.
Overwrites the CSV tables (not methodology.html). Run tools/build.py afterwards to validate.
"""
import argparse
import csv
import datetime
import re
import sys
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import LANGS, ROOT, SCHEMA  # noqa: E402

# The corpus description (docx §6) scores U003 with the rubric as a training example, so it is marked scorable.
TRAINING_UNITS = {"U003"}


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def cell(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    v = "" if v is None else str(v).strip()
    return "" if v in ("—", "-") else v  # the workbook uses a dash for "no locator"


def sheet(wb, name):
    ws = wb[name]
    header = [c.value for c in ws[1]]
    return [{k: cell(v) for k, v in zip(header, row)}
            for row in ws.iter_rows(min_row=2, values_only=True) if any(v is not None for v in row)]


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


def convert(wb):
    terms, units, anns = sheet(wb, "Terms"), sheet(wb, "Units"), sheet(wb, "Annotations")
    by_unit = {u["unit_id"]: u for u in units}
    out = {
        "vocab/difficulties": [{"id": d["difficulty_id"], "code": d["code"], "label": d["label_en"],
                                "label_ru": d["label_ru"], "label_kk": d["label_kk"], "description": d["description_ru"]}
                               for d in sheet(wb, "Ref_Difficulties")],
        "vocab/strategies": [{"id": s["strategy_id"], "code": s["code"], "label": s["label_en"],
                              "label_ru": s["label_ru"], "label_kk": s["label_kk"]} for s in sheet(wb, "Ref_Strategies")],
        # term topics and unit topics share one vocabulary; ids are slugs of the workbook labels
        "vocab/topics": [{"id": slug(t), "label": t}
                         for t in dict.fromkeys([x["topic"] for x in terms] + [u["topic"] for u in units])],
        "vocab/genres": [{"id": slug(g), "label": g} for g in dict.fromkeys(u["genre"] for u in units)],
        "sources": [{"source_id": s["source_id"], "title": s["title"], "organization": s["organization"],
                     "lang": s["language"].lower(), "genre": s["genre"], "audience": s["audience"], "url": s["url"],
                     "accessed": s["access_date"], "edition": s["edition"], "note": s["verification_note"]}
                    for s in sheet(wb, "Sources")],
        # definitions are written in Russian; their source is taken from the Russian form
        "terms": [{"term_id": t["term_id"], "topic_id": slug(t["topic"]), "definition": t["definition_ru"],
                   "definition_lang": "ru", "definition_source_id": t["source_ru"], "context": t["context_en"],
                   "difficulty_ids": t["difficulty_ids"], "difficulty_note": t["translation_note"], "dataset": "research"}
                  for t in terms],
        "term_forms": [{"term_id": t["term_id"], "lang": lang, "form": t[lang], "abbreviation": t[f"{lang}_abbr"],
                        "source_id": t[f"source_{lang}"], "check_status": t[f"status_{lang}"]}
                       for t in terms for lang in LANGS if t[lang]],
        "units": [{"unit_id": u["unit_id"], "genre_id": slug(u["genre"]), "topic_id": slug(u["topic"]),
                   "term_ids": u["term_ids"], "link_type": u["link_type"], "source_lang": u["original_lang"].lower(),
                   "direction_basis": u["direction_basis"], "alignment_status": u["alignment_status"],
                   "training": "yes" if u["unit_id"] in TRAINING_UNITS else "no", "dataset": u["dataset"],
                   "note": u["note"]} for u in units],
        "fragments": [{"unit_id": u["unit_id"], "lang": lang, "seq": 1, "text": u[f"text_{lang}"],
                       "source_id": u[f"source_{lang}"], "locator": u.get(f"locator_{lang}", "")}
                      for u in units for lang in LANGS if u[f"text_{lang}"]],
        "annotations": [],
        "versions": [{"version": v["version"], "date": v["date"], "changes": v["description"]}
                     for v in sheet(wb, "Version")],
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
    p.add_argument("xlsx", type=Path)
    p.add_argument("--data", type=Path, default=ROOT / "data")
    a = p.parse_args()
    for name, rows in convert(openpyxl.load_workbook(a.xlsx, data_only=True)).items():
        path = a.data / f"{name}.csv"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, SCHEMA[name][0].split())
            writer.writeheader()
            writer.writerows(rows)
        print(f"{path}: {len(rows)} rows")


if __name__ == "__main__":
    main()
