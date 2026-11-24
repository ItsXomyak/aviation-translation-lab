# Aviation Translation Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the five-module trilingual (EN/RU/KK) aviation translation research prototype described in `docs/superpowers/specs/2026-11-24-aviation-translation-lab-design.md`.

**Architecture:** Author-edited CSV tables → `tools/build.py` (validation + assembly, stdlib only) → `dist/` = copy of `web/` + `data.js`. The UI is plain HTML/CSS/JS loaded with classic `<script>` tags (works from `file://` and offline). Pure logic lives in `web/lib.js` (tested with `node --test`); views render with template strings into `<main>`.

**Tech Stack:** Python 3 stdlib (csv, json, argparse, unittest), vanilla JS (ES2020, no modules, no npm), CSS. Node is used only to run JS tests.

## Global Constraints

- No runtime dependencies, no CDN, no web fonts; the built site must work offline from `file://`.
- Interface language: English. Column order EN → RU → KK.
- Colours: navy `#112642`, gold `#D5B36A`, light text `#F3F5F8`; base font 18 px; every colour cue duplicated by a text label.
- At 375 px width the page has no horizontal scroll; language panels stack vertically below 760 px.
- Every action is reachable with the keyboard (native `a`, `button`, `select`, `input`, `textarea` only).
- All text from data is HTML-escaped (`App.esc`); only `methodology.html` is inserted as trusted HTML.
- Build errors use the format `<table>.csv:<line>: <problem>` (header = line 1); on error the output folder is untouched.
- Research mode shows only `approved` records; Demo mode shows `approved` + `illustrative` with a permanent banner and `DEMO_` export prefix.
- Code blocks tagged `file=<path>` contain the complete file content.

---

## File map

| File | Responsibility |
|---|---|
| `tools/build.py` | Load CSVs, validate (rules 4.3 of spec), assemble `data.js`, copy `web/` into output |
| `tools/test_build.py` | Validation/assembly tests on an inline fixture |
| `tools/test_data.py` | Repo demo data builds; templates match schema |
| `tools/lib.test.js` | Stats, rubric, search, CSV, segments tests |
| `tools/publish.sh` | Server publish: pull → build into release → atomic symlink switch |
| `data/**.csv`, `data/methodology.html` | Demo dataset, vocabularies, versions, methodology draft |
| `templates/**.csv` | Header-only CSV templates for the author |
| `web/lib.js` | Pure logic: dataset modes, search, stats, rubric, CSV |
| `web/app.js` | Shell: routing, mode toggle, banner, shared render helpers |
| `web/index.html`, `web/app.css` | Page skeleton and styles |
| `web/views/*.js` | One file per module: home, dictionary, compare, dashboard, assess, method |
| `docs/README.md`, `docs/DATA_DICTIONARY.md`, `docs/ACCEPTANCE.md` | Run/update instructions, field dictionary, acceptance results |

---

### Task 1: Build and validation script

**Files:**
- Create: `tools/build.py`
- Test: `tools/test_build.py`

**Interfaces:**
- Produces: `build.SCHEMA: dict[str, tuple[str, str]]` (table → (space-separated columns, space-separated required columns)); `build.build(data_dir, web_dir, out_dir) -> list[str]` (empty list = success); CLI `python3 tools/build.py [--data] [--web] [--out]` exit 0/1.
- Produces `data.js`: `window.ATL_DATA = {version: {current, history}, vocab: {topics, difficulties, strategies, genres: {id: label}}, sources: {id: row}, terms: [{...row, difficulty_ids: [], forms: [{lang, form, abbreviation, source_id, locator, check_status}]}], units: [{...row, term_ids: [], training: bool, fragments: [{lang, seq:int, text, source_id, locator}], annotations: [{annotation_id, label:"A1", lang, seq:int, span_text, start, end, compared_with, difficulty_ids: [], strategy_ids: [], explanation, evidence_source_id, evidence_locator, check_status}]}], methodology: str}`. `start`/`end` are UTF-16 offsets (JS string indices). Records with `status=draft` are omitted.

- [ ] **Step 1: Write the failing tests**

```python file=tools/test_build.py
"""Tests for tools/build.py. Run: python3 tools/test_build.py -v"""
import copy
import csv
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# Minimal valid corpus. First data row of every table is file line 2.
FIXTURE = {
    "vocab/topics": [{"id": "aerodrome", "label": "Aerodrome"}],
    "vocab/difficulties": [{"id": "modality", "label": "Modality"}, {"id": "syntax", "label": "Syntax"}],
    "vocab/strategies": [{"id": "calque", "label": "Calque"}],
    "vocab/genres": [{"id": "manual", "label": "Manual"}],
    "sources": [{"source_id": "S1", "title": "Title", "organization": "Org", "lang": "en", "genre_id": "manual",
                 "audience": "Pilots", "url": "https://example.org", "accessed": "2026-11-01"}],
    "terms": [{"term_id": "T1", "topic_id": "aerodrome", "definition": "Definition", "definition_source_id": "S1",
               "status": "approved"}],
    "term_forms": [{"term_id": "T1", "lang": "kk", "form": "ұшу-қону жолағы", "source_id": "S1",
                    "check_status": "pending"}],
    "units": [{"unit_id": "U1", "title": "Hold short", "topic_id": "aerodrome", "term_ids": "T1",
               "link_type": "confirmed_translation", "source_lang": "en", "direction_basis": "Stated in source",
               "alignment_status": "aligned", "status": "approved"}],
    "fragments": [
        {"unit_id": "U1", "lang": "en", "seq": "1", "text": "Hold short of runway 06.", "source_id": "S1"},
        {"unit_id": "U1", "lang": "ru", "seq": "1", "text": "Ожидайте перед ВПП 06.", "source_id": "S1"},
    ],
    "annotations": [{"annotation_id": "A1", "unit_id": "U1", "lang": "ru", "span_text": "Ожидайте",
                     "difficulty_ids": "modality", "explanation": "Explanation", "evidence_source_id": "S1",
                     "check_status": "verified"}],
    "versions": [{"version": "1.0", "date": "2026-11-24", "changes": "Initial"}],
}


def write_tables(root, tables):
    for name, rows in tables.items():
        path = root / f"{name}.csv"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, build.SCHEMA[name][0].split())
            writer.writeheader()
            writer.writerows(rows)
    (root / "methodology.html").write_text("<h2>Aim</h2>", encoding="utf-8")


def read_data(out):
    text = (out / "data.js").read_text(encoding="utf-8")
    return json.loads(text[text.index("=") + 1:].strip().rstrip(";"))


class BuildTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.data, self.out, self.web = self.tmp / "data", self.tmp / "dist", self.tmp / "web"
        self.web.mkdir()
        (self.web / "index.html").write_text("<!doctype html>", encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def build(self, mutate=None):
        tables = copy.deepcopy(FIXTURE)
        if mutate:
            mutate(tables)
        write_tables(self.data, tables)
        return build.build(self.data, self.web, self.out)

    def assertError(self, expected, mutate):
        errors = self.build(mutate)
        self.assertTrue(any(e.startswith(expected) for e in errors), f"{expected!r} not in {errors}")

    # --- successful builds ---
    def test_valid_fixture_builds(self):
        self.assertEqual(self.build(), [])
        data = read_data(self.out)
        self.assertTrue((self.out / "index.html").exists())
        unit = data["units"][0]
        self.assertEqual(unit["term_ids"], ["T1"])
        self.assertIs(unit["training"], False)
        self.assertEqual([f["seq"] for f in unit["fragments"]], [1, 1])
        ann = unit["annotations"][0]
        self.assertEqual((ann["start"], ann["end"], ann["label"], ann["seq"]), (0, 8, "A1", 1))
        self.assertEqual(data["terms"][0]["forms"][0]["form"], "ұшу-қону жолағы")
        self.assertEqual(data["version"]["current"]["version"], "1.0")
        self.assertEqual(data["vocab"]["difficulties"], {"modality": "Modality", "syntax": "Syntax"})
        self.assertEqual(data["methodology"], "<h2>Aim</h2>")

    def test_draft_records_are_not_published(self):
        def add_draft(t):
            t["units"].append({**t["units"][0], "unit_id": "U2", "status": "draft"})
        self.assertEqual(self.build(add_draft), [])
        self.assertEqual([u["unit_id"] for u in read_data(self.out)["units"]], ["U1"])

    def test_new_approved_record_appears_without_ui_changes(self):
        def add(t):
            t["units"].append({**t["units"][0], "unit_id": "U2"})
            t["fragments"].append({**t["fragments"][0], "unit_id": "U2"})
        self.assertEqual(self.build(add), [])
        self.assertEqual([u["unit_id"] for u in read_data(self.out)["units"]], ["U1", "U2"])

    # --- validation errors ---
    def test_missing_file(self):
        self.assertError("versions.csv: file is missing", lambda t: t.pop("versions"))

    def test_missing_column(self):
        self.build()
        (self.data / "sources.csv").write_text("source_id,title\nS1,T\n", encoding="utf-8")
        errors = build.build(self.data, self.web, self.out)
        self.assertTrue(any(e.startswith("sources.csv:1: missing column(s): organization") for e in errors), errors)

    def test_required_field(self):
        self.assertError("sources.csv:2: required field 'url' is empty", lambda t: t["sources"][0].update(url=""))

    def test_duplicate_id(self):
        self.assertError("terms.csv:3: duplicate ID 'T1' (first at line 2)",
                         lambda t: t["terms"].append(dict(t["terms"][0])))

    def test_unknown_vocabulary_value(self):
        self.assertError("annotations.csv:2: unknown difficulty_ids value 'modal'",
                         lambda t: t["annotations"][0].update(difficulty_ids="modal"))

    def test_unknown_enum_value(self):
        self.assertError("units.csv:2: unknown link_type value 'translation'",
                         lambda t: t["units"][0].update(link_type="translation"))

    def test_missing_reference(self):
        self.assertError("term_forms.csv:2: term_id 'T9' not found in terms.csv",
                         lambda t: t["term_forms"][0].update(term_id="T9"))

    def test_span_not_found(self):
        self.assertError("annotations.csv:2: span_text 'Ждите' not found 1 time(s)",
                         lambda t: t["annotations"][0].update(span_text="Ждите"))

    def test_occurrence_beyond_text(self):
        self.assertError("annotations.csv:2: span_text 'Ожидайте' not found 2 time(s)",
                         lambda t: t["annotations"][0].update(occurrence="2"))

    def test_bad_seq(self):
        self.assertError("annotations.csv:2: seq 'x' must be a whole number >= 1",
                         lambda t: t["annotations"][0].update(seq="x"))

    def test_annotation_fragment_missing(self):
        self.assertError("annotations.csv:2: fragment U1 / ru / 2 not found in fragments.csv",
                         lambda t: t["annotations"][0].update(seq="2"))

    def test_overlapping_selections(self):
        def add(t):
            t["annotations"].append({**t["annotations"][0], "annotation_id": "A2", "span_text": "Ожидайте перед"})
        self.assertError("annotations.csv:3: selection overlaps annotation at line 2", add)

    def test_annotation_without_category(self):
        self.assertError("annotations.csv:2: set difficulty_ids or strategy_ids",
                         lambda t: t["annotations"][0].update(difficulty_ids=""))

    def test_confirmed_direction_needs_basis(self):
        self.assertError("units.csv:2: confirmed_translation requires source_lang and direction_basis",
                         lambda t: t["units"][0].update(direction_basis=""))

    def test_training_needs_source_lang(self):
        self.assertError("units.csv:2: training example requires source_lang",
                         lambda t: t["units"][0].update(link_type="comparable", source_lang="", training="yes"))

    def test_source_lang_needs_fragment(self):
        self.assertError("units.csv:2: no kk fragment for source_lang",
                         lambda t: t["units"][0].update(source_lang="kk"))

    def test_approved_unit_cannot_link_illustrative_term(self):
        self.assertError("units.csv:2: approved unit links to term 'T1' with status 'illustrative'",
                         lambda t: t["terms"][0].update(status="illustrative"))

    def test_bad_date(self):
        self.assertError("sources.csv:2: accessed '24.11.2026' is not a date YYYY-MM-DD",
                         lambda t: t["sources"][0].update(accessed="24.11.2026"))

    # --- publishing safety ---
    def test_error_keeps_previous_build(self):
        self.assertEqual(self.build(), [])
        before = (self.out / "data.js").read_text(encoding="utf-8")
        self.assertNotEqual(self.build(lambda t: t["units"][0].update(status="bogus")), [])
        self.assertEqual((self.out / "data.js").read_text(encoding="utf-8"), before)

    def test_refuses_to_overwrite_foreign_folder(self):
        self.out.mkdir()
        (self.out / "notes.txt").write_text("keep me", encoding="utf-8")
        self.assertError(f"{self.out}: refusing to overwrite", None)
        self.assertTrue((self.out / "notes.txt").exists())

    def test_cli_reports_errors_and_exit_code(self):
        write_tables(self.data, {**copy.deepcopy(FIXTURE), "versions": []})
        result = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "build.py"), "--data", str(self.data), "--web", str(self.web),
             "--out", str(self.out)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("versions.csv: at least one version row is required", result.stderr)
        self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 tools/test_build.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'build'`

- [ ] **Step 3: Implement `tools/build.py`**

