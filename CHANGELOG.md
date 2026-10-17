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

## Stage 6: the SDF world (`Modules/Engine/SDF`)

- New module `@cse/sdf` (plan.md): the ordered edit list as the world's source of truth (64-byte edits, versions,
  deltas between workers, saving), the exact field with raycasts, a BVH of edits, compiled edit programs, a brick cache
  (R8 atlas with copy-on-write, toroidal brick map, budgeted incremental rebuilds), the mesh tier (Surface Nets chunks
  without cracks, baked AO, 16-bit indices) and tier selection.
- Babylon layers (`@cse/sdf/render`): a ray-marched layer that writes depth into Babylon's buffer (M0), and the mesh
  tier as Babylon meshes. Demo page, end-to-end depth check in Chromium, CPU benchmark, CI step.
- Docs: guide 24 (en/ru), `docs/stage6-estimates.md`, `docs/stage6-questions.md`, `docs/stage6-progress.md`.
