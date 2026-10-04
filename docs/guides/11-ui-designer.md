# 11. Редактор интерфейсов: макеты, скрипты, формы, скины, свои виджеты

Интерфейс собирается мышью в редакторе, сохраняется ассетом, а поведение пишется скриптом. Устроено как система виджетов
Unreal Engine (UMG): макет - аналог Widget Blueprint, скрипт - аналог его графа или C++-родителя, виджеты находятся
по именам из редактора. Поверх этого - модель форм Windows Forms: события фокуса, жизненный цикл, валидация, диалоги.

Редактор: `pnpm dev`, затем `http://127.0.0.1:5173/designer.html` (в собранном сайте - `/designer.html`).
Он открывается на примере - окне входа (`Toolkit/Designer/Examples/LoginDialog.ui.json` + `LoginDialog.ts`).

## Работа в редакторе

- **Палитра** - щелчок добавляет виджет, перетаскивание на холст кладёт его туда, где отпустили: внутрь контейнера под
  курсором (холст, окно, рамка группы) или рядом с обычным виджетом.
- **Холст** - щелчок выделяет, перетаскивание двигает, ручки справа, снизу и в углу меняют размер; всё с привязкой
  к сетке 8 px. Одно перетаскивание - один шаг отмены.
- **Иерархия** - выбор, порядок наложения (▲▼), дублирование, удаление.
- **Свойства** - имя (его используют скрипты: только идентификатор, уникальный в макете), родитель, X/Y/ширина/высота,
  свойства виджета; Enter подтверждает поле. Для всего макета - имя и скрипт.
- **Клавиши** - Delete, Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, Ctrl+D, стрелки (с Shift - на шаг сетки), Escape - к родителю.
- **File** - New, Open (файл `.ui.json`), Save. **Preview** - интерфейс оживает, работает его скрипт, внизу журнал
  событий виджетов; диалоги, открытые скриптом, появляются поверх холста.

## Ассет макета

`.ui.json` - дерево виджетов: имя, тип, прямоугольник относительно родителя, свойства; у макета - имя, `Script` и
необязательный `Skin`. Загрузка проверяет структуру: неизвестные свойства отбрасываются, недостающие получают значения
по умолчанию (старые файлы продолжают открываться).

```ts
const layout = ParseLayout(text);                         // или import ... from "./My.ui.json?raw"
const document = new UiDocument(layout, { Scripts, Widgets, Dialogs });
// <WinLayoutView :document="document" />                   - нарисовать (в игре, приложении, где угодно)
```

## Скрипт

```ts
export class LoginDialogScript extends UiScript {
	public override OnConstruct(): void {
		const ok = this.Widget<ButtonController>("OkButton");      // по имени из редактора
		this.On("UserName", "change", () => ok.SetEnabled(this.Widget<TextBoxController>("UserName").Value !== ""));
		this.Validate("Password", (context) => {
			if (this.Widget<TextBoxController>("Password").Value.length < 4) context.Error("Password", "At least 4 characters");
		});
	}
}
const scripts = new UiScriptRegistry().Register("LoginDialog", LoginDialogScript);   // имя - в поле Script макета
```

`this.On(имя, событие, обработчик)` подписывает на события контроллера виджета (`click`, `change`...) и на события
документа (`enter`, `leave`, `validated`). Подписки и валидаторы снимаются сами, когда интерфейс закрывается.

## Соответствие Windows Forms

| Windows Forms | Здесь |
|---|---|
| `Load`, `Shown` | `OnLoad()` (виджеты созданы; рядом `OnConstruct()` из UMG), `OnShown()` (интерфейс впервые на экране) |
| `FormClosing` (с `Cancel`), `FormClosed` | `OnClosing(event)` - `event.Result`, `event.Cancel()`; `OnClosed(result)` |
| `Disposed` | `OnDisposed()` (и `OnDestruct()` из UMG) |
| `Enter`, `Leave` | события `"enter"` / `"leave"` у каждого виджета с контроллером |
| `Validating`, `Validated`, `ValidateChildren` | см. «Валидация» |
| `ErrorProvider` | невалидный виджет обводится, у правого края значок с текстом ошибки |
| `Button.DialogResult`, `Form.DialogResult` | свойство кнопки Dialog result; `document.Close(результат)`, `document.Result` |
| `AcceptButton`, `CancelButton` | свойства окна: Enter нажимает первую, Escape - вторую (без неё Escape закрывает с Cancel) |
| `ShowDialog()`, `MessageBox.Show()` | `this.ShowDialog(layout)`, `this.MessageBox(текст, заголовок, кнопки, значок)` - `Promise` с результатом |

