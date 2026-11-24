// Translation comparison: EN/RU/KK columns, link type and direction, clickable highlighted spans with annotation panel.
(function () {
  'use strict';
  const { esc, txt, badge, checkBadge, statusBadge, langSign, sourceRef, notFound, setHash } = App;

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
        : id ? notFound('Unit', id, '#/compare', 'Back to Translation Comparison')
        : '<p class="empty">Choose an example above, or open one from a dictionary card.</p>';
    };

    main.querySelector('#unit').addEventListener('change', e => {
      setHash('#/compare/' + encodeURIComponent(e.target.value));
      show(e.target.value);
    });
    // Highlights are inline <mark role="button"> (so text wraps like text): Enter and Space open them too.
    box.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('mark[data-ann]')) {
        e.preventDefault();
        e.target.click();
      }
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
    const dir = Lib.direction(u);
    return `<article aria-labelledby="unit-h">
      <div class="strip">
        <div class="strip-id">${esc(u.unit_id)}</div>
        <div class="strip-title">
          <h2 id="unit-h">${esc(Lib.unitTitle(d, u))}</h2>
          <p>${badge(review ? 'In review' : 'Aligned', review ? 'review' : 'ok')}${u.training ? badge('Training example', 'training') : ''}${statusBadge(u.dataset)}</p>
        </div>
        <div class="strip-route">
          <span>Translation direction</span>
          <span class="sign-dir${dir.known ? '' : ' unknown'}">${esc(dir.label)}</span>
        </div>
      </div>
      ${u.direction_basis ? `<p class="basis">Basis: ${txt(u.direction_basis)}</p>` : ''}
      ${u.note ? `<p class="basis">${txt(u.note)}</p>` : ''}
      <div class="langs">${Lib.LANGS.map(l => column(d, u, l, dir.known)).join('')}</div>
      ${u.annotations.length ? `<p class="legend"><span class="hl-sample">solid</span> source referenced ·
        <span class="hl-sample pending">dashed</span> pending validation · select a highlight to read its annotation</p>` : ''}
      <div id="ann-panel" class="panel ann-panel" aria-live="polite" hidden></div>
      <h3>Annotations</h3>
      ${u.annotations.length ? `<ul class="ann-list">${u.annotations.map(a => `<li><button type="button" class="link" data-ann="${esc(a.annotation_id)}">[${esc(a.label)}] ${Lib.LANG_LABELS[a.lang]}: “${esc(a.span_text)}”</button></li>`).join('')}</ul>`
        : '<p class="muted">No annotations for this example.</p>'}
      <p><a class="btn secondary" href="#/assess/${encodeURIComponent(u.unit_id)}">Assess this unit</a></p>
    </article>`;
  }

  // The source-language column is the original when anything was translated from it, otherwise a reference text;
  // every other column carries its own link type (corpus v0.2: link_type_en/ru/kk).
  function column(d, u, lang, directed) {
    const frs = u.fragments.filter(f => f.lang === lang);
    const role = u.source_lang === lang ? badge(directed ? 'Original' : 'Reference', 'orig')
      : Lib.linkType(u, lang) ? badge(Lib.LINK_LABELS[Lib.linkType(u, lang)], 'link') : '';
    const body = frs.length ? frs.map(f => `
        <p class="frag" lang="${lang}">${frs.length > 1 ? `<span class="seq">${f.seq}</span>` : ''}${marked(f, u.annotations.filter(a => a.lang === lang && a.seq === f.seq))}</p>
        <p class="src">Source: ${sourceRef(d, f.source_id, f.locator)}</p>`).join('')
      : '<p class="muted">Not available</p>';
    return `<section class="panel"><div class="lang-head">${langSign(lang)}${role}</div>${body}</section>`;
  }

  // Highlight colour is always paired with a text label [A1] (ТЗ: colour duplicated by a text mark).
  // An inline <mark> (not a <button>, which is an atomic block) wraps with the sentence and keeps "[A1]." together.
  const hl = (a, text) => `<mark class="hl${a.check_status === 'pending_validation' ? ' pending' : ''}" role="button" tabindex="0" data-ann="${esc(a.annotation_id)}" aria-expanded="false" aria-controls="ann-panel">${esc(text)}<sup>[${esc(a.label)}]</sup></mark>`;
  const marked = (f, anns) => Lib.segments(f.text, anns).map(s => (s.ann ? hl(s.ann, s.text) : esc(s.text))).join('');

  function annotationHtml(d, a, frag) {
    const names = (list, key, kind) => list.map(id => badge(d.vocab[key][id], kind)).join('') || '<span class="muted">—</span>';
    return `<h3>[${esc(a.label)}] “<span lang="${a.lang}">${esc(a.span_text)}</span>”</h3>
      <p>${langSign(a.lang)}${a.compared_with ? ` <span class="muted">compared with</span> ${langSign(a.compared_with)}` : ''} ${checkBadge(a.check_status)}</p>
      <dl>
        <dt>Difficulty type</dt><dd>${names(a.difficulty_ids, 'difficulties', 'diff')}</dd>
        <dt>Strategy</dt><dd>${names(a.strategy_ids, 'strategies', 'strat')}</dd>
        <dt>Explanation</dt><dd>${txt(a.explanation)}</dd>
        <dt>Fragment source</dt><dd>${sourceRef(d, frag.source_id, frag.locator)}</dd>
        ${a.evidence_source_id ? `<dt>Supporting material</dt><dd>${sourceRef(d, a.evidence_source_id, a.evidence_locator)}</dd>` : ''}
      </dl>`;
  }
})();
