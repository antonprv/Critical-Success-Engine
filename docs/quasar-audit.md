# Аудит Quasar (S6-08, первая часть)

Состояние на начало S6-08. Пути — от `src/CSEngine`.

## Версии и подключение

| Что | Есть | Где |
|---|---|---|
| Vue | 3.5 | все пакеты UI (`Core`, `Modules/Engine/UI`, `Modules/Editor/*`) |
| Quasar | **2.34.0** (Quasar 2 на Vue 3, апгрейд не нужен) | только `Core/package.json` |
| Подключение | `@quasar/vite-plugin` 2.0 (автоимпорт компонентов шаблонов) | только `Core/vite.config.ts`, `Core/vitest.config.ts` |
| CSS Quasar | `quasar/dist/quasar.css` целиком, без `@layer` | `Core/Source/Ui/CreateUi.ts` |
| Наборы иконок, языковые пакеты | не подключены (Material Icons не грузятся) | — |
| Режим Electron Quasar CLI | не используется: Electron-оболочка своя (`Programs/Desktop`) | — |
| Лицензия | MIT (`node_modules/quasar/LICENSE`, © Razvan Stoenescu) | — |

## Что реально используется

| Часть Quasar | Где | Как |
|---|---|---|
| `QList`, `QItem`, `QItemSection` | `Core/Source/Ui/components/PauseMenu.vue` | старое меню паузы (до документов UI), с переопределением `.q-focus-helper` |
| Плагин `Notify` | `Core/Source/Ui/CreateUi.ts`, `Workers/OrchestratorUtils/UiBridge.ts` | всплывающие сообщения, когда экраны движка не документы (`documentScreens` = false) |
| Остальные компоненты, директивы, плагины, composables, утилиты | нигде | — |

Итого из ~130 компонентов, 12 директив, ~25 плагинов используются 3 компонента и 1 плагин, и только в старом
интерфейсе Core. Ни один UI-документ, ни UIDesigner, ни менеджер проектов Quasar не используют.

## Как устроен UI движка (что надо стыковать с Quasar)

- **Тулкит `@cse/ui`** (`Modules/Engine/UI`): свои контролы — контроллер без DOM (`Controls/*Controller.ts`, база
  `ControlBase`) плюс Vue-вид (`Components/Win*.vue`). Обёрток над Quasar нет.
- **UI-документы** (`*.ui.json`, `Documents/Layout.ts`): дерево узлов `LayoutNode {Name, Type, X, Y, Width, Height,
  Props, Children, Anchor*}`, абсолютное размещение с якорями (как WinForms). Тип узла ищется в `WidgetRegistry`
  (`Documents/Widgets.ts`): 18 встроенных типов.
- **Описание компонента для дизайнера:** `WidgetDefinition {Type, Label, Container, Size, Props: PropDefinition[],
  Events: string[], CreateController, Component}`; `PropKind`: text, number, boolean, lines, items, choice. Нет групп
  палитры, слотов, `v-model`, директив; события — просто имена; значения свойств — только строки, числа, флаги и
  списки строк (объекты и массивы объектов, нужные Quasar — колонки таблицы, узлы дерева — не выразить).
- **Рантайм:** `UiDocument` (контроллеры, события `On(name, event)`, переменные документа, валидация, результаты
  диалогов), `UiManager` и `UiHostModule` на главном потоке; игровой код шлёт команды `GameUi` через канал `ui`.
- **UIDesigner** (`Modules/Editor/UIDesigner`): палитра = `WidgetRegistry.Palette`, инспектор строится по
  `PropDefinition`, код — `GraphCodegen.ts` (TS-скрипт из графа узлов). Интерфейс самого дизайнера — тулкит `@cse/ui`.
- **Менеджер проектов** (`Modules/Editor/ProjectBrowser`): сам — UI-документы (`Content/*.ui.json`) на `@cse/ui`.

## Темы

