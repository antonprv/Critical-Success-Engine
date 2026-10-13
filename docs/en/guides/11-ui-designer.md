**English** | [Русский](../../ru/guides/11-ui-designer.md)

# 11. UI Designer: layouts, scripts, forms, skins, custom widgets

An interface is assembled with the mouse in the editor, saved as an asset, and its behaviour is written as a script. It's built like Unreal Engine's widget system
(UMG): a layout is the analogue of a Widget Blueprint, a script is the analogue of its graph or C++ parent, and widgets are found
by the names given in the editor. On top of that is the Windows Forms model: focus events, a lifecycle, validation, dialogs.

The designer is an editor module, not a part of the game: `src/CSEngine/Modules/Editor/UIDesigner` (the `@cse/ui-designer` package).
Only what it produces gets into the game: UI documents, their scripts and the runtime that shows them
(`Modules/Engine/UI/Source/Documents`, the public entry `@cse/ui`).

Running: `pnpm dev` in the module folder, then `http://127.0.0.1:5175/`. It opens on an example - a login window
(`Modules/Editor/UIDesigner/Source/Examples/LoginDialog.ui.json` + `LoginDialog.ts`).

## Working in the editor

- **The palette** - a click adds a widget, dragging onto the canvas puts it where you release: inside the container under the
  cursor (canvas, window, group box) or next to an ordinary widget.
- **The canvas** - a click selects, dragging moves, the handles on the right, bottom and corner resize; everything snaps
  to an 8 px grid. One drag is one undo step.
- **The hierarchy** - selection, stacking order (▲▼), duplicating, deleting.
- **Properties** - the name (scripts use it: an identifier only, unique within the layout), the parent, X/Y/width/height,
  the widget's properties; Enter confirms a field. For the whole layout - the name and the script.
- **Keys** - Delete, Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, Ctrl+D, arrows (with Shift - by a grid step), Escape - to the parent.
- **File** - New, Open (a `.ui.json` file), Save. **Preview** - the interface comes to life, its script runs, and at the bottom is a log of
  widget events; dialogs opened by the script appear over the canvas.

## Anchors and screen size

A widget's position is set by anchors, as in UMG: for each axis in the properties panel (Anchor X, Anchor Y) - one of the modes:

| Mode | What is stored | What happens on resize |
|---|---|---|
| Left / Top | the offset from the left or top edge, and the size | the widget stays at the start |
| Right / Bottom | the offset from the right or bottom edge, and the size | the widget moves with the edge |
| Center | the offset of the centre from the parent's centre, and the size | the widget stays in the middle |
| Stretch | the offsets from both sides | the widget stretches |

The offset is stored relative to its own edge, so the interface is rearranged by CSS itself - with no code and no scroll bars.
Changing the anchor doesn't move the widget: the editor recalculates the offsets. The captions of the geometry fields change with the mode.

Above the canvas is the **Screen** list: the size of the layout itself (the root's width and height) or common resolutions from
640×480 to 2560×1440, a phone and a tablet. It works both while editing and in the preview. The editor's side panels
are resized by splitters; a double click on a splitter returns the original width.

## Click pass-through: who gets the mouse

When a document is shown over the game, who gets a click is decided by the document itself, not by the engine's guess:

- **on the document** (the Layout section) the checkbox is on by default: empty areas of the document let clicks through to the game (a HUD).
  When it's off - the document covers the whole game (a pause menu: objects in the background can't be picked);
- **on a widget** the checkbox is off by default: the widget catches clicks itself. When on - clicks pass through it to what's
  under it (a crosshair over the game). On a container the checkbox concerns only the container itself: a button inside a transparent panel
  stays clickable.

Only what differs from the defaults is stored in the file (`"ClickThrough": true` on a widget, `"ClickThrough": false` on a
document). In the designer's canvas the checkboxes don't affect selection.

## Embed in window bounds: drop-down lists outside the window

In Windows Forms a combo box's list can extend beyond the form's bounds. On the web a window clips everything inside it
(`overflow`), so every widget has an **Embed in window bounds** checkbox (the properties panel, next to Click
pass-through):

- **on (the default)** - the widget's popup part stays inside the window and is clipped by its bounds, as before;
- **off** - the list "floats" over the whole interface and can extend beyond the window: it opens under the widget,
  and if there isn't enough room below and there's more above - over it; a list that's too long scrolls.

For now only the combo box has a popup part (the list opens under it), so the checkbox changes the behaviour
of just that one; for other widgets it changes nothing, but it's stored in the file all the same. Your own Vue widget reads the checkbox
from `node.EmbedInWindow` (the `IsEmbeddedInWindow(node)` function).

