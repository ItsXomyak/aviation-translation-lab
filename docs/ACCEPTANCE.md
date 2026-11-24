# Acceptance results

Checked on 2026-11-24 against ТЗ v1.0, section 7. Published at https://93.171.232.191.sslip.io. Corpus version `0.1-draft` (imported from the author's workbook),
Chrome on macOS, local server `python3 -m http.server -d dist 8765` unless noted otherwise.

## Automated tests

```
python3 tools/test_build.py   → Ran 29 tests … OK
python3 tools/test_data.py    → Ran 5 tests … OK
node --test tools/lib.test.js → tests 19, pass 19, fail 0
```

`tools/lib.test.js` also builds the real corpus and checks that the Dashboard reproduces the author's statistics sheet
(dataset = research): N = 22 annotated units; D01 10, D02 5, D03 5, D04 7, D05 8, D06 10;
ST01 13, ST02 2, ST03 4, ST04 4, ST05 6, ST07 2, ST08 7; 45.5% for D01; 18 source documents (20 sources minus the
author's own translation S19 and training text S20) and 54 terms in the corpus.

## ТЗ 7.1

| Check | Expected (ТЗ) | How verified | Result |
|---|---|---|---|
| Search and navigation | «ұшу-қону» opens Runway | Typed `ұшу-қону` in Dictionary; `lib.test.js` search test | Pass: 1 term found, Runway (T001) card opened automatically; KK form *Pending validation*, EN/RU *Source referenced* with ICAO sources |
| | Related example opens from the card | Related comparisons of T001: U001, U015, U020 | Pass |
| | Empty state for a nonexistent query | `lib.test.js`; UI message `No terms match "…"` | Pass |
| Comparison | Three language columns, source and link type | `#/compare/U001` | Pass: EN *Original* / RU *Comparable texts* / KK *Illustrative translation*, each with source and locator; direction sign EN → KK |
| | Undetermined direction when the original is unknown | `#/compare/U019` (parallel version, Law No. 339-IV) | Pass: KK column marked *Parallel version — direction not established*; EN, the author's translation, shows RU → EN; the basis note is shown |
| | Selecting a highlight opens the explanation | Click and keyboard (Tab → Enter) on highlights in U001 | Pass: panel with difficulty, strategy, explanation, fragment source, check status |
| | Doubtful alignment marked | U003, U011–U014, U019, U025, U026 | Pass: *In review* badge |
| Statistics | 2 confirmed units, one with *modality* → 1 of 2 and 50%; the demo unit excluded | `lib.test.js` "modality: 1 of 2 research units (50%), demo unit excluded" | Pass |
| | Filters update counters, charts and table together | `lib.test.js` filter test; Dashboard filters in the browser | Pass |
| | Link type follows the language pair | Pair EN–KK + *Confirmed translation*; `lib.test.js` "link type belongs to the language pair" | Pass: no records (KK of U015–U018 is the author's illustrative translation) |
| | CSV matches the filtered table | `lib.test.js` CSV test (same row builder for table and CSV) | Pass |
| | Message for an empty selection | Pair EN–KK + incompatible genre | Pass: `No records match the selected filters.` |
| Rubric | 2, 1, 2, 2 → 7/8 | Assessment U003 (training example), EN → RU — the example from the corpus description | Pass: `Total 7/8`; saving asks for the justification of the criterion scored 1 |
| | Scores only for confirmed pairs and training examples (ТЗ 4.4) | U015 EN→RU, U015 EN→KK, U020 | Pass: U015 EN→RU opens the rubric; EN→KK and U020 take a comparison comment |
| | Missing score → no total | Same form with 3 of 4 scores | Pass: status *Incomplete*, Save refused with `Score all four criteria before saving.` |
| | Export contains scores and comments | `lib.test.js` export test; session export in the browser | Pass: unit, pair, corpus and rubric version, scores, justifications, total |
| Corpus update | Correct new record appears without UI changes | `test_build.py` "new_approved_record_appears_without_ui_changes" | Pass |
| | Wrong file rejected with the reason; previous data available | `test_build.py` "error_keeps_previous_build"; CLI run on a broken copy of the real corpus (below) | Pass: table, line and reason for each error, exit 1, previous `dist/data.js` byte-identical |
| Defence readiness | Works locally without network | Headless Chrome rendered `file://…/dist/index.html`; no external URLs loaded by `dist/` | Pass |
| | Readable on a projector | 18 px base font, navy/gold/light palette, every colour cue paired with a text label | Pass (visual check) |
| | No horizontal page scroll at 375 px | 10 routes × 2 modes, true 375 px viewport (Chrome DevTools device emulation): `scrollWidth == clientWidth` | Pass: 0 px overflow everywhere; wide tables and the module menu scroll inside their own region; header 108 px |
| | Works from the published link | https://93.171.232.191.sslip.io: the 11 served files compared byte for byte with the local build of the same commit; headers checked; true 375 px viewport via Chrome DevTools device emulation, 8 routes × 2 modes | Pass: files identical, HTTP/2 200, valid Let's Encrypt certificate, CSP and no-cache headers present, 0 px horizontal overflow in all 16 checks |

### Rejected corpus file (ТЗ 6.2)

A copy of `data/` with an unknown term in U016 and a duplicated annotation row, built over a copy of `dist/`:

```
$ python3 tools/build.py --data broken/data --out broken/dist
Build rejected: 3 error(s). The previous build was left untouched.
  units.csv:17: term_ids 'T099' not found in terms.csv
  annotations.csv:4: duplicate ID 'A002' (first at line 3)
  annotations.csv:4: selection overlaps annotation at line 3
exit code: 1
before: eeae81cf30962738e2a21b6246d0237150c4d60f  dist/data.js
after:  eeae81cf30962738e2a21b6246d0237150c4d60f  dist/data.js
```

On the server the same check runs inside the Docker build, so a broken file fails the deploy and the running
container keeps serving the previous version.

## Defence scenario (ТЗ 7.2)

Dictionary → `ұшу-қону` → Runway → U001 → highlight and source → Assessment U003 RU 2, 1, 2, 2 = 7/8 → export →
Dashboard difficulty distribution (N = 22) → Methodology limitations. **Pass**, no console errors.

## Other checks

| Check | Result |
|---|---|
| Keyboard only | Pass: the first Tab reaches *Skip to content*; Tab reaches the dataset switch, selects, highlights, radio options, Save/Export/Remove; Enter and Space open annotations |
| Demo marking | Pass: permanent gold banner in Demo mode; `DEMO_` file names and `dataset=demo` in exports |
| Safari | Pending: manual check on a Mac with Safari |

## Audit of 24.11.2026

Findings from `Аудит_платформы_Aviation_Translation_Lab.pdf`; all 29 reproduced before fixing.

| № | Finding | Status |
|---|---|---|
| 1 | Link type set per unit, not per language pair | Fixed: `link_type_en/ru/kk`; KK of U001–U018 is *Illustrative translation*, RU of U015–U018 *Confirmed* |
| 2 | Source documents counter inflated | Fixed: `is_document`; 11 in the full selection, 18 in the corpus |
| 3 | Two topic systems mixed | Waiting for corpus v0.2 (`ref_topics`) |
| 4 | Illustrative translations could be scored | Fixed: scores only for confirmed pairs and training examples |
| 5 | Pending selections not dashed | Fixed, with a legend |
| 6 | Highlights broke into blocks at 375 px | Fixed: inline `<mark role="button">`, wraps with the sentence |
| 7 | "Direction not established" for comparable texts | Fixed: *Not a translation pair (comparable texts)* |
| 8 | Kazakh words typed with Russian letters not found | Fixed: `ушу-кону` finds Runway |
| 9 | Term card scrolled out of view | Fixed: sticky card on wide screens |
| 10 | Unknown IDs and routes opened silently | Fixed: *… not found* and *Page not found* |
| 11 | 12-column table cut at 1440 px | Fixed: source IDs with full reference on hover; fits at 1440 px; scroll hint when it overflows |
| 12 | Lower-case topic names | Fixed: capitalised on import |
| 13 | No overall comment in score mode | Fixed |
| 14 | Justification optional | Fixed: required for criteria scored 0 or 1 |
| 15 | No author, supervisor, university on the home page | Fixed for author and supervisor; university waits for the author |
| 16 | "Research Prototype" twice | Fixed: hero reads *Master's dissertation · 2026* |
| 17 | Russian text without `lang` | Fixed: explanations, notes, titles, locators tagged `ru`/`kk` |
| 18 | Skip link unreachable | Fixed: focus moves only on navigation |
| 19 | Site on corpus v0.1 | Waiting for corpus v0.2 |
| 20 | sslip.io address may be blocked | Kept for now (decision of the developer); `dist/` works offline |
| 21 | Stack deviation from ТЗ 6.3 not described | Fixed: *Implementation* section in Methodology |
| 22 | Import check and rollback not shown | Fixed: see *Rejected corpus file* above |
| 23 | Header ~210 px at 375 px | Fixed: 108 px, the menu scrolls sideways |
| 24 | Small label text | Fixed: .62 → .75 |
| 25 | Verified filter always 0 without explanation | Fixed: explains that the corpus is under validation |
| 26 | Language case differs in CSV | Fixed: `EN→RU` everywhere |
| 27 | A saved assessment could not be removed | Fixed: *Remove* per row and *Clear session* |
| 28 | Generalization 0 of 22 | Methodology marks categories not yet attested; examples are the author's decision |
| 29 | Words broken mid-word | Fixed: `overflow-wrap: break-word`, hyphenation in prose only |
