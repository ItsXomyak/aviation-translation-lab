// Run: node --test tools/lib.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const L = require('../web/lib.js');

const vocab = {
  topics: { aerodrome: 'aerodrome' },
  genres: { atc: 'ATC radiotelephony', reg: 'regulatory definition' },
  difficulties: { D04: 'Modality', D03: 'Syntax' },
  strategies: { ST03: 'Calque' },
};
const sources = {
  S1: { source_id: 'S1', title: 'Source', is_document: true },
  S9: { source_id: 'S9', title: 'Author translation', is_document: false },
};
const ann = (id, diffs, check = 'pending_validation') => ({
  annotation_id: id, label: 'A1', lang: 'ru', seq: 1, span_text: 'x', start: 0, end: 1, compared_with: 'en',
  difficulty_ids: diffs, strategy_ids: [], explanation: 'e', check_status: check,
});
const frag = lang => ({ lang, seq: 1, text: 'x', source_id: 'S1', locator: 'p. 1' });
const unit = (id, dataset, diffs, extra = {}) => ({
  unit_id: id, title: '', genre_id: 'atc', topic_id: 'aerodrome', term_ids: ['T1'],
  link_types: { en: '', ru: 'confirmed_translation', kk: '' },
  source_lang: 'en', direction_basis: 'b', alignment_status: 'aligned', training: false, dataset,
  fragments: [frag('en'), frag('ru')], annotations: [ann(id + '-A', diffs)], ...extra,
});
const runway = {
  term_id: 'T1', topic_id: 'aerodrome', difficulty_ids: ['D03'], dataset: 'research', forms: [
    { lang: 'en', form: 'runway', abbreviation: 'RWY', check_status: 'source_referenced' },
    { lang: 'ru', form: 'Взлётно-посадочная полоса', abbreviation: 'ВПП', check_status: 'source_referenced' },
    { lang: 'kk', form: 'Ұшу-қону жолағы', abbreviation: 'ҰҚЖ', check_status: 'pending_validation' }],
};
const DATA = {
  version: { current: { version: '1.0', date: '2026-11-24', changes: 'c' }, history: [] },
  vocab, sources, terms: [runway],
  units: [unit('U1', 'research', ['D04']), unit('U2', 'research', ['D03']), unit('U3', 'demo', ['D04'])],
  methodology: '',
};

test('modality: 1 of 2 research units (50%), demo unit excluded (ТЗ 7.1)', () => {
  const s = L.stats(L.datasetFor(DATA, 'research'));
  const m = s.difficulties.find(d => d.id === 'D04');
  assert.equal(s.annotatedUnits, 2);
  assert.equal(m.count, 1);
  assert.equal(L.percent(m.share), '50%');
});

test('demo mode counts demo units too', () => {
  const s = L.stats(L.datasetFor(DATA, 'demo'));
  assert.equal(s.annotatedUnits, 3);
  assert.equal(s.difficulties.find(d => d.id === 'D04').count, 2);
});

test('annotations count whatever their check status', () => {
  const data = { ...DATA, units: [unit('U1', 'research', [], { annotations: [ann('P', ['D04'], 'verified')] }), unit('U2', 'research', ['D04'])] };
  assert.equal(L.stats(L.datasetFor(data, 'research')).difficulties.find(d => d.id === 'D04').count, 2);
});

test('filters update counters, charts and rows together', () => {
  const ds = L.datasetFor(DATA, 'research');
  const all = L.stats(ds);
  assert.deepEqual([all.units, all.documents, all.totalDocuments, all.terms, all.totalTerms, all.rows.length], [2, 1, 1, 1, 1, 2]);
  const none = L.stats(ds, { pair: 'en-kk' });
  assert.deepEqual([none.units, none.annotatedUnits, none.rows.length], [0, 0, 0]);
  assert.equal(L.stats(ds, { genre: 'reg' }).units, 0);
  assert.equal(L.stats(ds, { genre: 'atc', link: 'confirmed_translation' }).units, 2);
  assert.equal(L.stats(ds, { link: 'comparable_text' }).units, 0);
  assert.equal(all.totalDocuments, 1, 'author-made sources are not documents');
  assert.deepEqual(all.termsByTopic, [{ id: 'aerodrome', label: 'aerodrome', count: 1 }]);
});

// U1: RU is a confirmed translation, KK the author's illustrative one (corpus v0.2, audit #1).
const mixed = unit('U1', 'research', ['D04'], {
  link_types: { en: '', ru: 'confirmed_translation', kk: 'illustrative_translation' },
  fragments: [frag('en'), frag('ru'), { ...frag('kk'), source_id: 'S9' }],
  annotations: [ann('A-ru', ['D04']), { ...ann('A-kk', ['D03']), lang: 'kk' }],
});

