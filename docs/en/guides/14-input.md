**English** | [Русский](../../ru/guides/14-input.md)

# 14. Input: a project's input files, action maps, gamepad

A game doesn't ask "is Space pressed" but "is the Jump action pressed" - like Enhanced Input in Unreal. **The engine defines
no actions and no bindings**: the project defines them in its input files. Each action has
a primary and a spare keyboard or mouse binding and one gamepad binding; the player remaps them. The keyboard,
mouse and gamepad work simultaneously.

The code: `Core/Source/Engine/Input/InputActions.ts`, `Core/Source/Engine/Services/InputService.ts`.

## The input file

A project's `Content/Input/<Id>.input.json`:

```json
{
  "FileVersion": 1,
  "Name": "City",
  "DefaultMap": "OnFoot",
  "ActionMaps": [
    { "Name": "OnFoot", "Actions": [
      { "Name": "Jump", "Label": "Jump", "Category": "Movement", "Default": { "Keyboard": ["Space", ""], "Gamepad": "Pad:A" } },
      { "Name": "EnterCar", "Label": "Get in", "Category": "Actions", "Default": { "Keyboard": ["KeyF", ""], "Gamepad": "Pad:Y" } }
    ] },
    { "Name": "Vehicle", "Actions": [
      { "Name": "Accelerate", "Label": "Accelerate", "Category": "Driving", "Default": { "Keyboard": ["KeyW", ""], "Gamepad": "Pad:RT" } }
    ] }
  ]
}
```

The project lists its files in the descriptor:

```json
"Input": { "Manifests": [{ "Id": "City", "Path": "Content/Input/City.input.json" }], "Default": "City" }
```

The files are read at build time: an error in a file names it and stops the build.

## Two levels of switching

1. **The input file** (`System.UseManifest(id)`). A scene names the file it's played with (`input: "CoinHunt"` in the
   scene description); a scene without this field is played with the project's default file. This is how Games Sample keeps the files of all five
   templates without merging them into one, and switches between them when the game changes. An unknown file is a scene load error
   with its name.
2. **An action map inside the file** (`System.UseActionMap(name)`), during the game - like in GTA when you get into a car:

```ts
if (input.ActionJustPressed("EnterCar")) this.Engine.Input.System.UseActionMap("Vehicle");
```

The file starts with the `DefaultMap` map. The player's remappings are stored for each map of each file and survive
switches; `System.Save()`/`Load()` save all of them.

## The action names the engine components know

The engine's components refer to actions by convention names (they can be changed in the component's properties). If the
active map doesn't contain such an action, it is simply never pressed.

| Component | Actions |
|---|---|
| `MoverComponent` | MoveForward, MoveBack, MoveLeft, MoveRight, Jump, Noclip |
| `CameraComponent` | LookLeft/Right/Up/Down (stick), ToggleView |
| `StrategyCamera` | PanView, ZoomIn, ZoomOut, Recenter, LookLeft/Right/Up/Down (moving the view with the stick) |
| `Shooter` | Fire |
| `Sprint` (recipe) | Sprint |

The codes: keys and mouse buttons as in the browser (`KeyW`, `Space`, `Mouse0`); gamepad - `Pad:A`, `Pad:B`, `Pad:X`,
`Pad:Y`, `Pad:LB`, `Pad:RB`, `Pad:LT`, `Pad:RT`, `Pad:Back`, `Pad:Start`, `Pad:LS`, `Pad:RS`, `Pad:DUp`...; sticks -
`Pad:LeftStickUp`, `Pad:RightStickLeft` and so on.

## In scripts

```ts
public override OnInputUpdate(input: InputService): void {
	if (input.ActionJustPressed("Restart")) { /* ... */ }
	const [x, y] = input.GetMoveVector();       // the Move actions of the active map: keys and the stick, length no more than 1
	const throttle = input.ActionValue("Accelerate"); // 0..1: triggers and sticks are analogue
}
```

Sticks: a dead zone of 0.2, beyond it the value is recomputed from 0; more than half the travel counts as pressed.

## Game settings

In the pause menu there's a **Settings** button: a list of settings, the player picks a row and changes the value with the Less and More buttons.
The values go into the game at once; the game stores them in `SettingsStorage` (below), and they come back on the next launch.

**The general ones** are declared by the engine - they drive its subsystems:

| Setting | What it does |
|---|---|
| Touch controls | touch controls (together with the keyboard and gamepad; the touch scheme itself is the next step) |
| Mouse sensitivity | a multiplier for the camera's sensitivity (0.2..3) |
| Invert looking up and down | inverts vertical looking |
| Gamepad look speed | a multiplier for the right stick's look speed (0.2..3) |

**Your own** are declared by the game's components when their scene starts, and they go away with the scene (the player's values
stay) - so the menu always shows the settings of the current game:

```ts
public override Awake(): void {
	this.Engine.Settings.Declare({ Key: "FieldOfView", Label: "Field of view", Category: "First Person",
		Kind: "Number", Default: 70, Min: 60, Max: 100, Step: 5 });
}
public override Update(): void {
	camera.FovDegrees = this.Engine.Settings.Number("FieldOfView");
}
```

The kinds: `Toggle` (on/off), `Number` (within `Min`..`Max` with the step `Step`), `Choice` (one of `Choices`).
The values are validated: a number is clamped to the limits and the step, a foreign option and a value of the wrong kind are not accepted.
In the templates: First Person - the field of view, Third Person - the camera distance, Top-Down - scrolling from the screen edge
(declared by `StrategyCamera`), Coin Hunt - the time limit (the limit set in the scene is the default value).