```python file=tools/build.py
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
LINK_TYPES = ("confirmed_translation", "parallel_unknown_direction", "comparable")
ALIGNMENT = ("aligned", "in_review")
STATUSES = ("approved", "illustrative", "draft")
CHECKS = ("verified", "pending")
TRAINING = ("yes", "no")

# table: (all columns, required columns)
SCHEMA = {
    "vocab/topics": ("id label", "id label"),
    "vocab/difficulties": ("id label", "id label"),
    "vocab/strategies": ("id label", "id label"),
    "vocab/genres": ("id label", "id label"),
    "sources": ("source_id title organization lang genre_id audience url accessed published edition locator",
                "source_id title organization lang genre_id audience url accessed"),
    "terms": ("term_id topic_id definition definition_source_id definition_locator context difficulty_ids "
              "difficulty_note status",
              "term_id topic_id definition definition_source_id status"),
    "term_forms": ("term_id lang form abbreviation source_id locator check_status",
                   "term_id lang form source_id check_status"),
    "units": ("unit_id title topic_id term_ids link_type source_lang direction_basis alignment_status training "
              "status note",
              "unit_id title topic_id link_type alignment_status status"),
    "fragments": ("unit_id lang seq text source_id locator", "unit_id lang seq text source_id"),
    "annotations": ("annotation_id unit_id lang seq span_text occurrence compared_with difficulty_ids strategy_ids "
                    "explanation evidence_source_id evidence_locator check_status",
                    "annotation_id unit_id lang span_text explanation evidence_source_id check_status"),
    "versions": ("version date changes", "version date changes"),
}


class Errors(list):
    def add(self, table, line, msg):
        self.append(f"{table}.csv:{line}: {msg}" if line else f"{table}.csv: {msg}")


def ids(value):
    return [x.strip() for x in value.split(";") if x.strip()]


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
            missing = [c for c in cols.split() if c not in (reader.fieldnames or [])]
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


def allowed(err, table, row, col, values, many=False):
    for v in ids(row[col]) if many else ([row[col]] if row[col] else []):
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
        allowed(err, "sources", r, "lang", LANGS)
        allowed(err, "sources", r, "genre_id", vocab["genres"])
        iso_date(err, "sources", r, "accessed")

    terms = unique(err, "terms", t["terms"], lambda r: r["term_id"])
    for r in t["terms"]:
        allowed(err, "terms", r, "topic_id", vocab["topics"])
        allowed(err, "terms", r, "difficulty_ids", vocab["difficulties"], many=True)
        allowed(err, "terms", r, "status", STATUSES)
        refs(err, "terms", r, "definition_source_id", "sources", sources)

    unique(err, "term_forms", t["term_forms"], lambda r: f"{r['term_id']} / {r['lang']} / {r['form']}")
    for r in t["term_forms"]:
        refs(err, "term_forms", r, "term_id", "terms", terms)
        allowed(err, "term_forms", r, "lang", LANGS)
        allowed(err, "term_forms", r, "check_status", CHECKS)
        refs(err, "term_forms", r, "source_id", "sources", sources)

    units = unique(err, "units", t["units"], lambda r: r["unit_id"])
    for r in t["units"]:
        for col, values in (("topic_id", vocab["topics"]), ("link_type", LINK_TYPES), ("source_lang", LANGS),
                            ("alignment_status", ALIGNMENT), ("training", TRAINING), ("status", STATUSES)):
            allowed(err, "units", r, col, values)
        refs(err, "units", r, "term_ids", "terms", terms)
        if r["link_type"] == "confirmed_translation" and not (r["source_lang"] and r["direction_basis"]):
            err.add("units", r["_line"], "confirmed_translation requires source_lang and direction_basis")
        if r["training"] == "yes" and not r["source_lang"]:
            err.add("units", r["_line"], "training example requires source_lang")
        if r["status"] == "approved":
            for tid in ids(r["term_ids"]):
                if tid in terms and terms[tid]["status"] != "approved":
                    err.add("units", r["_line"],
                            f"approved unit links to term '{tid}' with status '{terms[tid]['status']}'")

    for r in t["fragments"]:
        refs(err, "fragments", r, "unit_id", "units", units)
        allowed(err, "fragments", r, "lang", LANGS)
        refs(err, "fragments", r, "source_id", "sources", sources)
        r["seq"] = whole(err, "fragments", r, "seq")
    frags = unique(err, "fragments", [r for r in t["fragments"] if r["seq"]],
                   lambda r: f"{r['unit_id']} / {r['lang']} / {r['seq']}")

    for r in t["units"]:
        lang = r["source_lang"]
        if lang in LANGS and not any(f["unit_id"] == r["unit_id"] and f["lang"] == lang for f in frags.values()):
            err.add("units", r["_line"], f"no {lang} fragment for source_lang")

    unique(err, "annotations", t["annotations"], lambda r: r["annotation_id"])
    taken = {}
    for r in t["annotations"]:
        tb, line = "annotations", r["_line"]
        refs(err, tb, r, "unit_id", "units", units)
        allowed(err, tb, r, "lang", LANGS)
        allowed(err, tb, r, "compared_with", LANGS)
        allowed(err, tb, r, "difficulty_ids", vocab["difficulties"], many=True)
        allowed(err, tb, r, "strategy_ids", vocab["strategies"], many=True)
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
        for r in t["terms"] if r["status"] != "draft"
    ]
    published = {x["term_id"] for x in terms}
    units = []
    for r in t["units"]:
        if r["status"] == "draft":
            continue
        uid = r["unit_id"]
        anns = [a for a in t["annotations"] if a["unit_id"] == uid]
        units.append({
            **clean(r),
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
        "sources": {r["source_id"]: clean(r) for r in t["sources"]},
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 tools/test_build.py -v`
Expected: all tests `ok`, final line `OK`.

- [ ] **Step 5: Commit**

```bash
git add tools/build.py tools/test_build.py
git commit -m "feat: add corpus validation and static build script"
```

---
### Task 2: Demo dataset, vocabularies, methodology draft, templates

**Files:**
- Create: `data/vocab/{topics,difficulties,strategies,genres}.csv`, `data/{sources,terms,term_forms,units,fragments,annotations,versions}.csv`, `data/methodology.html`
- Create: `templates/**.csv` (generated, header only)
- Test: `tools/test_data.py`

**Interfaces:**
- Consumes: `build.SCHEMA`, `build.build()` (Task 1); `read_data()` from `tools/test_build.py`.
- Produces: demo records used in later manual checks — terms `T-RUNWAY`, `T-ATC`, `T-CLEARANCE`, `T-HOLD-SHORT`, `T-GO-AROUND`, `T-SQUAWK`; units `U-001`…`U-006`. All records `illustrative`; demo sources are explicitly constructed (no claims about ICAO/FAA wording).

- [ ] **Step 1: Write the failing test**

```python file=tools/test_data.py
"""Checks the shipped demo dataset and templates. Run: python3 tools/test_data.py -v"""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build  # noqa: E402
from test_build import read_data  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


class RepoDataTest(unittest.TestCase):
    def test_repo_data_builds(self):
        with tempfile.TemporaryDirectory() as tmp:
            web, out = Path(tmp) / "web", Path(tmp) / "dist"
            web.mkdir()
            self.assertEqual(build.build(ROOT / "data", web, out), [])
            data = read_data(out)
        runway = next(t for t in data["terms"] if t["term_id"] == "T-RUNWAY")
        forms = {f["lang"]: f["form"] for f in runway["forms"]}
        self.assertEqual(forms["ru"], "взлётно-посадочная полоса")
        self.assertEqual(forms["kk"], "ұшу-қону жолағы")
        self.assertTrue(all(u["status"] == "illustrative" for u in data["units"]))
        self.assertEqual({u["link_type"] for u in data["units"]}, set(build.LINK_TYPES))
        covered = {d for u in data["units"] for a in u["annotations"] for d in a["difficulty_ids"]}
        self.assertEqual(covered, set(data["vocab"]["difficulties"]))
        self.assertIn("U-001", [u["unit_id"] for u in data["units"] if "T-RUNWAY" in u["term_ids"]])

    def test_templates_match_schema(self):
        for name, (cols, _) in build.SCHEMA.items():
            header = (ROOT / "templates" / f"{name}.csv").read_text(encoding="utf-8").splitlines()[0]
            self.assertEqual(header.split(","), cols.split(), name)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 tools/test_data.py -v`
Expected: FAIL — errors such as `vocab/topics.csv: file is missing` and `FileNotFoundError` for templates.

- [ ] **Step 3: Create vocabularies**

```csv file=data/vocab/topics.csv
id,label
aerodrome,Aerodrome and runway operations
atc,Air traffic services
clearances,Clearances and instructions
radiotelephony,Radiotelephony procedures
```

```csv file=data/vocab/difficulties.csv
id,label
term_equivalence,Terminological equivalence
abbreviation,Abbreviations
syntax,Syntax
modality,Modality
pragmatic_function,Pragmatic function
term_consistency,Terminological consistency
```

```csv file=data/vocab/strategies.csv
id,label
established_equivalent,Established equivalent
borrowing,Borrowing
calque,Calque
descriptive,Descriptive translation
explicitation,Explicitation
generalization,Generalization
compression,Compression
syntactic_restructuring,Syntactic restructuring
```

```csv file=data/vocab/genres.csv
id,label
regulation,Regulation / standard
phraseology,Radiotelephony phraseology
manual,Operations manual
training,Training material
```

- [ ] **Step 4: Create demo sources, terms and forms**

```csv file=data/sources.csv
source_id,title,organization,lang,genre_id,audience,url,accessed,published,edition,locator
DEMO-EN-PHR,Demo source EN-1: radiotelephony exchanges (constructed),Aviation Translation Lab demo,en,phraseology,Pilots and air traffic controllers,n/a - constructed for demonstration,2026-11-24,,,
DEMO-RU-PHR,Demo source RU-1: radiotelephony exchanges (constructed),Aviation Translation Lab demo,ru,phraseology,Pilots and air traffic controllers,n/a - constructed for demonstration,2026-11-24,,,
DEMO-KK-PHR,Demo source KK-1: radiotelephony exchanges (constructed),Aviation Translation Lab demo,kk,phraseology,Pilots and air traffic controllers,n/a - constructed for demonstration,2026-11-24,,,
DEMO-EN-REG,Demo source EN-2: operating rules excerpt (constructed),Aviation Translation Lab demo,en,regulation,Flight crew,n/a - constructed for demonstration,2026-11-24,,,
DEMO-RU-REG,Demo source RU-2: operating rules excerpt (constructed),Aviation Translation Lab demo,ru,regulation,Flight crew,n/a - constructed for demonstration,2026-11-24,,,
DEMO-KK-REG,Demo source KK-2: operating rules excerpt (constructed),Aviation Translation Lab demo,kk,regulation,Flight crew,n/a - constructed for demonstration,2026-11-24,,,
DEMO-GLOSS,Demo glossary of illustrative paraphrases (constructed),Aviation Translation Lab demo,en,training,Translators and trainees,n/a - constructed for demonstration,2026-11-24,,,
```

```csv file=data/terms.csv
term_id,topic_id,definition,definition_source_id,definition_locator,context,difficulty_ids,difficulty_note,status
T-RUNWAY,aerodrome,A defined rectangular area at an aerodrome prepared for the landing and take-off of aircraft (illustrative paraphrase).,DEMO-GLOSS,entry 1,"Runway 24, cleared to land.",term_equivalence;abbreviation,"Russian and Kazakh use descriptive multi-word terms; Russian also uses the established abbreviation ВПП instead of borrowing RWY.",illustrative
T-ATC,atc,The service that directs aircraft to prevent collisions and keep air traffic flowing in an orderly way (illustrative paraphrase).,DEMO-GLOSS,entry 2,Contact Almaty Control on 125.1.,abbreviation;term_equivalence,"ATC names both the service and the controlling unit; Russian uses its own abbreviation УВД rather than borrowing ATC.",illustrative
T-CLEARANCE,clearances,An authorization from air traffic control for an aircraft to proceed under specified conditions (illustrative paraphrase).,DEMO-GLOSS,entry 3,Pilots shall read back the ATC clearance.,term_equivalence;pragmatic_function,"Polysemous: an ATC clearance (authorization) differs from obstacle clearance (vertical distance above obstacles, Russian «запас высоты над препятствиями»). The equivalent is chosen by meaning and context.",illustrative
T-HOLD-SHORT,clearances,"An instruction to stop before a specified point, such as a runway, and wait (illustrative paraphrase).",DEMO-GLOSS,entry 4,Hold short of runway 06.,modality;syntax,"Imperative with a locative phrase; Russian restructures the clause around the verb «ожидать».",illustrative
T-GO-AROUND,aerodrome,A procedure in which an aircraft on approach discontinues the landing and climbs to make another approach (illustrative paraphrase).,DEMO-GLOSS,entry 5,"Go around, I say again, go around.",term_equivalence;term_consistency,Russian and Kazakh equivalents are descriptive; consistency across documents should be checked.,illustrative
T-SQUAWK,radiotelephony,An instruction to set a given code on the aircraft transponder (illustrative paraphrase).,DEMO-GLOSS,entry 6,Squawk 4521.,term_equivalence;pragmatic_function,Jargon verb with no one-word equivalent; Russian and Kazakh use descriptive translation.,illustrative
```

```csv file=data/term_forms.csv
term_id,lang,form,abbreviation,source_id,locator,check_status
T-RUNWAY,en,runway,RWY,DEMO-EN-PHR,ex. 1,verified
T-RUNWAY,ru,взлётно-посадочная полоса,ВПП,DEMO-RU-PHR,ex. 1,verified
T-RUNWAY,kk,ұшу-қону жолағы,,DEMO-KK-PHR,ex. 1,pending
T-ATC,en,air traffic control,ATC,DEMO-EN-PHR,ex. 2,verified
T-ATC,ru,управление воздушным движением,УВД,DEMO-RU-PHR,ex. 2,verified
T-ATC,kk,әуе қозғалысын басқару,,DEMO-KK-PHR,ex. 2,pending
T-CLEARANCE,en,clearance,,DEMO-EN-REG,§ 1,verified
T-CLEARANCE,ru,диспетчерское разрешение,,DEMO-RU-REG,§ 1,verified
T-CLEARANCE,kk,диспетчерлік рұқсат,,DEMO-KK-REG,§ 1,pending
T-HOLD-SHORT,en,hold short,,DEMO-EN-PHR,ex. 3,verified
T-HOLD-SHORT,ru,ожидайте перед ВПП,,DEMO-RU-PHR,ex. 3,pending
T-GO-AROUND,en,go around,,DEMO-EN-PHR,ex. 4,verified
T-GO-AROUND,ru,уход на второй круг,,DEMO-RU-PHR,ex. 4,verified
T-GO-AROUND,kk,екінші айналымға кету,,DEMO-KK-PHR,ex. 4,pending
T-SQUAWK,en,squawk,,DEMO-EN-PHR,ex. 5,verified
T-SQUAWK,ru,установите код ответчика,,DEMO-RU-PHR,ex. 5,pending
```

- [ ] **Step 5: Create demo units, fragments, annotations, versions**

```csv file=data/units.csv
unit_id,title,topic_id,term_ids,link_type,source_lang,direction_basis,alignment_status,training,status,note
U-001,Landing clearance,clearances,T-RUNWAY;T-CLEARANCE,confirmed_translation,en,Demo: constructed English original with Russian and Kazakh renderings.,aligned,no,illustrative,
U-002,Frequency change instruction,atc,T-ATC,parallel_unknown_direction,,,aligned,no,illustrative,Parallel versions; which text is the original is not documented.
U-003,Holding short of the runway,clearances,T-HOLD-SHORT;T-RUNWAY,confirmed_translation,en,Demo: constructed English original with a Russian rendering.,aligned,no,illustrative,Kazakh version is not available.
U-004,Go-around instruction,aerodrome,T-GO-AROUND,confirmed_translation,en,Demo: constructed English original.,in_review,no,illustrative,Russian splits one English sentence into two; alignment is under review.
U-005,Read-back requirement,clearances,T-CLEARANCE,comparable,en,,aligned,yes,illustrative,Comparable rule texts; marked as a training example for scoring practice.
U-006,Transponder code instruction,radiotelephony,T-SQUAWK,confirmed_translation,en,Demo: constructed English original.,aligned,no,illustrative,
```

