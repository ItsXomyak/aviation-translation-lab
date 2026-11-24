# Acceptance results

Checked on 2026-11-24 against ТЗ v1.0, section 7. Build `0.1-demo`, Demo dataset, Chrome (macOS), local server
`python3 -m http.server -d dist 8765` unless noted otherwise.

## Automated tests

```
python3 tools/test_build.py   → Ran 24 tests … OK
python3 tools/test_data.py    → Ran 2 tests … OK
node --test tools/lib.test.js → tests 14, pass 14, fail 0
```

## ТЗ 7.1

| Check | Expected (ТЗ) | How verified | Result |
|---|---|---|---|
| Search and navigation | «ұшу-қону» opens Runway | Typed `ұшу-қону` in Dictionary; `lib.test.js` "search: Kazakh fragment…" | Pass: 1 term found, Runway card opened automatically; KK form shows *Pending validation* |
| | Related example opens from the card | Clicked `U-001 — Landing clearance` under Related comparisons | Pass: `#/compare/U-001` opened |
| | Empty state for a nonexistent query | `lib.test.js` (`nonexistent` → 0 results); UI message `No terms match "…"` | Pass |
| Comparison | Three language columns, source and link type | `#/compare/U-001` | Pass: EN (Original) / RU / KK, source under each fragment, badge *Confirmed translation*, `Direction: EN → RU, KK` with basis |
| | Undetermined direction when the original is unknown | `#/compare/U-002` (parallel version); `lib.test.js` "direction…" | Pass: `Direction not established`; Assessment shows `Original not established` |
| | Selecting a highlight opens the explanation | Click and keyboard (Tab → Enter) on `ВПП[A2]` and `разрешаю[A1]` | Pass: panel with difficulty, strategy, explanation, supporting source; `aria-expanded=true` |
| | Missing fragment / doubtful alignment / sentence split | `U-003`, `U-004` | Pass: KK `Not available`; *In review* badge; RU sentences numbered 1 and 2 |
| Statistics | 2 confirmed units, one with *modality* → 1 of 2 and 50%; third demo unit excluded | `lib.test.js` "modality: 1 of 2 approved units (50%), illustrative unit excluded" | Pass |
| | Filters update counters, charts and table together | Dashboard: link type = Comparable texts; pair EN–KK + genre Operations manual | Pass: `3 / 1 / 1` counters; empty selection shows `No records match the selected filters.`; Reset restores 14 rows |
| | CSV matches the filtered table | Topic = Clearances: compared table annotation IDs with downloaded CSV | Pass: identical 8 rows (AN-001…AN-012), file `DEMO_dashboard.csv` with dataset and corpus version columns |
| Rubric | 2, 1, 2, 2 → 7/8 | Assessment `U-001`, target RU | Pass: `Total: 7/8` |
| | Missing score → no total | Same form with 3 of 4 scores; Save attempt | Pass: `Status: Incomplete — 1 of 4 criteria not scored`; Save refused with `Score all four criteria before saving.` |
| | Export contains scores and comments | Exported session CSV | Pass: `DEMO_assessments.csv` with unit, `en→ru`, corpus version `0.1-demo`, rubric `R1.0`, scores, justification text, total 7 |
| Corpus update | Correct new record appears without UI changes | `test_build.py` "new_approved_record_appears_without_ui_changes" | Pass |
| | Wrong file rejected with the reason; previous data available | Changed two `link_type` values to `confirmed` and ran `tools/build.py`; `test_build.py` "error_keeps_previous_build" | Pass: `units.csv:5` and `units.csv:7: unknown link_type value 'confirmed' …`, exit 1, `dist/data.js` unchanged |
| Defence readiness | Works locally without network | Headless Chrome rendered `file://…/dist/index.html#/method`; no external URLs in `dist/` (`grep`) | Pass |
| | Readable on a projector | Base font 18 px, navy/gold/light palette, text labels on every colour cue | Pass (visual check) |
| | No horizontal page scroll at 375 px | Every module loaded in a 375 px frame; `scrollWidth == clientWidth` | Pass: 375 = 375 on Home, Dictionary, Compare (U-001, U-004), Dashboard, Assessment, Methodology; wide tables scroll inside their own container |
| | Works from the published link | — | Pending: deployment to the VPS (`<ip>.sslip.io`) |

## Defence scenario (ТЗ 7.2)

Switch to Demo → Dictionary → `ұшу-қону` → Runway → `U-001` → annotation `[A1]` with source → Assessment RU 2, 1, 2, 2
= 7/8 → export → Dashboard difficulty distribution → Methodology limitations. **Pass**, no console errors.

## Other checks

| Check | Result |
|---|---|
| Keyboard only | Pass: Tab reaches selects, highlight buttons, radios, Save/Export; Enter opens annotations |
| Research mode with no approved records | Pass: *Corpus under development* with a *Switch to Demo dataset* button |
| Demo marking | Pass: permanent gold banner on every screen; `DEMO_` file names and `dataset=demo` column in exports |
| Safari | Pending: manual check on a Mac with Safari |
