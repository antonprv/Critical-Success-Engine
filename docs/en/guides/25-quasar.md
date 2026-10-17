**English** | [Русский](../../ru/guides/25-quasar.md)

# 25. Quasar in UI documents

Every component of [Quasar](https://quasar.dev/docs/) 2 is a widget of UI documents: in the UI Designer's palette, in
its inspector, in games and tools at run time, in the three kits (Windows, Tailwind, Quasar). Quasar's plugins are the
engine's services, its directives are widget settings, its utilities and composables are there for scripts. What exists
where is in [docs/quasar-coverage.md](../../quasar-coverage.md); the audit that started it, in
[docs/quasar-audit.md](../../quasar-audit.md).

## Widgets

A Quasar widget's type is the component's tag: `q-btn`, `q-input`, `q-table`. The palette groups them as Quasar's
documentation does (Quasar: Layout, Forms, Data...); dropped on the canvas, a widget comes with what it needs to show
something (a select with options, a table with columns and rows, tabs with tabs).

```json
{ "Name": "Search", "Type": "q-input", "X": 16, "Y": 16, "Width": 260, "Height": 56,
  "Props": { "label": "Search", "outlined": true, "debounce": "200" },
  "Children": [ { "Name": "SearchIcon", "Type": "q-icon", "Slot": "append", "Props": { "name": "search" }, ... } ] }
```

- **Props:** any of the component's, as JSON (Quasar's names: `icon-right`, `row-key`). The inspector lists them by
  Quasar's categories, each with an editor of its kind and Quasar's description; a prop left unset is Quasar's default.
  Props JSON can't hold (functions, elements) are set from scripts.
- **Slots:** a child widget goes into the slot it names (`Slot`), the default one otherwise; children of a Quasar widget
  flow in its layout (a toolbar's row, a list's column) instead of sitting at their X and Y.
- **Text:** `Content` is the default slot's text while the widget holds no other widgets (a card section's line).
- **Value:** a component with a `v-model` has the widget's value: `SetValue` from scripts and the game, the `change`
  event when it changes.
- **Events:** every event of the component is an event of the widget, for node graphs, scripts and the game:
  `this.On("Search", "keyup", ...)`. Methods: `this.Widget<QuasarController>("Dialog").Call("show")`.
- **Directives:** `"Directives": { "ripple": true, "touch-swipe:mouse.left": true }` (Vue's syntax without `v-`);
  directives that call a handler (touch, scroll, intersection...) raise an event of their name on the widget.
- **Validation:** a field's `rules` are Quasar's rule names (`"email"`, `"date"`) and specs:
  `{ "Rule": "required" | "min-length" | "max-length" | "min" | "max" | "pattern", "Value": ..., "Message": "..." }`.

## Kits

`WinThemeProvider` has three kits: Classic (Windows 98...7), Tailwind and Quasar.

- **Quasar:** Quasar's own look; its brand colours come from the Tailwind palette (accent, neutral, radius, dark).
- **Classic and Tailwind** dress Quasar's components themselves: bevelled Windows buttons and sunken fields, Luna and
  Aero gradients; Tailwind's flat look with rings. Quasar's CSS is in a cascade layer under theirs
  (`@layer cse-quasar-force, quasar, cse-quasar`), so the order styles load in never matters.
- Pop-ups (dialogs, menus, tooltips, notifications) go into `#cse-portals`, which wears the theme shown last: they look
  like the rest without the page itself being restyled. A dark theme turns on Quasar's dark mode.
- The theme switches at once, without reloading (`kit`, `theme`, `tailwind` props of the provider).

## Services

Quasar's plugins, through the engine:

| | Node graph action | Script (`UiScript`) | Game (`GameUi`) |
|---|---|---|---|
| Notification | Notify | `this.Notify(text, type)` | `Notify(options)` |
| Dialog (alert, confirm, prompt, options) | | `await this.Quasar.Dialog(options)` | `await Dialog(options)` |
| Bottom sheet | | `this.Quasar.BottomSheet(options)` | `BottomSheet(options)` |
| Loading screen | Show / Hide loading screen | `ShowLoading`, `HideLoading` | `ShowLoading`, `HideLoading` |
| Loading bar | | `this.Quasar.LoadingBar("start")` | `LoadingBar("start")` |
| Full screen | Full screen on / off | `ToggleFullscreen()` | `ToggleFullscreen()` |
| Quasar's texts in a language | | `this.Quasar.SetLanguage("ru")` | |

`GameUi` also sets a Quasar widget's props (`SetProp`), value (`SetValue`) and list (`SetItems`: a select's options, a
table's rows, a tree's nodes).

Quasar's `LocalStorage` and `SessionStorage` keep their data in the engine's stores (`ConfigureQuasarStorage`; on a
game's page, a `SettingsStorage` of its own). Utilities and composables are imported from `"quasar"` as usual: the
page has one Quasar.

## Apps and tools

UI documents are whole applications too (see the samples in `Modules/Engine/UI/Content/Samples`: a property editor, a
settings window, a data table with a filter - made of palette widgets, no CSS).

- **Data binding:** `"Bindings": { "filter": "Query" }` - a prop follows a document variable; `model-value` goes both
  ways (the variable sets the value, what the user enters sets the variable). In the designer: the Bindings section.
- **Shortcuts:** `"Hotkeys": { "Ctrl+S": "SaveButton" }` on the layout presses the widget while the document is shown.
- **Screens:** `UiManager.Navigate(id)` and `Back()`; node graph actions "Go to screen" and "Go back".
- **Clipboard:** the "Copy to clipboard" action, `this.CopyToClipboard(text)`.
- Windows, dialogs, menus (`q-menu` with `context-menu`), focus, validation, drag and drop (`v-drop-zone`) and the rest
  come from the toolkit and Quasar's components.

## Performance

Quasar is loaded on the first Quasar widget a page shows: a game without one downloads none of it. Each component is
a chunk of its own (`q-btn` 3 KB, `q-input` 6 KB, `q-table` 7 KB gzip), Quasar's install 4 KB, its CSS 42 KB, the
icon font (129 KB) only when an icon is drawn. Over a game, Quasar's widgets are plain DOM: for a HUD at 600 fps keep
to light ones (buttons, badges, chips, progress, labels), lists through `q-virtual-scroll`, and leave the heavy ones
(table, editor, date and colour pickers) to menus and tools.

## Screenshot tests

`E2E/quasar.spec.ts` photographs every component that holds still in each kit, in five states (normal, hovered,
focused, disabled, with an error): `quasar.html?kit=classic&only=QBtn` shows the same in a browser. After a change of
look on purpose: `pnpm test:e2e --update-snapshots`.