test('link type belongs to the language pair, not to the unit', () => {
  const ds = L.datasetFor({ ...DATA, units: [mixed] }, 'research');
  const kkConfirmed = L.stats(ds, { pair: 'en-kk', link: 'confirmed_translation' });
  assert.deepEqual([kkConfirmed.units, kkConfirmed.rows.length], [0, 0]);
  const illustrative = L.stats(ds, { link: 'illustrative_translation' });
  assert.deepEqual(illustrative.rows.map(r => [r.annotation_id, r.link_type]), [['A-kk', 'Illustrative translation']]);
  assert.equal(L.stats(ds).documents, 1, 'S9 is the author\'s translation, not a document');
  assert.equal(L.linkType(mixed, 'en'), '');
});

test('labels may sum to more than 100%; shares keep one decimal', () => {
  const data = { ...DATA, units: [unit('U1', 'research', ['D04', 'D03'])] };
  const s = L.stats(L.datasetFor(data, 'research'));
  assert.equal(s.difficulties.reduce((sum, d) => sum + d.share, 0), 2);
  assert.equal(L.percent(10 / 22), '45.5%');
});

test('dashboard CSV has exactly the filtered table rows', () => {
  const ds = L.datasetFor(DATA, 'research');
  const s = L.stats(ds);
  const lines = L.toCSV(L.exportRows(ds, s.rows), L.DASHBOARD_CSV_COLUMNS).trim().split('\r\n');
  assert.equal(lines.length, s.rows.length + 1);
  assert.equal(lines[0], L.DASHBOARD_CSV_COLUMNS.join(','));
  assert.ok(lines[1].startsWith('research,1.0,U1,U1-A,RU,EN,x,Modality,,Confirmed translation,ATC radiotelephony,aerodrome,S1 (p. 1),Pending validation'), lines[1]);
});

test('rubric: 2,1,2,2 gives 7; a missing score gives no total', () => {
  assert.equal(L.rubricTotal({ terminology: 2, clarity: 1, meaning: 2, function: 2 }), 7);
  assert.equal(L.rubricTotal({ terminology: 2, clarity: 1, meaning: 2 }), null);
  assert.equal(L.rubricTotal({ terminology: 0, clarity: 0, meaning: 0, function: 0 }), 0);
});

test('assessment export contains scores and comments', () => {
  const ds = L.datasetFor(DATA, 'demo');
  const rec = L.assessmentRecord({
    ds, unit: DATA.units[0], target: 'ru', no: 1, savedAt: '2026-11-24T10:00:00Z',
    scores: { terminology: 2, clarity: 1, meaning: 2, function: 2 }, notes: { clarity: 'word "x", line 1' },
  });
  assert.equal(rec.total, 7);
  assert.equal(rec.status, 'Complete');
  const csv = L.toCSV([rec], L.ASSESSMENT_CSV_COLUMNS);
  assert.ok(csv.startsWith('dataset,assessment_no,unit_id,language_pair,corpus_version,rubric_version,mode,terminology,'));
  assert.ok(csv.includes('demo,1,U1,EN→RU,1.0,R1.0,score,2,,1,"word ""x"", line 1",2,,2,,7,Complete'), csv);
});

test('scoring: confirmed pairs and training units score; illustrative and comparable take comments (ТЗ 4.4)', () => {
  const ds = L.datasetFor(DATA, 'demo');
  assert.equal(L.assessmentRecord({ ds, unit: DATA.units[0], target: 'ru', scores: { terminology: 2 } }).status, 'Incomplete');
  assert.equal(L.isScorable(mixed, 'ru'), true);
  assert.equal(L.isScorable(mixed, 'kk'), false);
  assert.equal(L.isScorable({ ...mixed, training: true }, 'kk'), true);
  const rec = L.assessmentRecord({ ds, unit: mixed, target: 'kk', comment: 'c', scores: { terminology: 2 } });
  assert.deepEqual([rec.mode, rec.status, rec.terminology, rec.total, rec.language_pair], ['comment', 'Comment', '', '', 'EN→KK']);
});

test('criteria scored 0 or 1 need a justification', () => {
  const scores = { terminology: 2, clarity: 1, meaning: 0, function: 2 };
  assert.deepEqual(L.missingJustifications(scores, { clarity: 'line 1' }), ['Preservation of meaning']);
  assert.deepEqual(L.missingJustifications(scores, { clarity: 'x', meaning: 'y' }), []);
});

