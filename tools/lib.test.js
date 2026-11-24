// Run: node --test tools/lib.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/lib.js');

const vocab = {
  topics: { aerodrome: 'Aerodrome' },
  genres: { manual: 'Manual', phraseology: 'Phraseology' },
  difficulties: { modality: 'Modality', syntax: 'Syntax' },
  strategies: { calque: 'Calque' },
};
const sources = { S1: { source_id: 'S1', title: 'Source', genre_id: 'manual' } };
const ann = (id, diffs, check = 'verified') => ({
  annotation_id: id, label: 'A1', lang: 'ru', seq: 1, span_text: 'x', start: 0, end: 1, compared_with: 'en',
  difficulty_ids: diffs, strategy_ids: [], explanation: 'e', evidence_source_id: 'S1', evidence_locator: 'p. 2',
  check_status: check,
});
const frag = lang => ({ lang, seq: 1, text: 'x', source_id: 'S1', locator: 'p. 1' });
const unit = (id, status, diffs, extra = {}) => ({
  unit_id: id, title: id, topic_id: 'aerodrome', term_ids: ['T1'], link_type: 'confirmed_translation',
  source_lang: 'en', direction_basis: 'b', alignment_status: 'aligned', training: false, status,
  fragments: [frag('en'), frag('ru')], annotations: [ann(id + '-A', diffs)], ...extra,
});
const runway = {
  term_id: 'T1', topic_id: 'aerodrome', difficulty_ids: ['syntax'], status: 'approved', forms: [
    { lang: 'en', form: 'runway', abbreviation: 'RWY', check_status: 'verified' },
    { lang: 'ru', form: 'Взлётно-посадочная полоса', abbreviation: 'ВПП', check_status: 'verified' },
    { lang: 'kk', form: 'Ұшу-қону жолағы', abbreviation: '', check_status: 'pending' }],
};
const DATA = {
  version: { current: { version: '1.0', date: '2026-11-24', changes: 'c' }, history: [] },
  vocab, sources, terms: [runway],
  units: [unit('U1', 'approved', ['modality']), unit('U2', 'approved', ['syntax']), unit('U3', 'illustrative', ['modality'])],
  methodology: '',
};

test('modality: 1 of 2 approved units (50%), illustrative unit excluded', () => {
  const s = L.stats(L.datasetFor(DATA, 'research'));
  const m = s.difficulties.find(d => d.id === 'modality');
  assert.equal(s.annotatedUnits, 2);
  assert.equal(m.count, 1);
  assert.equal(L.percent(m.share), '50%');
});

test('demo mode counts illustrative units too', () => {
  const s = L.stats(L.datasetFor(DATA, 'demo'));
  assert.equal(s.annotatedUnits, 3);
  assert.equal(s.difficulties.find(d => d.id === 'modality').count, 2);
});

test('pending annotations are excluded in research mode only', () => {
  const data = { ...DATA, units: [unit('U1', 'approved', [], { annotations: [ann('P', ['modality'], 'pending')] })] };
  assert.equal(L.stats(L.datasetFor(data, 'research')).annotatedUnits, 0);
  assert.equal(L.stats(L.datasetFor(data, 'demo')).annotatedUnits, 1);
});

test('filters update counters, charts and rows together', () => {
  const ds = L.datasetFor(DATA, 'research');
  const all = L.stats(ds);
  assert.deepEqual([all.units, all.documents, all.terms, all.rows.length], [2, 1, 1, 2]);
  const none = L.stats(ds, { pair: 'en-kk' });
  assert.deepEqual([none.units, none.annotatedUnits, none.rows.length], [0, 0, 0]);
  assert.equal(L.stats(ds, { genre: 'phraseology' }).units, 0);
  assert.equal(L.stats(ds, { genre: 'manual', link: 'confirmed_translation' }).units, 2);
  assert.equal(L.stats(ds, { link: 'comparable' }).units, 0);
});

test('labels may sum to more than 100%', () => {
  const data = { ...DATA, units: [unit('U1', 'approved', ['modality', 'syntax'])] };
  const s = L.stats(L.datasetFor(data, 'research'));
  assert.equal(s.difficulties.reduce((sum, d) => sum + d.share, 0), 2);
});

