**English** | [Русский](../../ru/guides/13-projects.md)

# 13. Projects, templates, the game's UI documents

As in Unreal Engine: a game is a **project** anywhere on disk; the engine and the tools know projects through the user's **registry**;
a new project is created from a **template**.

## A project

```
Starfall/
  Starfall.cseproject           the descriptor (like .uproject)
  Source/StarfallModule.ts      the main game module
  Content/UI/Ui.manifest.json   the list of UI documents
  Content/UI/MainMenu.ui.json   UI documents (made by the UI Designer)
  Binaries/                     finished builds from the Project Manager: Web|Desktop / Dev|Prod (guide 16)
```

`Starfall.cseproject`:

```json
{
  "FileVersion": 1,
  "Name": "Starfall",
  "Template": "FirstPerson",
  "Genre": "FirstPerson",
  "Modules": [{ "Name": "Starfall", "Primary": true, "Dependencies": ["Engine"], "Entry": "Source/StarfallModule.ts" }],
  "Plugins": [{ "Name": "UI", "Enabled": true }],
  "Ui": { "Manifest": "Content/UI/Ui.manifest.json" }
}
```

A project's modules are the same modules as in guide 12 (`Type`, `LoadingPhase`, `Dependencies`), plus `Entry` - the file that
exports the module class by default. Parsing (`@cse/core/projects`) names what's wrong: an unknown genre, a module
without `Entry`, two main modules, a file newer than the engine.

Genres: `Blank`, `FirstPerson`, `ThirdPerson`, `TopDown`, `Collectathon` - each has its own template.

## Which project the engine builds

The engine builds one project - the one named in `CSE_PROJECT`: a path to a `.cseproject`, a project folder (with exactly one
descriptor in it) or the name of a registered project. Without `CSE_PROJECT` **Games Sample** is built
(`Core/Samples/GamesSample.cseproject`) - the engine's own project for development and tests. It has no code of its own:
its modules are the templates' main modules, so one build contains all their games (the E2E tests run on it).

```
cd src/CSEngine/Core
CSE_PROJECT=Starfall pnpm dev                          # by a name from the registry
CSE_PROJECT=D:/Games/Starfall pnpm build               # by a folder
CSE_PROJECT=../../Templates/Blank pnpm build           # a template is a project too
```

Besides `CSE_PROJECT`, the build reads `CSE_OUT_DIR`: with it the site goes to that folder (with relative URLs) instead of `Binaries/Core`. This is how the Project Manager's **Build** makes a project's `Binaries/<Web|Desktop>/<Dev|Prod>`, and its **Run** starts the dev server for a project (guide 16, "Running and building a project").

The `BuildTools/ProjectPlugin.ts` plugin gives the project to the engine as the `virtual:cse/project` module: the descriptor, the project's modules
(each `Entry` is loaded dynamically, as a separate build file) and UI documents (read on demand,
`LoadUiDocument(path)`). The engine imports in a project's files (`@cse/core/modules`, `@cse/core/Engine/...`, `vue`)
are resolved as if written in the engine itself - which is why a project can live anywhere on disk.

## The project registry

`Projects.json` in the user's settings: Windows - `%APPDATA%\CriticalSuccessEngine`, macOS -
`~/Library/Application Support/CriticalSuccessEngine`, Linux - `~/.config/CriticalSuccessEngine` (or `$XDG_CONFIG_HOME`).
The `CSE_PROJECTS_REGISTRY` variable points to another file. The code is `Core/BuildTools/Projects.ts`:
`RegisterProject`, `FindProject` (by name or file), `ListProjects` (with a mark if the file has disappeared), `UnregisterProject`.
A corrupted registry is an error, not a silent overwrite.

## Templates

`src/Templates/<Name>/` is a project folder where `TemplateProject` stands in place of the name (in file names and in text), plus
`Template.json` (a title, a description, a genre, the order in the list). `CreateProject` copies the template under the project's name
(binary files as is), writes the template and the genre into the descriptor and registers the project. The project's name is an identifier
that doesn't coincide with the engine's modules (`Engine`, `Core`, `UI`...).

A template's C# scripts (its `TemplateProject.csproj` and `Source/**/*.cs`, guide 18) are copied with the name
replaced as well; their build output (`Binaries`, `obj`) stays behind. The new project also gets a `.gitignore`, the
engine's code style as its `.editorconfig` (the engine's rules for C# and TypeScript, without the engine's own file
header) and, when it has C# scripts, `.cse/Engine.props`: where the engine is, so the scripts build against it and the
editor's C# language server sees the engine (the VSCodium extension keeps it up to date).

| Template | Genre | The game |
|---|---|---|
| Blank | Blank | a ball on the floor; the main menu as a UI document |
| First Person | FirstPerson | a first-person character in a test room: running, jumping, slopes, stairs, platforms, shooting |
| Coin Hunt | Collectathon | collect the coins before time runs out, rotating obstacles, restart |
| Third Person | ThirdPerson | a character seen from behind in an arena: the camera boom shortens at walls, a HUD with the distance travelled |
| Top-Down | TopDown | a top-down view like Baldur's Gate 3: the middle button moves the view, the wheel zooms, the cursor is free; walk round the platforms in the corners |