```csv file=data/fragments.csv
unit_id,lang,seq,text,source_id,locator
U-001,en,1,"Runway 24, cleared to land.",DEMO-EN-PHR,ex. 1
U-001,ru,1,Посадку на ВПП 24 разрешаю.,DEMO-RU-PHR,ex. 1
U-001,kk,1,24 ұшу-қону жолағына қонуға рұқсат етемін.,DEMO-KK-PHR,ex. 1
U-002,en,1,Contact Almaty Control on 125.1.,DEMO-EN-PHR,ex. 2
U-002,ru,1,"Работайте с Алматы-Контроль на частоте 125,1.",DEMO-RU-PHR,ex. 2
U-002,kk,1,"Алматы басқару орталығымен 125,1 жиілігінде байланысыңыз.",DEMO-KK-PHR,ex. 2
U-003,en,1,Hold short of runway 06.,DEMO-EN-PHR,ex. 3
U-003,ru,1,Ожидайте перед ВПП 06.,DEMO-RU-PHR,ex. 3
U-004,en,1,"Go around, I say again, go around.",DEMO-EN-PHR,ex. 4
U-004,ru,1,Уходите на второй круг.,DEMO-RU-PHR,ex. 4
U-004,ru,2,Повторяю: уходите на второй круг.,DEMO-RU-PHR,ex. 4
U-004,kk,1,"Екінші айналымға кетіңіз, қайталаймын, екінші айналымға кетіңіз.",DEMO-KK-PHR,ex. 4
U-005,en,1,Pilots shall read back the ATC clearance.,DEMO-EN-REG,§ 2
U-005,ru,1,Экипаж обязан повторить диспетчерское разрешение.,DEMO-RU-REG,§ 2
U-005,kk,1,Экипаж диспетчерлік рұқсатты қайталауға міндетті.,DEMO-KK-REG,§ 2
U-006,en,1,Squawk 4521.,DEMO-EN-PHR,ex. 5
U-006,ru,1,Установите код ответчика 4521.,DEMO-RU-PHR,ex. 5
U-006,kk,1,Ответчик кодын 4521 етіп орнатыңыз.,DEMO-KK-PHR,ex. 5
```

```csv file=data/annotations.csv
annotation_id,unit_id,lang,seq,span_text,occurrence,compared_with,difficulty_ids,strategy_ids,explanation,evidence_source_id,evidence_locator,check_status
AN-001,U-001,ru,1,разрешаю,1,en,pragmatic_function;syntax,syntactic_restructuring,"English 'cleared to land' (passive participle) becomes the first-person performative 'разрешаю', making the controller's authority explicit.",DEMO-RU-PHR,ex. 1,verified
AN-002,U-001,ru,1,ВПП,1,en,abbreviation,established_equivalent,'Runway' is rendered by the established Russian abbreviation ВПП rather than by a borrowing.,DEMO-RU-PHR,ex. 1,verified
AN-003,U-001,kk,1,ұшу-қону жолағына,1,en,term_equivalence,descriptive,Kazakh uses the descriptive compound 'ұшу-қону жолағы' (take-off and landing strip) with a case ending.,DEMO-KK-PHR,ex. 1,pending
AN-004,U-002,ru,1,Работайте с,1,en,pragmatic_function,established_equivalent,"'Contact' is rendered by the conventional Russian radiotelephony formula 'работайте с', not by a literal 'свяжитесь'.",DEMO-RU-PHR,ex. 2,verified
AN-005,U-002,kk,1,байланысыңыз,1,en,pragmatic_function,calque,Kazakh 'байланысыңыз' (contact) follows the English verb literally.,DEMO-KK-PHR,ex. 2,pending
AN-006,U-003,ru,1,Ожидайте,1,en,modality,syntactic_restructuring,"The English imperative 'hold short' is rendered as 'ожидайте' (wait), shifting the focus from position to action.",DEMO-RU-PHR,ex. 3,verified
AN-007,U-003,ru,1,ВПП,1,en,abbreviation,compression,'Runway' is compressed to the abbreviation ВПП.,DEMO-RU-PHR,ex. 3,verified
AN-008,U-004,ru,2,Повторяю,1,en,syntax,syntactic_restructuring,The repeated English instruction is split into two Russian sentences.,DEMO-RU-PHR,ex. 4,verified
AN-009,U-004,kk,1,екінші айналымға кетіңіз,1,en,term_consistency,established_equivalent,"The term is repeated in identical form, preserving terminological consistency.",DEMO-KK-PHR,ex. 4,pending
AN-010,U-005,ru,1,обязан,1,en,modality,established_equivalent,"Deontic 'shall' is rendered by 'обязан', preserving the requirement.",DEMO-RU-REG,§ 2,verified
AN-011,U-005,kk,1,міндетті,1,en,modality,established_equivalent,"Deontic 'shall' is rendered by 'міндетті', preserving the requirement.",DEMO-KK-REG,§ 2,pending
AN-012,U-005,ru,1,диспетчерское разрешение,1,en,term_equivalence;abbreviation,explicitation,The abbreviation 'ATC' in 'ATC clearance' is not reproduced; its meaning is carried by the adjective 'диспетчерское'.,DEMO-RU-REG,§ 2,verified
AN-013,U-006,ru,1,Установите код ответчика,1,en,term_equivalence,descriptive,The jargon verb 'squawk' has no one-word Russian equivalent and is rendered descriptively.,DEMO-RU-PHR,ex. 5,verified
AN-014,U-006,kk,1,Ответчик,1,en,term_equivalence,borrowing,Kazakh borrows 'ответчик' (transponder) from Russian.,DEMO-KK-PHR,ex. 5,pending
```

```csv file=data/versions.csv
version,date,changes
0.1-demo,2026-11-24,Initial prototype release with the illustrative demo dataset; the research corpus is not yet populated.
```

- [ ] **Step 6: Create the methodology draft**

```html file=data/methodology.html
<p class="draft-note"><strong>Draft for the author.</strong> Replace this text with the approved wording of the dissertation before publishing the research corpus.</p>

<h2>Aim</h2>
<p>To document, compare and visualise translation challenges in selected English, Russian and Kazakh aviation texts, linking every analytical observation to its source passage and supporting criterion-based evaluation of translation choices.</p>

<h2>Research questions</h2>
<ol>
  <li>Which translation difficulties recur when aviation terminology and phraseology are rendered between English, Russian and Kazakh?</li>
  <li>Which strategies are used to resolve these difficulties, and how consistently?</li>
  <li>How do the chosen strategies affect terminological accuracy, clarity, preservation of meaning and functional equivalence?</li>
</ol>

<h2>Source selection criteria</h2>
<ul>
  <li>Authoritative aviation documents: ICAO and FAA materials and official sources of the Republic of Kazakhstan.</li>
  <li>Availability of at least two language versions, or of comparable texts on the same subject.</li>
  <li>Permission to quote the material in a public research prototype.</li>
  <li>Planned scope: about 15–20 document sets, subject to the availability of comparable materials.</li>
</ul>

<h2>Alignment and coding procedure</h2>
<ol>
  <li>Each document set is segmented into units of analysis; one unit may link one sentence to several (merging or splitting).</li>
  <li>The link type is recorded: confirmed translation, parallel version with unknown direction, or comparable text. Direction is recorded only when it is documented.</li>
  <li>Doubtful alignments are marked <em>In review</em>.</li>
  <li>Selected spans are coded with the difficulty categories and strategies listed below, with an explanation and a supporting source.</li>
  <li>Every equivalent and definition is checked against relevant specialist sources; unchecked forms are marked <em>Pending validation</em>.</li>
</ol>

<h2>Limitations of the sample</h2>
<p>The corpus is small and purposive: frequencies describe the sample and cannot be generalised to aviation discourse as a whole. Translation direction is often undocumented in public materials. Visitor assessments in this prototype are illustrative and are not part of the research data.</p>

<h2>Bibliography</h2>
<p class="muted">Starting points to be verified and extended by the author.</p>
<ul>
  <li>Baker, M. <em>In Other Words: A Coursebook on Translation</em>. Routledge.</li>
  <li>House, J. <em>Translation Quality Assessment: Past and Present</em>. Routledge, 2015.</li>
  <li>Nord, C. <em>Translating as a Purposeful Activity: Functionalist Approaches Explained</em>. Routledge.</li>
  <li>Vinay, J.-P., Darbelnet, J. <em>Comparative Stylistics of French and English: A Methodology for Translation</em>. John Benjamins, 1995.</li>
  <li>ICAO. <em>Manual of Radiotelephony</em> (Doc 9432).</li>
  <li>ICAO. <em>Procedures for Air Navigation Services — Air Traffic Management</em> (Doc 4444).</li>
</ul>

<h2>Stages of work</h2>
<ol>
  <li>Selection and collection of source documents.</li>
  <li>Alignment of EN, RU and KK fragments.</li>
  <li>Annotation of difficulties and strategies.</li>
  <li>Validation of equivalents against specialist sources.</li>
  <li>Rubric-based evaluation and statistical summary.</li>
  <li>Interpretation of the results for the dissertation.</li>
</ol>
```

- [ ] **Step 7: Generate header-only templates from the schema**

Run:
```bash
python3 -c "
import sys, pathlib; sys.path.insert(0, 'tools'); import build
for name, (cols, _) in build.SCHEMA.items():
    p = pathlib.Path('templates') / f'{name}.csv'
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(','.join(cols.split()) + '\n', encoding='utf-8')
"
```
Expected: 11 files under `templates/` (4 in `templates/vocab/`).

- [ ] **Step 8: Run tests to verify they pass**

Run: `python3 tools/test_data.py -v && python3 tools/test_build.py`
Expected: `OK` for both.

- [ ] **Step 9: Commit**

```bash
git add data templates tools/test_data.py
git commit -m "feat: add illustrative demo dataset, vocabularies and CSV templates"
```

---

### Task 3: Pure logic library (`web/lib.js`)

**Files:**
- Create: `web/lib.js`
- Test: `tools/lib.test.js`

**Interfaces:**
- Consumes: `window.ATL_DATA` shape from Task 1.
- Produces (global `Lib` in browser, `module.exports` in node):
  - constants `LANGS`, `LANG_LABELS`, `LINK_LABELS`, `PAIRS`, `RUBRIC` (`[{id, name, levels[0..2]}]`), `RUBRIC_VERSION`, `TABLE_COLUMNS` (`[[key, header]]`), `DASHBOARD_CSV_COLUMNS`, `ASSESSMENT_CSV_COLUMNS` (`string[]`)
  - `datasetFor(data, mode) -> ds` (ds = data with filtered `terms`, `units`, plus `mode`, `empty`)
  - `datasetName(ds) -> 'demo'|'research'`
  - `searchTerms(terms, {q, topic, difficulty, check}) -> term[]`, `termCheck(term)`, `headword(term)`
  - `direction(unit) -> string`, `segments(text, anns) -> [{text, ann?}]`
  - `stats(ds, {genre, topic, pair, link}) -> {units, documents, terms, annotatedUnits, difficulties, strategies, termsByTopic, rows}`; `percent(share)`; `exportRows(ds, rows)`
  - `isScorable(unit)`, `rubricTotal(scores) -> number|null`, `assessmentRecord({ds, unit, target, scores, notes, comment, no, savedAt})`
  - `toCSV(rows, columns: string[]) -> string` (CRLF, RFC 4180 quoting)

- [ ] **Step 1: Write the failing tests**

