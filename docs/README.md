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

The site opens in **Research corpus** mode: 22 research units, 54 terms and 20 sources of corpus version 0.1-draft.
**Demo** in the header adds the four modelled demo units (METAR, ATIS, cabin announcement, manual instruction);
the demo mode is marked by a gold banner and `DEMO_` file names.

## Update the corpus

1. Edit the CSV files in `data/` (UTF-8; Excel "CSV UTF-8" is fine). Field reference: `docs/DATA_DICTIONARY.md`.
   Empty templates: `templates/`. If you keep working in the Excel workbook instead, re-import it:
   `pip install openpyxl && python3 tools/import_xlsx.py Aviation_Corpus_EN_RU_KK.xlsx`.
2. `dataset=research` records form the research corpus; `demo` records appear only in Demo mode; `draft` records are
   never published. After checking a form or annotation against the official source, set its `check_status` to `verified`.
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
| `tools/import_xlsx.py` | Import of the author's Excel workbook into `data/` |
| `tools/publish.sh` | Server publishing |
| `docs/` | This guide, data dictionary, acceptance results, design spec and plan |

## Why a static site instead of Streamlit

The ТЗ proposes Streamlit. The acceptance criteria require full keyboard access, no horizontal page scroll at
375 px, clickable highlighted spans and offline use at the defence. A static site gives direct control over all of
these and opens from a file without a server. Validation and data processing stay in Python, as the ТЗ intends.
