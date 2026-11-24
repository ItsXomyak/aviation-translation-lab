#!/usr/bin/env python3
"""Validate the corpus CSV tables and build the static site.

Usage:  python3 tools/build.py [--data DIR] [--web DIR] [--out DIR]

On any error prints "<table>.csv:<line>: <problem>" lines, exits with code 1
and leaves the output folder untouched, so the previous build keeps working.
"""
import argparse
import csv
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = ("en", "ru", "kk")
LINK_TYPES = ("confirmed_translation", "parallel_unknown_direction", "comparable_text", "illustrative_translation")
ALIGNMENT = ("aligned", "in_review")
DATASETS = ("research", "demo", "draft")
CHECKS = ("verified", "source_referenced", "pending_validation", "illustrative")
YES_NO = ("yes", "no")
# One link type per language: how that language's text relates to the original (source_lang).
LINK_COLS = {lang: f"link_type_{lang}" for lang in LANGS}

# table: (all columns, required columns)
SCHEMA = {
    "vocab/topics": ("id label", "id label"),
    "vocab/difficulties": ("id code label label_ru label_kk description", "id label"),
    "vocab/strategies": ("id code label label_ru label_kk", "id label"),
    "vocab/genres": ("id label", "id label"),
    "sources": ("source_id title organization lang genre audience url accessed edition note is_document",
                "source_id title organization lang genre accessed"),
    "terms": ("term_id topic_id definition definition_lang definition_source_id context difficulty_ids "
              "difficulty_note dataset",
              "term_id topic_id definition dataset"),
    "term_forms": ("term_id lang form abbreviation source_id locator check_status",
                   "term_id lang form source_id check_status"),
    "units": ("unit_id title genre_id topic_id subtopic term_ids link_type_en link_type_ru link_type_kk source_lang "
              "direction_basis alignment_status training dataset note",
              "unit_id genre_id topic_id alignment_status dataset"),
    "fragments": ("unit_id lang seq text source_id locator", "unit_id lang seq text source_id"),
    "annotations": ("annotation_id unit_id lang seq span_text occurrence compared_with difficulty_ids strategy_ids "
                    "explanation evidence_source_id evidence_locator check_status",
                    "annotation_id unit_id lang span_text explanation check_status"),
    "versions": ("version date changes", "version date changes"),
}


class Errors(list):
    def add(self, table, line, msg):
        self.append(f"{table}.csv:{line}: {msg}" if line else f"{table}.csv: {msg}")


def ids(value, sep=";"):
    return [x.strip() for x in value.split(sep) if x.strip()]


def u16(text):
    """Length in UTF-16 code units — the unit JavaScript string offsets use."""
    return len(text.encode("utf-16-le")) // 2


def load(data_dir, err):
    tables = {}
    for name, (cols, required) in SCHEMA.items():
        tables[name] = []
        path = data_dir / f"{name}.csv"
        if not path.exists():
            err.add(name, None, "file is missing")
            continue
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            missing = [c for c in required.split() if c not in (reader.fieldnames or [])]
            if missing:
                err.add(name, 1, "missing column(s): " + ", ".join(missing))
                continue
            for raw in reader:
                row = {c: (raw.get(c) or "").strip() for c in cols.split()}
                if not any(row.values()):
                    continue
                row["_line"] = reader.line_num
                for c in required.split():
                    if not row[c]:
                        err.add(name, row["_line"], f"required field '{c}' is empty")
                tables[name].append(row)
    return tables


def unique(err, table, rows, key):
    seen = {}
    for r in rows:
        k = key(r)
        if k in seen:
            err.add(table, r["_line"], f"duplicate ID '{k}' (first at line {seen[k]['_line']})")
        else:
            seen[k] = r
    return seen


def allowed(err, table, row, col, values, sep=None):
    for v in ids(row[col], sep) if sep else ([row[col]] if row[col] else []):
        if v not in values:
            err.add(table, row["_line"], f"unknown {col} value '{v}' (allowed: {', '.join(values)})")


def refs(err, table, row, col, target, known):
    for v in ids(row[col]):
        if v not in known:
            err.add(table, row["_line"], f"{col} '{v}' not found in {target}.csv")


def whole(err, table, row, col):
    v = row[col] or "1"
    if not v.isdecimal() or int(v) < 1:
        err.add(table, row["_line"], f"{col} '{v}' must be a whole number >= 1")
        return None
    return int(v)


def iso_date(err, table, row, col):
    v = row[col]
    try:
        ok = bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", v)) and bool(date.fromisoformat(v))
    except ValueError:
        ok = False
    if v and not ok:
        err.add(table, row["_line"], f"{col} '{v}' is not a date YYYY-MM-DD")


def find_nth(text, sub, n):
    i = -1
    for _ in range(n):
        i = text.find(sub, i + 1)
        if i < 0:
            break
    return i