```js file=tools/lib.test.js
// Run: node --test tools/lib.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/lib.js');

const vocab = {
  topics: { aerodrome: 'Aerodrome' },
  genres: { manual: 'Manual', phraseology: 'Phraseology' },
  difficulties: { modality: 'Modality', syntax: 'Syntax' },
  strategies: { calque: 'Calque' },
};
const sources = { S1: { source_id: 'S1', title: 'Source', genre_id: 'manual' } };
const ann = (id, diffs, check = 'verified') => ({
  annotation_id: id, label: 'A1', lang: 'ru', seq: 1, span_text: 'x', start: 0, end: 1, compared_with: 'en',
  difficulty_ids: diffs, strategy_ids: [], explanation: 'e', evidence_source_id: 'S1', evidence_locator: 'p. 2',
  check_status: check,
});
const frag = lang => ({ lang, seq: 1, text: 'x', source_id: 'S1', locator: 'p. 1' });
const unit = (id, status, diffs, extra = {}) => ({
  unit_id: id, title: id, topic_id: 'aerodrome', term_ids: ['T1'], link_type: 'confirmed_translation',
  source_lang: 'en', direction_basis: 'b', alignment_status: 'aligned', training: false, status,
  fragments: [frag('en'), frag('ru')], annotations: [ann(id + '-A', diffs)], ...extra,
});
const runway = {
  term_id: 'T1', topic_id: 'aerodrome', difficulty_ids: ['syntax'], status: 'approved', forms: [
    { lang: 'en', form: 'runway', abbreviation: 'RWY', check_status: 'verified' },
    { lang: 'ru', form: 'Взлётно-посадочная полоса', abbreviation: 'ВПП', check_status: 'verified' },
    { lang: 'kk', form: 'Ұшу-қону жолағы', abbreviation: '', check_status: 'pending' }],
};
const DATA = {
  version: { current: { version: '1.0', date: '2026-11-24', changes: 'c' }, history: [] },
  vocab, sources, terms: [runway],
  units: [unit('U1', 'approved', ['modality']), unit('U2', 'approved', ['syntax']), unit('U3', 'illustrative', ['modality'])],
  methodology: '',
};

test('modality: 1 of 2 approved units (50%), illustrative unit excluded', () => {
  const s = L.stats(L.datasetFor(DATA, 'research'));
  const m = s.difficulties.find(d => d.id === 'modality');
  assert.equal(s.annotatedUnits, 2);
  assert.equal(m.count, 1);
  assert.equal(L.percent(m.share), '50%');
});

test('demo mode counts illustrative units too', () => {
  const s = L.stats(L.datasetFor(DATA, 'demo'));
  assert.equal(s.annotatedUnits, 3);
  assert.equal(s.difficulties.find(d => d.id === 'modality').count, 2);
});

test('pending annotations are excluded in research mode only', () => {
  const data = { ...DATA, units: [unit('U1', 'approved', [], { annotations: [ann('P', ['modality'], 'pending')] })] };
  assert.equal(L.stats(L.datasetFor(data, 'research')).annotatedUnits, 0);
  assert.equal(L.stats(L.datasetFor(data, 'demo')).annotatedUnits, 1);
});

test('filters update counters, charts and rows together', () => {
  const ds = L.datasetFor(DATA, 'research');
  const all = L.stats(ds);
  assert.deepEqual([all.units, all.documents, all.terms, all.rows.length], [2, 1, 1, 2]);
  const none = L.stats(ds, { pair: 'en-kk' });
  assert.deepEqual([none.units, none.annotatedUnits, none.rows.length], [0, 0, 0]);
  assert.equal(L.stats(ds, { genre: 'phraseology' }).units, 0);
  assert.equal(L.stats(ds, { genre: 'manual', link: 'confirmed_translation' }).units, 2);
  assert.equal(L.stats(ds, { link: 'comparable' }).units, 0);
});

test('labels may sum to more than 100%', () => {
  const data = { ...DATA, units: [unit('U1', 'approved', ['modality', 'syntax'])] };
  const s = L.stats(L.datasetFor(data, 'research'));
  assert.equal(s.difficulties.reduce((sum, d) => sum + d.share, 0), 2);
});

test('dashboard CSV has exactly the filtered table rows', () => {
  const ds = L.datasetFor(DATA, 'research');
  const s = L.stats(ds);
  const lines = L.toCSV(L.exportRows(ds, s.rows), L.DASHBOARD_CSV_COLUMNS).trim().split('\r\n');
  assert.equal(lines.length, s.rows.length + 1);
  assert.equal(lines[0], L.DASHBOARD_CSV_COLUMNS.join(','));
  assert.ok(lines[1].startsWith('research,1.0,U1,U1-A,RU,EN,x,Modality,'), lines[1]);
  assert.ok(lines[1].includes('S1 (p. 1)'));
});

test('rubric: 2,1,2,2 gives 7; a missing score gives no total', () => {
  assert.equal(L.rubricTotal({ terminology: 2, clarity: 1, meaning: 2, function: 2 }), 7);
  assert.equal(L.rubricTotal({ terminology: 2, clarity: 1, meaning: 2 }), null);
  assert.equal(L.rubricTotal({ terminology: 0, clarity: 0, meaning: 0, function: 0 }), 0);
});

test('assessment export contains scores and comments', () => {
  const ds = L.datasetFor(DATA, 'demo');
  const rec = L.assessmentRecord({
    ds, unit: DATA.units[0], target: 'ru', no: 1, savedAt: '2026-11-24T10:00:00Z',
    scores: { terminology: 2, clarity: 1, meaning: 2, function: 2 }, notes: { clarity: 'word "x", line 1' },
  });
  assert.equal(rec.total, 7);
  assert.equal(rec.status, 'Complete');
  const csv = L.toCSV([rec], L.ASSESSMENT_CSV_COLUMNS);
  assert.ok(csv.startsWith('dataset,assessment_no,unit_id,language_pair,corpus_version,rubric_version,mode,terminology,'));
  assert.ok(csv.includes('demo,1,U1,en→ru,1.0,R1.0,score,2,,1,"word ""x"", line 1",2,,2,,7,Complete'), csv);
});

test('incomplete assessment has no total; comparable units take comments only', () => {
  const ds = L.datasetFor(DATA, 'demo');
  assert.equal(L.assessmentRecord({ ds, unit: DATA.units[0], target: 'ru', scores: { terminology: 2 } }).status, 'Incomplete');
  const comparable = { ...DATA.units[0], link_type: 'comparable' };
  assert.equal(L.isScorable(comparable), false);
  assert.equal(L.isScorable({ ...comparable, training: true }), true);
  const rec = L.assessmentRecord({ ds, unit: comparable, target: 'ru', comment: 'c', scores: { terminology: 2 } });
  assert.deepEqual([rec.mode, rec.status, rec.terminology, rec.total], ['comment', 'Comment', '', '']);
});

test('search: Kazakh fragment, case, abbreviation, ё/е, filters and empty result', () => {
  const terms = L.datasetFor(DATA, 'research').terms;
  assert.deepEqual(L.searchTerms(terms, { q: 'ұшу-қону' }).map(t => t.term_id), ['T1']);
  assert.equal(L.searchTerms(terms, { q: 'ҰШУ' }).length, 1);
  assert.equal(L.searchTerms(terms, { q: 'rwy' }).length, 1);
  assert.equal(L.searchTerms(terms, { q: 'взлетно' }).length, 1);
  assert.equal(L.searchTerms(terms, { q: 'nonexistent' }).length, 0);
  assert.equal(L.searchTerms(terms, { check: 'pending' }).length, 1);
  assert.equal(L.searchTerms(terms, { check: 'verified' }).length, 0);
  assert.equal(L.searchTerms(terms, { difficulty: 'modality' }).length, 0);
  assert.equal(L.headword(runway), 'runway');
});

test('research mode hides illustrative records and reports an empty corpus', () => {
  const demoOnly = { ...DATA, terms: [{ ...runway, status: 'illustrative' }], units: [unit('U3', 'illustrative', ['modality'])] };
  assert.equal(L.datasetFor(demoOnly, 'research').empty, true);
  const demo = L.datasetFor(demoOnly, 'demo');
  assert.equal(demo.empty, false);
  assert.deepEqual(demo.units[0].term_ids, ['T1']);
  assert.deepEqual(L.datasetFor({ ...DATA, terms: [] }, 'research').units[0].term_ids, []);
});

test('direction is shown only for confirmed translations', () => {
  assert.equal(L.direction(DATA.units[0]), 'EN → RU');
  assert.equal(L.direction({ ...DATA.units[0], link_type: 'parallel_unknown_direction' }), 'Direction not established');
});

test('segments split text around highlights', () => {
  const parts = L.segments('Hold short of runway', [{ start: 5, end: 10, annotation_id: 'A' }]);
  assert.deepEqual(parts.map(p => p.text), ['Hold ', 'short', ' of runway']);
  assert.equal(parts[1].ann.annotation_id, 'A');
});

test('CSV escapes commas, quotes and newlines', () => {
  assert.equal(L.toCSV([{ a: 'x,y', b: 'say "hi"\nnow' }], ['a', 'b']), 'a,b\r\n"x,y","say ""hi""\nnow"\r\n');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/lib.test.js`
Expected: FAIL — `Cannot find module '../web/lib.js'`

- [ ] **Step 3: Implement `web/lib.js`**

```js file=web/lib.js
// Pure logic shared by the UI and the node tests. No DOM access here.
(function (root) {
  'use strict';

  const LANGS = ['en', 'ru', 'kk'];
  const LANG_LABELS = { en: 'EN', ru: 'RU', kk: 'KK' };
  const LINK_LABELS = {
    confirmed_translation: 'Confirmed translation',
    parallel_unknown_direction: 'Parallel version — direction not established',
    comparable: 'Comparable texts',
  };
  const PAIRS = { 'en-ru': ['en', 'ru'], 'en-kk': ['en', 'kk'], 'ru-kk': ['ru', 'kk'] };
  const RUBRIC_VERSION = 'R1.0';
  // levels[score] describes the score 0, 1 or 2 (spec 5.1 / ТЗ 5.1).
  const RUBRIC = [
    { id: 'terminology', name: 'Terminological accuracy', levels: [
      'Concept replaced or essential meaning of the term lost.',
      'Concept recognisable, but with an inaccuracy or inconsistency.',
      'Concept rendered accurately and used consistently.'] },
    { id: 'clarity', name: 'Clarity', levels: [
      'Wording prevents understanding of the key message.',
      'Meaning recoverable from context; some ambiguity.',
      'Unambiguous for the intended audience.'] },
    { id: 'meaning', name: 'Preservation of meaning', levels: [
      'Essential content lost or distorted.',
      'Local loss or addition; core meaning preserved.',
      'Essential facts, relations and conditions preserved.'] },
    { id: 'function', name: 'Functional equivalence', levels: [
      'Function changed, e.g. a requirement rendered as advice.',
      'Function broadly preserved with a noticeable deviation.',
      'Communicative purpose and force preserved.'] },
  ];
  const TABLE_COLUMNS = [
    ['unit_id', 'Unit'], ['annotation_id', 'Annotation'], ['lang', 'Language'], ['compared_with', 'Compared with'],
    ['span', 'Selection'], ['difficulties', 'Difficulties'], ['strategies', 'Strategies'], ['link_type', 'Link type'],
    ['topic', 'Topic'], ['sources', 'Sources'], ['evidence', 'Evidence'], ['check_status', 'Check status'],
  ];
  const DASHBOARD_CSV_COLUMNS = ['dataset', 'corpus_version', ...TABLE_COLUMNS.map(c => c[0])];
  const ASSESSMENT_CSV_COLUMNS = ['dataset', 'assessment_no', 'unit_id', 'language_pair', 'corpus_version',
    'rubric_version', 'mode', ...RUBRIC.flatMap(c => [c.id, c.id + '_note']), 'total', 'status', 'comment', 'saved_at'];

  // Research mode = approved only; demo mode = approved + illustrative.
  function datasetFor(data, mode) {
    const visible = s => s === 'approved' || (mode === 'demo' && s === 'illustrative');
    const terms = data.terms.filter(t => visible(t.status));
    const termIds = new Set(terms.map(t => t.term_id));
    const units = data.units.filter(u => visible(u.status))
      .map(u => ({ ...u, term_ids: u.term_ids.filter(id => termIds.has(id)) }));
    return { ...data, mode, terms, units, empty: !terms.length && !units.length };
  }
  const datasetName = ds => (ds.mode === 'demo' ? 'demo' : 'research');

  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const termCheck = t => (t.forms.some(f => f.check_status === 'pending') ? 'pending' : 'verified');
  function searchTerms(terms, { q = '', topic = '', difficulty = '', check = '' } = {}) {
    const needle = norm(q).trim();
    return terms.filter(t =>
      (!needle || t.forms.some(f => norm(f.form).includes(needle) || norm(f.abbreviation).includes(needle))) &&
      (!topic || t.topic_id === topic) &&
      (!difficulty || t.difficulty_ids.includes(difficulty)) &&
      (!check || termCheck(t) === check));
  }
  const headword = t => (t.forms.find(f => f.lang === 'en') || t.forms[0] || { form: t.term_id }).form;

  function direction(unit) {
    if (unit.link_type !== 'confirmed_translation') return 'Direction not established';
    const targets = LANGS.filter(l => l !== unit.source_lang && unit.fragments.some(f => f.lang === l));
    return LANG_LABELS[unit.source_lang] + ' → ' + targets.map(l => LANG_LABELS[l]).join(', ');
  }

  // Split text into plain and highlighted pieces; start/end are UTF-16 offsets computed by the build.
  function segments(text, anns) {
    const out = [];
    let pos = 0;
    for (const a of [...anns].sort((x, y) => x.start - y.start)) {
      if (a.start > pos) out.push({ text: text.slice(pos, a.start) });
      out.push({ text: text.slice(a.start, a.end), ann: a });
      pos = a.end;
    }
    if (pos < text.length) out.push({ text: text.slice(pos) });
    return out;
  }

  function filterUnits(ds, f) {
    return ds.units.filter(u =>
      (!f.genre || u.fragments.some(fr => (ds.sources[fr.source_id] || {}).genre_id === f.genre)) &&
      (!f.topic || u.topic_id === f.topic) &&
      (!f.pair || PAIRS[f.pair].every(l => u.fragments.some(fr => fr.lang === l))) &&
      (!f.link || u.link_type === f.link));
  }

  function countedAnnotations(ds, unit, f) {
    const pair = f.pair && PAIRS[f.pair];
    return unit.annotations.filter(a =>
      (ds.mode === 'demo' || a.check_status === 'verified') &&
      (!pair || (pair.includes(a.lang) && (!a.compared_with || pair.includes(a.compared_with)))));
  }

  const ref = (id, locator) => id + (locator ? ' (' + locator + ')' : '');
  function tableRow(ds, u, a) {
    const names = (list, key) => list.map(id => ds.vocab[key][id]).join('; ');
    return {
      unit_id: u.unit_id, annotation_id: a.annotation_id, lang: LANG_LABELS[a.lang],
      compared_with: LANG_LABELS[a.compared_with] || '', span: a.span_text,
      difficulties: names(a.difficulty_ids, 'difficulties'), strategies: names(a.strategy_ids, 'strategies'),
      link_type: LINK_LABELS[u.link_type], topic: ds.vocab.topics[u.topic_id],
      sources: [...new Set(u.fragments.map(fr => ref(fr.source_id, fr.locator)))].join('; '),
      evidence: ref(a.evidence_source_id, a.evidence_locator), check_status: a.check_status,
    };
  }

  // Frequency = unique annotated units carrying a label; share = frequency / N annotated units after filtering.
  function stats(ds, f = {}) {
    const units = filterUnits(ds, f);
    const annotated = units.map(u => ({ u, anns: countedAnnotations(ds, u, f) })).filter(x => x.anns.length);
    const n = annotated.length;
    const freq = (vocabKey, field) => Object.entries(ds.vocab[vocabKey]).map(([id, label]) => {
      const count = annotated.filter(x => x.anns.some(a => a[field].includes(id))).length;
      return { id, label, count, share: n ? count / n : 0 };
    });
    const termIds = new Set(units.flatMap(u => u.term_ids));
    const terms = ds.terms.filter(t => termIds.has(t.term_id));
    return {
      units: units.length,
      documents: new Set(units.flatMap(u => u.fragments.map(fr => fr.source_id))).size,
      terms: terms.length,
      annotatedUnits: n,
      difficulties: freq('difficulties', 'difficulty_ids'),
      strategies: freq('strategies', 'strategy_ids'),
      termsByTopic: Object.entries(ds.vocab.topics).map(([id, label]) =>
        ({ id, label, count: terms.filter(t => t.topic_id === id).length })),
      rows: annotated.flatMap(x => x.anns.map(a => tableRow(ds, x.u, a))),
    };
  }
  const percent = share => Math.round(share * 100) + '%';
  const exportRows = (ds, rows) =>
    rows.map(r => ({ dataset: datasetName(ds), corpus_version: ds.version.current.version, ...r }));

  const isScorable = u => u.link_type === 'confirmed_translation' || u.training === true;
  function rubricTotal(scores) {
    const vals = RUBRIC.map(c => scores[c.id]);
    return vals.every(v => v === 0 || v === 1 || v === 2) ? vals.reduce((a, b) => a + b, 0) : null;
  }
  function assessmentRecord({ ds, unit, target, scores = {}, notes = {}, comment = '', no = '', savedAt = '' }) {
    const scorable = isScorable(unit);
    const total = scorable ? rubricTotal(scores) : null;
    const rec = {
      dataset: datasetName(ds), assessment_no: no, unit_id: unit.unit_id,
      language_pair: (unit.source_lang || 'n/a') + '→' + target,
      corpus_version: ds.version.current.version, rubric_version: RUBRIC_VERSION,
      mode: scorable ? 'score' : 'comment', total: total === null ? '' : total,
      status: !scorable ? 'Comment' : total === null ? 'Incomplete' : 'Complete', comment, saved_at: savedAt,
    };
    for (const c of RUBRIC) {
      rec[c.id] = scorable && scores[c.id] !== undefined ? scores[c.id] : '';
      rec[c.id + '_note'] = notes[c.id] || '';
    }
    return rec;
  }

  function toCSV(rows, columns) {
    const cell = v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [columns, ...rows.map(r => columns.map(c => r[c]))]
      .map(line => line.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  const lib = {
    LANGS, LANG_LABELS, LINK_LABELS, PAIRS, RUBRIC, RUBRIC_VERSION, TABLE_COLUMNS, DASHBOARD_CSV_COLUMNS,
    ASSESSMENT_CSV_COLUMNS, datasetFor, datasetName, searchTerms, termCheck, headword, direction, segments, stats,
    percent, exportRows, isScorable, rubricTotal, assessmentRecord, toCSV,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  else root.Lib = lib;
})(this);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/lib.test.js`
Expected: `# pass 14`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add web/lib.js tools/lib.test.js
git commit -m "feat: add search, statistics, rubric and CSV logic"
```

---
### Task 4: App shell, styles, Home and Methodology

**Files:**
- Create: `web/index.html`, `web/app.css`, `web/app.js`, `web/views/home.js`, `web/views/method.js`

**Interfaces:**
- Consumes: `Lib.datasetFor` (Task 3), `window.ATL_DATA` (Task 1).
- Produces global `App`:
  - `App.views: {[name]: (main: HTMLElement, ds, arg: string) => void}` — views register themselves; route `#/<name>/<arg>`.
  - `App.esc(s)`, `App.badge(text, kind)`, `App.checkBadge(status)`, `App.statusBadge(status)`, `App.options(map, selected, anyLabel='Any')`, `App.sourceRef(ds, sourceId, locator)`, `App.download(filename, csv, isDemo)`, `App.setHash(hash)` (no re-render), `App.store.get/set`, `App.render()`.
  - After each render, focus moves to the first `[data-focus]` element in `<main>`, else to `<h1>`.
  - Research mode with no approved records shows `Corpus under development` for dictionary/compare/dashboard/assess.

