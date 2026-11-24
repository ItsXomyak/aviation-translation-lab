# Aviation Translation Lab — дизайн

Дата: 2026-11-24 · Основание: `Aviation_Translation_Lab_TZ.docx` (ТЗ v1.0)

## 1. Цель и рамки

Исследовательский прототип: 5 модулей (Dictionary, Compare, Dashboard, Assessment, Methodology) для сравнительного анализа перевода авиационного дискурса EN/RU/KK. Сценарий защиты (ТЗ 7.2) проходит от термина до статистики.

Поставляется демо-набор (Illustrative). Утверждённый корпус пуст — его наполняет автор исследования по шаблонам. Деплой: VPS пользователя, домен `<ip>.sslip.io` (настраивается последним шагом).

Вне рамок: админка/редактор в браузере, аккаунты, серверное хранение оценок, перестановка колонок (только порядок по умолчанию EN → RU → KK), Streamlit Community Cloud.

## 2. Стек и отступление от ТЗ

ТЗ предлагает Streamlit. Выбран статический сайт: HTML/CSS/JS без сборщика и зависимостей + Python-скрипт проверки/сборки (только stdlib).

Причина: приёмка требует клавиатурной доступности всех действий, 375 px без горизонтальной прокрутки, кликабельных выделений в тексте и работы без сети. В Streamlit это требует кастомных компонентов; статика даёт полный контроль и открывается двойным кликом по `index.html`. Обоснование фиксируется в README.

## 3. Структура репозитория

```
data/                     CSV UTF-8, правит автор
  vocab/topics.csv difficulties.csv strategies.csv genres.csv
  sources.csv terms.csv term_forms.csv units.csv fragments.csv annotations.csv
  versions.csv
  methodology.html        текст раздела Methodology (простой HTML)
web/                      интерфейс (классические <script>, без ES-модулей → работает с file://)
  index.html app.css
  lib.js                  чистые функции: поиск, статистика, рубрика, CSV; экспорт для node
  app.js                  оболочка: меню, хеш-роутер, режим данных, баннер, утилиты рендера
  views/home.js dictionary.js compare.js dashboard.js assess.js method.js
tools/
  build.py                проверка CSV → dist/ (копия web/ + data.js)
  test_build.py           unittest
  lib.test.js             node --test
  publish.sh              публикация на VPS с атомарной подменой
templates/                CSV-шаблоны (только заголовки)
docs/ README.md DATA_DICTIONARY.md ACCEPTANCE.md
```

Сборка пишет `dist/data.js` (`window.ATL_DATA = {...}`), а не JSON: `fetch` не работает с `file://`, `<script>` работает. Локальный запуск без сети: открыть `dist/index.html` или `python3 -m http.server -d dist`.

## 4. Модель данных

Все CSV: UTF-8 (BOM допускается — Excel), первая строка — заголовок. Списки в ячейке — через `;`. Даты — ISO `YYYY-MM-DD`.

### 4.1 Справочники (`data/vocab/*.csv`, колонки `id,label`)

ID постоянные, `label` можно менять.

- `difficulties`: `term_equivalence`, `abbreviation`, `syntax`, `modality`, `pragmatic_function`, `term_consistency`.
- `strategies`: `established_equivalent`, `borrowing`, `calque`, `descriptive`, `explicitation`, `generalization`, `compression`, `syntactic_restructuring`.
- `topics`, `genres` — наполняются по корпусу.

Фиксированные перечисления (в коде, не справочники):

| Поле | Значения |
|---|---|
| язык | `en`, `ru`, `kk` |
| `link_type` | `confirmed_translation`, `parallel_unknown_direction`, `comparable` |
| `alignment_status` | `aligned`, `in_review` |
| `status` (терм, единица) | `approved`, `illustrative`, `draft` |
| `check_status` (форма, аннотация) | `verified`, `pending` |
| `training` | `yes`, `no` (пусто = `no`) |

### 4.2 Таблицы

Обязательные поля помечены `*`.

**sources.csv** — `source_id*, title*, organization*, lang*, genre_id*, audience*, url*, accessed*, published, edition, locator`

**terms.csv** — `term_id*, topic_id*, definition*, definition_source_id*, definition_locator, context, difficulty_ids, difficulty_note, status*`

**term_forms.csv** — `term_id*, lang*, form*, abbreviation, source_id*, locator, check_status*`. Несколько форм на язык допустимо. Нет формы для языка → карточка показывает `Not available`.

**units.csv** — `unit_id*, title*, topic_id*, term_ids, link_type*, source_lang, direction_basis, alignment_status*, training, status*, note`
- `source_lang` — язык оригинала по данным источника; пусто = не установлен.
- `direction_basis` — основание направления перевода.

