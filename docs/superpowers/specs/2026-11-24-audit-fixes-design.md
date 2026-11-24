# Audit fixes — design

Source: `Аудит_платформы_Aviation_Translation_Lab.pdf` (24.11.2026, 29 findings). Every finding was checked
against the code before planning; all 29 reproduce.

## Decisions

**Per-language link type (#1, #4, #7).** `units.csv` drops `link_type` and gets `link_type_en`, `link_type_ru`,
`link_type_kk` — the same shape as corpus v0.2. Rules (build.py): the `source_lang` column is empty (it is the
original or reference); every other language with a fragment has a type; a language without fragments has none;
`confirmed_translation` needs `source_lang` + `direction_basis` and may not cite an author-made source.
Until v0.2 arrives, the importer derives the types from v0.1: a fragment whose source is the author's own
translation (S19) → `illustrative_translation`; otherwise the old unit type. This gives KK of U001–U018 =
illustrative, RU of U015–U018 = confirmed, as the audit expects.
- Lib: `linkType(u, lang)`, `annLinkType(u, a)`; `isScorable(u, target)` = pair is confirmed or `u.training`.
- Direction sign: directed targets → "EN → KK"; only comparable texts → "Not a translation pair (comparable
  texts)"; otherwise "Direction not established". Each language column shows its own link-type badge.
- Dashboard link filter applies to each annotation's pair; table/CSV `link_type` is the pair's type.

**Documents (#2).** `sources.csv` gets `is_document` (yes/no, default yes). Importer: `no` for organisation
`author` (S19, S20). Counters count documents only and say so.

**Assessment (#13, #14, #26, #27).** Optional overall comment in score mode; a justification is required for every
criterion scored 0 or 1; pair written `EN→RU`; each saved row gets Remove, plus Clear session (second click confirms).
Numbers stay stable after removal (next = max + 1).

**Compare (#5, #6).** Pending check uses `pending_validation`; legend explains solid vs dashed. Highlights become
inline `<mark role="button" tabindex="0">` (Enter/Space open the panel), so text wraps like text; the `.nowrap`
glue is removed.

**Dictionary (#8, #9, #25).** Search folds Kazakh letters (ә→а, ғ→г, қ→к, ң→н, ө→о, ұ/ү→у, һ→х, і→и) for query and
forms. Term card is sticky on wide screens. A status filter with no matching forms in the whole corpus explains that
the corpus is still under validation.

**Not found (#10).** Unknown term/unit IDs show "… not found" with a link back; unknown routes show "Page not found".

**Dashboard (#11, #12).** Sources column shows IDs only (full reference in `title`; CSV keeps full references);
a "scroll sideways" hint under 1100 px. Topic labels are capitalised by the importer.

**Home and shell (#15, #16, #18, #23, #24, #29).** Hero kicker becomes "Master's dissertation · 2026" with author and
supervisor beneath (university added when the author sends it). Router focuses h1 only on navigation, not on first
load. On ≤560 px the header is brand + dataset switch on one row and a horizontally scrolling nav below. Label text
.62 → .75. `overflow-wrap: break-word`; `hyphens: auto` for prose blocks.

**Language tags (#17).** `Lib.langOf(text)`: Cyrillic-dominant text → `ru`, or `kk` when Kazakh-specific letters
exceed 10 % of Cyrillic letters. Applied to explanations, notes, bases, source titles/locators and context.

**Docs (#21, #22, #28).** Methodology gets an "Implementation" section (stack, why static, rebuild, repository).
ACCEPTANCE.md records a real `build.py` run on a broken CSV and shows the previous build untouched. Methodology lists
categories not yet attested in the research set (generated from data, so ST06 is flagged automatically).

## Not done now

- **#3, #12 (topics unification), #19 (import v0.2)** — need the author's corpus v0.2 (`ref_topics`, S21).
  Request sent to the author via the user.
- **#20 (permanent address)** — the user chose to keep sslip.io for now.

## Testing

TDD for build.py rules and lib.js functions; the author-statistics test keeps N = 22 and the D/ST counts
(documents total becomes 18). Browser check at 1440 and 375 px (CDP) on all routes in both modes.
