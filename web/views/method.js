// Research and Methodology: author's text (trusted HTML from data/methodology.html) + generated corpus facts.
App.views.method = (main, d) => {
  const { esc } = App;
  const list = map => `<ul>${Object.entries(map).map(([id, label]) =>
    `<li>${esc(label)} <code class="muted">${esc(id)}</code></li>`).join('')}</ul>`;
  main.innerHTML = `<h1>Research and Methodology</h1>
    <div class="prose">${d.methodology}</div>
    <h2>Working annotation categories</h2>
    <div class="cols">
      <section><h3>Translation difficulties</h3>${list(d.vocab.difficulties)}</section>
      <section><h3>Translation strategies</h3>${list(d.vocab.strategies)}</section>
    </div>
    <h2>Corpus version</h2>
    <p>Current version: <strong>${esc(d.version.current.version)}</strong> (${esc(d.version.current.date)})</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Corpus version history"><table>
      <thead><tr><th scope="col">Version</th><th scope="col">Date</th><th scope="col">Changes</th></tr></thead>
      <tbody>${[...d.version.history].reverse().map(v =>
        `<tr><td>${esc(v.version)}</td><td>${esc(v.date)}</td><td>${esc(v.changes)}</td></tr>`).join('')}</tbody>
    </table></div>`;
};
