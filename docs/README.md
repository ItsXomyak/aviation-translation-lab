# Aviation Translation Lab

Research prototype for the comparative analysis of aviation discourse translation (English · Russian · Kazakh).
Five modules: Dictionary, Compare, Dashboard, Assessment, Methodology.

- Live: https://93.171.232.191.sslip.io
- Repository: https://github.com/ItsXomyak/aviation-translation-lab

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

## Deploy with Docker

The image validates the corpus while it is built (`tools/build.py`) and serves the site with Caddy, which obtains a
Let's Encrypt certificate for the address in `SITE_ADDRESS` automatically. Ports 80 and 443 must be free and reachable.

```bash
git clone <repository-url> aviation-translation-lab && cd aviation-translation-lab
cp .env.example .env            # set SITE_ADDRESS=<server-ip>.sslip.io
docker compose up -d --build
```

### Production

The live site runs as a Coolify application on the VPS, behind the server's Traefik proxy: `SITE_ADDRESS=:8080`,
no published ports, Traefik terminates TLS with Let's Encrypt for `93.171.232.191.sslip.io`. To publish a corpus
update, push to `main` and redeploy the application in Coolify (it pulls `main` and rebuilds the image; a rolling
update replaces the container only after a successful build).

### Standalone server

Update after a corpus change:

```bash
git pull && docker compose up -d --build
```

If the CSV tables contain an error, the image build stops with the `table.csv:line: problem` list and the running
container keeps serving the previous version. Behind an existing reverse proxy, set `SITE_ADDRESS=:8080`, publish
`8080` instead of 80/443 in `compose.yaml`, and proxy the domain to it.

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
| `Dockerfile`, `compose.yaml`, `deploy/Caddyfile` | Container build and HTTPS serving |
| `docs/` | This guide, data dictionary, acceptance results, design spec and plan |

## Why a static site instead of Streamlit

The ТЗ proposes Streamlit. The acceptance criteria require full keyboard access, no horizontal page scroll at
375 px, clickable highlighted spans and offline use at the defence. A static site gives direct control over all of
these and opens from a file without a server. Validation and data processing stay in Python, as the ТЗ intends.
