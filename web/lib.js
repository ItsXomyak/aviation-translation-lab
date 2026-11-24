// Pure logic shared by the UI and the node tests. No DOM access here.
(function (root) {
  'use strict';

  const LANGS = ['en', 'ru', 'kk'];
  const LANG_LABELS = { en: 'EN', ru: 'RU', kk: 'KK' };
  const LINK_LABELS = {
    confirmed_translation: 'Confirmed translation',
    parallel_unknown_direction: 'Parallel version — direction not established',
    comparable_text: 'Comparable texts',
    illustrative_translation: 'Illustrative translation',
  };
  // Link types whose translation direction is known: confirmed by a source, or made by the author.
  const DIRECTED = ['confirmed_translation', 'illustrative_translation'];
  const CHECK_LABELS = {
    verified: 'Verified',
    source_referenced: 'Source referenced',
    pending_validation: 'Pending validation',
    illustrative: 'Illustrative example',
  };
  const PAIRS = { 'en-ru': ['en', 'ru'], 'en-kk': ['en', 'kk'], 'ru-kk': ['ru', 'kk'] };
  const RUBRIC_VERSION = 'R1.0';
  // levels[score] describes the score 0, 1 or 2 (ТЗ 5.1).
  const RUBRIC = [
    { id: 'terminology', name: 'Terminological accuracy', levels: [
      'Concept replaced or essential meaning of the term lost.',
      'Concept recognisable, but with an inaccuracy or inconsistency.',
      'Concept rendered accurately and used consistently.'] },
    { id: 'clarity', name: 'Clarity', levels: [
      'Wording prevents understanding of the key message.',
      'Meaning recoverable from context; some ambiguity.',
      'Unambiguous for the intended audience.'] },
    { id: 'meaning', name: 'Preservation of meaning', levels: [
      'Essential content lost or distorted.',
      'Local loss or addition; core meaning preserved.',
      'Essential facts, relations and conditions preserved.'] },
    { id: 'function', name: 'Functional equivalence', levels: [
      'Function changed, e.g. a requirement rendered as advice.',
      'Function broadly preserved with a noticeable deviation.',
      'Communicative purpose and force preserved.'] },
  ];
  const TABLE_COLUMNS = [
    ['unit_id', 'Unit'], ['annotation_id', 'Annotation'], ['lang', 'Language'], ['compared_with', 'Compared with'],
    ['span', 'Selection'], ['difficulties', 'Difficulties'], ['strategies', 'Strategies'], ['link_type', 'Link type'],
    ['genre', 'Genre'], ['topic', 'Topic'], ['sources', 'Sources'], ['check_status', 'Check status'],
  ];
  const DASHBOARD_CSV_COLUMNS = ['dataset', 'corpus_version', ...TABLE_COLUMNS.map(c => c[0])];
  const ASSESSMENT_CSV_COLUMNS = ['dataset', 'assessment_no', 'unit_id', 'language_pair', 'corpus_version',
    'rubric_version', 'mode', ...RUBRIC.flatMap(c => [c.id, c.id + '_note']), 'total', 'status', 'comment', 'saved_at'];

  const capitalize = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  // Research mode = research records only; demo mode adds the demo records.
  function datasetFor(data, mode) {
    const visible = s => s === 'research' || (mode === 'demo' && s === 'demo');
    const terms = data.terms.filter(t => visible(t.dataset));
    const termIds = new Set(terms.map(t => t.term_id));
    const units = data.units.filter(u => visible(u.dataset))
      .map(u => ({ ...u, term_ids: u.term_ids.filter(id => termIds.has(id)) }));
    return { ...data, mode, terms, units, empty: !terms.length && !units.length };
  }
  const datasetName = ds => (ds.mode === 'demo' ? 'demo' : 'research');
  const unitTitle = (ds, u) => u.title || capitalize(`${ds.vocab.topics[u.topic_id]} · ${ds.vocab.genres[u.genre_id]}`);

  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  function searchTerms(terms, { q = '', topic = '', difficulty = '', check = '' } = {}) {
    const needle = norm(q).trim();
    return terms.filter(t =>
      (!needle || t.forms.some(f => norm(f.form).includes(needle) || norm(f.abbreviation).includes(needle))) &&
      (!topic || t.topic_id === topic) &&
      (!difficulty || t.difficulty_ids.includes(difficulty)) &&
      (!check || t.forms.some(f => f.check_status === check)));
  }
  const headword = t => (t.forms.find(f => f.lang === 'en') || t.forms[0] || { form: t.term_id }).form;

  function direction(unit) {
    if (!DIRECTED.includes(unit.link_type)) return 'Direction not established';
    const targets = LANGS.filter(l => l !== unit.source_lang && unit.fragments.some(f => f.lang === l));
    return LANG_LABELS[unit.source_lang] + ' → ' + targets.map(l => LANG_LABELS[l]).join(', ');
  }

  // Split text into plain and highlighted pieces; start/end are UTF-16 offsets computed by the build.
  function segments(text, anns) {
    const out = [];
    let pos = 0;
    for (const a of [...anns].sort((x, y) => x.start - y.start)) {
      if (a.start > pos) out.push({ text: text.slice(pos, a.start) });
      out.push({ text: text.slice(a.start, a.end), ann: a });
      pos = a.end;
    }
    if (pos < text.length) out.push({ text: text.slice(pos) });
    return out;
  }

  function filterUnits(ds, f) {
    return ds.units.filter(u =>
      (!f.genre || u.genre_id === f.genre) &&
      (!f.topic || u.topic_id === f.topic) &&
      (!f.pair || PAIRS[f.pair].every(l => u.fragments.some(fr => fr.lang === l))) &&
      (!f.link || u.link_type === f.link));
  }

  // All annotations of the visible units count; their check status is shown as a label, not used as a filter.
  function countedAnnotations(unit, f) {
    const pair = f.pair && PAIRS[f.pair];
    return unit.annotations.filter(a =>
      !pair || (pair.includes(a.lang) && (!a.compared_with || pair.includes(a.compared_with))));
  }

  const ref = (id, locator) => id + (locator ? ' (' + locator + ')' : '');
  function tableRow(ds, u, a) {
    const names = (list, key) => list.map(id => ds.vocab[key][id]).join('; ');
    return {
      unit_id: u.unit_id, annotation_id: a.annotation_id, lang: LANG_LABELS[a.lang],
      compared_with: LANG_LABELS[a.compared_with] || '', span: a.span_text,
      difficulties: names(a.difficulty_ids, 'difficulties'), strategies: names(a.strategy_ids, 'strategies'),
      link_type: LINK_LABELS[u.link_type], genre: ds.vocab.genres[u.genre_id], topic: ds.vocab.topics[u.topic_id],
      sources: [...new Set(u.fragments.map(fr => ref(fr.source_id, fr.locator)))].join('; '),
      check_status: CHECK_LABELS[a.check_status],
    };
  }

  // Frequency = unique annotated units carrying a label; share = frequency / N annotated units after filtering.
  function stats(ds, f = {}) {
    const units = filterUnits(ds, f);
    const annotated = units.map(u => ({ u, anns: countedAnnotations(u, f) })).filter(x => x.anns.length);
    const n = annotated.length;
    const freq = (vocabKey, field) => Object.entries(ds.vocab[vocabKey]).map(([id, label]) => {
      const count = annotated.filter(x => x.anns.some(a => a[field].includes(id))).length;
      return { id, label, count, share: n ? count / n : 0 };
    });
    const termIds = new Set(units.flatMap(u => u.term_ids));
    const terms = ds.terms.filter(t => termIds.has(t.term_id));
    return {
      units: units.length,
      documents: new Set(units.flatMap(u => u.fragments.map(fr => fr.source_id))).size,
      totalDocuments: Object.keys(ds.sources).length,
      terms: terms.length,
      totalTerms: ds.terms.length,
      annotatedUnits: n,
      difficulties: freq('difficulties', 'difficulty_ids'),
      strategies: freq('strategies', 'strategy_ids'),
      termsByTopic: Object.entries(ds.vocab.topics)
        .map(([id, label]) => ({ id, label, count: terms.filter(t => t.topic_id === id).length }))
        .filter(t => t.count),
      rows: annotated.flatMap(x => x.anns.map(a => tableRow(ds, x.u, a))),
    };
  }
  // One decimal place, as in the author's statistics sheet: 0.5 → "50%", 10/22 → "45.5%".
  const percent = share => Math.round(share * 1000) / 10 + '%';
  const exportRows = (ds, rows) =>
    rows.map(r => ({ dataset: datasetName(ds), corpus_version: ds.version.current.version, ...r }));

  const isScorable = u => DIRECTED.includes(u.link_type) || u.training === true;
  function rubricTotal(scores) {
    const vals = RUBRIC.map(c => scores[c.id]);
    return vals.every(v => v === 0 || v === 1 || v === 2) ? vals.reduce((a, b) => a + b, 0) : null;
  }
  function assessmentRecord({ ds, unit, target, scores = {}, notes = {}, comment = '', no = '', savedAt = '' }) {
    const scorable = isScorable(unit);
    const total = scorable ? rubricTotal(scores) : null;
    const rec = {
      dataset: datasetName(ds), assessment_no: no, unit_id: unit.unit_id,
      language_pair: (unit.source_lang || 'n/a') + '→' + target,
      corpus_version: ds.version.current.version, rubric_version: RUBRIC_VERSION,
      mode: scorable ? 'score' : 'comment', total: total === null ? '' : total,
      status: !scorable ? 'Comment' : total === null ? 'Incomplete' : 'Complete', comment, saved_at: savedAt,
    };
    for (const c of RUBRIC) {
      rec[c.id] = scorable && scores[c.id] !== undefined ? scores[c.id] : '';
      rec[c.id + '_note'] = notes[c.id] || '';
    }
    return rec;
  }

  function toCSV(rows, columns) {
    const cell = v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [columns, ...rows.map(r => columns.map(c => r[c]))]
      .map(line => line.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  const lib = {
    LANGS, LANG_LABELS, LINK_LABELS, CHECK_LABELS, PAIRS, RUBRIC, RUBRIC_VERSION, TABLE_COLUMNS,
    DASHBOARD_CSV_COLUMNS, ASSESSMENT_CSV_COLUMNS, capitalize, datasetFor, datasetName, unitTitle, searchTerms,
    headword, direction, segments, stats, percent, exportRows, isScorable, rubricTotal, assessmentRecord, toCSV,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  else root.Lib = lib;
})(this);
