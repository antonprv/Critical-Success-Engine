# Critical Success Engine for VSCodium / VS Code

For projects made on the engine (anywhere on disk): imports of `@cse/core`, `@cse/ui` and the other engine packages
resolve to the engine's own sources. Types, completion and "Go to Definition" work, and the definition is the real
source file in the repository. The project needs no node_modules and no `paths` in a tsconfig. Projects without a
tsconfig are checked with the engine's own compiler options (`Core/tsconfig.json`).

`.cseproject` and `.csedata` files are highlighted as JSON.

## Setup

1. Build and install (from `src/CSEngine`):

	```
	pnpm install
	pnpm --filter @cse/engine-support package
	```

	The extension is built into `Binaries/Tools/CSEngineSupport`; the `.vsix` is there too. In VSCodium: Extensions,
	`...`, Install from VSIX.

2. Open the settings and set **Critical Success Engine: Engine Path** (`cse.enginePath`) to the repository, the folder
   that holds `src/CSEngine`. The TypeScript server restarts by itself when it changes.

Inside the repository (the templates, the engine's own sources) the setting can stay empty: the engine around the file
is used.

## How it works

The extension passes the path to a TypeScript server plugin (`cse-ts-plugin`, built into
`node_modules/cse-ts-plugin` of the extension). The plugin reads the engine's pnpm workspace, finds its `@cse/*`
packages and resolves their imports through each package's `exports` map, the way `Core/BuildTools/EngineTypes.ts`
does for the UI designer's Monaco.

Sources: `Source/Extension.ts` (the setting), `Source/Plugin` (the resolver). `Build.mjs` builds with Vite.
