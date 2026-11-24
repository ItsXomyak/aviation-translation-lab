// Trilingual dictionary: search + filters, result list, term card with sources and related comparisons.
(function () {
  'use strict';
  const { esc, badge, checkBadge, statusBadge, options, sourceRef, setHash } = App;
  const state = { q: '', topic: '', difficulty: '', check: '' }; // kept for the session

  App.views.dictionary = (main, d, selectedId) => {
    let selected = selectedId;
    main.innerHTML = `<h1>Trilingual Aviation Dictionary</h1>
      <form class="filters" role="search" id="dict-form">
        <div><label for="q">Search term or abbreviation</label>
          <input id="q" name="q" type="search" autocomplete="off" placeholder="EN, RU or KK" value="${esc(state.q)}"></div>
        <div><label for="topic">Topic</label>
          <select id="topic" name="topic">${options(d.vocab.topics, state.topic)}</select></div>
        <div><label for="difficulty">Difficulty type</label>
          <select id="difficulty" name="difficulty">${options(d.vocab.difficulties, state.difficulty)}</select></div>
        <div><label for="check">Validation status</label>
          <select id="check" name="check">${options({ verified: 'Verified', pending: 'Pending validation' }, state.check)}</select></div>
      </form>
      <div class="split">
        <div><p id="count" class="muted" role="status"></p><ul class="results" id="results"></ul></div>
        <div id="card"></div>
      </div>`;
    const form = main.querySelector('#dict-form');

    const update = () => {
      const list = Lib.searchTerms(d.terms, state);
      const term = d.terms.find(t => t.term_id === selected) || (list.length === 1 ? list[0] : null);
      main.querySelector('#count').textContent = `${list.length} term${list.length === 1 ? '' : 's'} found`;
      main.querySelector('#results').innerHTML = list.length
        ? list.map(t => `<li><a href="#/dictionary/${encodeURIComponent(t.term_id)}"${t === term ? ' aria-current="true"' : ''}>
            <strong>${esc(Lib.headword(t))}</strong>
            <span class="muted">${esc(t.forms.filter(f => f.lang !== 'en').map(f => f.form).join(' · '))}</span></a></li>`).join('')
        : `<li class="empty">No terms match ${state.q ? '“' + esc(state.q) + '”' : 'the selected filters'}.</li>`;
      main.querySelector('#card').innerHTML = term ? card(d, term, Boolean(selected))
        : list.length ? '<p class="muted">Select a term to open its card.</p>' : '';
    };

    form.addEventListener('submit', e => e.preventDefault());
    form.addEventListener('input', () => {
      Object.assign(state, Object.fromEntries(new FormData(form)));
      if (selected) {
        selected = '';
        setHash('#/dictionary');
      }
      update();
    });
    update();
  };

  function forms(d, t, lang) {
    const list = t.forms.filter(f => f.lang === lang);
    if (!list.length) return '<p class="muted">Not available</p>';
    return list.map(f => `<div class="form">
        <p lang="${lang}"><strong>${esc(f.form)}</strong>${f.abbreviation ? ` (${esc(f.abbreviation)})` : ''}</p>
        <p>${checkBadge(f.check_status)}</p>
        <p class="src">Source: ${sourceRef(d, f.source_id, f.locator)}</p></div>`).join('');
  }

  function card(d, t, focus) {
    const related = d.units.filter(u => u.term_ids.includes(t.term_id));
    return `<article class="card" aria-labelledby="term-h">
      <h2 id="term-h"${focus ? ' data-focus' : ''}>${esc(Lib.headword(t))}</h2>
      <p>${badge(d.vocab.topics[t.topic_id], 'topic')}${statusBadge(t.status)}</p>
      <div class="langs">${Lib.LANGS.map(l => `<section><h3>${Lib.LANG_LABELS[l]}</h3>${forms(d, t, l)}</section>`).join('')}</div>
      <h3>Definition</h3>
      <p>${esc(t.definition)}</p>
      <p class="src">Source: ${sourceRef(d, t.definition_source_id, t.definition_locator)}</p>
      ${t.context ? `<h3>Context</h3><p>${esc(t.context)}</p>` : ''}
      ${t.difficulty_ids.length || t.difficulty_note ? `<h3>Translation difficulty</h3>
        <p>${t.difficulty_ids.map(id => badge(d.vocab.difficulties[id], 'diff')).join('')}</p>
        <p>${esc(t.difficulty_note)}</p>` : ''}
      <h3>Related comparisons</h3>
      ${related.length ? `<ul>${related.map(u => `<li><a href="#/compare/${encodeURIComponent(u.unit_id)}">${esc(u.unit_id)} — ${esc(u.title)}</a></li>`).join('')}</ul>`
        : '<p class="muted">No related comparisons yet.</p>'}
    </article>`;
  }
})();