Every template is a self-contained project: the engine builds any of them (`CSE_PROJECT=../../Templates/CoinHunt`), CI
builds all of them. The templates' code is covered 100% by the engine's tests - it is its model content. The top-down view is the engine's `StrategyCamera` component in a scene with a free cursor (`cursor: "free"` in the scene description:
the mouse isn't captured, Esc opens the menu, Resume returns to the game). The camera looks at a point on the ground that
follows the character; the middle button moves this point, the wheel zooms (up close the camera is flatter, far away steeper:
`ZoomMin`/`ZoomMax`, `PitchNear`/`PitchFar`), Home or walking returns to the character. Scrolling from the screen edge
(`EdgeScroll`) is already in the camera; a checkbox for it in the pause menu is the next step.

## UI documents in the game

`Ui.manifest.json` lists the project's documents:

```json
{ "FileVersion": 1, "Documents": [{ "Id": "PauseMenu", "Path": "PauseMenu.ui.json", "Script": "" }] }
```

`Script` (optional) replaces the script named in the document itself. The UI Designer appends documents here
(`UpsertManifestEntry`).

The game's scripts show documents by `Id` through `UiManager` (`@cse/ui`):

```ts
const ui = new UiManager({ Manifest, Load: (path) => ReadText(path), Scripts });
await ui.Show("Hud");                              // loaded on first show, then from the cache
ui.Hide("PauseMenu");
await ui.Toggle("Inventory");
const result = await ui.ShowDialog("ConfirmQuit"); // modal; DialogResult
```

`<WinUiHost :manager="ui" />` draws the shown documents in layers over the game (new ones on top) and dialogs above them;
clicks pass through empty areas to the game. A document that closed itself (a button with a `DialogResult`, the close button) disappears
from the screen. Errors name the document and the file.

## UI documents from the game's scripts: the UI plugin

The game's scripts run in the game logic worker, while documents are drawn on the page. They are connected by the engine's **UI** plugin
(`Modules/Engine/UI/UI.cseplugin`), which a project enables in its descriptor (`"Plugins": [{ "Name": "UI",
"Enabled": true }]`). The plugin has two modules: `UIHost` on the page (a layer of documents over the game, under the engine's menu) and
`UIGame` in the worker - the API for scripts:

```ts
import { GetGameUi } from "@cse/ui/game";

const ui = GetGameUi();
ui.Show("CoinHuntHud");                                   // by an Id from the project's manifest
ui.SetText("CoinHuntHud", "Coins", "Coins: 3 / 9");       // a label, a button, a field, a window title
ui.SetVisible("CoinHuntHud", "Bonus", true);
ui.SetEnabled("PauseMenu", "SaveButton", false);
ui.SetValue("Loading", "Progress", 40);                   // a progress bar (0..100), a slider, a spinner
ui.SetItems("Inventory", "Items", ["Key", "Map"]);        // a list
const off = ui.On("PauseMenu", "ResumeButton", "click", () => Resume());
ui.Events.On("error", (message) => console.warn(message)); // an unknown document or widget
ui.Hide("CoinHuntHud");
```

A loading screen is any document with a progress bar, anywhere in the game:

```ts
import { GetGameUi, LoadingScreen } from "@cse/ui/game";

const loading = new LoadingScreen(GetGameUi(), "LevelLoading"); // the Progress and Status widgets (or your own: { Bar, Label })
loading.Show("Loading the level");
loading.SetProgress(0.4);                                        // a fraction 0..1: 40% on the bar
loading.SetLabel("Spawning enemies");
loading.Hide();
```

`LoadingScreen` keeps the fraction within 0..1 and sends the value only when the percentage changes, the caption - only when
the text changes.

## The engine's screens: the pause menu and loading

The engine's pause menu and loading screen are also UI documents of the UI plugin: `EnginePauseMenu` (the game's title, "Ready" or
"Paused", Play/Resume, the scene list with the current one marked; the window's close button returns to the game) and `EngineLoading` (a progress
bar and a caption). Both cover the game under them (Click pass-through is off). The engine manages them itself: what
to show follows its state; the player's clicks call its actions directly from the click (mouse capture requires a gesture).

A project replaces them with its own by declaring documents with the same Ids in its manifest:

```json
{ "Id": "EngineLoading", "Path": "MyLoading.ui.json" }
```

Your own loading screen must have a `Progress` bar and a `Status` label; your own menu - a `MenuWindow` window, `Heading` and `Hint` labels,
a `PlayButton` button and a `Scenes` list. Without the UI plugin the engine draws the page's old screens.

Commands run in order (`Show` followed right away by `SetText` works, although the document loads asynchronously);
`On` subscriptions apply to documents shown later too. Labels are live widgets: their text and visibility are changed from
scripts and from nodes.

An example is the HUD of the Coin Hunt template: the document `Content/UI/CoinHuntHud.ui.json` (a window in the top right corner, anchored
to the right), `GameRules` shows it when the game starts, changes the labels only when the text changes and hides it when the
scene goes away.

A second example is the HUD of the First Person template ("sample FPS"): the document `Content/UI/FirstPersonHud.ui.json` with a crosshair (a "+"
label, centre anchors - it stays in the middle of the screen at any size) and a panel with a shot counter in the bottom right
corner (right and bottom anchors). The template's `FpsHud` component shows the document and updates the counter from
`Shooter.ShotsFired`. The crosshair in the document has the Click pass-through checkbox on (guide 11): clicks pass through it, so it doesn't get in the way of shooting.
