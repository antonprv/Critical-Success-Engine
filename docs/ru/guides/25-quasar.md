[English](../../en/guides/25-quasar.md) | **Русский**

# 25. Quasar в UI-документах

Каждый компонент [Quasar](https://quasar.dev/docs/) 2 — виджет UI-документов: в палитре UIDesigner, в его инспекторе, в
играх и инструментах в рантайме, в трёх китах (Windows, Tailwind, Quasar). Плагины Quasar — сервисы движка, директивы —
настройки виджета, утилиты и composables доступны скриптам. Что где есть — в [docs/quasar-coverage.md](../../quasar-coverage.md);
аудит, с которого всё началось, — в [docs/quasar-audit.md](../../quasar-audit.md).

## Виджеты

Тип Quasar-виджета — тег компонента: `q-btn`, `q-input`, `q-table`. Палитра группирует их как документация Quasar
(Quasar: Layout, Forms, Data…); брошенный на холст виджет сразу с тем, что нужно, чтобы что-то показать (select с
вариантами, таблица с колонками и строками, вкладки со вкладками).

```json
{ "Name": "Search", "Type": "q-input", "X": 16, "Y": 16, "Width": 260, "Height": 56,
  "Props": { "label": "Search", "outlined": true, "debounce": "200" },
  "Children": [ { "Name": "SearchIcon", "Type": "q-icon", "Slot": "append", "Props": { "name": "search" }, ... } ] }
```

- **Свойства:** любые свойства компонента в JSON (имена Quasar: `icon-right`, `row-key`). Инспектор показывает их по
  категориям Quasar, у каждого — редактор по типу и описание из Quasar; незаданное свойство — значение Quasar по
  умолчанию. То, что JSON не выразит (функции, элементы), задаётся из скриптов.
- **Слоты:** дочерний виджет идёт в слот, который называет (`Slot`), иначе в слот по умолчанию; дети Quasar-виджета
  располагаются его разметкой (строка тулбара, колонка списка), а не по своим X и Y.
- **Текст:** `Content` — текст слота по умолчанию, пока в виджете нет других виджетов (строка секции карточки).
- **Значение:** у компонента с `v-model` есть значение виджета: `SetValue` из скриптов и игры, событие `change` при изменении.
- **События:** каждое событие компонента — событие виджета для графов узлов, скриптов и игры:
  `this.On("Search", "keyup", ...)`. Методы: `this.Widget<QuasarController>("Dialog").Call("show")`.
- **Директивы:** `"Directives": { "ripple": true, "touch-swipe:mouse.left": true }` (синтаксис Vue без `v-`); директивы
  с обработчиком (касания, прокрутка, видимость…) поднимают на виджете событие с именем директивы.
- **Валидация:** `rules` поля — имена правил Quasar (`"email"`, `"date"`) и описания:
  `{ "Rule": "required" | "min-length" | "max-length" | "min" | "max" | "pattern", "Value": ..., "Message": "..." }`.

## Киты

У `WinThemeProvider` три кита: Classic (Windows 98…7), Tailwind и Quasar.

- **Quasar:** собственный вид Quasar; цвета бренда берутся из палитры Tailwind (акцент, нейтраль, скругление, тёмный режим).
- **Classic и Tailwind** сами одевают компоненты Quasar: выпуклые кнопки и вдавленные поля Windows, градиенты Luna и
  Aero; плоский вид Tailwind с кольцами фокуса. CSS Quasar лежит в каскадном слое под их слоями
  (`@layer cse-quasar-force, quasar, cse-quasar`), поэтому порядок загрузки стилей ничего не меняет.
- Всплывающие элементы (диалоги, меню, подсказки, уведомления) попадают в `#cse-portals`, который носит последнюю
  показанную тему: они выглядят как всё остальное, а сама страница не перекрашивается. Тёмная тема включает тёмный режим Quasar.
- Тема переключается сразу, без перезагрузки (свойства провайдера `kit`, `theme`, `tailwind`).

## Сервисы

Плагины Quasar — через движок:

| | Действие графа узлов | Скрипт (`UiScript`) | Игра (`GameUi`) |
|---|---|---|---|
| Уведомление | Notify | `this.Notify(text, type)` | `Notify(options)` |
| Диалог (alert, confirm, prompt, options) | | `await this.Quasar.Dialog(options)` | `await Dialog(options)` |
| Нижняя панель действий | | `this.Quasar.BottomSheet(options)` | `BottomSheet(options)` |
| Экран загрузки | Show / Hide loading screen | `ShowLoading`, `HideLoading` | `ShowLoading`, `HideLoading` |
| Полоса загрузки | | `this.Quasar.LoadingBar("start")` | `LoadingBar("start")` |
| Полный экран | Full screen on / off | `ToggleFullscreen()` | `ToggleFullscreen()` |
| Тексты Quasar на языке | | `this.Quasar.SetLanguage("ru")` | |

`GameUi` также задаёт свойства Quasar-виджета (`SetProp`), значение (`SetValue`) и список (`SetItems`: варианты select,
строки таблицы, узлы дерева).

`LocalStorage` и `SessionStorage` Quasar хранят данные в хранилищах движка (`ConfigureQuasarStorage`; на странице игры —
свой `SettingsStorage`). Утилиты и composables импортируются из `"quasar"` как обычно: Quasar на странице один.

## Приложения и утилиты

UI-документы — это и целые приложения (см. образцы в `Modules/Engine/UI/Content/Samples`: редактор свойств, окно
настроек, таблица данных с фильтром — собраны из палитры, без CSS).

- **Привязка данных:** `"Bindings": { "filter": "Query" }` — свойство следует за переменной документа; `model-value`
  в обе стороны (переменная задаёт значение, ввод пользователя — переменную). В дизайнере — раздел Bindings.
- **Горячие клавиши:** `"Hotkeys": { "Ctrl+S": "SaveButton" }` у макета нажимает виджет, пока документ показан.
- **Экраны:** `UiManager.Navigate(id)` и `Back()`; действия графа «Go to screen» и «Go back».
- **Буфер обмена:** действие «Copy to clipboard», `this.CopyToClipboard(text)`.
- Окна, диалоги, меню (`q-menu` с `context-menu`), фокус, валидация, drag-and-drop (`v-drop-zone`) и остальное дают
  тулкит и компоненты Quasar.

## Производительность

Quasar грузится с первым Quasar-виджетом на странице: игра без них не скачивает ничего. Каждый компонент — отдельный
чанк (`q-btn` 3 КБ, `q-input` 6 КБ, `q-table` 7 КБ в gzip), установка Quasar — 4 КБ, его CSS — 42 КБ, шрифт иконок
(129 КБ) — только когда рисуется иконка. Поверх игры Quasar-виджеты — обычный DOM: для HUD при 600 fps держитесь
лёгких (кнопки, бейджи, чипы, прогресс, подписи), списки — через `q-virtual-scroll`, а тяжёлые (таблица, редактор,
выбор даты и цвета) оставьте меню и инструментам.

## Скриншотные тесты

`E2E/quasar.spec.ts` снимает каждый неподвижный компонент в каждом ките в пяти состояниях (обычное, наведение, фокус,
отключён, ошибка): `quasar.html?kit=classic&only=QBtn` показывает то же в браузере. После намеренного изменения вида:
`pnpm test:e2e --update-snapshots`.
