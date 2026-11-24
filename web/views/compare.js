// Translation comparison: EN/RU/KK columns, link type and direction, clickable highlighted spans with annotation panel.
(function () {
  'use strict';
  const { esc, badge, checkBadge, statusBadge, sourceRef, setHash } = App;

  App.views.compare = (main, d, unitId) => {
    main.innerHTML = `<h1>Translation Comparison</h1>
      <div class="filters"><div><label for="unit">Example</label>
        <select id="unit"><option value="">Choose an example…</option>
          ${d.units.map(u => `<option value="${esc(u.unit_id)}"${u.unit_id === unitId ? ' selected' : ''}>${esc(u.unit_id)} — ${esc(u.title)}</option>`).join('')}
        </select></div></div>
      <div id="unit-view"></div>`;
    const box = main.querySelector('#unit-view');
    let current = null;

    const show = id => {
      current = d.units.find(u => u.unit_id === id) || null;
      box.innerHTML = current ? unitHtml(d, current)
        : '<p class="muted">Choose an example from the list or open one from a dictionary card.</p>';
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
      panel.innerHTML = annotationHtml(d, a);
      panel.scrollIntoView({ block: 'nearest' });
    });
    show(unitId);
  };

  function unitHtml(d, u) {
    const review = u.alignment_status === 'in_review';
    return `<article aria-labelledby="unit-h">
      <h2 id="unit-h">${esc(u.title)}</h2>
      <p>${badge(Lib.LINK_LABELS[u.link_type], 'link')}${badge(review ? 'In review' : 'Aligned', review ? 'review' : 'ok')}${u.training ? badge('Training example', 'training') : ''}${statusBadge(u.status)}</p>
      <p><strong>Direction:</strong> ${esc(Lib.direction(u))}${u.link_type === 'confirmed_translation'
        ? ` <span class="muted">— basis: ${esc(u.direction_basis)}</span>` : ''}</p>
      ${u.note ? `<p class="muted">${esc(u.note)}</p>` : ''}
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
    const role = u.source_lang === lang ? badge(u.link_type === 'comparable' ? 'Reference' : 'Original', 'orig') : '';
    const body = frs.length ? frs.map(f => `
        <p lang="${lang}">${frs.length > 1 ? `<span class="seq">${f.seq}.</span> ` : ''}${marked(f, u.annotations.filter(a => a.lang === lang && a.seq === f.seq))}</p>
        <p class="src">Source: ${sourceRef(d, f.source_id, f.locator)}</p>`).join('')
      : '<p class="muted">Not available</p>';
    return `<section class="panel"><h3>${Lib.LANG_LABELS[lang]} ${role}</h3>${body}</section>`;
  }

  // Highlight colour is always paired with a text label [A1] (ТЗ: colour duplicated by a text mark).
  const marked = (f, anns) => Lib.segments(f.text, anns).map(s => (s.ann
    ? `<button type="button" class="hl${s.ann.check_status === 'pending' ? ' pending' : ''}" data-ann="${esc(s.ann.annotation_id)}" aria-expanded="false" aria-controls="ann-panel">${esc(s.text)}<sup>[${esc(s.ann.label)}]</sup></button>`
    : esc(s.text))).join('');

  function annotationHtml(d, a) {
    const names = (list, key, kind) => list.map(id => badge(d.vocab[key][id], kind)).join('') || '<span class="muted">—</span>';
    return `<h3>[${esc(a.label)}] “<span lang="${a.lang}">${esc(a.span_text)}</span>”
        <span class="muted">${Lib.LANG_LABELS[a.lang]}${a.compared_with ? ' compared with ' + Lib.LANG_LABELS[a.compared_with] : ''}</span></h3>
      <p>${checkBadge(a.check_status)}</p>
      <dl>
        <dt>Difficulty type</dt><dd>${names(a.difficulty_ids, 'difficulties', 'diff')}</dd>
        <dt>Strategy</dt><dd>${names(a.strategy_ids, 'strategies', 'strat')}</dd>
        <dt>Explanation</dt><dd>${esc(a.explanation)}</dd>
        <dt>Supporting source</dt><dd>${sourceRef(d, a.evidence_source_id, a.evidence_locator)}</dd>
      </dl>`;
  }
})();
