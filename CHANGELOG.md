This file explains how Visual Studio created the project.

The following tools were used to generate this project:
- TypeScript Compiler (tsc)

The following steps were used to generate this project:
- Create project file (`Core.esproj`).
- Create `launch.json` to enable debugging.
- Install npm packages and create `tsconfig.json`: `npm init && npm i --save-dev eslint @types/node typescript && npx tsc --init --sourceMap true`.
- Create `app.ts`.
- Update `package.json` entry point.
- Update TypeScript build scripts in `package.json`.
- Create `eslint.config.js` to enable linting.
- Add project to solution.
- Write this file.

## Stage 6: Solution Explorer (S6-20)

- New module `@cse/solution` (`Modules/Editor/Solution`): a project's files as a tree in Visual Studio's two modes,
  Folder View (the disk) and the solution view (visual projects and sub-projects bound to folders, virtual folders,
  items moved in the view only, hidden files, Show All Files). Operations: new folder (real or virtual), rename, move,
  copy ("Name - Copy"), delete, hide, with undo/redo; files a manifest lists but the disk lacks show as missing; nested
  files (generated code under its document); search; "Sync with Active Document"; 40 000 files in both modes.
- The `.uisolution` next to the `.cseproject`: only the presentation, indented JSON in a fixed key order; read again
  when another tool changes it.
- `@cse/ui`: `SolutionTreeController` and `WinSolutionTree` (multiple selection, F2 in place, Del, Ctrl+C/X/V/Z/Y,
  drag and drop with Ctrl to copy, context menu, filter, virtualised rows, icons by kind and extension, flags), styled
  by all three kits; the widget `solutiontree` in the UI Designer's palette.
- Desktop app: `SolutionService` and `window.cse.solution` (IPC): the disk for the tools' pages, watching the folder,
  deletes to the recycle bin.
- Docs: `docs/solution-explorer-parity.md`, guide 26.

## Stage 6: the SDF world (`Modules/Engine/SDF`)

- New module `@cse/sdf` (plan.md): the ordered edit list as the world's source of truth (64-byte edits, versions,
  deltas between workers, saving), the exact field with raycasts, a BVH of edits, compiled edit programs, a brick cache
  (R8 atlas with copy-on-write, toroidal brick map, budgeted incremental rebuilds), the mesh tier (Surface Nets chunks
  without cracks, baked AO, 16-bit indices) and tier selection.
- Babylon layers (`@cse/sdf/render`): a ray-marched layer that writes depth into Babylon's buffer (M0), and the mesh
  tier as Babylon meshes. Demo page, end-to-end depth check in Chromium, CPU benchmark, CI step.
- The editor's build bakes every edit into one base (`SdfBakedLayer`); the game's `SdfWorld` keeps only the last
  `MaxEdits` edits and folds older ones into the base (`Keep` edits never fold), bit-identical in worker replicas.
- The mesh tier meshes in a pool of workers (`SdfMeshWorkers`), new chunks before rebuilds.
- CSPhysics: SDF chunks as indexed-mesh statics, a rebuilt chunk swaps its shape in place (fixed `Statics.SetShape`
  not storing the new shape).
- In the engine: a sixth worker, the SDF worker, holds the world and the mesh pool and sends chunks straight to the
  renderer and the physics; GameLogic keeps only the recent edits (`this.Engine.Sdf`: edits with ids at once,
  raycasts and distances a frame later). A scene declares its world in the manifest's `sdf` field and spawns its
  entities only once the area around its `Start` is meshed. Perf suite scenario `sdf`.
- Docs: guide 24 (en/ru), `docs/stage6-estimates.md`, `docs/stage6-questions.md`, `docs/stage6-progress.md`.
