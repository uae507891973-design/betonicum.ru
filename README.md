# betonicum.ru — UX-исследование и PWA

Результаты UX-исследования сайта [betonicum.ru](https://betonicum.ru) (производитель
полиуретан-цементных систем Resalux) и готовый стартовый код PWA-слоя для него.

## Структура

| Путь | Содержимое |
|---|---|
| [`docs/ux-research.md`](docs/ux-research.md) | UX-исследование: аудитория, персоны, CJM, находки и рекомендации |
| [`docs/pwa-implementation.md`](docs/pwa-implementation.md) | Предложение по реализации PWA: архитектура, этапы, метрики, деплой |
| [`docs/seo-analysis.md`](docs/seo-analysis.md) | SEO-анализ: индексация, конкуренты, семантическое ядро, план работ |
| [`docs/market-research-and-conversion-structure.md`](docs/market-research-and-conversion-structure.md) | Исследование рынка, конкуренты, УТП и конверсионная структура сайта с законами UX |
| [`docs/partner-agreement.md`](docs/partner-agreement.md) | Партнёрское соглашение для подрядчиков: программа выгод «Resacrete Pro» + договор-шаблон |
| [`docs/partner-prospects.md`](docs/partner-prospects.md) | Целевой список партнёров-подрядчиков в развивающихся странах + приоритизация рынков и playbook аутрича |
| [`docs/improvements.md`](docs/improvements.md) | Варианты улучшения сайта на основе анализа конкурентов: приоритеты, 3 сценария внедрения |
| [`docs/roadmap.md`](docs/roadmap.md) | Единая дорожная карта: 5 фаз, зависимости, вехи, метрики, временная шкала |
| [`docs/cjm.md`](docs/cjm.md) | Customer Journey Map по 3 персонам: этапы, эмоции, боли и решения по фазам |
| [`docs/ui-research.md`](docs/ui-research.md) | Подробное UI-исследование: методология (эвристики + 10 слоёв), протокол живого аудита, бенчмарк, приоритеты |
| [`docs/design-system.md`](docs/design-system.md) | Дизайн-система v5 (светлая тема на базе брендбука: красный акцент, Manrope/Golos/JetBrains Mono) + блоки отзывов/сертификатов/галереи + сложная анимация |
| [`site/anim.js`](site/anim.js) | Сложная анимация: scroll-reveal, параллакс, счётчики, магнитные кнопки, 3D-tilt, прогресс скролла |
| [`site/styleguide.html`](site/styleguide.html) | Живой styleguide — рендерит всю дизайн-систему |
| [`site/tokens.json`](site/tokens.json) | Машиночитаемые дизайн-токены (W3C-формат) |
| [`site/index.html`](site/index.html) · [`site/styles.css`](site/styles.css) | Полноценная первая страница сайта на дизайн-системе |
| [`pwa/app/index.html`](pwa/app/index.html) | Первый экран приложения (мобильный прототип главной) |
| [`docs/screenshots/`](docs/screenshots/) | Скриншоты первого экрана |
| [`pwa/manifest.webmanifest`](pwa/manifest.webmanifest) | Манифест приложения (иконки, shortcuts, цвета) |
| [`pwa/sw.js`](pwa/sw.js) | Service worker: офлайн-режим, стратегии кэширования, офлайн-библиотека PDF |
| [`pwa/offline.html`](pwa/offline.html) | Офлайн-страница со списком сохранённых документов |
| [`pwa/js/pwa-register.js`](pwa/js/pwa-register.js) | Регистрация SW, кнопка установки, кнопки «Сохранить офлайн» |
| [`pwa/wordpress/betonicum-pwa.php`](pwa/wordpress/betonicum-pwa.php) | mu-plugin для подключения PWA к WordPress |
| [`pwa/icons/`](pwa/icons/) | Иконки 192/512 px (any + maskable) и SVG-исходник |

## Быстрый старт (Фаза 1)

1. Скопировать `pwa/manifest.webmanifest`, `pwa/sw.js`, `pwa/offline.html` и каталог `pwa/`
   в корень сайта (рядом с `wp-config.php`). Сайт должен работать по HTTPS.
2. Скопировать `pwa/wordpress/betonicum-pwa.php` в `wp-content/mu-plugins/`.
3. Проверить установку: Chrome DevTools → Application → Manifest / Service Workers,
   затем Lighthouse → PWA.

Полный чек-лист и план фаз 2–3 (калькулятор расхода, push, личный кабинет) —
в [docs/pwa-implementation.md](docs/pwa-implementation.md).
