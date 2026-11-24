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
  const checkBadge = s => (s === 'pending' ? badge('Pending validation', 'pending') : badge('Verified', 'ok'));
  const statusBadge = s => (s === 'illustrative' ? badge('Illustrative example', 'illustrative') : '');
  const options = (map, selected, any = 'Any') => `<option value="">${esc(any)}</option>` +
    Object.entries(map).map(([v, l]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');

  function sourceRef(d, id, locator) {
    const s = d.sources[id];
    if (!s) return esc(id);
    const title = /^https?:\/\//.test(s.url)
      ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title);
    return `${title}, ${esc(s.organization)}${locator ? ', ' + esc(locator) : ''} <span class="muted">[${esc(id)}]</span>`;
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
    <p>No approved research records have been published yet. The research corpus view shows approved records only.</p>
    <p><button type="button" data-action="demo">Switch to Demo dataset</button></p>`;

  function render() {
    const d = Lib.datasetFor(window.ATL_DATA, mode());
    const r = route();
    const view = App.views[r.name] ? r.name : 'home';
    $('#banner').hidden = d.mode !== 'demo';
    $('#mode').innerHTML = `<span>Dataset: <strong>${d.mode === 'demo' ? 'Demo dataset' : 'Research corpus'}</strong></span>
      <button type="button" class="secondary small" data-action="toggle-mode">Switch to ${d.mode === 'demo' ? 'research corpus' : 'demo dataset'}</button>`;
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
      if (action === 'toggle-mode') { store.set(MODE_KEY, mode() === 'demo' ? 'research' : 'demo'); render(); }
      if (action === 'demo') { store.set(MODE_KEY, 'demo'); render(); }
      if (action === 'skip') { e.preventDefault(); $('#main').focus(); }
    });
    window.addEventListener('hashchange', render);
    render();
  }

  window.App = { views: {}, store, esc, badge, checkBadge, statusBadge, options, sourceRef, download, setHash, render };
  document.addEventListener('DOMContentLoaded', start);
})();