test('search: Kazakh fragment, case, abbreviation, ё/е, filters and empty result', () => {
  const terms = L.datasetFor(DATA, 'research').terms;
  assert.deepEqual(L.searchTerms(terms, { q: 'ұшу-қону' }).map(t => t.term_id), ['T1']);
  assert.equal(L.searchTerms(terms, { q: 'ҰШУ' }).length, 1);
  assert.equal(L.searchTerms(terms, { q: 'rwy' }).length, 1);
  assert.equal(L.searchTerms(terms, { q: 'взлетно' }).length, 1);
  assert.equal(L.searchTerms(terms, { q: 'ушу-кону' }).length, 1, 'Kazakh typed with Russian letters');
  assert.equal(L.searchTerms(terms, { q: 'ЖОЛАГЫ' }).length, 1);
  assert.equal(L.searchTerms(terms, { q: 'nonexistent' }).length, 0);
  assert.equal(L.searchTerms(terms, { check: 'pending_validation' }).length, 1);
  assert.equal(L.searchTerms(terms, { check: 'verified' }).length, 0);
  assert.equal(L.searchTerms(terms, { difficulty: 'D04' }).length, 0);
  assert.equal(L.headword(runway), 'runway');
});

test('research mode hides demo records and reports an empty corpus', () => {
  const demoOnly = { ...DATA, terms: [{ ...runway, dataset: 'demo' }], units: [unit('U3', 'demo', ['D04'])] };
  assert.equal(L.datasetFor(demoOnly, 'research').empty, true);
  const demo = L.datasetFor(demoOnly, 'demo');
  assert.equal(demo.empty, false);
  assert.deepEqual(demo.units[0].term_ids, ['T1']);
  assert.deepEqual(L.datasetFor({ ...DATA, terms: [] }, 'research').units[0].term_ids, []);
});

test('direction lists the translated languages; comparable texts are not a translation pair', () => {
  const u = (ru, kk = '') => ({ ...mixed, link_types: { en: '', ru, kk } });
  assert.deepEqual(L.direction(mixed), { label: 'EN → RU, KK', known: true });
  assert.deepEqual(L.direction(u('comparable_text', 'illustrative_translation')), { label: 'EN → KK', known: true });
  assert.deepEqual(L.direction(u('parallel_unknown_direction')), { label: 'Direction not established', known: false });
  assert.deepEqual(L.direction(u('comparable_text', 'comparable_text')),
    { label: 'Not a translation pair (comparable texts)', known: false });
});

test('language of free text: Russian, Kazakh or neither', () => {
  assert.equal(L.langOf('Расшифровка аббревиатур — описательный перевод.'), 'ru');
  assert.equal(L.langOf('EN occurrence vs accident — RU «событие»; KK «оқиға» покрывает оба'), 'ru');
  assert.equal(L.langOf('Ұшу-қону жолағы бос'), 'kk');
  assert.equal(L.langOf('ICAO Doc 4444, Ch. 12 (рус.)'), '');
  assert.equal(L.langOf(''), '');
});

test('unit title falls back to topic and genre', () => {
  assert.equal(L.unitTitle(DATA, DATA.units[0]), 'Aerodrome · ATC radiotelephony');
  assert.equal(L.unitTitle(DATA, { ...DATA.units[0], title: 'Landing' }), 'Landing');
});

test('segments split text around highlights', () => {
  const parts = L.segments('Hold short of runway', [{ start: 5, end: 10, annotation_id: 'A' }]);
  assert.deepEqual(parts.map(p => p.text), ['Hold ', 'short', ' of runway']);
  assert.equal(parts[1].ann.annotation_id, 'A');
});

test('CSV escapes commas, quotes and newlines', () => {
  assert.equal(L.toCSV([{ a: 'x,y', b: 'say "hi"\nnow' }], ['a', 'b']), 'a,b\r\n"x,y","say ""hi""\nnow"\r\n');
});

// The author's workbook (sheet "Stats", dataset = research) is the reference for the real corpus.
test('dashboard reproduces the author statistics for the research corpus', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-'));
  execFileSync('python3', [path.join(__dirname, 'build.py'), '--out', path.join(out, 'dist')]);
  const js = fs.readFileSync(path.join(out, 'dist', 'data.js'), 'utf8');
  const data = JSON.parse(js.slice(js.indexOf('=') + 1).trim().replace(/;$/, ''));
  fs.rmSync(out, { recursive: true });
  const s = L.stats(L.datasetFor(data, 'research'));
  const counts = list => Object.fromEntries(list.filter(x => x.count).map(x => [x.id, x.count]));
  assert.equal(s.annotatedUnits, 22);
  assert.deepEqual(counts(s.difficulties), { D01: 10, D02: 5, D03: 5, D04: 7, D05: 8, D06: 10 });
  assert.deepEqual(counts(s.strategies), { ST01: 13, ST02: 2, ST03: 4, ST04: 4, ST05: 6, ST07: 2, ST08: 7 });
  assert.equal(L.percent(s.difficulties.find(d => d.id === 'D01').share), '45.5%');
  assert.deepEqual([s.totalDocuments, s.totalTerms], [18, 54]);
});
