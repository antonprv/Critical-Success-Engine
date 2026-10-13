**English** | [Русский](../../ru/guides/10-ui-toolkit.md)

# 10. UI Toolkit: Windows 98 - 7 style interfaces

A set of Vue components separate from the game, reproducing Windows elements from 98 to 7 with all their familiar behaviours.
The code is the module `src/CSEngine/Modules/Engine/UI` (the `@cse/ui` package, its `Source/` folder), a live demo is that module's gallery
(`Source/Gallery`): `pnpm dev` in the module folder, then `http://127.0.0.1:5176/`. The "More controls" window
waits minimised on the taskbar: it has a text box, a spinner, a combo box, a scroll bar, a toolbar, a tooltip
and a button that opens a message box.

## How each element is built

Every element has two parts:

- the **controller** (`Source/Controls/*Controller.ts`) - all the logic and all the state, pure TypeScript without a DOM. It can be
  created, read and changed from code, and tested without a browser;
- the **component** (`Source/Components/Win*.vue`) - only draws the controller's state and passes it mouse and keyboard input.

Extension points:

- **flags and variables** - all the internal state lives in the controller's public fields: `button.Pressed`, `window.State`,
  `list.SelectedIndices`, `menu.OpenPath`... Read-only fields are changed with methods (`SetEnabled`, `Minimize`, `Select`...);
- **events** - every controller has `Events`: `On(name, handler)` returns an unsubscribe function, there's also `Once`.
  Events ending in `-ing` (`closing`, `selecting`) receive an object with `Cancel()`: a subscriber can forbid the action;
- components repeat the same events as ordinary Vue events (`@click`, `@change`...) and expose the controller through `defineExpose`.

Common to all controls (`ControlBase`): the flags `Enabled`, `Visible`, `Focused`, `Hovered` and the events
`enabled-change`, `visible-change`, `focus-change`, `hover-change`.

## Example

```vue
<script setup lang="ts">
import { ButtonController, UseControl, WinButton, WinDesktop, WinTheme, WinThemeProvider, WinWindow, WindowController, WindowManager } from "@cse/ui";

const dialog = UseControl(new WindowController({ Title: "Save changes?", Width: 300, Height: 120 }));
const save = UseControl(new ButtonController({ Label: "Save", IsDefault: true }));
const manager = UseControl(new WindowManager());
manager.Add(dialog); // z-order, activation, taskbar

save.Events.On("click", () => dialog.RequestClose());
dialog.Events.On("closing", (event) => { if (!save.Enabled) event.Cancel(); });
</script>

<template>
	<WinThemeProvider :theme="WinTheme.XpBlue">
		<WinDesktop :manager="manager">
			<WinWindow :controller="dialog" :manager="manager">
				<WinButton :controller="save" />
			</WinWindow>
		</WinDesktop>
	</WinThemeProvider>
</template>
```

