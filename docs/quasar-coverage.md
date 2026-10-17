# Покрытие Quasar (S6-08)

Создано `Modules/Engine/UI/Scripts/QuasarCoverage.mjs` по каталогу Quasar 2.34.0 (`quasar/dist/api`), CSS китов
и снимкам скриншотных тестов; `Tests/Quasar/Coverage.test.ts` падает, пока файл устарел. Не править руками.

- **Палитра:** каждый компонент — тип виджета UI-документа (`BuiltInWidgets`), в палитре UIDesigner в группе «Quasar: …».
- **Инспектор:** свойства по категориям Quasar с редактором по типу, слоты (в какой слот идёт дочерний виджет),
  события (для графов узлов и скриптов), методы (`Controller("Имя").Call("метод")`), директивы.
- **Тема Quasar:** собственный вид Quasar, цвета бренда из палитры кита.
- **Tailwind, Windows:** «own rules» — у кита свои правила для компонента; «tokens» — компонент одет токенами кита
  (цвета бренда, шрифт, размер, скругление, поверхности), отдельных правил не требует.
- **Тест:** снимки во всех трёх китах в пяти состояниях (`E2E/quasar.spec.ts`); «движется» — анимированный компонент
  (спиннеры, полосы загрузки): проверяется юнит-тестами отрисовки, снимок не стабилен.

## Компоненты