**fragments.csv** — `unit_id*, lang*, seq*, text*, source_id*, locator`. `seq` — порядковый номер предложения (1, 2, …) внутри (единица, язык). Разное число предложений в языках = объединение/разделение.

**annotations.csv** — `annotation_id*, unit_id*, lang*, seq, span_text*, occurrence, compared_with, difficulty_ids, strategy_ids, explanation*, evidence_source_id*, evidence_locator, check_status*`
- Выделение задаётся текстом (`span_text`) и номером вхождения (`occurrence`, по умолчанию 1) во фрагменте (`unit_id`, `lang`, `seq` по умолчанию 1). Смещения символов вычисляет сборка — автору не нужно их считать.
- `compared_with` — второй язык пары (необязательно).
- Хотя бы одно из `difficulty_ids` / `strategy_ids` непусто.

**versions.csv** — `version*, date*, changes*`. Последняя строка — текущая версия.

### 4.3 Правила проверки (`build.py`)

Ошибка: `<таблица>:<строка>: <описание>`. Строка — номер строки файла (заголовок = 1). Все ошибки собираются и печатаются разом; код выхода 1; выходная папка не изменяется.

1. Файл/колонка отсутствует.
2. Пустое обязательное поле.
3. Дубли ID: `source_id`, `term_id`, `unit_id`, `annotation_id`, ID справочников, `(unit_id, lang, seq)`, `(term_id, lang, form)`, `version`.
4. Неизвестное значение перечисления или справочника (с перечнем допустимых).
5. Ссылка на отсутствующую запись: `*source_id`, `term_id`, `term_ids`, `unit_id`, фрагмент аннотации `(unit_id, lang, seq)`.
6. Границы выделения: `span_text` не найден нужное число раз; `occurrence`/`seq` не целое ≥ 1; выделения во фрагменте пересекаются.
7. `link_type = confirmed_translation` без `source_lang` или `direction_basis`.
8. `training = yes` без `source_lang`; `source_lang` указан, но фрагмента на этом языке нет.
9. `approved`-единица ссылается на не-`approved` термин.
10. Некорректная дата; `versions.csv` пуст.

Успех: записи `draft` исключаются; аннотациям добавляются `start/end`; всё собирается в `dist/data.js` вместе с текстом `methodology.html`. Сборка идёт во временную папку, затем подменяет выходную.

## 5. Режимы данных и статистика

### 5.1 Режимы

- **Research corpus** (по умолчанию): видны только `approved` термины и единицы.
- **Demo dataset**: `approved` + `illustrative`. Постоянный баннер `DEMO DATASET — illustrative records, not research results` на каждом экране. Иллюстративные записи помечены `Illustrative example`. Все выгрузки: колонка `dataset=demo` и имя файла с префиксом `DEMO_`.
- В Research нет ни одной `approved` записи → модули Dictionary/Compare/Dashboard/Assessment показывают `Corpus under development` и кнопку `Switch to Demo dataset`. Methodology доступна всегда.
- Режим переключается кнопкой в шапке и хранится в `sessionStorage`.
- `pending`-формы и аннотации отображаются с меткой `Pending validation` в обоих режимах.

### 5.2 Dashboard

Фильтры: жанр, тематика, языковая пара (EN–RU, EN–KK, RU–KK), тип связи. Каждый по умолчанию `Any`. Счётчики, диаграммы и таблица пересчитываются из одного отфильтрованного набора.

- **U** — единицы режима, прошедшие фильтры:
  - жанр: у хотя бы одного источника фрагментов единицы совпадает `genre_id`;
  - тематика: `topic_id` единицы;
  - пара: есть фрагменты на обоих языках;
  - тип связи: `link_type`.
- **A** — учитываемые аннотации единиц из U. В Research — только `verified`, в Demo — все. При фильтре пары: `lang` ∈ пара и (`compared_with` пуст или ∈ пара).
- Счётчики:
  - Documents — уникальные `source_id` фрагментов U;
  - Term entries — уникальные термины из `term_ids` единиц U (только существующие в режиме);
  - Annotated units — **N** = единицы U, имеющие хотя бы одну аннотацию из A.
- Частота категории = число уникальных единиц из N, у которых есть аннотация из A с этой категорией. Доля = частота / N. Вывод: `Modality — 1 of 2 (50%)`, подпись `Base: N = 2 annotated units. Units may carry several labels; shares can sum to more than 100%.`
- Диаграммы: трудности, стратегии (частота/доля), термины по темам (количество). Горизонтальные HTML-полосы с текстовыми подписями.
- Таблица: строка на аннотацию из A — `unit_id, annotation_id, lang, compared_with, span, difficulties, strategies, link_type, topic, sources (id + locator), check_status`. CSV строится той же функцией + `dataset`, `corpus_version` → совпадает с таблицей.
- Пустая выборка: `No records match the selected filters.` + `Reset filters`.

