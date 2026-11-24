// Quality assessment: rubric (0–2 × 4 criteria) or comparison comment; results kept in sessionStorage only.
(function () {
  'use strict';
  const { esc, badge, statusBadge, sourceRef, store, setHash, download } = App;
  const KEY = 'atl.assessments';
  const saved = () => {
    try { return JSON.parse(store.get(KEY)) || []; } catch (e) { return []; }
  };

  App.views.assess = (main, d, unitId) => {
    main.innerHTML = `<h1>Translation Quality Assessment</h1>
      <div class="filters">
        <div><label for="a-unit">Unit of analysis</label>
          <select id="a-unit"><option value="">Choose a unit…</option>
            ${d.units.map(u => `<option value="${esc(u.unit_id)}"${u.unit_id === unitId ? ' selected' : ''}>${esc(u.unit_id)} — ${esc(u.title)}</option>`).join('')}
          </select></div>
        <div><label for="a-lang">Target language</label><select id="a-lang"></select></div>
      </div>
      <div id="a-form"></div>
      <section aria-labelledby="sess-h"><h2 id="sess-h">Assessments in this session</h2>
        <p class="muted">Visitor assessments stay in this browser session and are never added to corpus statistics.</p>
        <div id="a-session"></div></section>`;
    const unitSel = main.querySelector('#a-unit');
    const langSel = main.querySelector('#a-lang');
    const formBox = main.querySelector('#a-form');
    const sessBox = main.querySelector('#a-session');
    let unit = null;

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
      st.textContent = total === null ? `Status: Incomplete — ${left} of 4 criteria not scored` : `Total: ${total}/8`;
    };

    const showForm = () => {
      formBox.innerHTML = !unit ? '<p class="muted">Choose a unit of analysis and a target language.</p>'
        : !langSel.value ? '<p class="muted">This unit has no target-language fragment to assess.</p>'
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
          <thead><tr><th scope="col">#</th><th scope="col">Unit</th><th scope="col">Pair</th><th scope="col">Dataset</th><th scope="col">Result</th></tr></thead>
          <tbody>${list.map(r => `<tr><td>${esc(r.assessment_no)}</td><td>${esc(r.unit_id)}</td><td>${esc(r.language_pair)}</td>
            <td>${esc(r.dataset)}</td><td>${r.mode === 'score' ? esc(r.total) + '/8' : 'Comment'}</td></tr>`).join('')}</tbody>
        </table></div>
        <p><button type="button" id="a-export">Export session CSV</button></p>`
        : '<p class="muted">No assessments saved yet.</p>';
    };

    unitSel.addEventListener('change', () => {
      setHash('#/assess/' + encodeURIComponent(unitSel.value));
      pickUnit();
    });
    langSel.addEventListener('change', showForm);
    formBox.addEventListener('input', updateStatus);
    formBox.addEventListener('reset', () => setTimeout(updateStatus));
    formBox.addEventListener('submit', e => {
      e.preventDefault();
      const { scores, notes, comment } = read();
      const msg = formBox.querySelector('#a-msg');
      const scorable = Lib.isScorable(unit);
      if (scorable ? Lib.rubricTotal(scores) === null : !comment) {
        msg.textContent = scorable ? 'Score all four criteria before saving.' : 'Write a comparison comment before saving.';
        return;
      }
      const list = saved();
      list.push(Lib.assessmentRecord({
        ds: d, unit, target: langSel.value, scores, notes, comment,
        no: list.length + 1, savedAt: new Date().toISOString(),
      }));
      store.set(KEY, JSON.stringify(list));
      e.target.reset();
      msg.textContent = `Saved as assessment #${list.length}.`;
      showSession();
    });
    sessBox.addEventListener('click', e => {
      if (!e.target.closest('#a-export')) return;
      const list = saved();
      download('assessments.csv', Lib.toCSV(list, Lib.ASSESSMENT_CSV_COLUMNS), list.some(r => r.dataset === 'demo'));
    });

    pickUnit();
    showSession();
  };

  const texts = (d, frs) => frs.map(f => `<p lang="${f.lang}">${esc(f.text)}</p>
    <p class="src">Source: ${sourceRef(d, f.source_id, f.locator)}</p>`).join('');

  function formHtml(d, u, target) {
    const orig = u.fragments.filter(f => f.lang === u.source_lang);
    const tgt = u.fragments.filter(f => f.lang === target);
    const src = d.sources[tgt[0].source_id] || {};
    const scorable = Lib.isScorable(u);
    const origLabel = u.link_type === 'comparable' ? 'Reference text' : 'Original';
    const rubric = Lib.RUBRIC.map(c => `<fieldset><legend>${esc(c.name)}</legend>
        ${[2, 1, 0].map(v => `<label class="radio"><input type="radio" name="${c.id}" value="${v}">
          <span><strong>${v}</strong> — ${esc(c.levels[v])}</span></label>`).join('')}
        <label for="${c.id}-note">Justification</label>
        <textarea id="${c.id}-note" name="${c.id}_note" rows="2" placeholder="Point to the exact place in the text"></textarea>
      </fieldset>`).join('') + '<p id="a-status" class="total" role="status"></p>';
    const commentOnly = `<p class="panel">Score-based assessment is available only for confirmed translation pairs and
        marked training examples. For ${esc(Lib.LINK_LABELS[u.link_type].toLowerCase())} you can record a comparison comment.</p>
      <label for="comment">Comparison comment</label><textarea id="comment" name="comment" rows="4"></textarea>`;
    return `<div class="langs two">
        <section class="panel"><h2>${origLabel}${u.source_lang ? ' (' + Lib.LANG_LABELS[u.source_lang] + ')' : ''}</h2>
          ${orig.length ? texts(d, orig) : '<p class="muted">Original not established</p>'}</section>
        <section class="panel"><h2>Target (${Lib.LANG_LABELS[target]})</h2>${texts(d, tgt)}</section>
      </div>
      <p><strong>Genre:</strong> ${esc(d.vocab.genres[src.genre_id] || '—')} · <strong>Audience:</strong> ${esc(src.audience || '—')}</p>
      <p>${badge(Lib.LINK_LABELS[u.link_type], 'link')}${u.training ? badge('Training example', 'training') : ''}${statusBadge(u.status)}</p>
      <form id="rubric" novalidate>
        ${scorable ? rubric : commentOnly}
        <p class="form-actions"><button type="submit">Save to session</button> <button type="reset" class="secondary">Reset form</button></p>
        <p id="a-msg" role="status"></p>
      </form>`;
  }
})();