| Компонент | Группа | В палитре | Свойства / слоты / события в инспекторе | Тема Quasar | Тема Tailwind | Тема Windows | Тест |
|---|---|---|---|---|---|---|---|
| [QAjaxBar](https://v2.quasar.dev/vue-components/ajax-bar) | Feedback | да | 5 / 0 / 2 | да | tokens | tokens | движется; юнит |
| [QAvatar](https://v2.quasar.dev/vue-components/avatar) | Feedback | да | 7 / 1 / 0 | да | tokens | own rules | снимки ×3 |
| [QBadge](https://v2.quasar.dev/vue-components/badge) | Feedback | да | 9 / 1 / 0 | да | own rules | own rules | снимки ×3 |
| [QBanner](https://v2.quasar.dev/vue-components/banner) | Containers | да | 4 / 3 / 0 | да | own rules | own rules | снимки ×3 |
| [QBar](https://v2.quasar.dev/vue-components/bar) | Layout | да | 2 / 1 / 0 | да | own rules | own rules | снимки ×3 |
| [QBreadcrumbs](https://v2.quasar.dev/vue-components/breadcrumbs) | Navigation | да | 5 / 2 / 0 | да | own rules | own rules | снимки ×3 |
| [QBreadcrumbsEl](https://v2.quasar.dev/vue-components/breadcrumbs) | Navigation | да | 11 / 1 / 1 | да | own rules | own rules | снимки ×3 |
| [QBtn](https://v2.quasar.dev/vue-components/button) | Buttons | да | 34 / 2 / 1 | да | own rules | own rules | снимки ×3 |
| [QBtnDropdown](https://v2.quasar.dev/vue-components/button-dropdown) | Buttons | да | 57 / 4 / 6 + v-model | да | tokens | tokens | снимки ×3 |
| [QBtnGroup](https://v2.quasar.dev/vue-components/button-group) | Buttons | да | 10 / 1 / 0 | да | own rules | own rules | снимки ×3 |
| [QBtnToggle](https://v2.quasar.dev/vue-components/button-toggle) | Buttons | да | 27 / 1 / 2 + v-model | да | tokens | own rules | снимки ×3 |
| [QCard](https://v2.quasar.dev/vue-components/card) | Containers | да | 5 / 1 / 0 | да | own rules | own rules | снимки ×3 |
| [QCardActions](https://v2.quasar.dev/vue-components/card) | Containers | да | 2 / 1 / 0 | да | tokens | own rules | снимки ×3 |
| [QCardSection](https://v2.quasar.dev/vue-components/card) | Containers | да | 2 / 1 / 0 | да | tokens | own rules | снимки ×3 |
| [QCarousel](https://v2.quasar.dev/vue-components/carousel) | Media | да | 29 / 3 / 5 + v-model | да | own rules | own rules | снимки ×3 |
| [QCarouselControl](https://v2.quasar.dev/vue-components/carousel) | Media | да | 2 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QCarouselSlide](https://v2.quasar.dev/vue-components/carousel) | Media | да | 3 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QChatMessage](https://v2.quasar.dev/vue-components/chat) | Data | да | 13 / 5 / 0 | да | tokens | tokens | снимки ×3 |
| [QCheckbox](https://v2.quasar.dev/vue-components/checkbox) | Forms | да | 20 / 1 / 1 + v-model | да | tokens | own rules | снимки ×3 |
| [QChip](https://v2.quasar.dev/vue-components/chip) | Feedback | да | 20 / 1 / 4 + v-model | да | own rules | own rules | снимки ×3 |
| [QCircularProgress](https://v2.quasar.dev/vue-components/circular-progress) | Feedback | да | 16 / 1 / 0 | да | own rules | tokens | снимки ×3 |
| [QColor](https://v2.quasar.dev/vue-components/color-picker) | Pickers | да | 15 / 1 / 2 + v-model | да | tokens | tokens | снимки ×3 |
| [QDate](https://v2.quasar.dev/vue-components/date) | Pickers | да | 31 / 1 / 4 + v-model | да | own rules | own rules | снимки ×3 |
| [QDialog](https://v2.quasar.dev/vue-components/dialog) | Popups | да | 20 / 1 / 7 + v-model | да | own rules | own rules | снимки ×3 |
| [QDrawer](https://v2.quasar.dev/layout/drawer) | Layout | да | 18 / 2 / 12 + v-model | да | own rules | own rules | снимки ×3 |
| [QEditor](https://v2.quasar.dev/vue-components/editor) | Pickers | да | 29 / 1 / 9 + v-model | да | own rules | own rules | снимки ×3 |
| [QExpansionItem](https://v2.quasar.dev/vue-components/expansion-item) | Containers | да | 33 / 2 / 7 + v-model | да | tokens | tokens | снимки ×3 |
| [QFab](https://v2.quasar.dev/vue-components/floating-action-button) | Buttons | да | 29 / 5 / 5 + v-model | да | tokens | own rules | снимки ×3 |
| [QFabAction](https://v2.quasar.dev/vue-components/floating-action-button) | Buttons | да | 22 / 3 / 1 | да | tokens | tokens | снимки ×3 |
| [QField](https://v2.quasar.dev/vue-components/field) | Forms | да | 38 / 11 / 4 + v-model | да | tokens | own rules | снимки ×3 |
| [QFile](https://v2.quasar.dev/vue-components/file) | Forms | да | 49 / 12 / 5 + v-model | да | tokens | tokens | снимки ×3 |
| [QFooter](https://v2.quasar.dev/layout/header-and-footer) | Layout | да | 5 / 1 / 1 + v-model | да | own rules | own rules | снимки ×3 |
| [QForm](https://v2.quasar.dev/vue-components/form) | Containers | да | 4 / 1 / 4 | да | tokens | tokens | снимки ×3 |
| [QHeader](https://v2.quasar.dev/layout/header-and-footer) | Layout | да | 6 / 1 / 1 + v-model | да | own rules | own rules | снимки ×3 |
| [QIcon](https://v2.quasar.dev/vue-components/icon) | Feedback | да | 6 / 1 / 0 | да | tokens | own rules | снимки ×3 |
| [QImg](https://v2.quasar.dev/vue-components/img) | Media | да | 27 / 3 / 2 | да | tokens | own rules | снимки ×3 |
| [QInfiniteScroll](https://v2.quasar.dev/vue-components/infinite-scroll) | Data | да | 7 / 2 / 1 | да | tokens | tokens | снимки ×3 |
| [QInnerLoading](https://v2.quasar.dev/vue-components/inner-loading) | Feedback | да | 10 / 1 / 0 | да | own rules | own rules | движется; юнит |
| [QInput](https://v2.quasar.dev/vue-components/input) | Forms | да | 49 / 10 / 4 + v-model | да | tokens | tokens | снимки ×3 |
| [QIntersection](https://v2.quasar.dev/vue-components/intersection) | Behaviour | да | 8 / 2 / 1 | да | tokens | tokens | снимки ×3 |
| [QItem](https://v2.quasar.dev/vue-components/list-and-list-items) | Data | да | 18 / 1 / 1 | да | own rules | own rules | снимки ×3 |
| [QItemLabel](https://v2.quasar.dev/vue-components/list-and-list-items) | Data | да | 4 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QItemSection](https://v2.quasar.dev/vue-components/list-and-list-items) | Data | да | 5 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QKnob](https://v2.quasar.dev/vue-components/knob) | Forms | да | 21 / 1 / 3 + v-model | да | own rules | own rules | снимки ×3 |
| [QLayout](https://v2.quasar.dev/layout/layout) | Layout | да | 2 / 1 / 3 | да | own rules | own rules | снимки ×3 |
| [QLinearProgress](https://v2.quasar.dev/vue-components/linear-progress) | Feedback | да | 13 / 1 / 0 | да | own rules | own rules | снимки ×3 |
| [QList](https://v2.quasar.dev/vue-components/list-and-list-items) | Data | да | 7 / 1 / 0 | да | own rules | own rules | снимки ×3 |
| [QMarkupTable](https://v2.quasar.dev/vue-components/markup-table) | Data | да | 7 / 1 / 0 | да | own rules | own rules | снимки ×3 |
| [QMenu](https://v2.quasar.dev/vue-components/menu) | Popups | да | 27 / 1 / 6 + v-model | да | own rules | own rules | снимки ×3 |
| [QNoSsr](https://v2.quasar.dev/vue-components/no-ssr) | Layout | да | 2 / 2 / 0 | да | tokens | tokens | снимки ×3 |
| [QOptionGroup](https://v2.quasar.dev/vue-components/option-group) | Forms | да | 15 / 2 / 1 + v-model | да | tokens | tokens | снимки ×3 |
| [QPage](https://v2.quasar.dev/layout/page) | Layout | да | 1 / 1 / 0 | да | own rules | own rules | снимки ×3 |
| [QPageContainer](https://v2.quasar.dev/layout/page) | Layout | да | 0 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QPageScroller](https://v2.quasar.dev/layout/page-scroller) | Layout | да | 6 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QPageSticky](https://v2.quasar.dev/layout/page-sticky) | Layout | да | 3 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QPagination](https://v2.quasar.dev/vue-components/pagination) | Navigation | да | 33 / 1 / 1 + v-model | да | tokens | own rules | снимки ×3 |
| [QParallax](https://v2.quasar.dev/vue-components/parallax) | Media | да | 4 / 3 / 1 | да | tokens | tokens | снимки ×3 |
| [QPopupEdit](https://v2.quasar.dev/vue-components/popup-edit) | Forms | да | 34 / 1 / 8 + v-model | да | tokens | tokens | снимки ×3 |
| [QPopupProxy](https://v2.quasar.dev/vue-components/popup-proxy) | Popups | да | 36 / 1 / 7 + v-model | да | tokens | tokens | снимки ×3 |
| [QPullToRefresh](https://v2.quasar.dev/vue-components/pull-to-refresh) | Behaviour | да | 7 / 1 / 1 | да | tokens | tokens | снимки ×3 |
| [QRadio](https://v2.quasar.dev/vue-components/radio) | Forms | да | 14 / 1 / 1 + v-model | да | tokens | own rules | снимки ×3 |
| [QRange](https://v2.quasar.dev/vue-components/range) | Forms | да | 49 / 2 / 3 + v-model | да | tokens | tokens | снимки ×3 |
| [QRating](https://v2.quasar.dev/vue-components/rating) | Forms | да | 15 / 1 / 1 + v-model | да | tokens | tokens | снимки ×3 |
| [QResizeObserver](https://v2.quasar.dev/vue-components/resize-observer) | Behaviour | да | 1 / 0 / 1 | да | tokens | tokens | снимки ×3 |
| [QResponsive](https://v2.quasar.dev/vue-components/responsive) | Layout | да | 1 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QRouteTab](https://v2.quasar.dev/vue-components/tabs) | Navigation | да | 17 / 1 / 1 | да | tokens | tokens | снимки ×3 |
| [QScrollArea](https://v2.quasar.dev/vue-components/scroll-area) | Containers | да | 14 / 1 / 1 | да | tokens | tokens | снимки ×3 |
| [QScrollObserver](https://v2.quasar.dev/vue-components/scroll-observer) | Behaviour | да | 3 / 0 / 1 | да | tokens | tokens | снимки ×3 |
| [QSelect](https://v2.quasar.dev/vue-components/select) | Forms | да | 92 / 16 / 13 + v-model | да | tokens | tokens | снимки ×3 |
| [QSeparator](https://v2.quasar.dev/vue-components/separator) | Layout | да | 6 / 0 / 0 | да | own rules | own rules | снимки ×3 |
| [QSkeleton](https://v2.quasar.dev/vue-components/skeleton) | Feedback | да | 10 / 1 / 0 | да | own rules | own rules | движется; юнит |
| [QSlideItem](https://v2.quasar.dev/vue-components/slide-item) | Data | да | 5 / 5 / 6 | да | tokens | tokens | снимки ×3 |
| [QSlideTransition](https://v2.quasar.dev/vue-components/slide-transition) | Behaviour | да | 2 / 1 / 2 | да | tokens | tokens | снимки ×3 |
| [QSlider](https://v2.quasar.dev/vue-components/slider) | Forms | да | 36 / 2 / 3 + v-model | да | tokens | tokens | снимки ×3 |
| [QSpace](https://v2.quasar.dev/vue-components/space) | Layout | да | 0 / 0 / 0 | да | tokens | tokens | снимки ×3 |
| [QSpinner](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 3 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerAudio](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerBall](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerBars](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerBox](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerClock](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerComment](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerCube](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerDots](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerFacebook](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerGears](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerGrid](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerHearts](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerHourglass](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerInfinity](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerIos](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerOrbit](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerOval](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerPie](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerPuff](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerRadio](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerRings](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSpinnerTail](https://v2.quasar.dev/vue-components/spinners) | Spinners | да | 2 / 0 / 0 | да | tokens | own rules | движется; юнит |
| [QSplitter](https://v2.quasar.dev/vue-components/splitter) | Layout | да | 13 / 4 / 1 + v-model | да | tokens | tokens | снимки ×3 |
| [QStep](https://v2.quasar.dev/vue-components/stepper) | Navigation | да | 16 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QStepper](https://v2.quasar.dev/vue-components/stepper) | Navigation | да | 27 / 3 / 3 + v-model | да | own rules | own rules | снимки ×3 |
| [QStepperNavigation](https://v2.quasar.dev/vue-components/stepper) | Navigation | да | 0 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QTab](https://v2.quasar.dev/vue-components/tabs) | Navigation | да | 10 / 1 / 0 | да | own rules | own rules | снимки ×3 |
| [QTabPanel](https://v2.quasar.dev/vue-components/tab-panels) | Navigation | да | 2 / 1 / 0 | да | tokens | own rules | снимки ×3 |
| [QTabPanels](https://v2.quasar.dev/vue-components/tab-panels) | Navigation | да | 13 / 1 / 3 + v-model | да | own rules | own rules | снимки ×3 |
| [QTable](https://v2.quasar.dev/vue-components/table) | Data | да | 57 / 21 / 11 | да | own rules | own rules | снимки ×3 |
| [QTabs](https://v2.quasar.dev/vue-components/tabs) | Navigation | да | 20 / 1 / 1 + v-model | да | tokens | own rules | снимки ×3 |
| [QTd](https://v2.quasar.dev/vue-components/table) | Data | да | 4 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QTh](https://v2.quasar.dev/vue-components/table) | Data | да | 3 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QTime](https://v2.quasar.dev/vue-components/time) | Pickers | да | 21 / 1 / 1 + v-model | да | own rules | own rules | снимки ×3 |
| [QTimeline](https://v2.quasar.dev/vue-components/timeline) | Data | да | 4 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QTimelineEntry](https://v2.quasar.dev/vue-components/timeline) | Data | да | 9 / 3 / 0 | да | tokens | tokens | снимки ×3 |
| [QToggle](https://v2.quasar.dev/vue-components/toggle) | Forms | да | 22 / 1 / 1 + v-model | да | tokens | own rules | снимки ×3 |
| [QToolbar](https://v2.quasar.dev/vue-components/toolbar) | Layout | да | 1 / 1 / 0 | да | own rules | own rules | снимки ×3 |
| [QToolbarTitle](https://v2.quasar.dev/vue-components/toolbar) | Layout | да | 1 / 1 / 0 | да | tokens | own rules | снимки ×3 |
| [QTooltip](https://v2.quasar.dev/vue-components/tooltip) | Popups | да | 15 / 1 / 5 + v-model | да | own rules | own rules | снимки ×3 |
| [QTr](https://v2.quasar.dev/vue-components/table) | Data | да | 3 / 1 / 0 | да | tokens | tokens | снимки ×3 |
| [QTree](https://v2.quasar.dev/vue-components/tree) | Data | да | 32 / 4 / 7 | да | own rules | own rules | снимки ×3 |
| [QUploader](https://v2.quasar.dev/vue-components/uploader) | Pickers | да | 27 / 2 / 9 | да | own rules | own rules | снимки ×3 |
| [QUploaderAddTrigger](https://v2.quasar.dev/vue-components/uploader) | Pickers | да | 0 / 0 / 0 | да | tokens | tokens | снимки ×3 |
| [QVideo](https://v2.quasar.dev/vue-components/video) | Media | да | 6 / 0 / 0 | да | tokens | tokens | снимки ×3 |
| [QVirtualScroll](https://v2.quasar.dev/vue-components/virtual-scroll) | Data | да | 22 / 3 / 1 | да | tokens | own rules | снимки ×3 |

## Директивы

В инспекторе: раздел «Directives» (вкл/выкл, аргумент и модификаторы, значение); у директив-обработчиков
событие виджета с именем директивы.

| Директива | Значение | Модификаторы | В инспекторе |
|---|---|---|---|
| [v-close-popup](https://v2.quasar.dev/vue-directives/close-popup) | Boolean, Number, String | — | да |
| [v-drop-zone](https://v2.quasar.dev/vue-directives/drop-zone) | Function, Object, false | multiple | да |
| [v-intersection](https://v2.quasar.dev/vue-directives/intersection) | Function, Object, false | once | да |
| [v-morph](https://v2.quasar.dev/vue-directives/morph) | Object, Any | resize, useCSS, hideFromClone, keepToClone, tween | да |
| [v-mutation](https://v2.quasar.dev/vue-directives/mutation) | Function, false | once, childList, subtree, attributes, characterData, attributeOldValue, characterDataOldValue | да |
| [v-resize](https://v2.quasar.dev/vue-directives/resize) | Function, false | once | да |
| [v-ripple](https://v2.quasar.dev/vue-directives/material-ripple) | Boolean, Object | early, stop, center | да |
| [v-scroll](https://v2.quasar.dev/vue-directives/scroll) | Function | — | да |
| [v-scroll-fire](https://v2.quasar.dev/vue-directives/scroll-fire) | Function | — | да |
| [v-touch-hold](https://v2.quasar.dev/vue-directives/touch-hold) | Function | capture, mouse, mouseCapture | да |
| [v-touch-pan](https://v2.quasar.dev/vue-directives/touch-pan) | Function | stop, prevent, capture, mouse, mouseCapture, mouseAllDir, preserveCursor, horizontal, vertical, up, right, down, left | да |
| [v-touch-repeat](https://v2.quasar.dev/vue-directives/touch-repeat) | Function | capture, mouse, mouseCapture, keyCapture, esc, tab, enter, space, up, left, right, down, delete, [keycode] | да |
| [v-touch-swipe](https://v2.quasar.dev/vue-directives/touch-swipe) | Function | capture, mouse, mouseCapture, horizontal, vertical, up, right, down, left | да |

## Плагины

| Плагин | Как доступен |
|---|---|
| [AddressbarColor](https://v2.quasar.dev/quasar-plugins/addressbar-color) | плагин Quasar (`import { AddressbarColor } from "quasar"` в скриптах) |
| [AppFullscreen](https://v2.quasar.dev/quasar-plugins/app-fullscreen) | сервис `ToggleFullscreen`: графы, скрипты, `GameUi` |
| [AppNetwork](https://v2.quasar.dev/quasar-plugins/app-network) | плагин Quasar |
| [AppVisibility](https://v2.quasar.dev/quasar-plugins/app-visibility) | плагин Quasar ($q.appVisible) |
| [AppWakeLock](https://v2.quasar.dev/quasar-plugins/app-wake-lock) | плагин Quasar |
| [BottomSheet](https://v2.quasar.dev/quasar-plugins/bottom-sheet) | сервис `BottomSheet`: скрипты, `GameUi.BottomSheet` → Task |
| [Brand](https://v2.quasar.dev/style/color-palette) | CSS-переменные `--q-primary`… — их задаёт кит |
| [Cookies](https://v2.quasar.dev/quasar-plugins/cookies) | плагин Quasar как есть (cookies — понятие браузера; настройки и файлы — `SettingsStorage`) |
| [Dark](https://v2.quasar.dev/quasar-plugins/dark) | следует теме (тёмная тема Tailwind/Quasar включает тёмный режим Quasar) |
| [Dialog](https://v2.quasar.dev/quasar-plugins/dialog) | сервис `Dialog` (alert, confirm, prompt, options): скрипты, `GameUi.Dialog` → Task |
| [IconSet](https://v2.quasar.dev/options/quasar-icon-sets) | Material Icons (шрифт в модуле, грузится браузером по требованию) |
| [Lang](https://v2.quasar.dev/options/quasar-language-packs) | сервис `SetLanguage` (языковых пакетов: 74, ленивые чанки); язык задаёт CSTables |
| [Loading](https://v2.quasar.dev/quasar-plugins/loading) | сервис `ShowLoading`/`HideLoading`: графы, скрипты, `GameUi` |
| [LoadingBar](https://v2.quasar.dev/quasar-plugins/loading-bar) | сервис `LoadingBar`: скрипты, `GameUi.LoadingBar` |
| [LocalStorage](https://v2.quasar.dev/quasar-plugins/web-storage) | через хранилище движка: `ConfigureQuasarStorage` (на странице игры — свой `SettingsStorage`) |
| [Meta](https://v2.quasar.dev/quasar-plugins/meta) | плагин Quasar (`useMeta` в скриптах) |
| [Notify](https://v2.quasar.dev/quasar-plugins/notify) | сервис `Notify`: графы узлов, скрипты, `GameUi.Notify` |
| [Platform](https://v2.quasar.dev/options/platform-detection) | устанавливается вместе с Quasar ($q.platform) |
| [Screen](https://v2.quasar.dev/options/screen-plugin) | устанавливается вместе с Quasar ($q.screen) |
| [SessionStorage](https://v2.quasar.dev/quasar-plugins/web-storage) | через хранилище движка (по умолчанию память страницы) |

## Утилиты и composables

Доступны скриптам UI-документов и игры: `import { date, copyToClipboard, useInterval } from "quasar"` (одна копия Quasar на
странице: Core и `@cse/ui` берут исходники Quasar).

- **Утилиты (24):** `clone`, `colors`, `copyToClipboard`, `createMetaMixin`, `createUploaderComponent`, `date`, `debounce`, `dom`, `EventBus`, `event`, `exportFile`, `extend`, `format`, `frameDebounce`, `getCssVar`, `is`, `morph`, `openURL`, `patterns`, `runSequentialPromises`, `scroll`, `setCssVar`, `throttle`, `uid`.
- **Composables (30):** `useAnimationFrame`, `useBroadcastChannel`, `useDebounce`, `useDialogPluginComponent`, `useDropZone`, `useElementSize`, `useEventListener`, `useEventSource`, `useFilePicker`, `useFormChild`, `useHydration`, `useId`, `useIdle`, `useIntersection`, `useKeyboardShortcut`, `useInterval`, `useMeta`, `useMutation`, `useObjectUrl`, `useQuasar`, `useRenderCache`, `useScroll`, `useSoftFullscreen`, `useSplitAttrs`, `useThrottle`, `useTick`, `useTimeout`, `useWebSocket`, `useWebWorker`, `useWebWorkerFn`.

## Итого

- Компонентов: 122, все в палитре, инспекторе и рантайме; директив: 13; плагинов: 20; языков: 74.
- Своих правил: Windows — 75, Tailwind — 37; остальные одеты токенами кита.
- Снимков: 288 (96 компонентов × 3 кита, 5 состояний на снимке).