test('dashboard CSV has exactly the filtered table rows', () => {
  const ds = L.datasetFor(DATA, 'research');
  const s = L.stats(ds);
  const lines = L.toCSV(L.exportRows(ds, s.rows), L.DASHBOARD_CSV_COLUMNS).trim().split('\r\n');
  assert.equal(lines.length, s.rows.length + 1);
  assert.equal(lines[0], L.DASHBOARD_CSV_COLUMNS.join(','));
  assert.ok(lines[1].startsWith('research,1.0,U1,U1-A,RU,EN,x,Modality,'), lines[1]);
  assert.ok(lines[1].includes('S1 (p. 1)'));
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
  assert.ok(csv.includes('demo,1,U1,en→ru,1.0,R1.0,score,2,,1,"word ""x"", line 1",2,,2,,7,Complete'), csv);
});

test('incomplete assessment has no total; comparable units take comments only', () => {
  const ds = L.datasetFor(DATA, 'demo');
  assert.equal(L.assessmentRecord({ ds, unit: DATA.units[0], target: 'ru', scores: { terminology: 2 } }).status, 'Incomplete');
  const comparable = { ...DATA.units[0], link_type: 'comparable' };
  assert.equal(L.isScorable(comparable), false);
  assert.equal(L.isScorable({ ...comparable, training: true }), true);
  const rec = L.assessmentRecord({ ds, unit: comparable, target: 'ru', comment: 'c', scores: { terminology: 2 } });
  assert.deepEqual([rec.mode, rec.status, rec.terminology, rec.total], ['comment', 'Comment', '', '']);
});

test('search: Kazakh fragment, case, abbreviation, ё/е, filters and empty result', () => {
  const terms = L.datasetFor(DATA, 'research').terms;
  assert.deepEqual(L.searchTerms(terms, { q: 'ұшу-қону' }).map(t => t.term_id), ['T1']);
  assert.equal(L.searchTerms(terms, { q: 'ҰШУ' }).length, 1);
  assert.equal(L.searchTerms(terms, { q: 'rwy' }).length, 1);
  assert.equal(L.searchTerms(terms, { q: 'взлетно' }).length, 1);
  assert.equal(L.searchTerms(terms, { q: 'nonexistent' }).length, 0);
  assert.equal(L.searchTerms(terms, { check: 'pending' }).length, 1);
  assert.equal(L.searchTerms(terms, { check: 'verified' }).length, 0);
  assert.equal(L.searchTerms(terms, { difficulty: 'modality' }).length, 0);
  assert.equal(L.headword(runway), 'runway');
});

test('research mode hides illustrative records and reports an empty corpus', () => {
  const demoOnly = { ...DATA, terms: [{ ...runway, status: 'illustrative' }], units: [unit('U3', 'illustrative', ['modality'])] };
  assert.equal(L.datasetFor(demoOnly, 'research').empty, true);
  const demo = L.datasetFor(demoOnly, 'demo');
  assert.equal(demo.empty, false);
  assert.deepEqual(demo.units[0].term_ids, ['T1']);
  assert.deepEqual(L.datasetFor({ ...DATA, terms: [] }, 'research').units[0].term_ids, []);
});

test('direction is shown only for confirmed translations', () => {
  assert.equal(L.direction(DATA.units[0]), 'EN → RU');
  assert.equal(L.direction({ ...DATA.units[0], link_type: 'parallel_unknown_direction' }), 'Direction not established');
});

test('segments split text around highlights', () => {
  const parts = L.segments('Hold short of runway', [{ start: 5, end: 10, annotation_id: 'A' }]);
  assert.deepEqual(parts.map(p => p.text), ['Hold ', 'short', ' of runway']);
  assert.equal(parts[1].ann.annotation_id, 'A');
});

test('CSV escapes commas, quotes and newlines', () => {
  assert.equal(L.toCSV([{ a: 'x,y', b: 'say "hi"\nnow' }], ['a', 'b']), 'a,b\r\n"x,y","say ""hi""\nnow"\r\n');
});
