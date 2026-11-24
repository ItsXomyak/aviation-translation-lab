"""Checks the shipped corpus (imported from Aviation_Corpus_EN_RU_KK.xlsx) and the templates.

Run: python3 tools/test_data.py -v
"""
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build  # noqa: E402
from test_build import read_data  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


class RepoDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            web, out = Path(tmp) / "web", Path(tmp) / "dist"
            web.mkdir()
            cls.errors = build.build(ROOT / "data", web, out)
            cls.data = read_data(out) if not cls.errors else None

    def test_repo_data_builds(self):
        self.assertEqual(self.errors, [])

    def test_corpus_size_matches_workbook(self):
        d = self.data
        anns = sum(len(u["annotations"]) for u in d["units"])
        self.assertEqual((len(d["sources"]), len(d["terms"]), len(d["units"]), anns), (20, 54, 26, 44))
        self.assertEqual(Counter(u["dataset"] for u in d["units"]), {"research": 22, "demo": 4})

    def test_demo_terms_from_the_tz(self):
        forms = {t["term_id"]: {f["lang"]: f["form"] for f in t["forms"]} for t in self.data["terms"]}
        self.assertEqual(forms["T001"], {"en": "runway", "ru": "взлётно-посадочная полоса", "kk": "ұшу-қону жолағы"})
        self.assertEqual(forms["T008"]["en"], "air traffic control")
        self.assertEqual(forms["T010"]["en"], "ATC clearance")

    def test_rubric_example_unit_is_scorable(self):
        u003 = next(u for u in self.data["units"] if u["unit_id"] == "U003")
        self.assertTrue(u003["training"])

    def test_templates_match_schema(self):
        for name, (cols, _) in build.SCHEMA.items():
            header = (ROOT / "templates" / f"{name}.csv").read_text(encoding="utf-8").splitlines()[0]
            self.assertEqual(header.split(","), cols.split(), name)


if __name__ == "__main__":
    unittest.main()