- [ ] **Step 1: Create the page skeleton**

`index.html` already lists all view scripts; views from later tasks simply fail to load until they exist (the router falls back to Home).

```html file=web/index.html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aviation Translation Lab</title>
  <link rel="stylesheet" href="app.css">
</head>
<body>
  <a class="skip" href="#main" data-action="skip">Skip to content</a>
  <header class="top">
    <a class="brand" href="#/">Aviation Translation Lab <small>Research Prototype</small></a>
    <nav aria-label="Modules">
      <ul>
        <li><a href="#/dictionary">Dictionary</a></li>
        <li><a href="#/compare">Compare</a></li>
        <li><a href="#/dashboard">Dashboard</a></li>
        <li><a href="#/assess">Assessment</a></li>
        <li><a href="#/method">Methodology</a></li>
      </ul>
    </nav>
    <div class="mode" id="mode"></div>
  </header>
  <div class="banner" id="banner" role="note" hidden>DEMO DATASET — illustrative records, not research results</div>
  <main id="main" tabindex="-1"></main>
  <footer class="foot"><span id="version"></span></footer>
  <script src="data.js"></script>
  <script src="lib.js"></script>
  <script src="app.js"></script>
  <script src="views/home.js"></script>
  <script src="views/dictionary.js"></script>
  <script src="views/compare.js"></script>
  <script src="views/dashboard.js"></script>
  <script src="views/assess.js"></script>
  <script src="views/method.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the stylesheet**

```css file=web/app.css
/* Aviation Translation Lab: projector-first dark theme (ТЗ colours #112642 / #D5B36A / #F3F5F8). */
:root {
  --bg: #112642; --panel: #1a3459; --field: #0b1a2f; --line: #34507a;
  --gold: #D5B36A; --text: #F3F5F8; --muted: #c5cddb;
  --ok: #9fe0b4; --warn: #ffb59e; --info: #a9cdff;
}
* { box-sizing: border-box; }
html { font-size: 112.5%; }
body {
  margin: 0; background: var(--bg); color: var(--text); line-height: 1.55;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif;
  overflow-wrap: anywhere;
}
a { color: var(--gold); }
:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
h1, h2, h3 { line-height: 1.25; }
h1 { font-size: 2rem; margin: .5rem 0 1rem; }
h2 { font-size: 1.4rem; }
h3 { font-size: 1.1rem; color: var(--gold); margin: 1rem 0 .4rem; }
code { font-size: .85em; }
.muted { color: var(--muted); }
.skip { position: absolute; left: -100vw; }
.skip:focus { left: 1rem; top: .5rem; z-index: 10; background: var(--gold); color: var(--bg); padding: .5rem 1rem; }

.top { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.5rem; padding: .75rem 1rem; border-bottom: 3px solid var(--gold); }
.brand { color: var(--text); text-decoration: none; font-weight: 700; font-size: 1.2rem; }
.brand small { display: block; color: var(--gold); font-weight: 600; font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; }
nav ul { display: flex; flex-wrap: wrap; gap: .25rem 1.1rem; list-style: none; margin: 0; padding: 0; }
nav a { text-decoration: none; padding: .2rem 0; border-bottom: 3px solid transparent; }
nav a[aria-current="page"] { color: var(--text); border-bottom-color: var(--gold); }
.mode { margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; font-size: .9rem; }
.banner { position: sticky; top: 0; z-index: 5; background: var(--gold); color: var(--bg); font-weight: 700; text-align: center; padding: .4rem 1rem; }
main { max-width: 76rem; margin: 0 auto; padding: 1rem; }
main:focus { outline: none; }
.foot { margin-top: 2rem; padding: 1.25rem 1rem; border-top: 1px solid var(--line); color: var(--muted); text-align: center; font-size: .9rem; }

button, .btn { font: inherit; font-weight: 600; display: inline-block; cursor: pointer; text-decoration: none; background: var(--gold); color: var(--bg); border: 2px solid var(--gold); border-radius: 4px; padding: .4rem 1rem; }
button.secondary, .btn.secondary { background: transparent; color: var(--gold); }
button.small { padding: .15rem .6rem; }
button.link { background: none; border: 0; padding: 0; color: var(--gold); text-decoration: underline; font-weight: 400; text-align: left; }
input, select, textarea { font: inherit; color: var(--text); background: var(--field); border: 1px solid var(--line); border-radius: 4px; padding: .4rem .6rem; width: 100%; }
label { display: block; font-weight: 600; margin-bottom: .2rem; }
.filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr)); gap: .75rem 1rem; align-items: end; margin: 0 0 1.25rem; }
.form-actions { display: flex; flex-wrap: wrap; gap: .5rem; }

.panel, .card { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 1rem; }
.card h2 { margin-top: 0; font-size: 1.8rem; }
.langs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin: 1rem 0; }
.langs.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.split { display: grid; grid-template-columns: minmax(0, 20rem) minmax(0, 1fr); gap: 1.25rem; }
.cols, .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr)); gap: 1rem; }
@media (max-width: 760px) {
  .langs, .langs.two, .split { grid-template-columns: minmax(0, 1fr); }
  h1 { font-size: 1.6rem; }
}

.badge { display: inline-block; border: 1px solid currentColor; border-radius: 3px; padding: 0 .4rem; margin: 0 .3rem .3rem 0; font-size: .8rem; font-weight: 600; }
.badge-ok { color: var(--ok); }
.badge-pending, .badge-review { color: var(--warn); }
.badge-illustrative, .badge-training { color: var(--info); }
.badge-orig, .badge-link, .badge-topic { color: var(--gold); }
.badge-diff, .badge-strat { color: var(--text); }
.src { font-size: .85rem; color: var(--muted); }
.seq { color: var(--gold); font-weight: 700; }
.draft-note { border-left: 4px solid var(--gold); padding-left: .75rem; }

.hl { font: inherit; font-weight: 400; color: var(--text); background: rgba(213, 179, 106, .25); border: 0; border-bottom: 3px solid var(--gold); border-radius: 2px; padding: 0 .15em; }
.hl.pending { border-bottom-style: dashed; }
.hl sup { color: var(--gold); font-weight: 700; font-size: .7em; margin-left: .15em; }
.hl[aria-expanded="true"] { background: var(--gold); color: var(--bg); }
.hl[aria-expanded="true"] sup { color: var(--bg); }
.ann-panel { border-color: var(--gold); margin: 1rem 0; }
.ann-panel h3 { margin-top: 0; }
.ann-panel dt { font-weight: 700; color: var(--gold); margin-top: .5rem; }
.ann-panel dd { margin: 0; }
.ann-list { padding-left: 1.2rem; }

.results { list-style: none; margin: 0; padding: 0; }
.results a { display: block; padding: .45rem .6rem; border-radius: 4px; text-decoration: none; }
.results a[aria-current="true"] { background: var(--panel); outline: 2px solid var(--gold); }
.empty { padding: 1rem; border: 1px dashed var(--line); border-radius: 6px; }

.counters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr)); gap: 1rem; }
.counter { margin: 0; }
.counter strong { display: block; font-size: 2.2rem; color: var(--gold); line-height: 1.1; }
.bars { list-style: none; margin: 0; padding: 0; }
.bar { margin: .55rem 0; }
.track { height: .75rem; background: var(--field); border-radius: 2px; margin-top: .2rem; }
.fill { height: 100%; background: var(--gold); border-radius: 2px; }
.table-wrap { overflow-x: auto; margin: .5rem 0 1rem; }
.table-wrap table { border-collapse: collapse; width: 100%; min-width: 36rem; }
th, td { text-align: left; vertical-align: top; padding: .45rem .6rem; border-bottom: 1px solid var(--line); overflow-wrap: normal; }
th { color: var(--gold); }

fieldset { border: 1px solid var(--line); border-radius: 6px; margin: 0 0 1rem; padding: .75rem 1rem 1rem; }
legend { color: var(--gold); font-weight: 700; padding: 0 .3rem; }
.radio { display: flex; gap: .6rem; align-items: flex-start; font-weight: 400; margin: .35rem 0; }
.radio input { width: auto; margin-top: .35rem; }
.total { font-size: 1.3rem; font-weight: 700; color: var(--gold); }

