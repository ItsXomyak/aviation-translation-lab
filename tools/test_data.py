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