**Important:** create the controllers you change from code with `UseControl(new ...)` and keep that reference. `UseControl`
makes the object reactive, and the changes are immediately visible on screen; Vue won't see changes to a "raw" object.
If no controller is passed, the button, checkbox, progress bar and text box components create their own (the button's `label` sets the caption).

## Themes

`WinThemeProvider :theme="WinTheme.X"` styles everything inside. 12 themes in three families (`ThemeFamily`):

| Family | Themes |
|---|---|
| Classic (3D borders) | `Win98`, `WinMe`, `Win2000`, `Classic` (the classic scheme of XP, Vista and 7) |
| Luna (XP) | `XpBlue`, `XpOlive`, `XpSilver`, `XpRoyale` |
| Aero (Vista and 7) | `VistaBasic`, `VistaAero`, `Win7Basic`, `Win7Aero` (Aero is blurred glass, Basic is an opaque frame) |

`AllThemes` is a list with names and years, `GetTheme(id)` is the description of one theme. Each theme's colours are CSS variables
in `Source/Styles/classic-kit.css` (`--face`, `--title-1`, `--select`...): you can make your own theme by overriding them.

## Style kits: Classic and Tailwind

The same components, controllers, events, skins and editor - two sets of styles (`WinKit`):

- **Classic** - the Windows 98 - 7 themes above; the styles are `Source/Styles/classic-kit.css`, all rules inside `.win-kit--classic`;
- **Tailwind** - every component is drawn with Tailwind CSS 4 utilities on its design tokens (`Source/Styles/tailwind-kit.css`).
  The kit's theme (`TailwindTheme`, `Source/Core/Kits.ts`):
  - `Accent` - any of the 26 Tailwind palettes (red ... rose, as well as slate ... taupe);
  - `Neutral` - the grey family for surfaces, lines and text: slate, gray, zinc, neutral, stone, mauve, olive, mist, taupe;
  - `Dark` - light or dark mode;
  - `Radius` - the Tailwind radius scale: none, xs ... 4xl, full.

```vue
<WinThemeProvider :theme="WinTheme.XpBlue" :kit="WinKit.Tailwind" :tailwind="{ Accent: 'emerald', Neutral: 'slate', Dark: true, Radius: 'lg' }">
```

The components use semantic colours (`panel`, `ink`, `line`, `primary`, `selected`...), which the theme maps to its own
palettes - so everything switches on the fly. A skin is applied over any kit the same way: it relies on the same
semantic component classes (`win-button--pressed`, `win-window--inactive`...). In the gallery the Tailwind kit and theme
are chosen in the Themes window, in the editor - at the top right. Your own kit is one more stylesheet on the same classes,
inside its own kit class.

## Elements

| Component + controller | State (fields) | Events | Behaviour |
|---|---|---|---|
| `WinButton` / `ButtonController` | `Label`, `IsDefault`, `Pressed` | `press`, `release`, `click` | mouse press, a click only on release over the button; Space presses, Enter clicks; `PerformClick()` |
| `WinCheckBox` / `CheckBoxController` | `State` (`CheckState`), `Checked`, `ThreeState`, `Label` | `change(state, previous)` | click and Space; three states per `ThreeState` |
| `WinRadioGroup` / `RadioGroupController` | `Value`, `Options` (with `Disabled`) | `change(value, previous)` | arrows cycle round, disabled ones are skipped |
| `WinProgressBar` / `ProgressBarController` | `Value`, `Min`, `Max`, `Percent`, `Marquee`, `State` (`ProgressState`) | `change`, `complete`, `state-change`, `marquee-change` | `Step()`; a running marquee bar; green/yellow/red as in Vista and 7 |
| `WinTabs` / `TabsController` | `SelectedId`, `Tabs` | `selecting` (cancellable), `change` | arrows, Home/End, Ctrl+Tab; a page is a slot with the tab's id |
| `WinSlider` / `SliderController` | `Value`, `Fraction`, `Step`, `PageSize`, `Ticks` | `change` | mouse on the track and dragging, arrows, PageUp/PageDown, Home/End |
| `WinListView` / `ListViewController` | `Items`, `SelectedIndices`, `SelectedItems`, `FocusedIndex`, `SelectionMode`, `SortColumn`, `SortDirection` | `selection-change`, `activate`, `sort` | selection like in Explorer (Ctrl, Shift, Ctrl+A), keys, sorting by a column keeping the selection |
| `WinTreeView` / `TreeViewController` | `SelectedId`, `VisibleNodes`, `IsExpanded(id)` | `expand-change`, `selection-change`, `activate` | +/-, tree keys (right expands and steps in, left collapses and steps up) |
| `WinMenuBar` / `MenuController` | `OpenPath`, `HighlightedId`, `Items` | `open-change`, `invoke`, `check-change` | submenus, `&File` mnemonics and Alt+letter, checkable items, separators, switching between menus by hovering |
| `WinWindow` / `WindowController` | `X`, `Y`, `Width`, `Height`, `State` (`WindowState`), `Active`, `Dragging`, `Resizing`, `Closed` | `move`, `resize`, `state-change`, `closing` (cancellable), `close`, `activate`, `deactivate`, `drag-*`, `resize-*` | dragging by the title bar, 8 edges for resizing with a minimum, minimise/maximise/restore, double-click on the title bar |
| `WinDesktop` + `WindowManager` | `Windows` (by depth), `TaskOrder`, `ActiveWindow` | `active-change` | window order, one active, cascade; the taskbar: clicking the active one minimises it, another - raises it |
| `WinTextBox` / `TextBoxController` | `Value`, `SelectionStart`, `SelectionEnd`, `SelectedText`, `MaxLength`, `ReadOnly`, `Password`, `Placeholder`, `Multiline` | `change`, `select` | user input respects `ReadOnly` and `MaxLength`, `SetValue` from code - only `MaxLength`; Ctrl+A |
| `WinSpinner` / `SpinnerController` | `Value`, `Min`, `Max`, `Step`, `Wrap` | `change` | buttons and arrows - a step, PageUp/PageDown - ten steps, Home/End; a typed number is validated on commit (`CommitText`) |
| `WinComboBox` / `ComboBoxController` | `SelectedIndex`, `SelectedOption`, `HighlightedIndex`, `Open`, `Options` | `change`, `open-change` | closed: arrows change the selection; F4 and Alt+arrow open; Enter selects, Escape closes; a letter finds the next item, cycling round |
| `WinScrollBar` / `ScrollBarController` | `Value`, `MaxValue`, `PageSize`, `SmallChange`, `ThumbSize`, `ThumbPosition`, `Horizontal` | `scroll` | arrows - a line, a click on the track - a page toward the click, the thumb is draggable, the thumb size is proportional to the page |
| `WinMessageBox` / `MessageBoxController` | `Title`, `Text`, `Icon`, `Buttons`, `Results`, `DefaultButton`, `Result`, `Closed` | `close(result)` | modal; all the classic button sets; Enter - the default button; Escape and the close button - Cancel (or OK if there's only one button), unavailable for Yes/No |
| `WinTooltip` / `TooltipController` | `Text`, `Delay` (500 ms), `AutoPopDelay` (5 s), `Shown` | `show`, `hide` | appears if the pointer lingers on an element; hides on leaving, on a press, or by itself after `AutoPopDelay` |
| `WinStatusBar` / `StatusBarController` | `Panels` (`Text`, `Width`) | `change` | `SetText(index, text)`; panels without a width share the remainder; it sticks to the bottom of the window by itself |
| `WinToolbar` / `ToolbarController` | `Buttons` (`Toggle`, `Group`, `Pressed`, `Disabled`), `IsPressed(id)` | `click`, `toggle` | sticky buttons, groups like radio buttons, `SetDisabled(id)` |
| `WinGroupBox` | - (only `title`) | - | a frame with a caption around a group of elements |

`WinComboBox` accepts the `embedded` property (`true` by default): the list lies inside the window and is clipped by it. With
`embedded: false` the list is moved to the theme's root (`.win-root`), positioned on screen (`position: fixed`) and can
extend beyond the window; in the designer it's the Embed in window bounds checkbox (guide 11).

## Tests

The controllers and components were written with TDD and are 100% covered (`Tests/`); the gallery is checked in a real
browser by the module's `E2E/toolkit.spec.ts` (mouse, keyboard, all themes).

## Touch elements: the stick and the game button

For touch controls in games there are a virtual stick and a game button. They exist in all themes of both kits
(the classic themes draw them with their raised and pressed look, Luna and Aero with a gradient, Tailwind with palette
tokens), in documents and in the designer's palette ("Stick (touch)", "Game button (touch)").

**`JoystickController`** + `WinJoystick`: the knob follows the finger within a radius (0.3 of the element's size),
`X` and `Y` go from -1 to 1, up and left are negative (like a gamepad stick), with a radial dead zone
`DeadZone` (beyond it the value is recomputed from 0). A finger that has moved outside the stick keeps controlling it
(pointer capture); a second finger doesn't take the stick over. A released knob springs back to the centre (`Returning`, animated).
Events: `move(x, y)` - only on change, `release`.

**`GameButtonController`** + `WinGameButton`: pressed while a finger holds it - one at a time, so other buttons
can be pressed with other fingers. When pressed, the button sinks in and is highlighted with the theme's selection colour.
Events: `press`, `release`, `click` (released over the button).

```ts
const stick = new JoystickController({ DeadZone: 0.15 });
stick.Events.On("move", (x, y) => Move(x, y));
const jump = new GameButtonController({ Label: "Jump" });
jump.Events.On("press", () => Jump());
```

Animations are turned off with the system "reduce motion" setting. The showcase has a "Touch controls" window on the
taskbar: a stick that shows its position and the buttons A, B, Jump.
