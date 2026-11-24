// Research and Methodology: author's text (trusted HTML from data/methodology.html) + generated corpus facts.
App.views.method = (main, d) => {
  const { esc } = App;
  const list = map => `<ul>${Object.entries(map).map(([id, label]) =>
    `<li>${esc(label)} <code class="muted">${esc(id)}</code></li>`).join('')}</ul>`;
  const link = s => (/^https?:\/\//.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">link</a>` : '—');
  main.innerHTML = `<h1>Research and Methodology</h1>
    <div class="prose">${d.methodology}</div>
    <h2>Working annotation categories</h2>
    <div class="cols">
      <section><h3>Translation difficulties</h3>${list(d.vocab.difficulties)}</section>
      <section><h3>Translation strategies</h3>${list(d.vocab.strategies)}</section>
    </div>
    <h2>Corpus sources</h2>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Corpus sources"><table>
      <thead><tr><th scope="col">ID</th><th scope="col">Document</th><th scope="col">Organisation</th><th scope="col">Language</th>
        <th scope="col">Genre</th><th scope="col">Edition</th><th scope="col">Link</th><th scope="col">Verification note</th></tr></thead>
      <tbody>${Object.values(d.sources).map(s => `<tr><td class="id">${esc(s.source_id)}</td><td>${esc(s.title)}</td>
        <td>${esc(s.organization)}</td><td>${esc(s.lang.toUpperCase())}</td><td>${esc(s.genre)}</td><td>${esc(s.edition)}</td>
        <td>${link(s)}</td><td>${esc(s.note)}</td></tr>`).join('')}</tbody>
    </table></div>
    <h2>Corpus version</h2>
    <p>Current version: <strong>${esc(d.version.current.version)}</strong> (${esc(d.version.current.date)})</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Corpus version history"><table>
      <thead><tr><th scope="col">Version</th><th scope="col">Date</th><th scope="col">Changes</th></tr></thead>
      <tbody>${[...d.version.history].reverse().map(v =>
        `<tr><td>${esc(v.version)}</td><td>${esc(v.date)}</td><td>${esc(v.changes)}</td></tr>`).join('')}</tbody>
    </table></div>`;
};
