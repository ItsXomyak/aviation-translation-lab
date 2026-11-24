// Quality assessment: rubric (0–2 × 4 criteria) or comparison comment; results kept in sessionStorage only.
(function () {
  'use strict';
  const { esc, badge, statusBadge, langSign, sourceRef, notFound, store, setHash, download } = App;
  const KEY = 'atl.assessments';
  const saved = () => {
    try { return JSON.parse(store.get(KEY)) || []; } catch (e) { return []; }
  };

  App.views.assess = (main, d, unitId) => {
    main.innerHTML = `<h1>Translation Quality Assessment</h1>
      <div class="filters">
        <div><label for="a-unit">Unit of analysis</label>
          <select id="a-unit"><option value="">Choose a unit…</option>
            ${d.units.map(u => `<option value="${esc(u.unit_id)}"${u.unit_id === unitId ? ' selected' : ''}>${esc(u.unit_id)} — ${esc(Lib.unitTitle(d, u))}</option>`).join('')}
          </select></div>
        <div><label for="a-lang">Target language</label><select id="a-lang"></select></div>
      </div>
      <div id="a-form"></div>
      <section aria-labelledby="sess-h"><h2 id="sess-h">Assessments in this session</h2>
        <p class="muted">Your assessments stay in this browser tab and are never added to corpus statistics.</p>
        <div id="a-session"></div></section>`;
    const unitSel = main.querySelector('#a-unit');
    const langSel = main.querySelector('#a-lang');
    const formBox = main.querySelector('#a-form');
    const sessBox = main.querySelector('#a-session');
    let unit = null;
    // an ID from the address that is not in this dataset has no <option>: report it instead of an empty form
    let missing = unitId && !d.units.some(u => u.unit_id === unitId) ? unitId : '';

    const read = () => {
      const fd = new FormData(formBox.querySelector('form'));
      const scores = {};
      const notes = {};
      for (const c of Lib.RUBRIC) {
        if (fd.has(c.id)) scores[c.id] = Number(fd.get(c.id));
        notes[c.id] = String(fd.get(c.id + '_note') || '').trim();
      }
      return { scores, notes, comment: String(fd.get('comment') || '').trim() };
    };

    const updateStatus = () => {
      const st = formBox.querySelector('#a-status');
      if (!st) return;
      const { scores } = read();
      const total = Lib.rubricTotal(scores);
      const left = Lib.RUBRIC.filter(c => !(c.id in scores)).length;
      st.innerHTML = total === null
        ? `<span>Status</span><strong>Incomplete</strong><span>${left} of 4 criteria not scored yet</span>`
        : `<span>Total</span><strong>${total}/8</strong><span>All four criteria scored</span>`;
    };

    const showForm = () => {
      formBox.innerHTML = missing ? notFound('Unit', missing, '#/assess', 'Back to Translation Quality Assessment')
        : !unit ? '<p class="empty">Choose a unit of analysis and a target language.</p>'
        : !langSel.value ? '<p class="empty">This unit has no target-language fragment to assess.</p>'
        : formHtml(d, unit, langSel.value);
      updateStatus();
    };

    const pickUnit = () => {
      unit = d.units.find(u => u.unit_id === unitSel.value) || null;
      const targets = unit ? Lib.LANGS.filter(l => l !== unit.source_lang && unit.fragments.some(f => f.lang === l)) : [];
      langSel.innerHTML = targets.map(l => `<option value="${l}">${Lib.LANG_LABELS[l]}</option>`).join('');
      langSel.disabled = !targets.length;
      showForm();
    };

    const showSession = () => {
      const list = saved();
      sessBox.innerHTML = list.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Session assessments"><table>
          <thead><tr><th scope="col">#</th><th scope="col">Unit</th><th scope="col">Pair</th><th scope="col">Dataset</th><th scope="col">Result</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${list.map(r => `<tr><td class="id">${esc(r.assessment_no)}</td><td class="id">${esc(r.unit_id)}</td><td>${esc(r.language_pair)}</td>
            <td>${esc(r.dataset)}</td><td>${r.mode === 'score' ? esc(r.total) + '/8' : 'Comment'}</td>
            <td><button type="button" class="link" data-remove="${esc(r.assessment_no)}">Remove<span class="sr-only"> assessment #${esc(r.assessment_no)}</span></button></td></tr>`).join('')}</tbody>
        </table></div>
        <p class="form-actions"><button type="button" class="secondary" id="a-export">Export session CSV</button>
          <button type="button" class="secondary" id="a-clear">Clear session</button></p>
        <p id="a-sess-msg" class="msg" role="status"></p>`
        : '<p class="empty">No assessments saved yet. Saved assessments appear here and can be exported as CSV.</p>';
    };

    unitSel.addEventListener('change', () => {
      setHash('#/assess/' + encodeURIComponent(unitSel.value));
      missing = '';
      pickUnit();
    });
    langSel.addEventListener('change', showForm);
    formBox.addEventListener('input', updateStatus);
    formBox.addEventListener('reset', () => setTimeout(updateStatus));
    formBox.addEventListener('submit', e => {
      e.preventDefault();
      const { scores, notes, comment } = read();
      const msg = formBox.querySelector('#a-msg');
      const scorable = Lib.isScorable(unit, langSel.value);
      const unjustified = scorable ? Lib.missingJustifications(scores, notes) : [];
      formBox.querySelectorAll('textarea').forEach(t => t.removeAttribute('aria-invalid'));
      if (scorable ? Lib.rubricTotal(scores) === null : !comment) {
        msg.textContent = scorable ? 'Score all four criteria before saving.' : 'Write a comparison comment before saving.';
        return;
      }
      if (unjustified.length) {
        const fields = Lib.RUBRIC.filter(c => unjustified.includes(c.name)).map(c => formBox.querySelector(`#${c.id}-note`));
        fields.forEach(t => t.setAttribute('aria-invalid', 'true'));
        fields[0].focus();
        msg.textContent = `Add a justification for criteria scored 0 or 1: ${unjustified.join(', ')}.`;
        return;
      }
      const list = saved();
      // numbers stay stable after a removal, so a CSV exported earlier still matches
      const no = Math.max(0, ...list.map(r => Number(r.assessment_no) || 0)) + 1;
      list.push(Lib.assessmentRecord({ ds: d, unit, target: langSel.value, scores, notes, comment, no, savedAt: new Date().toISOString() }));
      store.set(KEY, JSON.stringify(list));
      e.target.reset();
      msg.textContent = `Saved as assessment #${no}.`;
      showSession();
    });
    sessBox.addEventListener('click', e => {
      const list = saved();
      const remove = e.target.closest('[data-remove]');
      const clear = e.target.closest('#a-clear');
      if (e.target.closest('#a-export')) {
        download('assessments.csv', Lib.toCSV(list, Lib.ASSESSMENT_CSV_COLUMNS), list.some(r => r.dataset === 'demo'));
      } else if (remove) {
        store.set(KEY, JSON.stringify(list.filter(r => String(r.assessment_no) !== remove.dataset.remove)));
        showSession();
        const note = sessBox.querySelector('#a-sess-msg');
        if (note) note.textContent = `Assessment #${remove.dataset.remove} removed.`;
      } else if (clear && clear.dataset.armed) {
        store.set(KEY, '[]');
        showSession();
      } else if (clear) { // second click confirms: no browser dialog
        clear.dataset.armed = '1';
        clear.textContent = `Click again to delete all ${list.length}`;
      }
    });

    pickUnit();
    showSession();
  };

  const texts = (d, frs) => frs.map(f => `<p class="frag" lang="${f.lang}">${esc(f.text)}</p>
    <p class="src">Source: ${sourceRef(d, f.source_id, f.locator)}</p>`).join('');

  function formHtml(d, u, target) {
    const orig = u.fragments.filter(f => f.lang === u.source_lang);
    const tgt = u.fragments.filter(f => f.lang === target);
    const src = d.sources[tgt[0].source_id.split(';')[0]] || {};
    const link = Lib.linkType(u, target);
    const scorable = Lib.isScorable(u, target);
    const pair = `${Lib.LANG_LABELS[u.source_lang]}→${Lib.LANG_LABELS[target]}`;
    const origLabel = ['confirmed_translation', 'illustrative_translation'].includes(link) ? 'Original' : 'Reference text';
    const rubric = Lib.RUBRIC.map(c => `<fieldset><legend>${esc(c.name)}</legend>
        ${[2, 1, 0].map(v => `<label class="opt"><input type="radio" name="${c.id}" value="${v}">
          <span class="score">${v}</span><span>${esc(c.levels[v])}</span></label>`).join('')}
        <label class="note-label" for="${c.id}-note">Justification</label>
        <textarea id="${c.id}-note" name="${c.id}_note" rows="2" placeholder="Quote or point to the exact place in the text (required for 0 and 1)"></textarea>
      </fieldset>`).join('') + `<p id="a-status" class="readout" role="status"></p>
      <label for="comment">Overall comment (optional)</label><textarea id="comment" name="comment" rows="3"></textarea>`;
    const commentOnly = `<p class="empty">Scoring is available for confirmed translations and for marked training examples (ТЗ 4.4).
        The ${pair} pair is “${esc(Lib.LINK_LABELS[link])}”, so you can record a comparison comment instead.</p>
      <label for="comment">Comparison comment</label><textarea id="comment" name="comment" rows="4"></textarea>`;
    return `<div class="langs two">
        <section class="panel"><div class="lang-head">${u.source_lang ? langSign(u.source_lang) : ''}${badge(origLabel, 'orig')}</div>
          ${orig.length ? texts(d, orig) : '<p class="muted">Original not established</p>'}</section>
        <section class="panel"><div class="lang-head">${langSign(target)}${badge('Target', 'link')}</div>${texts(d, tgt)}</section>
      </div>
      <div class="meta">
        <span><strong>Genre</strong> ${esc(d.vocab.genres[u.genre_id] || '—')}</span>
        <span><strong>Audience</strong> ${esc(src.audience || '—')}</span>
        <span class="badges">${badge(Lib.LINK_LABELS[link], 'link')}${u.training ? badge('Training example', 'training') : ''}${statusBadge(u.dataset)}</span>
      </div>
      <form id="rubric" novalidate>
        ${scorable ? rubric : commentOnly}
        <p class="form-actions"><button type="submit">Save to session</button> <button type="reset" class="secondary">Reset form</button></p>
        <p id="a-msg" class="msg" role="status"></p>
      </form>`;
  }
})();
