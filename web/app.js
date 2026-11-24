// App shell: dataset mode, hash routing and render helpers shared by the views in web/views/.
(function () {
  'use strict';
  const MODE_KEY = 'atl.mode';
  const NEEDS_CORPUS = new Set(['dictionary', 'compare', 'dashboard', 'assess']);

  // sessionStorage can throw (privacy settings, some file:// setups): fall back to memory for this page load.
  const memory = {};
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return k in memory ? memory[k] : null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { memory[k] = v; } },
  };

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const $ = sel => document.querySelector(sel);

  // trailing space keeps adjacent badges as separate words for screen readers and copy-paste
  const badge = (text, kind) => `<span class="badge badge-${kind}">${esc(text)}</span> `;
  const CHECK_KINDS = { verified: 'ok', source_referenced: 'ref', pending_validation: 'pending', illustrative: 'illustrative' };
  const checkBadge = s => badge(Lib.CHECK_LABELS[s] || s, CHECK_KINDS[s] || 'ref');
  // record-level dataset: demo records are the ТЗ's "Illustrative example"
  const statusBadge = dataset => (dataset === 'demo' ? badge('Illustrative example', 'illustrative') : '');
  // vocabulary entries actually used by the given records (keeps filters free of options that match nothing)
  const usedVocab = (map, records, key) => {
    const used = new Set(records.map(r => r[key]));
    return Object.fromEntries(Object.entries(map).filter(([id]) => used.has(id)));
  };
  // Airfield-style location sign for a language code; the full name is read by screen readers.
  const LANG_NAMES = { en: 'English', ru: 'Russian', kk: 'Kazakh' };
  const langSign = l => `<span class="sign"><span aria-hidden="true">${esc(l)}</span><span class="sr-only">${LANG_NAMES[l] || esc(l)}</span></span>`;
  const options = (map, selected, any = 'Any') => `<option value="">${esc(any)}</option>` +
    Object.entries(map).map(([v, l]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');

  // A reference may list several sources ("S02;S09"); the locator belongs to the reference as a whole.
  function sourceRef(d, ids, locator) {
    const one = id => {
      const s = d.sources[id];
      if (!s) return esc(id);
      const title = /^https?:\/\//.test(s.url)
        ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title);
      return `${title}, ${esc(s.organization)} <span class="id">[${esc(id)}]</span>`;
    };
    const list = String(ids || '').split(';').map(x => x.trim()).filter(Boolean);
    return list.map(one).join('; ') + (locator ? ` · ${esc(locator)}` : '');
  }

  // BOM keeps Kazakh/Russian letters intact when the CSV is opened in Excel.
  function download(filename, csv, demo) {
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: (demo ? 'DEMO_' : '') + filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const mode = () => (store.get(MODE_KEY) === 'demo' ? 'demo' : 'research');
  function route() {
    const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
    let arg = '';
    try { arg = decodeURIComponent(rest.join('/')); } catch (e) { arg = ''; }
    return { name: name || 'home', arg };
  }
  // In-view selections update the address without re-rendering (replaceState fires no hashchange).
  const setHash = hash => history.replaceState(null, '', hash);

  const underDevelopment = () => `<h1>Corpus under development</h1>
    <div class="empty"><p>The research corpus has no approved records yet. They appear here once the author publishes them.</p>
    <p>To explore the prototype now, open the illustrative demo dataset.</p>
    <p><button type="button" data-action="mode" data-mode="demo">Show demo dataset</button></p></div>`;

  function render() {
    const d = Lib.datasetFor(window.ATL_DATA, mode());
    const r = route();
    const view = App.views[r.name] ? r.name : 'home';
    $('#banner').hidden = d.mode !== 'demo';
    $('#mode').innerHTML = `<span id="mode-label">Dataset</span>
      <span class="seg" role="group" aria-labelledby="mode-label">
        <button type="button" data-action="mode" data-mode="research" aria-pressed="${d.mode === 'research'}">Research corpus</button>
        <button type="button" data-action="mode" data-mode="demo" aria-pressed="${d.mode === 'demo'}">Demo</button>
      </span>`;
    document.querySelectorAll('nav a').forEach(a => {
      if (a.getAttribute('href') === '#/' + view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    $('#version').textContent = `Corpus version ${d.version.current.version} · updated ${d.version.current.date}`;
    const main = $('#main');
    if (d.empty && NEEDS_CORPUS.has(view)) main.innerHTML = underDevelopment();
    else App.views[view](main, d, r.arg);
    const target = main.querySelector('[data-focus]') || main.querySelector('h1');
    if (target) {
      target.tabIndex = -1;
      target.focus();
    }
  }

  function start() {
    if (!window.ATL_DATA) {
      $('#main').innerHTML = '<h1>Data not found</h1><p>Run <code>python3 tools/build.py</code> and open <code>dist/index.html</code>.</p>';
      return;
    }
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      if (action === 'mode' && el.dataset.mode !== mode()) { store.set(MODE_KEY, el.dataset.mode); render(); }
      if (action === 'skip') { e.preventDefault(); $('#main').focus(); }
    });
    window.addEventListener('hashchange', render);
    render();
  }

  window.App = { views: {}, store, esc, badge, checkBadge, statusBadge, usedVocab, langSign, options, sourceRef, download, setHash, render };
  document.addEventListener('DOMContentLoaded', start);
})();