def validate(t, err):
    vocab = {}
    for name in ("topics", "difficulties", "strategies", "genres"):
        table = f"vocab/{name}"
        vocab[name] = {k: r["label"] for k, r in unique(err, table, t[table], lambda r: r["id"]).items()}

    sources = unique(err, "sources", t["sources"], lambda r: r["source_id"])
    for r in t["sources"]:
        allowed(err, "sources", r, "lang", LANGS, sep="/")  # a bilingual document is written "ru/kk"
        iso_date(err, "sources", r, "accessed")
        allowed(err, "sources", r, "is_document", YES_NO)  # "no" = made by the author (translation, training text)

    terms = unique(err, "terms", t["terms"], lambda r: r["term_id"])
    for r in t["terms"]:
        allowed(err, "terms", r, "topic_id", vocab["topics"])
        allowed(err, "terms", r, "definition_lang", LANGS)
        allowed(err, "terms", r, "difficulty_ids", vocab["difficulties"], sep=";")
        allowed(err, "terms", r, "dataset", DATASETS)
        refs(err, "terms", r, "definition_source_id", "sources", sources)

    unique(err, "term_forms", t["term_forms"], lambda r: f"{r['term_id']} / {r['lang']} / {r['form']}")
    for r in t["term_forms"]:
        refs(err, "term_forms", r, "term_id", "terms", terms)
        allowed(err, "term_forms", r, "lang", LANGS)
        allowed(err, "term_forms", r, "check_status", CHECKS)
        refs(err, "term_forms", r, "source_id", "sources", sources)

    units = unique(err, "units", t["units"], lambda r: r["unit_id"])
    for r in t["units"]:
        for col, values in (("genre_id", vocab["genres"]), ("topic_id", vocab["topics"]), ("source_lang", LANGS),
                            ("alignment_status", ALIGNMENT), ("training", YES_NO), ("dataset", DATASETS),
                            *((c, LINK_TYPES) for c in LINK_COLS.values())):
            allowed(err, "units", r, col, values)
        refs(err, "units", r, "term_ids", "terms", terms)
        types = {r[c] for c in LINK_COLS.values()}
        if "confirmed_translation" in types and not (r["source_lang"] and r["direction_basis"]):
            err.add("units", r["_line"], "confirmed_translation requires source_lang and direction_basis")
        if "illustrative_translation" in types and not r["source_lang"]:
            err.add("units", r["_line"], "illustrative_translation requires source_lang")
        if r["training"] == "yes" and not r["source_lang"]:
            err.add("units", r["_line"], "training example requires source_lang")
        if r["dataset"] == "research":
            for tid in ids(r["term_ids"]):
                if tid in terms and terms[tid]["dataset"] != "research":
                    err.add("units", r["_line"],
                            f"research unit links to term '{tid}' with dataset '{terms[tid]['dataset']}'")

    for r in t["fragments"]:
        refs(err, "fragments", r, "unit_id", "units", units)
        allowed(err, "fragments", r, "lang", LANGS)
        refs(err, "fragments", r, "source_id", "sources", sources)
        r["seq"] = whole(err, "fragments", r, "seq")
    frags = unique(err, "fragments", [r for r in t["fragments"] if r["seq"]],
                   lambda r: f"{r['unit_id']} / {r['lang']} / {r['seq']}")

    for r in t["units"]:
        src = r["source_lang"]
        have = {f["lang"] for f in frags.values() if f["unit_id"] == r["unit_id"]}
        if src in LANGS and src not in have:
            err.add("units", r["_line"], f"no {src} fragment for source_lang")
        for lang, col in LINK_COLS.items():
            if lang == src and r[col]:
                err.add("units", r["_line"], f"{col} must be empty: {lang} is the source language")
            elif lang != src and lang in have and not r[col]:
                err.add("units", r["_line"], f"{col} is required: the unit has a {lang} fragment")
            elif lang not in have and r[col]:
                err.add("units", r["_line"], f"{col} is set but the unit has no {lang} fragment")

    for f in frags.values():
        unit = units.get(f["unit_id"])
        if unit and unit.get(LINK_COLS.get(f["lang"])) == "confirmed_translation":
            for sid in ids(f["source_id"]):
                if sid in sources and sources[sid]["is_document"] == "no":
                    err.add("fragments", f["_line"], f"confirmed_translation cannot cite the author's own source '{sid}'")

    unique(err, "annotations", t["annotations"], lambda r: r["annotation_id"])
    taken = {}
    for r in t["annotations"]:
        tb, line = "annotations", r["_line"]
        refs(err, tb, r, "unit_id", "units", units)
        allowed(err, tb, r, "lang", LANGS)
        allowed(err, tb, r, "compared_with", LANGS)
        allowed(err, tb, r, "difficulty_ids", vocab["difficulties"], sep=";")
        allowed(err, tb, r, "strategy_ids", vocab["strategies"], sep=";")
        allowed(err, tb, r, "check_status", CHECKS)
        refs(err, tb, r, "evidence_source_id", "sources", sources)
        if not (r["difficulty_ids"] or r["strategy_ids"]):
            err.add(tb, line, "set difficulty_ids or strategy_ids")
        r["seq"], r["occurrence"] = whole(err, tb, r, "seq"), whole(err, tb, r, "occurrence")
        if not (r["seq"] and r["occurrence"] and r["span_text"] and r["unit_id"] in units and r["lang"] in LANGS):
            continue
        key = f"{r['unit_id']} / {r['lang']} / {r['seq']}"
        if key not in frags:
            err.add(tb, line, f"fragment {key} not found in fragments.csv")
            continue
        text = frags[key]["text"]
        i = find_nth(text, r["span_text"], r["occurrence"])
        if i < 0:
            err.add(tb, line, f"span_text '{r['span_text']}' not found {r['occurrence']} time(s) in fragment {key}")
            continue
        r["start"] = u16(text[:i])
        r["end"] = r["start"] + u16(r["span_text"])
        for other in taken.setdefault(key, []):
            if r["start"] < other["end"] and other["start"] < r["end"]:
                err.add(tb, line, f"selection overlaps annotation at line {other['_line']}")
        taken[key].append(r)

    unique(err, "versions", t["versions"], lambda r: r["version"])
    for r in t["versions"]:
        iso_date(err, "versions", r, "date")
    if not t["versions"]:
        err.add("versions", None, "at least one version row is required")
    return vocab