Приёмочный пример: 2 `approved` единицы (одна с `modality`) + 1 `illustrative` → Research: `1 of 2 (50%)`; иллюстративная не учитывается.

### 5.3 Рубрика (Assessment)

- Выбор единицы и одного целевого языка (кроме языка оригинала).
- Форма показывает оригинал (фрагмент `source_lang`; если не установлен — `Original not established`), целевой фрагмент, жанр и аудиторию (из источника целевого фрагмента), критерии.
- **Балльный режим** — если `link_type = confirmed_translation` или `training = yes` (метка `Training example`). 4 критерия по ТЗ 5.1, баллы 0/1/2 (радиокнопки с текстами уровней) + поле обоснования к каждому (`Point to the exact place in the text`). Итог — сумма 0–8, только когда заполнены все 4; иначе статус `Incomplete`.
- **Режим комментария** — иначе. Только поле `Comparison comment` и пояснение, почему балльная оценка недоступна.
- Кнопки: `Save to session` (балльный — только при полной оценке; комментарий — при непустом тексте), `Reset form`, `Export session CSV`.
- Список сохранённых оценок сессии отображается под формой. Хранение — `sessionStorage`, отдельно от корпуса.
- CSV: `dataset, assessment_no, unit_id, language_pair (en→kk), corpus_version, rubric_version, mode, terminology, terminology_note, clarity, clarity_note, meaning, meaning_note, function, function_note, total, status, comment, saved_at`.
- Версия рубрики — константа `R1.0` в `lib.js`.

## 6. Модули интерфейса

Хеш-роутинг: `#/`, `#/dictionary`, `#/dictionary/<term_id>`, `#/compare`, `#/compare/<unit_id>`, `#/dashboard`, `#/assess`, `#/assess/<unit_id>`, `#/method`. При смене маршрута фокус переходит на `<h1>`.

**Шапка** — `Aviation Translation Lab` (ссылка на главную), меню из 5 модулей, переключатель набора данных. **Подвал** — версия корпуса.

**Home** — заголовок, `Research Prototype`, описание из ТЗ, кнопки `Open Dictionary` и `Compare Translations`.

**Dictionary**
- Поиск (`input type=search`): подстрока без учёта регистра по всем формам и аббревиатурам трёх языков; `ё`=`е`.
- Фильтры (`select`): тематика, тип трудности (`terms.difficulty_ids`), статус проверки (`Verified` — все формы verified; `Pending validation` — хотя бы одна pending).
- Список результатов и карточка. Если результат один — карточка открывается сразу (`ұшу-қону` → Runway).
- Карточка:
  - заголовок — EN-форма;
  - колонки EN → RU → KK: форма, аббревиатура, источник + локатор, метка проверки;
  - определение + источник;
  - контекст;
  - трудности + пояснение;
  - метка `Illustrative example`;
  - ссылки `Related comparisons` → `#/compare/<unit_id>`.
- Пусто → `No terms match "<query>".`

**Compare**
- `select` всех единиц режима.
- Шапка единицы:
  - тип связи текстом (`Confirmed translation` / `Parallel version — direction not established` / `Comparable texts`);
  - направление `EN → RU, KK` (только при `confirmed_translation`, с `direction_basis`), иначе `Direction not established`;
  - выравнивание `Aligned` / `In review`;
  - `Training example`.
- Три колонки (на узком экране — друг под другом). В каждой:
  - язык, метка `Original` для `source_lang`;
  - предложения (с номерами, если их больше одного) и источник + локатор каждого;
  - или `Not available`.
- Выделение — `<button>` внутри текста с золотой подложкой и текстовой меткой `[A1]` (цвет дублируется текстом). Нажатие открывает панель аннотации: трудности, стратегии, пояснение, сопоставляемый язык, подтверждающий источник + локатор, метка проверки.
- Под колонками — список всех аннотаций кнопками (доступ без поиска в тексте).
- Ссылка `Assess this unit` → `#/assess/<unit_id>`.

**Dashboard / Assessment** — по разделу 5.

**Methodology**
- `methodology.html`: цель, исследовательские вопросы, критерии отбора, процедура выравнивания и кодирования, ограничения выборки, библиография, этапы. В поставке — черновик с пометкой автору.
- Автоматически: версия корпуса и история из `versions.csv`; рабочие категории из справочников.

**Оформление**
- Фон `#112642`, акцент `#D5B36A`, текст `#F3F5F8`. Только тёмная тема — так задано ТЗ.
- Базовый размер шрифта 18 px — для проектора.
- Системные шрифты с поддержкой казахских букв (`system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial`). Внешних загрузок нет.
- Видимый фокус: 3 px, золотой. Ссылка `Skip to content`.
- `overflow-wrap: anywhere`; таблицы в контейнере с собственной прокруткой — страница при 375 px не прокручивается горизонтально.
- Весь текст из данных экранируется; `methodology.html` — доверенный контент автора.