The list can't go beyond the browser or application window: that's an OS window, not a window inside a page. Skins and the theme
apply to the floating list too: it lies at the theme's root, while it takes the skin classes from the layout the widget belongs to.

Only the difference from the default is stored in the file: `"EmbedInWindow": false` on a widget. This is how the `Theme` combo box of the
Project Manager is made: it sits at the bottom edge of the page, and its list mustn't be clipped by the window.

## Labels

A label, besides text, size and boldness, has: "Wrap text" (wrapping onto lines, otherwise a single line), "Text color" (a colour
in CSS, empty - the theme's colour) and "Align" (left, center, right).

## Node scripting

The **Nodes** tab above the canvas. Simple behaviour is assembled without code: "clicked here - a window opened there", "ticked
the checkbox - this button is disabled".

- **+ Event** - an event of the selected widget (`click`, `change`, `enter`, `leave`...). Checkbox events have a condition:
  always, when ticked or when unticked.
- **+ Action** - an action: show, hide, toggle visibility, enable, disable, "availability follows
  a checkbox" (with inversion), set text, focus, a message box, close the form with a result.
- A link is dragged with the mouse from an output (on the right) to an action's input (on the left). An event runs its chain of actions in order.
- A window with the **Shown at start** property cleared is hidden until the "Show" action opens it.

The graph is stored in the layout and works both in the preview and at runtime. On the right you can see the code the graph generates - a
`UiScript` class that does exactly the same (this is verified by a test: the generated TypeScript is compiled and compared with the
execution of the graph). **File > Save** also saves this file next to the `.ui.json` (`LayoutNameNodes.ts`). The same actions
are available in your own scripts: `this.Show("Settings")`, `this.EnabledFollowsCheck("Server", "Offline", true)`.

The generated file imports `@cse/ui` - the public entry of the engine's UI module.

## Animations

In the spirit of Windows 11 and for both kits: windows open with scaling and fading in and leave shrinking, maximise
and restore go smoothly, menus and lists slide out, tooltips fade in, dialogs rise above the dimming, a pressed
button squeezes slightly. With the system "reduce motion" setting everything is turned off.

## The layout asset

`.ui.json` is a tree of widgets: a name, a type, a rectangle relative to the parent, properties; for the layout - a name, `Script` and
an optional `Skin`. Loading validates the structure: unknown properties are dropped, missing ones get default values
(old files keep opening).

```ts
const layout = ParseLayout(text);                         // or import ... from "./My.ui.json?raw"
const document = new UiDocument(layout, { Scripts, Widgets, Dialogs });
// <WinLayoutView :document="document" />                   - draw it (in the game, an app, anywhere)
```

## The script

```ts
export class LoginDialogScript extends UiScript {
	public override OnConstruct(): void {
		const ok = this.Widget<ButtonController>("OkButton");      // by the name from the editor
		this.On("UserName", "change", () => ok.SetEnabled(this.Widget<TextBoxController>("UserName").Value !== ""));
		this.Validate("Password", (context) => {
			if (this.Widget<TextBoxController>("Password").Value.length < 4) context.Error("Password", "At least 4 characters");
		});
	}
}
const scripts = new UiScriptRegistry().Register("LoginDialog", LoginDialogScript);   // the name - in the layout's Script field
```

`this.On(name, event, handler)` subscribes to events of the widget's controller (`click`, `change`...) and to the document's
events (`enter`, `leave`, `validated`). Subscriptions and validators are removed by themselves when the interface closes.

## The Windows Forms correspondence

| Windows Forms | Here |
|---|---|
| `Load`, `Shown` | `OnLoad()` (widgets are created; next to it `OnConstruct()` from UMG), `OnShown()` (the interface is on screen for the first time) |
| `FormClosing` (with `Cancel`), `FormClosed` | `OnClosing(event)` - `event.Result`, `event.Cancel()`; `OnClosed(result)` |
| `Disposed` | `OnDisposed()` (and `OnDestruct()` from UMG) |
| `Enter`, `Leave` | the `"enter"` / `"leave"` events on every widget with a controller |
| `Validating`, `Validated`, `ValidateChildren` | see "Validation" |
| `ErrorProvider` | an invalid widget is outlined, with an icon with the error text at the right edge |
| `Button.DialogResult`, `Form.DialogResult` | the button's Dialog result property; `document.Close(result)`, `document.Result` |
| `AcceptButton`, `CancelButton` | window properties: Enter presses the first, Escape - the second (without it Escape closes with Cancel) |
| `ShowDialog()`, `MessageBox.Show()` | `this.ShowDialog(layout)`, `this.MessageBox(text, title, buttons, icon)` - a `Promise` with the result |

The close button in the title bar of a top-level window closes the form with `Cancel` - through the same `OnClosing`, which can cancel it.

**Frameless** (a window property) removes the title bar, frame, shadow and resize edges: the window becomes just a surface
in the theme and skin. It's needed when a page lives in an operating system window (the editor's tools, guide 16) and the OS window itself
already has a frame - this way it isn't drawn twice. The size of such a window is set by anchors, like for any widget: for it to
fill the whole page, set Anchor X and Anchor Y to `stretch` with zero offsets.

