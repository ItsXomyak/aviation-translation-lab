# Data dictionary

All tables are CSV, UTF-8, first row = column names. Lists inside a cell are separated by `;`.
Dates use `YYYY-MM-DD`. Required columns are marked **bold**; optional columns may be left empty or omitted.
Run `python3 tools/build.py` after every change.

The current tables (corpus version 0.1-draft) were imported from the author's workbook
`Aviation_Corpus_EN_RU_KK.xlsx` with `python3 tools/import_xlsx.py Aviation_Corpus_EN_RU_KK.xlsx`
(needs `pip install openpyxl`). Re-running the import overwrites the CSV tables, not `methodology.html`.

## Fixed values

| Field | Allowed values |
|---|---|
| language (`lang`, `source_lang`, `compared_with`, `definition_lang`) | `en`, `ru`, `kk`; a source written in several languages uses `ru/kk` |
| `link_type` | `confirmed_translation`, `parallel_unknown_direction`, `comparable_text`, `illustrative_translation` |
| `alignment_status` | `aligned`, `in_review` |
| `dataset` (terms, units) | `research` (research corpus), `demo` (shown only in Demo mode, marked *Illustrative example*), `draft` (not published) |
| `check_status` (term forms, annotations) | `verified`, `source_referenced`, `pending_validation`, `illustrative` |
| `training` | `yes`, `no` (empty = `no`) |

Validation statuses (from the corpus description):

- `source_referenced` — wording follows the known model of an ICAO/FAA document and has an exact reference; check it verbatim before the defence.
- `pending_validation` — the equivalent still has to be checked against a specialist source.
- `illustrative` — the author's own translation or a modelled text.
- `verified` — set by the author after checking.

## Vocabularies — `data/vocab/*.csv`

IDs are permanent (other tables refer to them); labels may be edited. The interface shows `label` (English).

| File | Columns |
|---|---|
| `difficulties.csv` | **id** (`D01`…), code, **label**, label_ru, label_kk, description |
| `strategies.csv` | **id** (`ST01`…), code, **label**, label_ru, label_kk |
| `topics.csv` | **id**, **label** — topics of terms and units |
| `genres.csv` | **id**, **label** — genres of units (used by the Dashboard genre filter) |

## `sources.csv`

| Column | Meaning |
|---|---|
| **source_id** | Unique ID, e.g. `S01` |
| **title**, **organization** | Document title and issuing body |
| **lang** | Language(s) of the document: `en`, `ru/kk`, `en/ru/kk` |
| **genre** | Document genre, free text (e.g. `regulatory/phraseology`) |
| audience | Intended readers |
| url | Link (empty for books and the author's own translations) |
| **accessed** | Date of access |
| edition, note | Edition; verification note |

## `terms.csv` and `term_forms.csv`

`terms.csv`: **term_id**, **topic_id**, **definition**, definition_lang, definition_source_id, context,
difficulty_ids (`;` list of difficulty IDs), difficulty_note, **dataset**.

`term_forms.csv` (one row per form; several forms per language allowed): **term_id**, **lang**, **form**,
abbreviation, **source_id** (one or more, `S02;S09`), locator, **check_status**.
A language without a form is shown as *Not available*.

## `units.csv` and `fragments.csv`

`units.csv`: **unit_id**, title (if empty the interface shows "topic · genre"), **genre_id**, **topic_id**,
term_ids (`;` list), **link_type**, source_lang (language of the original according to the source), direction_basis,
**alignment_status**, training, **dataset**, note.

- `confirmed_translation` requires `source_lang` and `direction_basis`; `illustrative_translation` requires `source_lang`.
  The interface shows the translation direction only for these two link types.
- Rubric scoring is available for confirmed and illustrative translations and for units with `training=yes`
  (training examples; they require `source_lang` as the reference text). U003 is marked as a training example
  because the corpus description uses it as the rubric example.
- A `research` unit may link only to `research` terms.

`fragments.csv`: **unit_id**, **lang**, **seq** (sentence number 1, 2, … within the unit and language), **text**,
**source_id**, locator. Different numbers of sentences per language express merging or splitting.

## `annotations.csv`

**annotation_id**, **unit_id**, **lang** (language of the highlighted fragment), seq (default 1), **span_text**
(exact text to highlight), occurrence (which occurrence of `span_text`, default 1), compared_with (other language of
the pair), difficulty_ids, strategy_ids (at least one of the two), **explanation**, evidence_source_id,
evidence_locator, **check_status**.

The build finds `span_text` in the fragment and computes the highlight boundaries; highlights in one fragment must
not overlap. The annotation panel always shows the source of the fragment; `evidence_source_id` adds supporting material.

## `versions.csv`

**version**, **date**, **changes**. The last row is the current corpus version shown in the footer, Methodology and
every export.

## Statistics

The Dashboard counts annotated units of the visible dataset (Research: `research` units; Demo: `research` + `demo`)
after the filters. Frequency = number of units with at least one annotation carrying the label; share = frequency / N
annotated units, one decimal place. All annotations count regardless of their check status, as in the author's
statistics sheet; the status is shown as a label. For version 0.1-draft the research corpus gives N = 22, e.g.
Terminological equivalence 10 of 22 = 45.5% (checked by `tools/lib.test.js`).

## What the build checks

Missing files or required columns, empty required fields, duplicate IDs, unknown vocabulary or fixed values, references
to missing records, highlight text not found or overlapping, invalid numbers and dates, a confirmed direction without
its basis, illustrative translations and training examples without `source_lang`, research units linked to
non-research terms. Each error reads `table.csv:line: problem`.
