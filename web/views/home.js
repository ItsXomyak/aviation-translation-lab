// Home: title, subtitle, description and the two main actions required by the ТЗ (section 3).
App.views.home = main => {
  main.innerHTML = `<section class="hero">
      <p class="kicker">Research Prototype</p>
      <h1>Aviation Translation Lab</h1>
      <p class="lead">An Interactive Platform for the Comparative Analysis of Aviation Discourse Translation</p>
      <p class="muted">English · <span lang="ru">Русский</span> · <span lang="kk">Қазақша</span></p>
      <p class="actions"><a class="btn" href="#/dictionary">Open Dictionary</a>
        <a class="btn secondary" href="#/compare">Compare Translations</a></p>
    </section>
    <ul class="modules">
      <li><a href="#/dictionary"><strong>Trilingual Aviation Dictionary</strong></a>Search terms in EN, RU and KK with sources and validation status.</li>
      <li><a href="#/compare"><strong>Translation Comparison</strong></a>Aligned fragments with annotated difficulties and strategies.</li>
      <li><a href="#/dashboard"><strong>Research Dashboard</strong></a>Counts and distributions of terms, difficulties and strategies.</li>
      <li><a href="#/assess"><strong>Translation Quality Assessment</strong></a>Criterion-based rubric scoring with justifications.</li>
      <li><a href="#/method"><strong>Research and Methodology</strong></a>Aims, procedure, limitations and corpus version.</li>
    </ul>`;
};