## 7. Публикация

- Автор правит CSV (в репозитории) → `tools/publish.sh` на VPS:
  1. `git pull`;
  2. `build.py --out releases/<timestamp>`;
  3. при успехе — атомарная подмена симлинка `current` (`ln -sfn` + `mv -T`), хранить 5 последних релизов;
  4. при ошибке — вывод ошибок, `current` не меняется.
- Веб-сервер отдаёт `current/` по `https://<ip>.sslip.io`. Конкретный сервер (Caddy/nginx) — по тому, что стоит на VPS; настраивается последним шагом.

## 8. Тестирование и приёмка

- `python3 -m unittest tools/test_build.py`:
  - демо-данные собираются;
  - каждое правило 4.3 даёт ожидаемое `таблица:строка`;
  - при ошибке выходная папка не тронута;
  - новая `approved`-запись появляется в `data.js`.
- `node --test tools/`:
  - статистика 1 of 2 = 50%, иллюстративная исключена;
  - рубрика 2,1,2,2 → 7, пропуск → нет итога;
  - поиск `ұшу-қону` → Runway, несуществующий → пусто;
  - CSV-экранирование;
  - строки таблицы = строки CSV.
- Ручная проверка в Chrome (и Safari по возможности): сценарий защиты 7.2, 375 px, клавиатура, офлайн через `file://`.
- Результаты по каждому пункту ТЗ 7.1 записываются в `docs/ACCEPTANCE.md`.

## 9. Демо-набор

Тексты демо-фрагментов составлены для демонстрации и не являются цитатами из опубликованных документов. Источники демо помечены как сконструированные (`Demo source … (constructed)`), чтобы не создавать ложных ссылок на ICAO/FAA. Все записи `illustrative`; неочевидные RU/KK-формы — `pending`.

**Термины**

| Термин | EN | RU | KK | Особенности |
|---|---|---|---|---|
| Runway | runway / RWY | взлётно-посадочная полоса / ВПП | ұшу-қону жолағы | — |
| Air traffic control | air traffic control / ATC | управление воздушным движением / УВД | әуе қозғалысын басқару | — |
| Clearance | clearance | диспетчерское разрешение | диспетчерлік рұқсат | многозначность: ATC clearance vs obstacle clearance — выбор по значению и контексту |
| Hold short | hold short | ожидайте перед ВПП | — | — |
| Go around | go around | уход на второй круг | екінші айналымға кету | — |
| Squawk | squawk | установите код ответчика | — | — |

**Единицы** (6 шт.) — покрывают:
- все три типа связи;
- отсутствующий фрагмент (`Not available`);
- `in_review`;
- разделение предложения (EN 1 ↔ RU 2);
- учебный пример (`training=yes`) у сопоставимых текстов;
- все 6 категорий трудностей хотя бы раз.

Предлагаемые реальные отправные точки (ICAO Doc 4444, Doc 9432, Annex 14, FAA Pilot/Controller Glossary, официальные источники РК) перечисляются в `docs/DATA_DICTIONARY.md` для автора.

## 10. Редакция 2 (2026-11-24): корпус автора

Автор передал корпус `Aviation_Corpus_EN_RU_KK.xlsx` (+ описание в docx). Демо-набор из раздела 9 заменён этим корпусом; модель приведена к словарю автора:

- `status: approved/illustrative/draft` → `dataset: research/demo/draft`. Research-режим показывает `research`, Demo — `research` + `demo`.
- `check_status`: `verified`, `source_referenced`, `pending_validation`, `illustrative`. Статистика считает все аннотации видимых единиц (как лист Stats автора); статус — только метка.
- `link_type`: `comparable` → `comparable_text`, добавлен `illustrative_translation` (направление известно, требует `source_lang`, допускает балльную оценку).
- Жанр — у единицы (`units.genre_id`, фильтр дашборда); у источника жанр — свободный текст. Язык источника может быть списком (`ru/kk`); `url` необязателен.
- `units.title` необязателен (интерфейс показывает «тематика · жанр»); `evidence_source_id` необязателен — панель аннотации всегда показывает источник фрагмента.
- Доли — с одним знаком после запятой; счётчики документов и терминов показывают «в выборке · в корпусе».
- Импорт: `tools/import_xlsx.py` (openpyxl, только для импорта). U003 помечен `training=yes` — на нём в описании корпуса показан пример рубрики.
- Тест `lib.test.js` сверяет статистику дашборда с листом Stats (N = 22, D01 10 = 45,5% и т. д.).
- Публикация: вместо `publish.sh` — Docker (`Dockerfile` + `compose.yaml` + Caddy с автоматическим HTTPS для `<ip>.sslip.io`). Ошибка в данных роняет сборку образа, работающий контейнер остаётся на прошлой версии.
