# 10. UI Toolkit: интерфейсы в стиле Windows 98 - 7

Отдельный от игры набор Vue-компонентов, повторяющих элементы Windows от 98 до 7 со всеми их привычными поведениями.
Код - `src/CSEngine/Core/Source/Toolkit/`, живая демонстрация - страница `toolkit.html`
(`pnpm dev`, затем `http://127.0.0.1:5173/toolkit.html`; в собранном сайте - `/toolkit.html`). Окно «More controls»
ждёт на панели задач свёрнутым: в нём поле ввода, счётчик, комбобокс, полоса прокрутки, панель инструментов, подсказка
и кнопка, открывающая окно сообщения.

## Как устроен каждый элемент

У каждого элемента две части:

- **контроллер** (`Toolkit/Controls/*Controller.ts`) - вся логика и всё состояние, чистый TypeScript без DOM. Его можно
  создать, читать и менять из кода, тестировать без браузера;
- **компонент** (`Toolkit/Components/Win*.vue`) - только рисует состояние контроллера и передаёт ему ввод мыши и клавиатуры.

Точки расширения:

- **флаги и переменные** - всё внутреннее состояние лежит в открытых полях контроллера: `button.Pressed`, `window.State`,
  `list.SelectedIndices`, `menu.OpenPath`... Поля только для чтения меняются методами (`SetEnabled`, `Minimize`, `Select`...);
- **события** - у каждого контроллера есть `Events`: `On(имя, обработчик)` возвращает функцию отписки, есть `Once`.
  События с `-ing` на конце (`closing`, `selecting`) получают объект с `Cancel()`: подписчик может запретить действие;
- компоненты повторяют те же события как обычные Vue-события (`@click`, `@change`...) и отдают контроллер через `defineExpose`.

Общее для всех контролов (`ControlBase`): флаги `Enabled`, `Visible`, `Focused`, `Hovered` и события
`enabled-change`, `visible-change`, `focus-change`, `hover-change`.

## Пример