Крестик в заголовке окна верхнего уровня закрывает форму с `Cancel` - через тот же `OnClosing`, который может отменить.

## Валидация

Запускается только специальной кнопкой: у кнопки со свойством **Validates its container** (`CausesValidation`)
щелчок сначала проверяет все виджеты внутри её контейнера (окна, рамки группы, холста), потом идут обработчики `click`.
Порядок:

1. `OnValidating(context)` скрипта - подготовить контекст: `context.Data` - любые общие данные (лимиты, справочники);
2. валидаторы каждого виджета контейнера, в порядке дерева: `(context, widget) => { ... context.Error(имя, текст) }`;
3. `OnValidated(context)` - проверки уровня формы, `context.Cancel(текст)` - ошибка без конкретного виджета;
4. ошибки показываются на виджетах; кнопке приходит событие `"validated"` с контекстом.

`context.IsValid`, `context.Errors`, `context.ErrorsFor(имя)`, `context.Container`, `context.Trigger` (кнопка).
Если у кнопки есть Dialog result, форма закрывается с ним только при успешной проверке и после обработчиков щелчка.
Из кода: `document.ValidateChildren(контейнер, данные)` - тот же прогон со своим контекстом.

## Диалоги

```ts
const dialogs = new DialogService();
// <WinDialogHost :service="dialogs" />                   - где показывать модальные окна
const document = new UiDocument(mainLayout, { Scripts, Dialogs: dialogs });
// в скрипте:
const answer = await this.MessageBox("Save changes?", "Notepad", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
const result = await this.ShowDialog(settingsLayout);    // DialogResult: OK, Cancel, Yes, No, Abort, Retry, Ignore
```

## Скины

Вкладка **Skin** в панели свойств: готовый скин или свой; часть интерфейса (кнопка, рамка окна, заголовок, флажок,
вкладка, полоса прокрутки... - 35 частей) и её состояние (обычное, наведение, нажатие, фокус, отключено, отмечено,
выбрано, кнопка по умолчанию, неактивное окно). Для каждой пары:

- **спрайт с нарезкой на 9 частей** - загрузить картинку, задать срез (сверху, справа, снизу, слева), толщину рамки,
  растяжение или повтор, заливку центра. Углы не искажаются, края и центр тянутся - как в игровых интерфейсах;
- фон (цвет или градиент), цвет текста, шрифт, размер шрифта, скругление, минимальная высота, отступ, тень.

Пустое поле снимает настройку - снова видна тема. Скин работает поверх обоих наборов оформления - Classic и Tailwind (гайд 10). Скин хранится в макете и применяется только к нему; Save skin /
Open skin переносят его между макетами. Два примера - **Celestial** (светлое приключение) и **Grimoire** (тёмное
фэнтези), все их спрайты нарисованы в SVG прямо в коде (`Toolkit/Skins/SkinPresets.ts`). Вне макетов скин можно дать
теме: `<WinThemeProvider :theme="..." :skin="skin">`.

## Свои виджеты на Vue

Все виджеты, включая встроенные, - записи в `WidgetRegistry`. Свой подключается одной регистрацией и дальше живёт
наравне со встроенными: в палитре, панели свойств, файлах, рантайме, скриптах, скинах.

```ts
const widgets = BuiltInWidgets.Extend().Register({
	Type: "rating", Label: "Rating", Container: false, Size: [100, 20],
	Props: [{ Key: "Max", Label: "Stars", Kind: PropKind.Number, Default: 5 }],
	Events: ["change"],                                       // попадут в журнал предпросмотра и в this.On(...)
	CreateController: (node) => UseControl(new RatingController(node.Props["Max"] as number)),
	Component: Rating,                                         // любой Vue-компонент: props node, controller, document
});
// <WinDesigner :widgets="widgets" />,  new UiDocument(layout, { Widgets: widgets }),  ParseLayout(text, widgets)
```

Контейнер (`Container: true`) получает своих детей в default-слот. Виды свойств: текст, число, флажок, строки
(список), выбор из `Choices`. Пример полного пути - `Tests/Toolkit/Designer/Widgets.test.ts`.
