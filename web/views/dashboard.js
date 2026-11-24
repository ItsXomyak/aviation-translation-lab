// Research dashboard: one filter state drives counters, charts, table and CSV (all from Lib.stats).
(function () {
  'use strict';
  const { esc, options, usedVocab, download } = App;
  const state = { genre: '', topic: '', pair: '', link: '' };
  const PAIR_LABELS = { 'en-ru': 'EN–RU', 'en-kk': 'EN–KK', 'ru-kk': 'RU–KK' };
  const ID_COLUMNS = new Set(['unit_id', 'annotation_id']);
  const REF_COLUMNS = new Set(['sources', 'evidence']);
  // Same values as the CSV; source references are only laid out one per line.
  const cell = (key, value) => (REF_COLUMNS.has(key)
    ? `<td class="refs">${String(value).split('; ').map(esc).join('<br>')}</td>`
    : `<td${ID_COLUMNS.has(key) ? ' class="id"' : ''}>${esc(value)}</td>`);

  App.views.dashboard = (main, d) => {
    main.innerHTML = `<h1>Research Dashboard</h1>
      <form class="filters" id="dash-form">
        <div><label for="genre">Genre</label><select id="genre" name="genre">${options(usedVocab(d.vocab.genres, d.units, 'genre_id'), state.genre)}</select></div>
        <div><label for="topic">Topic</label><select id="topic" name="topic">${options(usedVocab(d.vocab.topics, d.units, 'topic_id'), state.topic)}</select></div>
        <div><label for="pair">Language pair</label><select id="pair" name="pair">${options(PAIR_LABELS, state.pair)}</select></div>
        <div><label for="link">Link type</label><select id="link" name="link">${options(Lib.LINK_LABELS, state.link)}</select></div>
        <div class="form-actions"><button type="reset" class="secondary">Reset filters</button></div>
      </form>
      <div id="out"></div>`;
    const form = main.querySelector('#dash-form');
    const out = main.querySelector('#out');
    let rows = [];

    const update = () => {
      Object.assign(state, Object.fromEntries(new FormData(form)));
      const s = Lib.stats(d, state);
      rows = s.rows;
      out.innerHTML = s.units ? report(s)
        : '<p class="empty" role="status">No records match the selected filters. Reset the filters or choose another combination.</p>';
    };

    form.addEventListener('input', update);
    form.addEventListener('reset', e => {
      e.preventDefault(); // native reset would restore the pre-selected values, not "Any"
      form.querySelectorAll('select').forEach(sel => { sel.value = ''; });
      update();
    });
    out.addEventListener('click', e => {
      if (e.target.closest('#csv')) {
        download('dashboard.csv', Lib.toCSV(Lib.exportRows(d, rows), Lib.DASHBOARD_CSV_COLUMNS), d.mode === 'demo');
      }
    });
    update();
  };

  const bar = (label, value, width) => `<li class="bar">
      <span class="bar-label"><span>${label}</span><span class="val">${value}</span></span>
      <div class="track" aria-hidden="true"><div class="fill" style="width:${width.toFixed(1)}%"></div></div></li>`;

  function report(s) {
    const n = s.annotatedUnits;
    const shareChart = (title, items) => `<section class="panel"><h2>${title}</h2><ul class="bars">${items.map(i =>
      bar(esc(i.label), `${i.count} of ${n} · ${Lib.percent(i.share)}`, i.share * 100)).join('')}</ul></section>`;
    const max = Math.max(1, ...s.termsByTopic.map(t => t.count));
    return `<div class="counters">
        <p class="counter panel"><strong>${s.documents}</strong>Source documents in selection · ${s.totalDocuments} in corpus</p>
        <p class="counter panel"><strong>${s.terms}</strong>Term entries in selection · ${s.totalTerms} in corpus</p>
        <p class="counter panel"><strong>${n}</strong>Annotated units of ${s.units} in selection</p>
      </div>
      <p class="base-note">Shares are calculated from N = ${n} annotated unit${n === 1 ? '' : 's'} after filtering.
        A unit may carry several labels, so shares can add up to more than 100%.</p>
      <div class="charts">
        ${shareChart('Difficulties by category', s.difficulties)}
        ${shareChart('Strategies by type', s.strategies)}
        <section class="panel"><h2>Terms by topic</h2><ul class="bars">${s.termsByTopic.map(t =>
          bar(esc(t.label), String(t.count), t.count / max * 100)).join('')}</ul></section>
      </div>
      <div class="table-head"><h2>Annotated units in selection</h2>
        <button type="button" class="secondary" id="csv">Download CSV · ${s.rows.length} rows</button></div>
      <div class="table-wrap" tabindex="0" role="region" aria-label="Annotated units table"><table>
        <thead><tr>${Lib.TABLE_COLUMNS.map(c => `<th scope="col">${c[1]}</th>`).join('')}</tr></thead>
        <tbody>${s.rows.map(r => `<tr>${Lib.TABLE_COLUMNS.map(c => cell(c[0], r[c[0]])).join('')}</tr>`).join('')
          || `<tr><td colspan="${Lib.TABLE_COLUMNS.length}">No annotations in this selection.</td></tr>`}</tbody>
      </table></div>`;
  }
})();
