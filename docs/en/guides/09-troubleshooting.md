**English** | [Русский](../../ru/guides/09-troubleshooting.md)

# 09. When something doesn't work

We go from the symptom to the cause. Always open the **browser console** first (F12): worker and script errors are written there,
and the script ones as a line like `[Script] ClassName.Hook threw on entity "…" (#id)`.

## Running and building

| Symptom | Cause → what to do |
|---|---|
| At startup a toast *"Physics failed to load…"*, objects hang | The physics wasm isn't built or isn't found. Build it (`Physics/Bridge/BUILD.md`), check that `Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework/dotnet.js` exists |
| The loading screen hangs for more than ~30 s | The physics signalled neither "ready" nor "error": look in the console for 404s/`dotnet.js` errors. After 30 s the engine will continue without physics |
| `pnpm typecheck` complains about `.vue` | `vue-tsc` is needed (it's in the scripts); plain `tsc` doesn't understand `.vue` |
| `pnpm dev`: "Port 5173 is already in use" | The dev server is already running (maybe in another terminal or from a VS Code task). The port is pinned (`strictPort`) so VS Code tasks and debugging always know the address |
| `pnpm test` fails with "Coverage … does not meet global threshold (100%)" | The tests passed, but the new code isn't fully covered. The file and the metric are in the message; the detailed report is `coverage/index.html` |
| `pnpm test:e2e`: "Executable doesn't exist" | The Playwright browser isn't installed: `pnpm exec playwright install chromium` (once) |
| E2E failed | The cause is printed in the terminal; a trace is saved for a failed test: `pnpm exec playwright show-trace test-results/<test>/trace.zip` (in CI - also an HTML report in the artifacts). Tests also fail on any error or warning in the browser console, and on a Warning/Error in the game's log - the test's message says exactly what it was |
| `[Logger] failed to reach log sidecar` in the console every 5 seconds | The log sidecar isn't running (`Core/Tools/LogServer.mjs` is absent from the repository, or port 4790 is busy). It doesn't affect the game: logs stay in the console. See guide 17 |
| Script changes aren't visible | Workers pick up changes with a full page reload; Vue components - "on the fly" |

## Mouse and menu

| Symptom | Cause → what to do |
|---|---|
| I press Play - nothing, the mouse didn't get captured | The browser needs a user gesture, and after Esc there's a short pause: wait a second and click again. The menu stays on screen |
| Esc doesn't return to the game | While the mouse is captured, Esc goes to the browser and opens the menu; to return - click **Resume** |
| Keys get "stuck" after Esc/Alt-Tab | They shouldn't: on losing focus and capture the engine resets input. If it gets stuck - that's a bug, send the steps |
| Space scrolls the page | It shouldn't while the mouse is captured. Outside capture - it's normal browser behaviour |

## Scenes and entities

| Symptom | Cause → what to do |
|---|---|
| The scene isn't in the menu | Not registered in the `StartupModule` of the project's main module |
| "Scene … is already registered" | A duplicate `id` |
| An object isn't visible | No `MeshRenderer`/no `Mesh` set; or it's behind the camera; or there's no camera in the scene |
| An object is visible but falls through or hangs | No body; or the physics isn't built; or the layer/mask doesn't intersect with the floor |
| `Comp(...)` - a type error | A field the component doesn't have, or a wrong value type - this is by design, fix it following the compiler's hint |
| A component "doesn't work" | `Enabled = false`; the entity `Active = false`; no `override` (a typo in a hook - the compiler will tell you); a hook of another tick (frame ≠ physics) |
| `RequireComponent` threw an error | The entity has no such component (or it's on another entity) - check the manifest |
| A reference to an entity "died" after a restart | Don't keep entities between scenes, look them up again in `Start` |

## Physics and the character

| Symptom | Cause → what to do |
|---|---|
| The player falls into the floor on spawn | The starting position is too low. The capsule's centre must be ≥ ~1.0 m above the floor |
| The player can't climb a step | There are no auto-steps (guide 05). A ramp ≤ 46° or a block you have to jump onto |
| The player "slides" on the lift | In the manifest `KinematicBody` is **before** the movement script (guide 04) - swap the order |
| I teleported the player and he flew off | Use `characterBody.Teleport(...)` (zeroes the velocity) |
| A velocity set from `Update` "disappeared" | Change the character's `Velocity` from `OnPhysicsUpdate` or physics callbacks (guide 05) |
| A bullet flies through a thin wall | You need the `Projectile` component (not `RigidBody`), or `ContinuousDetection` and a thicker wall |
| Objects don't collide | Layers and masks: both bodies must "see" each other (guide 04) |
| `OnCollisionEnter` isn't called for the player and the floor | That's right: contact events occur when the pair includes a dynamic body or a trigger. "Standing on the ground" - `IsOnFloor` |
| A command to the body right after `Spawn` is ignored | Give it from another component's `Start` (guide 03) |
| A crate on a platform slides off | The platform moves too jerkily - move it from `OnPhysicsUpdate` (not from `Update`) and with a script **before** `KinematicBody` |

## UI

| Symptom | Cause → what to do |
|---|---|
| The HUD is empty | Lines are set in `OnUIUpdate`; the HUD is hidden during the menu and loading |
| You need your own button/bar | The five-place scheme - guide 06 |
| The menu looks different from what you want | Only `Source/Ui/**/*.vue` (ordinary Quasar), don't touch the logic in `UiController` |

## How to narrow the problem down

1. **Tests**: `pnpm test` runs the whole runtime without a browser. If the test for your scene passes but it doesn't work in the browser - the problem is in the physics (wasm), the renderer or the UI,
   not in the scripts. The scene test template is `Tests/GameLogicRuntime.test.ts` (fake ports in `Tests/Harness.ts`).
2. **Turn off the extras**: remove components from the manifest one by one until you find the culprit.
3. **Look at the commands to the physics**: in tests `harness.AllPhysicsCommands()` shows exactly what the scripts sent to the physics worker - it quickly answers the question "did I even ask for this?".
