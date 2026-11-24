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
    "vocab/difficulties": [{"id": "D04", "label": "Modality"}, {"id": "D03", "label": "Syntax"}],
    "vocab/strategies": [{"id": "ST03", "label": "Calque"}],
    "vocab/genres": [{"id": "atc", "label": "ATC radiotelephony"}],
    "sources": [{"source_id": "S1", "title": "Title", "organization": "Org", "lang": "ru/kk", "genre": "regulatory",
                 "audience": "Pilots", "accessed": "2026-11-01"},
                {"source_id": "S2", "title": "Author's translation", "organization": "author", "lang": "kk",
                 "genre": "illustrative translation", "accessed": "2026-11-01", "is_document": "no"}],
    "terms": [{"term_id": "T1", "topic_id": "aerodrome", "definition": "Definition", "definition_source_id": "S1",
               "dataset": "research"}],
    "term_forms": [{"term_id": "T1", "lang": "kk", "form": "ұшу-қону жолағы", "source_id": "S1",
                    "check_status": "pending_validation"}],
    "units": [{"unit_id": "U1", "genre_id": "atc", "topic_id": "aerodrome", "subtopic": "taxi", "term_ids": "T1",
               "link_type_ru": "confirmed_translation", "source_lang": "en", "direction_basis": "Stated in source",
               "alignment_status": "aligned", "dataset": "research"}],
    "fragments": [
        {"unit_id": "U1", "lang": "en", "seq": "1", "text": "Hold short of runway 06.", "source_id": "S1"},
        {"unit_id": "U1", "lang": "ru", "seq": "1", "text": "Ожидайте перед ВПП 06.", "source_id": "S1"},
    ],
    "annotations": [{"annotation_id": "A1", "unit_id": "U1", "lang": "ru", "span_text": "Ожидайте",
                     "difficulty_ids": "D04", "explanation": "Explanation", "check_status": "pending_validation"}],
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
        self.assertEqual(unit["link_types"], {"en": "", "ru": "confirmed_translation", "kk": ""})
        self.assertEqual(unit["subtopic"], "taxi")
        self.assertNotIn("link_type_ru", unit)
        self.assertEqual([s["is_document"] for s in data["sources"].values()], [True, False])
        self.assertEqual([f["seq"] for f in unit["fragments"]], [1, 1])
        ann = unit["annotations"][0]
        self.assertEqual((ann["start"], ann["end"], ann["label"], ann["seq"]), (0, 8, "A1", 1))
        self.assertEqual(data["terms"][0]["forms"][0]["form"], "ұшу-қону жолағы")
        self.assertEqual(data["version"]["current"]["version"], "1.0")
        self.assertEqual(data["vocab"]["difficulties"], {"D04": "Modality", "D03": "Syntax"})
        self.assertEqual(data["methodology"], "<h2>Aim</h2>")

    def test_draft_records_are_not_published(self):
        def add_draft(t):  # drafts are still validated, so the draft gets its own fragment
            t["units"].append({**t["units"][0], "unit_id": "U2", "dataset": "draft"})
            t["fragments"] += [{**f, "unit_id": "U2"} for f in t["fragments"]]
        self.assertEqual(self.build(add_draft), [])
        self.assertEqual([u["unit_id"] for u in read_data(self.out)["units"]], ["U1"])

    def test_new_approved_record_appears_without_ui_changes(self):
        def add(t):
            t["units"].append({**t["units"][0], "unit_id": "U2"})
            t["fragments"] += [{**f, "unit_id": "U2"} for f in t["fragments"]]
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
        self.assertError("sources.csv:2: required field 'genre' is empty", lambda t: t["sources"][0].update(genre=""))

    def test_optional_url_and_bad_language_list(self):
        self.assertEqual(self.build(lambda t: t["sources"][0].update(url="")), [])
        self.assertError("sources.csv:2: unknown lang value 'de'", lambda t: t["sources"][0].update(lang="ru/de"))

    def test_duplicate_id(self):
        self.assertError("terms.csv:3: duplicate ID 'T1' (first at line 2)",
                         lambda t: t["terms"].append(dict(t["terms"][0])))

    def test_unknown_vocabulary_value(self):
        self.assertError("annotations.csv:2: unknown difficulty_ids value 'modal'",
                         lambda t: t["annotations"][0].update(difficulty_ids="modal"))

    def test_unknown_enum_value(self):
        self.assertError("units.csv:2: unknown link_type_ru value 'translation'",
                         lambda t: t["units"][0].update(link_type_ru="translation"))
        self.assertError("sources.csv:2: unknown is_document value 'maybe'",
                         lambda t: t["sources"][0].update(is_document="maybe"))

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
                         lambda t: t["units"][0].update(link_type_ru="comparable_text", source_lang="", training="yes"))

    def test_illustrative_translation_needs_source_lang(self):
        self.assertError("units.csv:2: illustrative_translation requires source_lang",
                         lambda t: t["units"][0].update(link_type_ru="illustrative_translation", source_lang=""))

    def test_source_language_has_no_link_type(self):
        self.assertError("units.csv:2: link_type_en must be empty: en is the source language",
                         lambda t: t["units"][0].update(link_type_en="comparable_text"))

    def test_every_target_language_has_a_link_type(self):
        self.assertError("units.csv:2: link_type_ru is required: the unit has a ru fragment",
                         lambda t: t["units"][0].update(link_type_ru=""))
        self.assertError("units.csv:2: link_type_kk is set but the unit has no kk fragment",
                         lambda t: t["units"][0].update(link_type_kk="comparable_text"))

    def test_confirmed_translation_cannot_cite_author_source(self):
        self.assertError("fragments.csv:3: confirmed_translation cannot cite the author's own source 'S2'",
                         lambda t: t["fragments"][1].update(source_id="S2"))

    def test_source_lang_needs_fragment(self):
        self.assertError("units.csv:2: no kk fragment for source_lang",
                         lambda t: t["units"][0].update(source_lang="kk"))

    def test_research_unit_cannot_link_demo_term(self):
        self.assertError("units.csv:2: research unit links to term 'T1' with dataset 'demo'",
                         lambda t: t["terms"][0].update(dataset="demo"))

    def test_bad_date(self):
        self.assertError("sources.csv:2: accessed '24.11.2026' is not a date YYYY-MM-DD",
                         lambda t: t["sources"][0].update(accessed="24.11.2026"))

    # --- publishing safety ---
    def test_error_keeps_previous_build(self):
        self.assertEqual(self.build(), [])
        before = (self.out / "data.js").read_text(encoding="utf-8")
        self.assertNotEqual(self.build(lambda t: t["units"][0].update(dataset="bogus")), [])
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