The settings screen is the engine's `EngineSettings` document; a project can replace it with its own, like the pause menu.

## SettingsStorage: where what the player chose lives

Like `PlayerPrefs` in Unity: JSON values by keys over the platform's storage (`Core/Source/Engine/Storage`).
The game accesses it as `this.Engine.Storage`:

```ts
const progress = this.Engine.Storage.Get("Progress", { Level: 1 }); // right away, from the cache
this.Engine.Storage.Set("Progress", { Level: 2 });                   // the write goes out in the background, in order
```

The engine itself stores two keys - plain, readable JSON:

| Key | What | Example |
|---|---|---|
| `Settings` | the values of the player's settings (of all the project's games) | `{ "MouseSensitivity": 1.5, "TimeLimit": "30" }` |
| `Input` | input remappings: file → map → action | `{ "FirstPerson": { "OnFoot": { "Fire": { "Keyboard": ["KeyF", ""], "Gamepad": "Pad:RT" } } } }` |

`Export()` returns everything as one readable JSON, `Import(text)` restores it (a player's backup).

**In the browser** the storage is IndexedDB, one database per project (`cse:<project name>`): it's large and asynchronous,
works in the game logic worker and requires nothing from the host (no headers, no server settings). At startup the page
asks the browser for persistent storage (`navigator.storage.persist()`): in Chrome, Firefox and Safari 17+ such
storage isn't evicted when space runs low; the browser may also refuse - the answer is written to the log.

Honest limitations that can't be worked around without your own server:

- **Safari** wipes a site's whole storage after 7 days of using Safari without visiting the site - this applies to
  any storage a script writes to (IndexedDB, localStorage, OPFS). The exception is a game installed on the
  home screen.
- A site **embedded in someone else's page** (a game portal) gets, in modern browsers, its own storage for each
  such portal.
- Where IndexedDB is unavailable (some private modes), the storage works in memory, and the log says why.

## Remapping input

On the settings screen there's a **Controls** button: a list of all the actions of the input file the current game plays with, by
maps and categories, with three bindings - the primary key, the spare one and the gamepad button:

`[OnFoot · Movement] Jump: Space · J · Pad A`

The player picks a row, then a cell (**Main key**, **Spare key**, **Gamepad**) and presses what should perform the
action: a key or a mouse button for the keyboard cells, a gamepad button or stick for the gamepad cell (whatever
was held at the moment of starting doesn't count). **Esc** cancels, **Delete** or **Backspace** clear the cell,
**Reset all** restores the file's defaults. A change takes effect in the game at once and is written to `SettingsStorage`
(the `Input` key), so it survives a reload.

How it works: the screen (the engine's `EngineControls` document, which can be replaced with your own) talks to the game over the
`input` plugin's channel; in the game it's answered by `InputBindings` (`Core/Source/Engine/Input/InputBindings.ts`):

| From the page | What the game does |
|---|---|
| `{ op: "request" }` | sends a snapshot: the file, the active map, all the maps with actions and bindings |
| `{ op: "rebind", map, action, slot, code }` | changes a binding, saves, sends a snapshot |
| `{ op: "reset", map?, action? }` | restores the defaults (of one action, a map or all), saves, sends a snapshot |

An error (no such map or action) arrives as `{ op: "error", message }` and is shown in the hint.

## The touch scheme

The general **Touch controls** setting turns on on-screen sticks and buttons - together with the keyboard and gamepad, not instead of
them. While it's on, the game doesn't capture the mouse in any scene (on a phone there's no capture), and the pause is set by the
on-screen **II** button (and Esc, if there's a keyboard). The layer is visible only during the game - not in the menu or while loading.

The elements are taken from the **actions of the input file's active map**. Which element presses an action is determined by its
`Touch` field:

| `Touch` | Element | The default for |
|---|---|---|
| `MoveStick` | the move stick (bottom left) | actions whose name starts with `Move` |
| `LookStick` | the look stick (bottom right) | actions whose name starts with `Look` |
| `Button` | a button with the action's caption (above the right stick) | all the others |
| `None` | nothing | - (the templates mark the debug "fly" and dragging the view with the mouse this way) |

A stick decomposes its position into actions by the ending of their names: `...Forward`/`...Up` - up, `...Back`/`...Down`
- down, `...Left`, `...Right`. In the game these are "virtual" action presses (`InputService.SetTouch`): they add up
with the keys and the gamepad and give "pressed" and "just pressed" just like keys. When the map changes (you got into a car) -
the layer shows its actions.

The sticks and buttons are the toolkit's `WinJoystick` and `WinGameButton` elements (guide 10), so the layer looks like the game's theme.

### Arrangement

Settings → Controls → **Arrange touch**: the screen is dimmed, the elements stop being pressable and can be dragged wherever is
convenient (a picked-up element is lifted); another finger doesn't take over the drag. **Done** saves the layout and
returns to the controls screen, **Reset** - the default places (sticks at the bottom corners, buttons in rows above the right
stick, pause at the top right).

The layout is the centre of each element as fractions of the screen, by key: `MoveStick`, `LookStick`, `Button:<action>`,
`Pause`. The game stores it in `SettingsStorage` under the `TouchLayout` key separately for each input file (different
games have different elements) and sends it together with the action snapshot; the page hands it back for saving with the
`{ op: "touch-layout", layout }` message over the `input` channel:

```json
{ "FirstPerson": { "MoveStick": { "X": 0.4, "Y": 0.35 }, "Button:Jump": { "X": 0.9, "Y": 0.45 } } }
```