| Тема | Как сделана | Выбор и хранение |
|---|---|---|
| Classic (Windows 98…7, 12 тем) | `Styles/classic-kit.css`: CSS-переменные (`--face`, `--select`, `--title-1`…) на `.win-theme--<id>`, классы `.win-family--*`; область `.win-kit--classic.win-root` | `WinThemeProvider` (`kit`, `theme`) |
| Tailwind | `Styles/tailwind-kit.css`: `@import "tailwindcss/theme" theme(static)`, семантические токены `@theme inline` (`--color-panel`, `--color-ink`, `--kit-*`), палитры акцента и нейтрали, радиус, тёмный режим | `WinThemeProvider` (`tailwind`) |
| Quasar | **нет** | — |

- Тема инструмента хранится в `localStorage` (`Core/ThemeMemory.ts`, ключ `cse.theme.<tool>`), тема игры — в
  `.cseproject` (`Ui.Theme`). `SettingsStorage` для тем не используется.
- **Tailwind и Quasar:** preflight Tailwind не подключён (только `tailwindcss/theme`), `@layer` нигде нет; CSS Quasar и
  CSS китов не слоёные и уживаются только за счёт префиксов классов (`win-*`, `tw-*`, `q-*`). При появлении Quasar
  внутри документов это не работает: CSS Quasar глобальный (типографика, `body`), а переопределения тем должны
  гарантированно его перебивать.
- Всплывающие элементы Quasar (`QDialog`, `QMenu`, `QTooltip`, `Notify`) телепортируются в `body`, за пределы
  `.win-root` — классы темы туда не доходят.

## Деревья, таблицы, диалоги, меню (то, что нужно инструментам, волна 0)

| Нужно | Есть в `@cse/ui` | Есть в Quasar |
|---|---|---|
| layout, toolbar, splitter | `WinToolbar`, `WinSplitter` (не виджеты документа) | `QLayout`, `QToolbar`, `QSplitter` |
| tree | `WinTreeView` (не виджет документа) | `QTree` |
| table | `WinListView` (список, без сетки) | `QTable` (сортировка, фильтр, пагинация, виртуальная прокрутка) |
| tabs | `WinTabs` (не виджет документа) | `QTabs`, `QTabPanels` |
| поля ввода, select, checkbox, toggle | textbox, combobox, checkbox (+ `WinSwitch` не в документах) | `QInput`, `QSelect`, `QCheckbox`, `QToggle` |
| кнопки, меню, контекстное меню | button, `WinMenuBar` | `QBtn`, `QMenu` (`context-menu`) |
| dialog, tooltip, notify | `WinMessageBox`, `WinTooltip`, toast | `QDialog`, `QTooltip`, `Notify` |
| scroll area, expansion item, icon | нет | `QScrollArea`, `QExpansionItem`, `QIcon` |

## Локализация

Нет нигде: все тексты в `.ui.json` и экранах движка — английские строки. Плагин Quasar `Lang` не используется.

## Чего не хватает (что делает S6-08)

1. Quasar-компоненты как типы узлов UI-документов (все, по метаданным из `quasar/dist/api/*.json`), с ленивой
   загрузкой: игра без Quasar его не грузит.
2. Метаданные для палитры и инспектора: группы, свойства с типами, значениями по умолчанию и допустимыми
   значениями, слоты как зоны, события, `v-model`, директивы.
3. Значения свойств-объектов и массивов в документах (`PropKind.Json`).
4. Третий кит — Quasar — и бэкпорт оформления Quasar-компонентов на Classic и Tailwind через слои
   (`@layer quasar, cse-quasar`), с классами темы и на телепортированных элементах.
5. Плагины Quasar как сервисы документов и игрового кода; LocalStorage/SessionStorage/Cookies через
   `SettingsStorage`, язык — через CSTables (S6-01), тёмный режим — через систему тем.
6. Таблица покрытия `docs/quasar-coverage.md`, скриншотные тесты по трём китам.
