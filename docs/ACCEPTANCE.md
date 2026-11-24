# Acceptance results

Checked on 2026-11-24 against ТЗ v1.0, section 7. Corpus version `0.1-draft` (imported from the author's workbook),
Chrome on macOS, local server `python3 -m http.server -d dist 8765` unless noted otherwise.

## Automated tests

```
python3 tools/test_build.py   → Ran 26 tests … OK
python3 tools/test_data.py    → Ran 5 tests … OK
node --test tools/lib.test.js → tests 16, pass 16, fail 0
```

`tools/lib.test.js` also builds the real corpus and checks that the Dashboard reproduces the author's statistics sheet
(dataset = research): N = 22 annotated units; D01 10, D02 5, D03 5, D04 7, D05 8, D06 10;
ST01 13, ST02 2, ST03 4, ST04 4, ST05 6, ST07 2, ST08 7; 45.5% for D01; 20 sources and 54 terms in the corpus.

## ТЗ 7.1

| Check | Expected (ТЗ) | How verified | Result |
|---|---|---|---|
| Search and navigation | «ұшу-қону» opens Runway | Typed `ұшу-қону` in Dictionary; `lib.test.js` search test | Pass: 1 term found, Runway (T001) card opened automatically; KK form *Pending validation*, EN/RU *Source referenced* with ICAO sources |
| | Related example opens from the card | Related comparisons of T001: U001, U015, U020 | Pass |
| | Empty state for a nonexistent query | `lib.test.js`; UI message `No terms match "…"` | Pass |
| Comparison | Three language columns, source and link type | `#/compare/U001` | Pass: EN (Reference) / RU / KK with source and locator under each fragment; strip shows *Comparable texts* |
| | Undetermined direction when the original is unknown | `#/compare/U019` (parallel version, Law No. 339-IV) | Pass: dashed sign *Direction not established*; the basis note is shown |
| | Selecting a highlight opens the explanation | Click and keyboard (Tab → Enter) on highlights in U001 | Pass: panel with difficulty, strategy, explanation, fragment source, check status |
| | Doubtful alignment marked | U003, U011–U014, U019, U025, U026 | Pass: *In review* badge |
| Statistics | 2 confirmed units, one with *modality* → 1 of 2 and 50%; the demo unit excluded | `lib.test.js` "modality: 1 of 2 research units (50%), demo unit excluded" | Pass |
| | Filters update counters, charts and table together | `lib.test.js` filter test; Dashboard filters in the browser | Pass |
| | CSV matches the filtered table | `lib.test.js` CSV test (same row builder for table and CSV) | Pass |
| | Message for an empty selection | Pair EN–KK + incompatible genre | Pass: `No records match the selected filters.` |
| Rubric | 2, 1, 2, 2 → 7/8 | Assessment U003 (training example), EN → RU — the example from the corpus description | Pass: `Total 7/8` |
| | Missing score → no total | Same form with 3 of 4 scores | Pass: status *Incomplete*, Save refused with `Score all four criteria before saving.` |
| | Export contains scores and comments | `lib.test.js` export test; session export in the browser | Pass: unit, pair, corpus and rubric version, scores, justifications, total |
| Corpus update | Correct new record appears without UI changes | `test_build.py` "new_approved_record_appears_without_ui_changes" | Pass |
| | Wrong file rejected with the reason; previous data available | `test_build.py` "error_keeps_previous_build"; CLI run with an unknown `link_type` | Pass: `units.csv:<line>: unknown link_type value …`, exit 1, previous `dist/` unchanged |
| Defence readiness | Works locally without network | Headless Chrome rendered `file://…/dist/index.html`; no external URLs loaded by `dist/` | Pass |
| | Readable on a projector | 18 px base font, navy/gold/light palette, every colour cue paired with a text label | Pass (visual check) |
| | No horizontal page scroll at 375 px | 15 routes × 2 modes in a 375 px frame: `scrollWidth == clientWidth` | Pass: 0 px overflow everywhere; wide tables scroll inside their own region |
| | Works from the published link | — | Pending: deployment to the VPS (`<ip>.sslip.io`) |

## Defence scenario (ТЗ 7.2)

Dictionary → `ұшу-қону` → Runway → U001 → highlight and source → Assessment U003 RU 2, 1, 2, 2 = 7/8 → export →
Dashboard difficulty distribution (N = 22) → Methodology limitations. **Pass**, no console errors.

## Other checks

| Check | Result |
|---|---|
| Keyboard only | Pass: Tab reaches the dataset switch, selects, highlight buttons, radio options, Save/Export; Enter opens annotations |
| Demo marking | Pass: permanent gold banner in Demo mode; `DEMO_` file names and `dataset=demo` in exports |
| Safari | Pending: manual check on a Mac with Safari |