def clean(row, *drop):
    return {k: v for k, v in row.items() if k != "_line" and k not in drop}


def assemble(t, vocab, methodology):
    terms = [
        {**clean(r), "difficulty_ids": ids(r["difficulty_ids"]),
         "forms": [clean(f, "term_id") for f in t["term_forms"] if f["term_id"] == r["term_id"]]}
        for r in t["terms"] if r["dataset"] != "draft"
    ]
    published = {x["term_id"] for x in terms}
    units = []
    for r in t["units"]:
        if r["dataset"] == "draft":
            continue
        uid = r["unit_id"]
        anns = [a for a in t["annotations"] if a["unit_id"] == uid]
        units.append({
            **clean(r, *LINK_COLS.values()),
            "link_types": {lang: r[col] for lang, col in LINK_COLS.items()},
            "term_ids": [x for x in ids(r["term_ids"]) if x in published],
            "training": r["training"] == "yes",
            "fragments": sorted((clean(f, "unit_id") for f in t["fragments"] if f["unit_id"] == uid),
                                key=lambda f: (LANGS.index(f["lang"]), f["seq"])),
            "annotations": [{**clean(a, "unit_id", "occurrence"), "label": f"A{n}",
                             "difficulty_ids": ids(a["difficulty_ids"]), "strategy_ids": ids(a["strategy_ids"])}
                            for n, a in enumerate(anns, 1)],
        })
    return {
        "version": {"current": clean(t["versions"][-1]), "history": [clean(v) for v in t["versions"]]},
        "vocab": vocab,
        "sources": {r["source_id"]: {**clean(r), "is_document": r["is_document"] != "no"} for r in t["sources"]},
        "terms": terms,
        "units": units,
        "methodology": methodology,
    }


def build(data_dir, web_dir, out_dir):
    data_dir, web_dir, out_dir = Path(data_dir), Path(web_dir), Path(out_dir)
    err = Errors()
    tables = load(data_dir, err)
    vocab = validate(tables, err)
    meth = data_dir / "methodology.html"
    if not meth.exists():
        err.append("methodology.html: file is missing")
    if out_dir.exists() and any(out_dir.iterdir()) and not (out_dir / "data.js").exists():
        err.append(f"{out_dir}: refusing to overwrite a folder that is not a previous build")
    if err:
        return err
    data = assemble(tables, vocab, meth.read_text(encoding="utf-8"))
    tmp = out_dir.with_name(out_dir.name + ".tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    shutil.copytree(web_dir, tmp)
    (tmp / "data.js").write_text(
        "window.ATL_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    shutil.rmtree(out_dir, ignore_errors=True)
    tmp.rename(out_dir)
    return err


def main(argv=None):
    p = argparse.ArgumentParser(description="Validate corpus CSVs and build the static site.")
    p.add_argument("--data", type=Path, default=ROOT / "data")
    p.add_argument("--web", type=Path, default=ROOT / "web")
    p.add_argument("--out", type=Path, default=ROOT / "dist")
    a = p.parse_args(argv)
    errors = build(a.data, a.web, a.out)
    if errors:
        print(f"Build rejected: {len(errors)} error(s). The previous build was left untouched.", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return 1
    print(f"Build OK -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