## Validation

It's triggered only by a special button: for a button with the **Validates its container** property (`CausesValidation`)
a click first validates all the widgets inside its container (a window, a group box, a canvas), then the `click` handlers run.
The order:

1. the script's `OnValidating(context)` - prepare the context: `context.Data` - any shared data (limits, reference lists);
2. the validators of each widget of the container, in tree order: `(context, widget) => { ... context.Error(name, text) }`;
3. `OnValidated(context)` - form-level checks, `context.Cancel(text)` - an error without a specific widget;
4. the errors are shown on the widgets; the button receives a `"validated"` event with the context.

`context.IsValid`, `context.Errors`, `context.ErrorsFor(name)`, `context.Container`, `context.Trigger` (the button).
If the button has a Dialog result, the form closes with it only if validation succeeds and after the click handlers.
From code: `document.ValidateChildren(container, data)` - the same run with your own context.

## Dialogs

```ts
const dialogs = new DialogService();
// <WinDialogHost :service="dialogs" />                   - where to show modal windows
const document = new UiDocument(mainLayout, { Scripts, Dialogs: dialogs });
// in a script:
const answer = await this.MessageBox("Save changes?", "Notepad", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
const result = await this.ShowDialog(settingsLayout);    // DialogResult: OK, Cancel, Yes, No, Abort, Retry, Ignore
```

## Skins

The **Skin** tab in the properties panel: a ready-made skin or your own; a part of the interface (a button, a window frame, a title bar, a checkbox,
a tab, a scroll bar... - 35 parts) and its state (normal, hover, pressed, focus, disabled, checked,
selected, default button, inactive window). For each pair:

- a **9-slice sprite** - upload a picture, set the slice (top, right, bottom, left), the border width,
  stretching or tiling, the centre fill. Corners aren't distorted, edges and the centre stretch - as in game interfaces;
- a background (a colour or a gradient), text colour, font, font size, corner radius, minimum height, padding, shadow.

An empty field clears the setting - the theme shows again. A skin works over both style kits - Classic and Tailwind (guide 10). A skin is stored in the layout and applies only to it; Save skin /
Open skin move it between layouts. Two examples - **Celestial** (a light adventure) and **Grimoire** (dark
fantasy), all their sprites are drawn in SVG right in the code (`Modules/Engine/UI/Source/Skins/SkinPresets.ts`). Outside layouts a skin can be given
to a theme: `<WinThemeProvider :theme="..." :skin="skin">`.

## Your own widgets in Vue

All widgets, including the built-in ones, are entries in `WidgetRegistry`. Your own is connected with one registration and then lives
on equal terms with the built-in ones: in the palette, the properties panel, files, the runtime, scripts, skins.

```ts
const widgets = BuiltInWidgets.Extend().Register({
	Type: "rating", Label: "Rating", Container: false, Size: [100, 20],
	Props: [{ Key: "Max", Label: "Stars", Kind: PropKind.Number, Default: 5 }],
	Events: ["change"],                                       // will go to the preview log and to this.On(...)
	CreateController: (node) => UseControl(new RatingController(node.Props["Max"] as number)),
	Component: Rating,                                         // any Vue component: props node, controller, document
});
// <WinDesigner :widgets="widgets" />,  new UiDocument(layout, { Widgets: widgets }),  ParseLayout(text, widgets)
```

A container (`Container: true`) gets its children in the default slot. The kinds of properties: text, number, checkbox, lines
(a list), a choice from `Choices`. An example of the full path - `Modules/Engine/UI/Tests/Documents/Widgets.test.ts` and `Modules/Editor/UIDesigner/Tests/DesignerWidgets.test.ts`.

## In a project (the desktop app)

In the desktop app the designer opens on a project: the documents from its UI manifest, new documents, Save
(Ctrl+S) straight into the project's folder with an entry in the manifest, and the generated node code goes into `Source/UI`. Details - guide 16.