.hero { padding: 2rem 0 1rem; }
.hero h1 { font-size: clamp(2.2rem, 7vw, 3.6rem); margin: .25rem 0; }
.kicker { color: var(--gold); text-transform: uppercase; letter-spacing: .15em; font-weight: 700; margin: 0; }
.lead { font-size: 1.3rem; max-width: 42rem; }
.actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.5rem; }
.modules { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr)); gap: 1rem; margin-top: 2rem; }
.modules li { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 1rem; }
.modules a { display: block; margin-bottom: .3rem; }
.prose { max-width: 48rem; }
```

- [ ] **Step 3: Create the shell script**

```js file=web/app.js
// App shell: dataset mode, hash routing and render helpers shared by the views in web/views/.
(function () {
  'use strict';
  const MODE_KEY = 'atl.mode';
  const NEEDS_CORPUS = new Set(['dictionary', 'compare', 'dashboard', 'assess']);

  // sessionStorage can throw (privacy settings, some file:// setups): fall back to memory for this page load.
  const memory = {};
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return k in memory ? memory[k] : null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { memory[k] = v; } },
  };

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const $ = sel => document.querySelector(sel);

  const badge = (text, kind) => `<span class="badge badge-${kind}">${esc(text)}</span>`;
  const checkBadge = s => (s === 'pending' ? badge('Pending validation', 'pending') : badge('Verified', 'ok'));
  const statusBadge = s => (s === 'illustrative' ? badge('Illustrative example', 'illustrative') : '');
  const options = (map, selected, any = 'Any') => `<option value="">${esc(any)}</option>` +
    Object.entries(map).map(([v, l]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');

  function sourceRef(d, id, locator) {
    const s = d.sources[id];
    if (!s) return esc(id);
    const title = /^https?:\/\//.test(s.url)
      ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title);
    return `${title}, ${esc(s.organization)}${locator ? ', ' + esc(locator) : ''} <span class="muted">[${esc(id)}]</span>`;
  }

  // BOM keeps Kazakh/Russian letters intact when the CSV is opened in Excel.
  function download(filename, csv, demo) {
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: (demo ? 'DEMO_' : '') + filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const mode = () => (store.get(MODE_KEY) === 'demo' ? 'demo' : 'research');
  function route() {
    const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
    let arg = '';
    try { arg = decodeURIComponent(rest.join('/')); } catch (e) { arg = ''; }
    return { name: name || 'home', arg };
  }
  // In-view selections update the address without re-rendering (replaceState fires no hashchange).
  const setHash = hash => history.replaceState(null, '', hash);

  const underDevelopment = () => `<h1>Corpus under development</h1>
    <p>No approved research records have been published yet. The research corpus view shows approved records only.</p>
    <p><button type="button" data-action="demo">Switch to Demo dataset</button></p>`;

  function render() {
    const d = Lib.datasetFor(window.ATL_DATA, mode());
    const r = route();
    const view = App.views[r.name] ? r.name : 'home';
    $('#banner').hidden = d.mode !== 'demo';
    $('#mode').innerHTML = `<span>Dataset: <strong>${d.mode === 'demo' ? 'Demo dataset' : 'Research corpus'}</strong></span>
      <button type="button" class="secondary small" data-action="toggle-mode">Switch to ${d.mode === 'demo' ? 'research corpus' : 'demo dataset'}</button>`;
    document.querySelectorAll('nav a').forEach(a => {
      if (a.getAttribute('href') === '#/' + view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    $('#version').textContent = `Corpus version ${d.version.current.version} · updated ${d.version.current.date}`;
    const main = $('#main');
    if (d.empty && NEEDS_CORPUS.has(view)) main.innerHTML = underDevelopment();
    else App.views[view](main, d, r.arg);
    const target = main.querySelector('[data-focus]') || main.querySelector('h1');
    if (target) {
      target.tabIndex = -1;
      target.focus();
    }
  }

  function start() {
    if (!window.ATL_DATA) {
      $('#main').innerHTML = '<h1>Data not found</h1><p>Run <code>python3 tools/build.py</code> and open <code>dist/index.html</code>.</p>';
      return;
    }
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      if (action === 'toggle-mode') { store.set(MODE_KEY, mode() === 'demo' ? 'research' : 'demo'); render(); }
      if (action === 'demo') { store.set(MODE_KEY, 'demo'); render(); }
      if (action === 'skip') { e.preventDefault(); $('#main').focus(); }
    });
    window.addEventListener('hashchange', render);
    render();
  }

  window.App = { views: {}, store, esc, badge, checkBadge, statusBadge, options, sourceRef, download, setHash, render };
  document.addEventListener('DOMContentLoaded', start);
})();
```

- [ ] **Step 4: Create Home and Methodology views**

```js file=web/views/home.js
// Home: title, subtitle, description and the two main actions required by the ТЗ (section 3).
App.views.home = main => {
  main.innerHTML = `<section class="hero">
      <p class="kicker">Research Prototype</p>
      <h1>Aviation Translation Lab</h1>
      <p class="lead">An Interactive Platform for the Comparative Analysis of Aviation Discourse Translation</p>
      <p class="muted">English · <span lang="ru">Русский</span> · <span lang="kk">Қазақша</span></p>
      <p class="actions"><a class="btn" href="#/dictionary">Open Dictionary</a>
        <a class="btn secondary" href="#/compare">Compare Translations</a></p>
    </section>
    <ul class="modules">
      <li><a href="#/dictionary"><strong>Trilingual Aviation Dictionary</strong></a>Search terms in EN, RU and KK with sources and validation status.</li>
      <li><a href="#/compare"><strong>Translation Comparison</strong></a>Aligned fragments with annotated difficulties and strategies.</li>
      <li><a href="#/dashboard"><strong>Research Dashboard</strong></a>Counts and distributions of terms, difficulties and strategies.</li>
      <li><a href="#/assess"><strong>Translation Quality Assessment</strong></a>Criterion-based rubric scoring with justifications.</li>
      <li><a href="#/method"><strong>Research and Methodology</strong></a>Aims, procedure, limitations and corpus version.</li>
    </ul>`;
};
```

```js file=web/views/method.js
// Research and Methodology: author's text (trusted HTML from data/methodology.html) + generated corpus facts.
App.views.method = (main, d) => {
  const { esc } = App;
  const list = map => `<ul>${Object.entries(map).map(([id, label]) =>
    `<li>${esc(label)} <code class="muted">${esc(id)}</code></li>`).join('')}</ul>`;
  main.innerHTML = `<h1>Research and Methodology</h1>
    <div class="prose">${d.methodology}</div>
    <h2>Working annotation categories</h2>
    <div class="cols">
      <section><h3>Translation difficulties</h3>${list(d.vocab.difficulties)}</section>
      <section><h3>Translation strategies</h3>${list(d.vocab.strategies)}</section>
    </div>
    <h2>Corpus version</h2>
    <p>Current version: <strong>${esc(d.version.current.version)}</strong> (${esc(d.version.current.date)})</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Corpus version history"><table>
      <thead><tr><th scope="col">Version</th><th scope="col">Date</th><th scope="col">Changes</th></tr></thead>
      <tbody>${[...d.version.history].reverse().map(v =>
        `<tr><td>${esc(v.version)}</td><td>${esc(v.date)}</td><td>${esc(v.changes)}</td></tr>`).join('')}</tbody>
    </table></div>`;
};
```

- [ ] **Step 5: Verify syntax, build and smoke-test in the browser**

Run:
```bash
for f in web/lib.js web/app.js web/views/*.js; do node --check "$f" || exit 1; done
python3 tools/build.py && python3 -m http.server -d dist 8765
```
Expected: no syntax errors; `Build OK -> .../dist`. Open `http://localhost:8765/`:
- Home shows title, "Research Prototype", description, both buttons.
- Footer shows `Corpus version 0.1-demo · updated 2026-11-24`.
- `#/dictionary` shows "Corpus under development"; its button switches to demo, the gold banner appears, the header reads "Dataset: Demo dataset".
- `#/method` shows the methodology draft, both category lists and the version table.

Stop the server (Ctrl+C).

- [ ] **Step 6: Commit**

```bash
git add web/index.html web/app.css web/app.js web/views/home.js web/views/method.js
git commit -m "feat: add app shell, theme, home and methodology views"
```

---

### Task 5: Dictionary view

**Files:**
- Create: `web/views/dictionary.js`

**Interfaces:**
- Consumes: `Lib.searchTerms`, `Lib.headword`, `Lib.LANGS`, `Lib.LANG_LABELS`; `App.esc`, `App.badge`, `App.checkBadge`, `App.statusBadge`, `App.options`, `App.sourceRef`, `App.setHash`.
- Produces: route `#/dictionary[/<term_id>]`; links to `#/compare/<unit_id>`.

- [ ] **Step 1: Implement the view**

```js file=web/views/dictionary.js
// Trilingual dictionary: search + filters, result list, term card with sources and related comparisons.
(function () {
  'use strict';
  const { esc, badge, checkBadge, statusBadge, options, sourceRef, setHash } = App;
  const state = { q: '', topic: '', difficulty: '', check: '' }; // kept for the session

  App.views.dictionary = (main, d, selectedId) => {
    let selected = selectedId;
    main.innerHTML = `<h1>Trilingual Aviation Dictionary</h1>
      <form class="filters" role="search" id="dict-form">
        <div><label for="q">Search term or abbreviation (EN, RU, KK)</label>
          <input id="q" name="q" type="search" autocomplete="off" value="${esc(state.q)}"></div>
        <div><label for="topic">Topic</label>
          <select id="topic" name="topic">${options(d.vocab.topics, state.topic)}</select></div>
        <div><label for="difficulty">Difficulty type</label>
          <select id="difficulty" name="difficulty">${options(d.vocab.difficulties, state.difficulty)}</select></div>
        <div><label for="check">Validation status</label>
          <select id="check" name="check">${options({ verified: 'Verified', pending: 'Pending validation' }, state.check)}</select></div>
      </form>
      <div class="split">
        <div><p id="count" class="muted" role="status"></p><ul class="results" id="results"></ul></div>
        <div id="card"></div>
      </div>`;
    const form = main.querySelector('#dict-form');

    const update = () => {
      const list = Lib.searchTerms(d.terms, state);
      const term = d.terms.find(t => t.term_id === selected) || (list.length === 1 ? list[0] : null);
      main.querySelector('#count').textContent = `${list.length} term${list.length === 1 ? '' : 's'} found`;
      main.querySelector('#results').innerHTML = list.length
        ? list.map(t => `<li><a href="#/dictionary/${encodeURIComponent(t.term_id)}"${t === term ? ' aria-current="true"' : ''}>
            <strong>${esc(Lib.headword(t))}</strong>
            <span class="muted">${esc(t.forms.filter(f => f.lang !== 'en').map(f => f.form).join(' · '))}</span></a></li>`).join('')
        : `<li class="empty">No terms match ${state.q ? '“' + esc(state.q) + '”' : 'the selected filters'}.</li>`;
      main.querySelector('#card').innerHTML = term ? card(d, term, Boolean(selected))
        : list.length ? '<p class="muted">Select a term to open its card.</p>' : '';
    };

    form.addEventListener('submit', e => e.preventDefault());
    form.addEventListener('input', () => {
      Object.assign(state, Object.fromEntries(new FormData(form)));
      if (selected) {
        selected = '';
        setHash('#/dictionary');
      }
      update();
    });
    update();
  };

  function forms(d, t, lang) {
    const list = t.forms.filter(f => f.lang === lang);
    if (!list.length) return '<p class="muted">Not available</p>';
    return list.map(f => `<div class="form">
        <p lang="${lang}"><strong>${esc(f.form)}</strong>${f.abbreviation ? ` (${esc(f.abbreviation)})` : ''}</p>
        <p>${checkBadge(f.check_status)}</p>
        <p class="src">Source: ${sourceRef(d, f.source_id, f.locator)}</p></div>`).join('');
  }

  function card(d, t, focus) {
    const related = d.units.filter(u => u.term_ids.includes(t.term_id));
    return `<article class="card" aria-labelledby="term-h">
      <h2 id="term-h"${focus ? ' data-focus' : ''}>${esc(Lib.headword(t))}</h2>
      <p>${badge(d.vocab.topics[t.topic_id], 'topic')}${statusBadge(t.status)}</p>
      <div class="langs">${Lib.LANGS.map(l => `<section><h3>${Lib.LANG_LABELS[l]}</h3>${forms(d, t, l)}</section>`).join('')}</div>
      <h3>Definition</h3>
      <p>${esc(t.definition)}</p>
      <p class="src">Source: ${sourceRef(d, t.definition_source_id, t.definition_locator)}</p>
      ${t.context ? `<h3>Context</h3><p>${esc(t.context)}</p>` : ''}
      ${t.difficulty_ids.length || t.difficulty_note ? `<h3>Translation difficulty</h3>
        <p>${t.difficulty_ids.map(id => badge(d.vocab.difficulties[id], 'diff')).join('')}</p>
        <p>${esc(t.difficulty_note)}</p>` : ''}
      <h3>Related comparisons</h3>
      ${related.length ? `<ul>${related.map(u => `<li><a href="#/compare/${encodeURIComponent(u.unit_id)}">${esc(u.unit_id)} — ${esc(u.title)}</a></li>`).join('')}</ul>`
        : '<p class="muted">No related comparisons yet.</p>'}
    </article>`;
  }
})();
```

- [ ] **Step 2: Verify**

Run: `node --check web/views/dictionary.js && python3 tools/build.py && python3 -m http.server -d dist 8765`
Expected in demo mode at `http://localhost:8765/#/dictionary`:
- Typing `ұшу-қону` leaves one result and the Runway card opens automatically, with the KK form marked "Pending validation" and the "Illustrative example" badge.
- `ВПП`, `atc`, `взлетно` each find a term; `zzzz` shows `No terms match “zzzz”.`
- The Related comparisons link `U-001 — Landing clearance` opens `#/compare/U-001` (blank until Task 6).
- Topic / difficulty / status filters narrow the list.

- [ ] **Step 3: Commit**

```bash
git add web/views/dictionary.js
git commit -m "feat: add trilingual dictionary view"
```

---

### Task 6: Translation Comparison view

**Files:**
- Create: `web/views/compare.js`

**Interfaces:**
- Consumes: `Lib.LANGS`, `Lib.LANG_LABELS`, `Lib.LINK_LABELS`, `Lib.direction`, `Lib.segments`; `App.esc`, `App.badge`, `App.checkBadge`, `App.statusBadge`, `App.sourceRef`, `App.setHash`.
- Produces: route `#/compare[/<unit_id>]`; link to `#/assess/<unit_id>`.

- [ ] **Step 1: Implement the view**

```js file=web/views/compare.js
// Translation comparison: EN/RU/KK columns, link type and direction, clickable highlighted spans with annotation panel.
(function () {
  'use strict';
  const { esc, badge, checkBadge, statusBadge, sourceRef, setHash } = App;

  App.views.compare = (main, d, unitId) => {
    main.innerHTML = `<h1>Translation Comparison</h1>
      <div class="filters"><div><label for="unit">Example</label>
        <select id="unit"><option value="">Choose an example…</option>
          ${d.units.map(u => `<option value="${esc(u.unit_id)}"${u.unit_id === unitId ? ' selected' : ''}>${esc(u.unit_id)} — ${esc(u.title)}</option>`).join('')}
        </select></div></div>
      <div id="unit-view"></div>`;
    const box = main.querySelector('#unit-view');
    let current = null;

    const show = id => {
      current = d.units.find(u => u.unit_id === id) || null;
      box.innerHTML = current ? unitHtml(d, current)
        : '<p class="muted">Choose an example from the list or open one from a dictionary card.</p>';
    };

    main.querySelector('#unit').addEventListener('change', e => {
      setHash('#/compare/' + encodeURIComponent(e.target.value));
      show(e.target.value);
    });
    box.addEventListener('click', e => {
      const btn = e.target.closest('[data-ann]');
      if (!btn || !current) return;
      const a = current.annotations.find(x => x.annotation_id === btn.dataset.ann);
      box.querySelectorAll('.hl').forEach(h => h.setAttribute('aria-expanded', String(h.dataset.ann === a.annotation_id)));
      const panel = box.querySelector('#ann-panel');
      panel.hidden = false;
      panel.innerHTML = annotationHtml(d, a);
      panel.scrollIntoView({ block: 'nearest' });
    });
    show(unitId);
  };

  function unitHtml(d, u) {
    const review = u.alignment_status === 'in_review';
    return `<article aria-labelledby="unit-h">
      <h2 id="unit-h">${esc(u.title)}</h2>
      <p>${badge(Lib.LINK_LABELS[u.link_type], 'link')}${badge(review ? 'In review' : 'Aligned', review ? 'review' : 'ok')}${u.training ? badge('Training example', 'training') : ''}${statusBadge(u.status)}</p>
      <p><strong>Direction:</strong> ${esc(Lib.direction(u))}${u.link_type === 'confirmed_translation'
        ? ` <span class="muted">— basis: ${esc(u.direction_basis)}</span>` : ''}</p>
      ${u.note ? `<p class="muted">${esc(u.note)}</p>` : ''}
      <div class="langs">${Lib.LANGS.map(l => column(d, u, l)).join('')}</div>
      <div id="ann-panel" class="panel ann-panel" aria-live="polite" hidden></div>
      <h3>Annotations</h3>
      ${u.annotations.length ? `<ul class="ann-list">${u.annotations.map(a => `<li><button type="button" class="link" data-ann="${esc(a.annotation_id)}">[${esc(a.label)}] ${Lib.LANG_LABELS[a.lang]}: “${esc(a.span_text)}”</button></li>`).join('')}</ul>`
        : '<p class="muted">No annotations for this example.</p>'}
      <p><a class="btn secondary" href="#/assess/${encodeURIComponent(u.unit_id)}">Assess this unit</a></p>
    </article>`;
  }

  function column(d, u, lang) {
    const frs = u.fragments.filter(f => f.lang === lang);
    const role = u.source_lang === lang ? badge(u.link_type === 'comparable' ? 'Reference' : 'Original', 'orig') : '';
    const body = frs.length ? frs.map(f => `
        <p lang="${lang}">${frs.length > 1 ? `<span class="seq">${f.seq}.</span> ` : ''}${marked(f, u.annotations.filter(a => a.lang === lang && a.seq === f.seq))}</p>
        <p class="src">Source: ${sourceRef(d, f.source_id, f.locator)}</p>`).join('')
      : '<p class="muted">Not available</p>';
    return `<section class="panel"><h3>${Lib.LANG_LABELS[lang]} ${role}</h3>${body}</section>`;
  }

  // Highlight colour is always paired with a text label [A1] (ТЗ: colour duplicated by a text mark).
  const marked = (f, anns) => Lib.segments(f.text, anns).map(s => (s.ann
    ? `<button type="button" class="hl${s.ann.check_status === 'pending' ? ' pending' : ''}" data-ann="${esc(s.ann.annotation_id)}" aria-expanded="false" aria-controls="ann-panel">${esc(s.text)}<sup>[${esc(s.ann.label)}]</sup></button>`
    : esc(s.text))).join('');

  function annotationHtml(d, a) {
    const names = (list, key, kind) => list.map(id => badge(d.vocab[key][id], kind)).join('') || '<span class="muted">—</span>';
    return `<h3>[${esc(a.label)}] “<span lang="${a.lang}">${esc(a.span_text)}</span>”
        <span class="muted">${Lib.LANG_LABELS[a.lang]}${a.compared_with ? ' compared with ' + Lib.LANG_LABELS[a.compared_with] : ''}</span></h3>
      <p>${checkBadge(a.check_status)}</p>
      <dl>
        <dt>Difficulty type</dt><dd>${names(a.difficulty_ids, 'difficulties', 'diff')}</dd>
        <dt>Strategy</dt><dd>${names(a.strategy_ids, 'strategies', 'strat')}</dd>
        <dt>Explanation</dt><dd>${esc(a.explanation)}</dd>
        <dt>Supporting source</dt><dd>${sourceRef(d, a.evidence_source_id, a.evidence_locator)}</dd>
      </dl>`;
  }
})();
```

- [ ] **Step 2: Verify**

Run: `node --check web/views/compare.js && python3 tools/build.py && python3 -m http.server -d dist 8765`
Expected in demo mode:
- `#/compare/U-001`: three columns EN/RU/KK, "Original" on EN, "Confirmed translation", `Direction: EN → RU, KK — basis: …`, sources under each fragment.
- Clicking or pressing Enter on `разрешаю[A1]` opens the panel with difficulty, strategy, explanation, supporting source; the button shows the expanded style.
- `U-002`: `Direction not established`. `U-003`: KK column shows `Not available`. `U-004`: "In review" badge, RU shows numbered sentences 1 and 2.
- Changing the select updates the view and the address (`#/compare/U-00x`).

- [ ] **Step 3: Commit**

```bash
git add web/views/compare.js
git commit -m "feat: add translation comparison view with annotated spans"
```

---

### Task 7: Research Dashboard view

**Files:**
- Create: `web/views/dashboard.js`

**Interfaces:**
- Consumes: `Lib.stats`, `Lib.percent`, `Lib.exportRows`, `Lib.toCSV`, `Lib.TABLE_COLUMNS`, `Lib.DASHBOARD_CSV_COLUMNS`, `Lib.LINK_LABELS`; `App.esc`, `App.options`, `App.download`.
- Produces: route `#/dashboard`; CSV `dashboard.csv` (`DEMO_dashboard.csv` in demo mode).

- [ ] **Step 1: Implement the view**

```js file=web/views/dashboard.js
// Research dashboard: one filter state drives counters, charts, table and CSV (all from Lib.stats).
(function () {
  'use strict';
  const { esc, options, download } = App;
  const state = { genre: '', topic: '', pair: '', link: '' };
  const PAIR_LABELS = { 'en-ru': 'EN–RU', 'en-kk': 'EN–KK', 'ru-kk': 'RU–KK' };

  App.views.dashboard = (main, d) => {
    main.innerHTML = `<h1>Research Dashboard</h1>
      <form class="filters" id="dash-form">
        <div><label for="genre">Genre</label><select id="genre" name="genre">${options(d.vocab.genres, state.genre)}</select></div>
        <div><label for="topic">Topic</label><select id="topic" name="topic">${options(d.vocab.topics, state.topic)}</select></div>
        <div><label for="pair">Language pair</label><select id="pair" name="pair">${options(PAIR_LABELS, state.pair)}</select></div>
        <div><label for="link">Link type</label><select id="link" name="link">${options(Lib.LINK_LABELS, state.link)}</select></div>
        <div class="form-actions"><button type="reset" class="secondary">Reset filters</button></div>
      </form>
      <div id="out"></div>`;
    const form = main.querySelector('#dash-form');
    const out = main.querySelector('#out');
    let rows = [];

    const update = () => {
      Object.assign(state, Object.fromEntries(new FormData(form)));
      const s = Lib.stats(d, state);
      rows = s.rows;
      out.innerHTML = s.units ? report(s) : '<p class="empty" role="status">No records match the selected filters.</p>';
    };

    form.addEventListener('input', update);
    form.addEventListener('reset', e => {
      e.preventDefault(); // native reset would restore the pre-selected values, not "Any"
      form.querySelectorAll('select').forEach(sel => { sel.value = ''; });
      update();
    });
    out.addEventListener('click', e => {
      if (e.target.closest('#csv')) {
        download('dashboard.csv', Lib.toCSV(Lib.exportRows(d, rows), Lib.DASHBOARD_CSV_COLUMNS), d.mode === 'demo');
      }
    });
    update();
  };

  function report(s) {
    const n = s.annotatedUnits;
    const bar = (text, width) => `<li class="bar"><span>${text}</span>
        <div class="track" aria-hidden="true"><div class="fill" style="width:${width.toFixed(1)}%"></div></div></li>`;
    const shareChart = (title, items) => `<section class="panel"><h2>${title}</h2><ul class="bars">${items.map(i =>
      bar(`${esc(i.label)} — <strong>${i.count} of ${n}</strong> (${Lib.percent(i.share)})`, i.share * 100)).join('')}</ul></section>`;
    const max = Math.max(1, ...s.termsByTopic.map(t => t.count));
    return `<div class="counters">
        <p class="counter panel"><strong>${s.documents}</strong> Documents</p>
        <p class="counter panel"><strong>${s.terms}</strong> Term entries</p>
        <p class="counter panel"><strong>${n}</strong> Annotated units <span class="muted">of ${s.units} in selection</span></p>
      </div>
      <p class="muted">Base for shares: N = ${n} annotated unit${n === 1 ? '' : 's'} after filtering.
        A unit may carry several labels, so shares can sum to more than 100%.</p>
      <div class="charts">
        ${shareChart('Difficulties by category', s.difficulties)}
        ${shareChart('Strategies by type', s.strategies)}
        <section class="panel"><h2>Terms by topic</h2><ul class="bars">${s.termsByTopic.map(t =>
          bar(`${esc(t.label)} — <strong>${t.count}</strong>`, t.count / max * 100)).join('')}</ul></section>
      </div>
      <h2>Annotated units in selection</h2>
      <p><button type="button" id="csv">Download CSV (${s.rows.length} rows)</button></p>
      <div class="table-wrap" tabindex="0" role="region" aria-label="Annotated units table"><table>
        <thead><tr>${Lib.TABLE_COLUMNS.map(c => `<th scope="col">${c[1]}</th>`).join('')}</tr></thead>
        <tbody>${s.rows.map(r => `<tr>${Lib.TABLE_COLUMNS.map(c => `<td>${esc(r[c[0]])}</td>`).join('')}</tr>`).join('')
          || `<tr><td colspan="${Lib.TABLE_COLUMNS.length}">No annotations in this selection.</td></tr>`}</tbody>
      </table></div>`;
  }
})();
```

- [ ] **Step 2: Verify**

Run: `node --check web/views/dashboard.js && python3 tools/build.py && python3 -m http.server -d dist 8765`
Expected in demo mode at `#/dashboard`:
- Counters: Documents 7, Term entries 6, Annotated units 6 of 6.
- Difficulty bars show `count of 6 (xx%)`; strategies and terms-by-topic bars render; table lists 14 rows.
- Link type = Comparable texts → 1 unit, all three parts update together. Language pair EN–KK + Genre "Operations manual" → `No records match the selected filters.` Reset filters → back to everything.
- Download CSV saves `DEMO_dashboard.csv` whose row count equals the table rows.
- Research mode → "Corpus under development".

- [ ] **Step 3: Commit**

```bash
git add web/views/dashboard.js
git commit -m "feat: add research dashboard with filters, charts and CSV export"
```

---

### Task 8: Translation Quality Assessment view

**Files:**
- Create: `web/views/assess.js`

**Interfaces:**
- Consumes: `Lib.RUBRIC`, `Lib.isScorable`, `Lib.rubricTotal`, `Lib.assessmentRecord`, `Lib.toCSV`, `Lib.ASSESSMENT_CSV_COLUMNS`, `Lib.LANGS`, `Lib.LANG_LABELS`, `Lib.LINK_LABELS`; `App.esc`, `App.badge`, `App.statusBadge`, `App.sourceRef`, `App.store`, `App.setHash`, `App.download`.
- Produces: route `#/assess[/<unit_id>]`; session storage key `atl.assessments` (JSON array of `assessmentRecord` objects); CSV `assessments.csv` (`DEMO_` prefix if any record is from the demo dataset).

- [ ] **Step 1: Implement the view**

```js file=web/views/assess.js
// Quality assessment: rubric (0–2 × 4 criteria) or comparison comment; results kept in sessionStorage only.
(function () {
  'use strict';
  const { esc, badge, statusBadge, sourceRef, store, setHash, download } = App;
  const KEY = 'atl.assessments';
  const saved = () => {
    try { return JSON.parse(store.get(KEY)) || []; } catch (e) { return []; }
  };

  App.views.assess = (main, d, unitId) => {
    main.innerHTML = `<h1>Translation Quality Assessment</h1>
      <div class="filters">
        <div><label for="a-unit">Unit of analysis</label>
          <select id="a-unit"><option value="">Choose a unit…</option>
            ${d.units.map(u => `<option value="${esc(u.unit_id)}"${u.unit_id === unitId ? ' selected' : ''}>${esc(u.unit_id)} — ${esc(u.title)}</option>`).join('')}
          </select></div>
        <div><label for="a-lang">Target language</label><select id="a-lang"></select></div>
      </div>
      <div id="a-form"></div>
      <section aria-labelledby="sess-h"><h2 id="sess-h">Assessments in this session</h2>
        <p class="muted">Visitor assessments stay in this browser session and are never added to corpus statistics.</p>
        <div id="a-session"></div></section>`;
    const unitSel = main.querySelector('#a-unit');
    const langSel = main.querySelector('#a-lang');
    const formBox = main.querySelector('#a-form');
    const sessBox = main.querySelector('#a-session');
    let unit = null;

    const read = () => {
      const fd = new FormData(formBox.querySelector('form'));
      const scores = {};
      const notes = {};
      for (const c of Lib.RUBRIC) {
        if (fd.has(c.id)) scores[c.id] = Number(fd.get(c.id));
        notes[c.id] = String(fd.get(c.id + '_note') || '').trim();
      }
      return { scores, notes, comment: String(fd.get('comment') || '').trim() };
    };

    const updateStatus = () => {
      const st = formBox.querySelector('#a-status');
      if (!st) return;
      const { scores } = read();
      const total = Lib.rubricTotal(scores);
      const left = Lib.RUBRIC.filter(c => !(c.id in scores)).length;
      st.textContent = total === null ? `Status: Incomplete — ${left} of 4 criteria not scored` : `Total: ${total}/8`;
    };

    const showForm = () => {
      formBox.innerHTML = !unit ? '<p class="muted">Choose a unit of analysis and a target language.</p>'
        : !langSel.value ? '<p class="muted">This unit has no target-language fragment to assess.</p>'
        : formHtml(d, unit, langSel.value);
      updateStatus();
    };

    const pickUnit = () => {
      unit = d.units.find(u => u.unit_id === unitSel.value) || null;
      const targets = unit ? Lib.LANGS.filter(l => l !== unit.source_lang && unit.fragments.some(f => f.lang === l)) : [];
      langSel.innerHTML = targets.map(l => `<option value="${l}">${Lib.LANG_LABELS[l]}</option>`).join('');
      langSel.disabled = !targets.length;
      showForm();
    };

    const showSession = () => {
      const list = saved();
      sessBox.innerHTML = list.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Session assessments"><table>
          <thead><tr><th scope="col">#</th><th scope="col">Unit</th><th scope="col">Pair</th><th scope="col">Dataset</th><th scope="col">Result</th></tr></thead>
          <tbody>${list.map(r => `<tr><td>${esc(r.assessment_no)}</td><td>${esc(r.unit_id)}</td><td>${esc(r.language_pair)}</td>
            <td>${esc(r.dataset)}</td><td>${r.mode === 'score' ? esc(r.total) + '/8' : 'Comment'}</td></tr>`).join('')}</tbody>
        </table></div>
        <p><button type="button" id="a-export">Export session CSV</button></p>`
        : '<p class="muted">No assessments saved yet.</p>';
    };

    unitSel.addEventListener('change', () => {
      setHash('#/assess/' + encodeURIComponent(unitSel.value));
      pickUnit();
    });
    langSel.addEventListener('change', showForm);
    formBox.addEventListener('input', updateStatus);
    formBox.addEventListener('reset', () => setTimeout(updateStatus));
    formBox.addEventListener('submit', e => {
      e.preventDefault();
      const { scores, notes, comment } = read();
      const msg = formBox.querySelector('#a-msg');
      const scorable = Lib.isScorable(unit);
      if (scorable ? Lib.rubricTotal(scores) === null : !comment) {
        msg.textContent = scorable ? 'Score all four criteria before saving.' : 'Write a comparison comment before saving.';
        return;
      }
      const list = saved();
      list.push(Lib.assessmentRecord({
        ds: d, unit, target: langSel.value, scores, notes, comment,
        no: list.length + 1, savedAt: new Date().toISOString(),
      }));
      store.set(KEY, JSON.stringify(list));
      e.target.reset();
      msg.textContent = `Saved as assessment #${list.length}.`;
      showSession();
    });
    sessBox.addEventListener('click', e => {
      if (!e.target.closest('#a-export')) return;
      const list = saved();
      download('assessments.csv', Lib.toCSV(list, Lib.ASSESSMENT_CSV_COLUMNS), list.some(r => r.dataset === 'demo'));
    });

    pickUnit();
    showSession();
  };

  const texts = (d, frs) => frs.map(f => `<p lang="${f.lang}">${esc(f.text)}</p>
    <p class="src">Source: ${sourceRef(d, f.source_id, f.locator)}</p>`).join('');

  function formHtml(d, u, target) {
    const orig = u.fragments.filter(f => f.lang === u.source_lang);
    const tgt = u.fragments.filter(f => f.lang === target);
    const src = d.sources[tgt[0].source_id] || {};
    const scorable = Lib.isScorable(u);
    const origLabel = u.link_type === 'comparable' ? 'Reference text' : 'Original';
    const rubric = Lib.RUBRIC.map(c => `<fieldset><legend>${esc(c.name)}</legend>
        ${[2, 1, 0].map(v => `<label class="radio"><input type="radio" name="${c.id}" value="${v}">
          <span><strong>${v}</strong> — ${esc(c.levels[v])}</span></label>`).join('')}
        <label for="${c.id}-note">Justification</label>
        <textarea id="${c.id}-note" name="${c.id}_note" rows="2" placeholder="Point to the exact place in the text"></textarea>
      </fieldset>`).join('') + '<p id="a-status" class="total" role="status"></p>';
    const commentOnly = `<p class="panel">Score-based assessment is available only for confirmed translation pairs and
        marked training examples. For ${esc(Lib.LINK_LABELS[u.link_type].toLowerCase())} you can record a comparison comment.</p>
      <label for="comment">Comparison comment</label><textarea id="comment" name="comment" rows="4"></textarea>`;
    return `<div class="langs two">
        <section class="panel"><h2>${origLabel}${u.source_lang ? ' (' + Lib.LANG_LABELS[u.source_lang] + ')' : ''}</h2>
          ${orig.length ? texts(d, orig) : '<p class="muted">Original not established</p>'}</section>
        <section class="panel"><h2>Target (${Lib.LANG_LABELS[target]})</h2>${texts(d, tgt)}</section>
      </div>
      <p><strong>Genre:</strong> ${esc(d.vocab.genres[src.genre_id] || '—')} · <strong>Audience:</strong> ${esc(src.audience || '—')}</p>
      <p>${badge(Lib.LINK_LABELS[u.link_type], 'link')}${u.training ? badge('Training example', 'training') : ''}${statusBadge(u.status)}</p>
      <form id="rubric" novalidate>
        ${scorable ? rubric : commentOnly}
        <p class="form-actions"><button type="submit">Save to session</button> <button type="reset" class="secondary">Reset form</button></p>
        <p id="a-msg" role="status"></p>
      </form>`;
  }
})();
```

- [ ] **Step 2: Verify**

Run: `node --check web/views/assess.js && python3 tools/build.py && python3 -m http.server -d dist 8765`
Expected in demo mode at `#/assess/U-001`:
- Target options RU and KK; Original (EN) and Target panels, genre "Radiotelephony phraseology", audience shown.
- Status reads `Incomplete — 4 of 4 criteria not scored`; choosing 2, 1, 2, 2 shows `Total: 7/8`. Clearing one criterion via Reset form returns to Incomplete.
- Save with a missing score → `Score all four criteria before saving.`; complete save → row `#1 … 7/8` in the session table.
- `U-002` (parallel, no original): `Original not established`, comment field only, no scores. `U-005` (comparable + training): rubric available, panel titled "Reference text (EN)".
- Export session CSV saves `DEMO_assessments.csv` with scores and justification text.

- [ ] **Step 3: Commit**

```bash
git add web/views/assess.js
git commit -m "feat: add rubric-based quality assessment with session export"
```

---

### Task 9: Publishing script, documentation and acceptance run

**Files:**
- Create: `tools/publish.sh`, `docs/README.md`, `docs/DATA_DICTIONARY.md`, `docs/ACCEPTANCE.md`

**Interfaces:**
- Consumes: `tools/build.py` CLI (Task 1); everything above for the acceptance run.
- Produces: server layout `$APP_DIR/{repo,releases/<ts>,current}` used by the deployment step.

- [ ] **Step 1: Create the publish script**

```bash file=tools/publish.sh
#!/usr/bin/env bash
# Publish the corpus on the server: pull, validate + build into a new release, switch `current` atomically.
# On any validation error the build exits non-zero and the live site keeps serving the previous release.
# Layout: $APP_DIR/repo (git clone), $APP_DIR/releases/<timestamp>, $APP_DIR/current -> releases/<timestamp>
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/atl}"
cd "$APP_DIR/repo"
git pull --ff-only
TS="$(date +%Y%m%d-%H%M%S)"
python3 tools/build.py --out "$APP_DIR/releases/$TS"
ln -sfn "releases/$TS" "$APP_DIR/current.tmp"
mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
# keep the five newest releases
ls -1dt "$APP_DIR"/releases/* | tail -n +6 | xargs -r rm -rf
echo "Published release $TS"
```

Run: `chmod +x tools/publish.sh && bash -n tools/publish.sh`
Expected: no output (syntax OK).

- [ ] **Step 2: Write the README**

````markdown file=docs/README.md
# Aviation Translation Lab

Research prototype for the comparative analysis of aviation discourse translation (English · Russian · Kazakh).
Five modules: Dictionary, Compare, Dashboard, Assessment, Methodology.

## Run locally (works offline)

Requirements: Python 3.8+ (standard library only). Node 18+ is needed only to run the JavaScript tests.

```bash
python3 tools/build.py      # validate data/ and build dist/
open dist/index.html        # or double-click the file; no network or server needed
```

Alternative with a local server: `python3 -m http.server -d dist 8000`, then open http://localhost:8000.

The site opens in **Research corpus** mode (approved records only). Use **Switch to demo dataset** in the header
to show the illustrative demo records; the demo mode is marked by a gold banner and `DEMO_` file names.

## Update the corpus

1. Edit the CSV files in `data/` (UTF-8; Excel "CSV UTF-8" is fine). Field reference: `docs/DATA_DICTIONARY.md`.
   Empty templates: `templates/`.
2. Mark records approved for the public research corpus with `status=approved`. `illustrative` records appear only
   in Demo mode; `draft` records are never published.
3. Add a row to `data/versions.csv` describing the change.
4. Run `python3 tools/build.py`. Errors are listed as `table.csv:line: problem`; nothing is built until all are fixed.
5. Commit, push, and publish on the server (below).

## Publish on the server

Server layout: `/opt/atl/repo` (git clone), `/opt/atl/releases/<timestamp>`, `/opt/atl/current` → active release.
The web server serves `/opt/atl/current`.

```bash
ssh <server> /opt/atl/repo/tools/publish.sh
```

`publish.sh` pulls, validates, builds a new release and switches `current` atomically. If validation fails, the
command prints the errors and the live site keeps the previous release.

## Tests

```bash
python3 tools/test_build.py && python3 tools/test_data.py && node --test tools/lib.test.js
```

## Structure

| Path | Content |
|---|---|
| `data/` | Corpus CSV tables, vocabularies, `methodology.html` |
| `templates/` | Header-only CSV templates |
| `web/` | Interface: `index.html`, `app.css`, `app.js` (shell), `lib.js` (logic), `views/` (one file per module) |
| `tools/build.py` | Validation and build |
| `tools/publish.sh` | Server publishing |
| `docs/` | This guide, data dictionary, acceptance results, design spec and plan |

## Why a static site instead of Streamlit

The ТЗ proposes Streamlit. The acceptance criteria require full keyboard access, no horizontal page scroll at
375 px, clickable highlighted spans and offline use at the defence. A static site gives direct control over all of
these and opens from a file without a server. Validation and data processing stay in Python, as the ТЗ intends.
````

- [ ] **Step 3: Write the data dictionary**

````markdown file=docs/DATA_DICTIONARY.md
# Data dictionary

All tables are CSV, UTF-8, first row = column names. Lists inside a cell are separated by `;`.
Dates use `YYYY-MM-DD`. Required columns are marked **bold**. Run `python3 tools/build.py` after every change.

## Fixed values

| Field | Allowed values |
|---|---|
| language (`lang`, `source_lang`, `compared_with`) | `en`, `ru`, `kk` |
| `link_type` | `confirmed_translation`, `parallel_unknown_direction`, `comparable` |
| `alignment_status` | `aligned`, `in_review` |
| `status` (terms, units) | `approved` (research corpus), `illustrative` (Demo dataset only), `draft` (not published) |
| `check_status` (term forms, annotations) | `verified`, `pending` (shown as *Pending validation*) |
| `training` | `yes`, `no` (empty = `no`) |

## Vocabularies — `data/vocab/*.csv`

Columns **id**, **label**. IDs are permanent (referenced by other tables); labels may be edited.
`topics`, `genres`, `difficulties`, `strategies`.

## `sources.csv`

| Column | Meaning |
|---|---|
| **source_id** | Unique ID, e.g. `ICAO-9432-EN` |
| **title**, **organization** | Document title and issuing body |
| **lang** | Language of the document |
| **genre_id** | ID from `vocab/genres.csv` |
| **audience** | Intended readers, e.g. `Pilots and air traffic controllers` |
| **url** | Link to the document |
| **accessed** | Date of access |
| published, edition, locator | Publication date, edition, page/section — when available |

## `terms.csv` and `term_forms.csv`

`terms.csv`: **term_id**, **topic_id**, **definition**, **definition_source_id**, definition_locator, context,
difficulty_ids (`;` list from `vocab/difficulties.csv`), difficulty_note, **status**.

`term_forms.csv` (one row per form; several forms per language allowed): **term_id**, **lang**, **form**,
abbreviation, **source_id**, locator, **check_status**. A language without a form is shown as *Not available*.

## `units.csv`, `fragments.csv`

`units.csv`: **unit_id**, **title**, **topic_id**, term_ids (`;` list), **link_type**, source_lang (language of the
original according to the source; empty = not established), direction_basis (why the direction is known),
**alignment_status**, training, **status**, note.

- `confirmed_translation` requires `source_lang` and `direction_basis`.
- `training=yes` marks a training example: rubric scoring is allowed even if the link is not a confirmed translation; it requires `source_lang` (the reference text).
- An `approved` unit may link only to `approved` terms.

`fragments.csv`: **unit_id**, **lang**, **seq** (sentence number 1, 2, … within the unit and language), **text**,
**source_id**, locator. Different numbers of sentences per language express merging or splitting.

## `annotations.csv`

**annotation_id**, **unit_id**, **lang** (language of the highlighted fragment), seq (default 1), **span_text**
(exact text to highlight), occurrence (which occurrence of `span_text`, default 1), compared_with (other language of
the pair), difficulty_ids, strategy_ids (at least one of the two), **explanation**, **evidence_source_id**,
evidence_locator, **check_status**.

The build finds `span_text` in the fragment and computes the highlight boundaries; highlights in one fragment must
not overlap.

## `versions.csv`

**version**, **date**, **changes**. The last row is the current corpus version shown in the footer, Methodology and
every export.

## What the build checks

Missing files or columns, empty required fields, duplicate IDs, unknown vocabulary or fixed values, references to
missing records, highlight text not found or overlapping, invalid numbers and dates, a confirmed direction without
its basis, training examples without `source_lang`, approved units linked to non-approved terms.
Each error reads `table.csv:line: problem`.

## Suggested real sources (to be verified by the author)

ICAO Doc 4444 (PANS-ATM), ICAO Doc 9432 (Manual of Radiotelephony), ICAO Annex 14, FAA Pilot/Controller Glossary,
official aviation regulations of the Republic of Kazakhstan. Quote only materials permitted for publication and give
the exact location of every borrowed definition and quotation.

## Demo dataset

All demo records are `illustrative`. Demo sources are constructed for demonstration (`url` = `n/a - constructed
for demonstration`); demo fragments are not quotations from published documents. Kazakh forms are marked `pending`.
````

- [ ] **Step 4: Run all automated checks**

Run: `python3 tools/test_build.py && python3 tools/test_data.py && node --test tools/lib.test.js && python3 tools/build.py`
Expected: all `OK`, `# fail 0`, `Build OK`.

- [ ] **Step 5: Check that a bad file is rejected and the previous build survives**

Run:
```bash
sed -i '' 's/confirmed_translation,en,Demo: constructed English original\./confirmed,en,x/' data/units.csv
python3 tools/build.py; echo "exit=$?"; ls dist/data.js
git checkout -- data/units.csv
```
Expected: `units.csv:5: unknown link_type value 'confirmed' …` (and line 7), `exit=1`, `dist/data.js` still present.

- [ ] **Step 6: Browser acceptance run (Chrome; Safari where available)**

Serve `python3 -m http.server -d dist 8765` and walk through:
1. Defence scenario (ТЗ 7.2): switch to Demo → Dictionary → search `Runway` → open `U-001` → open annotation `[A1]` and its source → Assessment: score RU 2,1,2,2 → `7/8` → export CSV → Dashboard: difficulty distribution → Methodology: limitations section.
2. ТЗ 7.1 checks: `ұшу-қону` opens Runway; nonexistent query → empty state; three columns + source + link type; `U-002` shows undetermined direction; rubric missing score → no total; CSV contents.
3. Resize to 375 px: `document.documentElement.scrollWidth <= window.innerWidth` on every module; panels stacked.
4. Keyboard only: Tab through header, filters, results, highlight buttons (Enter opens panel), radios (arrow keys), Save, Export.
5. Offline: open `dist/index.html` via `file://` with network disabled; all modules work.

- [ ] **Step 7: Record the results**

Write `docs/ACCEPTANCE.md` with one row per ТЗ 7.1 check plus the defence scenario, 375 px, keyboard and offline checks: columns `Check`, `Expected (ТЗ)`, `How verified` (test name or manual steps), `Result` (observed outcome and date). Include the automated test command output summary.

- [ ] **Step 8: Commit**

```bash
git add tools/publish.sh docs/README.md docs/DATA_DICTIONARY.md docs/ACCEPTANCE.md
git commit -m "docs: add README, data dictionary, publish script and acceptance results"
```

---

## After this plan

Deployment to the user's VPS (`https://<ip>.sslip.io`) is a separate step once server details are provided: clone the repo to `/opt/atl/repo`, run `tools/publish.sh`, point the existing web server (Caddy/nginx) at `/opt/atl/current`, verify HTTPS and the acceptance checks on the public URL, then add the public URL and repository link to `docs/README.md`.
