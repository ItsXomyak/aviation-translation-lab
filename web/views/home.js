// Home: title, subtitle, description and the two main actions required by the ТЗ (section 3).
// The sign board shows the ТЗ's own demo term across the three languages — the platform's subject in one line.
App.views.home = main => {
  const { langSign } = App;
  const modules = [
    ['dictionary', 'Trilingual Aviation Dictionary', 'Find a term in English, Russian or Kazakh and see where each equivalent comes from.'],
    ['compare', 'Translation Comparison', 'Read aligned fragments side by side and open the annotated difficulties.'],
    ['dashboard', 'Research Dashboard', 'Filter the corpus and see how difficulties and strategies are distributed.'],
    ['assess', 'Translation Quality Assessment', 'Score a translation on four criteria and export your assessment.'],
    ['method', 'Research and Methodology', 'Aims, alignment and coding procedure, limitations and corpus version.'],
  ];
  main.innerHTML = `<section class="hero">
      <p class="kicker">Master's dissertation · 2026</p>
      <h1>Aviation Translation Lab</h1>
      <p class="lead">An Interactive Platform for the Comparative Analysis of Aviation Discourse Translation</p>
      <p class="byline">Makhmut Laila Zheniskyzy <span aria-hidden="true">·</span> Supervisor: Akizhanova Diana Muratovna</p>
      <a class="board" href="#/dictionary/T001" aria-describedby="board-caption">
        <span>${langSign('en')}<span lang="en">runway</span></span>
        <span>${langSign('ru')}<span lang="ru">взлётно-посадочная полоса</span></span>
        <span>${langSign('kk')}<span lang="kk">ұшу-қону жолағы</span></span>
      </a>
      <p class="board-caption" id="board-caption">One concept, three languages, every equivalent traced to its source.</p>
      <p class="actions"><a class="btn" href="#/dictionary">Open Dictionary</a>
        <a class="btn secondary" href="#/compare">Compare Translations</a></p>
    </section>
    <ul class="modules">${modules.map(([route, name, text]) => `
      <li><a href="#/${route}"><strong>${name}<span aria-hidden="true">→</span></strong><span>${text}</span></a></li>`).join('')}
    </ul>`;
};
