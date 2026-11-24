// Translation comparison: EN/RU/KK columns, link type and direction, clickable highlighted spans with annotation panel.
(function () {
  'use strict';
  const { esc, badge, checkBadge, statusBadge, langSign, sourceRef, setHash } = App;

  App.views.compare = (main, d, unitId) => {
    main.innerHTML = `<h1>Translation Comparison</h1>
      <div class="filters"><div><label for="unit">Example</label>
        <select id="unit"><option value="">Choose an example…</option>
          ${d.units.map(u => `<option value="${esc(u.unit_id)}"${u.unit_id === unitId ? ' selected' : ''}>${esc(u.unit_id)} — ${esc(Lib.unitTitle(d, u))}</option>`).join('')}
        </select></div></div>
      <div id="unit-view"></div>`;
    const box = main.querySelector('#unit-view');
    let current = null;

    const show = id => {
      current = d.units.find(u => u.unit_id === id) || null;
      box.innerHTML = current ? unitHtml(d, current)
        : '<p class="empty">Choose an example above, or open one from a dictionary card.</p>';
    };

    main.querySelector('#unit').addEventListener('change', e => {
      setHash('#/compare/' + encodeURIComponent(e.target.value));
      show(e.target.value);
    });
    box.addEventListener('click', e => {
      const btn = e.target.closest('[data-ann]');
      if (!btn || !current) return;
      const a = current.annotations.find(x => x.annotation_id === btn.dataset.ann);
      box.querySelectorAll('.hl').forEach(h => h.setAttribute('aria-expanded', String(h.dataset.ann === a.annotation_id)));
      const panel = box.querySelector('#ann-panel');
      panel.hidden = false;
      panel.innerHTML = annotationHtml(d, a, current.fragments.find(f => f.lang === a.lang && f.seq === a.seq));
      panel.scrollIntoView({ block: 'nearest' });
    });
    show(unitId);
  };

  function unitHtml(d, u) {
    const review = u.alignment_status === 'in_review';
    const directed = Lib.direction(u) !== 'Direction not established';
    return `<article aria-labelledby="unit-h">
      <div class="strip">
        <div class="strip-id">${esc(u.unit_id)}</div>
        <div class="strip-title">
          <h2 id="unit-h">${esc(Lib.unitTitle(d, u))}</h2>
          <p>${badge(review ? 'In review' : 'Aligned', review ? 'review' : 'ok')}${u.training ? badge('Training example', 'training') : ''}${statusBadge(u.dataset)}</p>
        </div>
        <div class="strip-route">
          <span>${esc(Lib.LINK_LABELS[u.link_type])}</span>
          <span class="sign-dir${directed ? '' : ' unknown'}">${esc(Lib.direction(u))}</span>
        </div>
      </div>
      ${u.direction_basis ? `<p class="basis">Basis: ${esc(u.direction_basis)}</p>` : ''}
      ${u.note ? `<p class="basis">${esc(u.note)}</p>` : ''}
      <div class="langs">${Lib.LANGS.map(l => column(d, u, l)).join('')}</div>
      <div id="ann-panel" class="panel ann-panel" aria-live="polite" hidden></div>
      <h3>Annotations</h3>
      ${u.annotations.length ? `<ul class="ann-list">${u.annotations.map(a => `<li><button type="button" class="link" data-ann="${esc(a.annotation_id)}">[${esc(a.label)}] ${Lib.LANG_LABELS[a.lang]}: “${esc(a.span_text)}”</button></li>`).join('')}</ul>`
        : '<p class="muted">No annotations for this example.</p>'}
      <p><a class="btn secondary" href="#/assess/${encodeURIComponent(u.unit_id)}">Assess this unit</a></p>
    </article>`;
  }

  function column(d, u, lang) {
    const frs = u.fragments.filter(f => f.lang === lang);
    const role = u.source_lang === lang ? badge(u.link_type === 'comparable_text' ? 'Reference' : 'Original', 'orig') : '';
    const body = frs.length ? frs.map(f => `
        <p class="frag" lang="${lang}">${frs.length > 1 ? `<span class="seq">${f.seq}</span>` : ''}${marked(f, u.annotations.filter(a => a.lang === lang && a.seq === f.seq))}</p>
        <p class="src">Source: ${sourceRef(d, f.source_id, f.locator)}</p>`).join('')
      : '<p class="muted">Not available</p>';
    return `<section class="panel"><div class="lang-head">${langSign(lang)}${role}</div>${body}</section>`;
  }

  // Highlight colour is always paired with a text label [A1] (ТЗ: colour duplicated by a text mark).
  const hlButton = (a, text) => `<button type="button" class="hl${a.check_status === 'pending' ? ' pending' : ''}" data-ann="${esc(a.annotation_id)}" aria-expanded="false" aria-controls="ann-panel">${esc(text)}<sup>[${esc(a.label)}]</sup></button>`;
  // Buttons are atomic inline boxes, so the browser may wrap right after them; glue the following
  // punctuation (text up to the next space) to the button so "разрешаю[A1]." never orphans the dot.
  function marked(f, anns) {
    const parts = Lib.segments(f.text, anns);
    return parts.map((s, i) => {
      if (!s.ann) return esc(s.text);
      const next = parts[i + 1];
      const glue = next && !next.ann ? (next.text.match(/^\S+/) || [''])[0] : '';
      if (glue) next.text = next.text.slice(glue.length);
      return `<span class="nowrap">${hlButton(s.ann, s.text)}${esc(glue)}</span>`;
    }).join('');
  }

  function annotationHtml(d, a, frag) {
    const names = (list, key, kind) => list.map(id => badge(d.vocab[key][id], kind)).join('') || '<span class="muted">—</span>';
    return `<h3>[${esc(a.label)}] “<span lang="${a.lang}">${esc(a.span_text)}</span>”</h3>
      <p>${langSign(a.lang)}${a.compared_with ? ` <span class="muted">compared with</span> ${langSign(a.compared_with)}` : ''} ${checkBadge(a.check_status)}</p>
      <dl>
        <dt>Difficulty type</dt><dd>${names(a.difficulty_ids, 'difficulties', 'diff')}</dd>
        <dt>Strategy</dt><dd>${names(a.strategy_ids, 'strategies', 'strat')}</dd>
        <dt>Explanation</dt><dd>${esc(a.explanation)}</dd>
        <dt>Fragment source</dt><dd>${sourceRef(d, frag.source_id, frag.locator)}</dd>
        ${a.evidence_source_id ? `<dt>Supporting material</dt><dd>${sourceRef(d, a.evidence_source_id, a.evidence_locator)}</dd>` : ''}
      </dl>`;
  }
})();
