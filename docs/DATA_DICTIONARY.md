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