```vue
<script setup lang="ts">
import { ButtonController } from "./Toolkit/Controls/ButtonController";
import { WindowController } from "./Toolkit/Controls/WindowController";
import { WindowManager } from "./Toolkit/Controls/WindowManager";
import { WinTheme } from "./Toolkit/Core/Themes";
import { UseControl } from "./Toolkit/Core/UseControl";
import WinButton from "./Toolkit/Components/WinButton.vue";
import WinDesktop from "./Toolkit/Components/WinDesktop.vue";
import WinThemeProvider from "./Toolkit/Components/WinThemeProvider.vue";
import WinWindow from "./Toolkit/Components/WinWindow.vue";

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

**Важно:** контроллеры, которые меняешь из кода, создавай через `UseControl(new ...)` и держи эту ссылку. `UseControl`
делает объект реактивным, и изменения сразу видны на экране; у «сырого» объекта Vue изменений не увидит.
Если контроллер не передан, компоненты кнопки, флажка, прогресс-бара и поля ввода создают свой (`label` у кнопки задаёт подпись).

## Темы

`WinThemeProvider :theme="WinTheme.X"` оформляет всё внутри. 12 тем в трёх семействах (`ThemeFamily`):

| Семейство | Темы |
|---|---|
| Classic (объёмные рамки) | `Win98`, `WinMe`, `Win2000`, `Classic` (классическая схема XP, Vista и 7) |
| Luna (XP) | `XpBlue`, `XpOlive`, `XpSilver`, `XpRoyale` |
| Aero (Vista и 7) | `VistaBasic`, `VistaAero`, `Win7Basic`, `Win7Aero` (Aero - стекло с размытием, Basic - непрозрачная рамка) |

`AllThemes` - список с названиями и годами, `GetTheme(id)` - описание одной темы. Цвета каждой темы - CSS-переменные
в `Toolkit/Styles/toolkit.css` (`--face`, `--title-1`, `--select`...): свою тему можно сделать, переопределив их.

## Наборы оформления: Classic и Tailwind

Одни и те же компоненты, контроллеры, события, скины и редактор - два набора стилей (`WinKit`):

- **Classic** - темы Windows 98 - 7 выше; стили - `Toolkit/Styles/classic-kit.css`, все правила внутри `.win-kit--classic`;
- **Tailwind** - каждый компонент нарисован утилитами Tailwind CSS 4 на его дизайн-токенах (`Toolkit/Styles/tailwind-kit.css`).
  Тема набора (`TailwindTheme`, `Core/Kits.ts`):
  - `Accent` - любая из 26 палитр Tailwind (red ... rose, а также slate ... taupe);
  - `Neutral` - серая семья для поверхностей, линий и текста: slate, gray, zinc, neutral, stone, mauve, olive, mist, taupe;
  - `Dark` - светлый или тёмный режим;
  - `Radius` - шкала радиусов Tailwind: none, xs ... 4xl, full.

```vue
<WinThemeProvider :theme="WinTheme.XpBlue" :kit="WinKit.Tailwind" :tailwind="{ Accent: 'emerald', Neutral: 'slate', Dark: true, Radius: 'lg' }">
```

Компоненты используют смысловые цвета (`panel`, `ink`, `line`, `primary`, `selected`...), которые тема сводит к своим
палитрам - поэтому всё переключается на лету. Скин накладывается поверх любого набора одинаково: он опирается на те же
смысловые классы компонентов (`win-button--pressed`, `win-window--inactive`...). В галерее набор и тема Tailwind
выбираются в окне Themes, в редакторе - справа вверху. Свой набор - это ещё одна таблица стилей по тем же классам,
внутри своего класса набора.

## Элементы

| Компонент + контроллер | Состояние (поля) | События | Поведение |
|---|---|---|---|
| `WinButton` / `ButtonController` | `Label`, `IsDefault`, `Pressed` | `press`, `release`, `click` | нажатие мышью, клик только при отпускании над кнопкой; Space нажимает, Enter кликает; `PerformClick()` |
| `WinCheckBox` / `CheckBoxController` | `State` (`CheckState`), `Checked`, `ThreeState`, `Label` | `change(state, previous)` | клик и Space; три состояния по `ThreeState` |
| `WinRadioGroup` / `RadioGroupController` | `Value`, `Options` (с `Disabled`) | `change(value, previous)` | стрелки по кругу, недоступные пропускаются |
| `WinProgressBar` / `ProgressBarController` | `Value`, `Min`, `Max`, `Percent`, `Marquee`, `State` (`ProgressState`) | `change`, `complete`, `state-change`, `marquee-change` | `Step()`; бегущая полоса; зелёный/жёлтый/красный как в Vista и 7 |
| `WinTabs` / `TabsController` | `SelectedId`, `Tabs` | `selecting` (можно отменить), `change` | стрелки, Home/End, Ctrl+Tab; страница - слот с id вкладки |
| `WinSlider` / `SliderController` | `Value`, `Fraction`, `Step`, `PageSize`, `Ticks` | `change` | мышью по дорожке и перетаскиванием, стрелки, PageUp/PageDown, Home/End |
| `WinListView` / `ListViewController` | `Items`, `SelectedIndices`, `SelectedItems`, `FocusedIndex`, `SelectionMode`, `SortColumn`, `SortDirection` | `selection-change`, `activate`, `sort` | выделение как в Проводнике (Ctrl, Shift, Ctrl+A), клавиши, сортировка по колонке с сохранением выделения |
| `WinTreeView` / `TreeViewController` | `SelectedId`, `VisibleNodes`, `IsExpanded(id)` | `expand-change`, `selection-change`, `activate` | +/-, клавиши дерева (вправо раскрывает и входит, влево сворачивает и поднимается) |
| `WinMenuBar` / `MenuController` | `OpenPath`, `HighlightedId`, `Items` | `open-change`, `invoke`, `check-change` | подменю, мнемоники `&File` и Alt+буква, отмечаемые пункты, разделители, переход между меню наведением |
| `WinWindow` / `WindowController` | `X`, `Y`, `Width`, `Height`, `State` (`WindowState`), `Active`, `Dragging`, `Resizing`, `Closed` | `move`, `resize`, `state-change`, `closing` (можно отменить), `close`, `activate`, `deactivate`, `drag-*`, `resize-*` | перетаскивание за заголовок, 8 краёв для размера с минимумом, свернуть/развернуть/восстановить, двойной щелчок по заголовку |
| `WinDesktop` + `WindowManager` | `Windows` (по глубине), `TaskOrder`, `ActiveWindow` | `active-change` | порядок окон, одно активное, каскад; панель задач: щелчок по активному сворачивает, по другому - поднимает |
| `WinTextBox` / `TextBoxController` | `Value`, `SelectionStart`, `SelectionEnd`, `SelectedText`, `MaxLength`, `ReadOnly`, `Password`, `Placeholder`, `Multiline` | `change`, `select` | ввод пользователя учитывает `ReadOnly` и `MaxLength`, `SetValue` из кода - только `MaxLength`; Ctrl+A |
| `WinSpinner` / `SpinnerController` | `Value`, `Min`, `Max`, `Step`, `Wrap` | `change` | кнопки и стрелки - шаг, PageUp/PageDown - десять шагов, Home/End; набранное число проверяется при подтверждении (`CommitText`) |
| `WinComboBox` / `ComboBoxController` | `SelectedIndex`, `SelectedOption`, `HighlightedIndex`, `Open`, `Options` | `change`, `open-change` | закрытый: стрелки меняют выбор; F4 и Alt+стрелка открывают; Enter выбирает, Escape закрывает; буква ищет следующий пункт по кругу |
| `WinScrollBar` / `ScrollBarController` | `Value`, `MaxValue`, `PageSize`, `SmallChange`, `ThumbSize`, `ThumbPosition`, `Horizontal` | `scroll` | стрелки - строка, щелчок по дорожке - страница в сторону щелчка, бегунок перетаскивается, размер бегунка пропорционален странице |
| `WinMessageBox` / `MessageBoxController` | `Title`, `Text`, `Icon`, `Buttons`, `Results`, `DefaultButton`, `Result`, `Closed` | `close(result)` | модальное; все классические наборы кнопок; Enter - кнопка по умолчанию; Escape и крестик - Cancel (или OK, если кнопка одна), у Да/Нет недоступны |
| `WinTooltip` / `TooltipController` | `Text`, `Delay` (500 мс), `AutoPopDelay` (5 с), `Shown` | `show`, `hide` | появляется, если указатель задержался на элементе; прячется при уходе, нажатии или сам через `AutoPopDelay` |
| `WinStatusBar` / `StatusBarController` | `Panels` (`Text`, `Width`) | `change` | `SetText(индекс, текст)`; панели без ширины делят остаток; внизу окна прижимается сама |
| `WinToolbar` / `ToolbarController` | `Buttons` (`Toggle`, `Group`, `Pressed`, `Disabled`), `IsPressed(id)` | `click`, `toggle` | залипающие кнопки, группы как у переключателей, `SetDisabled(id)` |
| `WinGroupBox` | - (только `title`) | - | рамка с подписью вокруг группы элементов |

## Тесты

Контроллеры и компоненты написаны по TDD и покрыты на 100% (`Tests/Toolkit/`); страницу `toolkit.html` в настоящем
браузере проверяет `E2E/toolkit.spec.ts` (мышь, клавиатура, все темы).
