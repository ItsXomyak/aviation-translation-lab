// Research and Methodology: author's text (trusted HTML from data/methodology.html) + generated corpus facts.
App.views.method = (main, d) => {
  const { esc, txt } = App;
  // categories no annotation of the current dataset uses yet are flagged, so a 0% bar on the dashboard is expected
  const used = new Set(d.units.flatMap(u => u.annotations.flatMap(a => [...a.difficulty_ids, ...a.strategy_ids])));
  const list = map => `<ul>${Object.entries(map).map(([id, label]) =>
    `<li>${esc(label)} <code class="muted">${esc(id)}</code>${used.has(id) ? '' : ' <span class="muted">— not yet attested in this dataset</span>'}</li>`).join('')}</ul>`;
  const link = s => (/^https?:\/\//.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">link</a>` : '—');
  main.innerHTML = `<h1>Research and Methodology</h1>
    <div class="prose">${d.methodology}</div>
    <h2>Working annotation categories</h2>
    <div class="cols">
      <section><h3>Translation difficulties</h3>${list(d.vocab.difficulties)}</section>
      <section><h3>Translation strategies</h3>${list(d.vocab.strategies)}</section>
    </div>
    <h2>Implementation</h2>
    <div class="prose">
      <p>The ТЗ (6.3) suggests Python with Streamlit, pandas and Plotly. The platform is instead a static site
        (HTML, CSS and plain JavaScript) built by one Python script that uses only the standard library. The site opens
        from a folder without a server or network, which makes it safe for a defence room, and the corpus stays in plain
        CSV tables that the author edits.</p>
      <p><code>tools/build.py</code> validates every table (IDs, references, vocabularies, selection boundaries,
        link types by language) and writes the site. On any error it prints <code>table.csv:line: problem</code> and leaves
        the previous build untouched. The author's corpus tables are converted with <code>tools/import_corpus.py</code>.</p>
      <p>Source code, tests and the update procedure:
        <a href="https://github.com/ItsXomyak/aviation-translation-lab" target="_blank" rel="noopener">github.com/ItsXomyak/aviation-translation-lab</a>.</p>
    </div>
    <h2>Corpus sources</h2>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Corpus sources"><table>
      <thead><tr><th scope="col">ID</th><th scope="col">Document</th><th scope="col">Organisation</th><th scope="col">Language</th>
        <th scope="col">Genre</th><th scope="col">Edition</th><th scope="col">Link</th><th scope="col">Verification note</th></tr></thead>
      <tbody>${Object.values(d.sources).map(s => `<tr><td class="id">${esc(s.source_id)}</td><td>${txt(s.title)}</td>
        <td>${esc(s.organization)}</td><td>${esc(s.lang.toUpperCase())}</td><td>${esc(s.genre)}</td><td>${esc(s.edition)}</td>
        <td>${link(s)}</td><td>${txt(s.note)}</td></tr>`).join('')}</tbody>
    </table></div>
    <h2>Corpus version</h2>
    <p>Current version: <strong>${esc(d.version.current.version)}</strong> (${esc(d.version.current.date)})</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Corpus version history"><table>
      <thead><tr><th scope="col">Version</th><th scope="col">Date</th><th scope="col">Changes</th></tr></thead>
      <tbody>${[...d.version.history].reverse().map(v =>
        `<tr><td>${esc(v.version)}</td><td>${esc(v.date)}</td><td>${txt(v.changes)}</td></tr>`).join('')}</tbody>
    </table></div>`;
};
