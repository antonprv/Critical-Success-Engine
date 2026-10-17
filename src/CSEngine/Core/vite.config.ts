import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

import { LogServerPlugin } from "./BuildTools/LogServerPlugin.ts";
import {
	PhysicsWasmPlugin,
	ResolvePhysicsWasmDirectory,
	ResolvePhysicsWasmNoSimdDirectory,
} from "./BuildTools/PhysicsWasmPlugin.ts";
import {
	CSharpProjectIn, ProjectPlugin, ResolveProject,
} from "./BuildTools/ProjectPlugin.ts";
import { RegistryPath } from "./BuildTools/Projects.ts";
import { ContractsPlugin } from "./BuildTools/ContractsPlugin.ts";
import { ScriptsWasmPlugin } from "./BuildTools/ScriptsWasmPlugin.ts";

const RootDirectory = process.cwd();

// The .NET publish output for the physics engine lives outside this project -
// see Modules/Physics/Bridge/BUILD.md. Dev serves it from there, the production
// build copies it into the site (PHYSICS_WASM_DIR overrides the location).
const PhysicsWasmFrameworkDirectory = ResolvePhysicsWasmDirectory(
	RootDirectory,
);

/**
 * The project the engine builds when CSE_PROJECT names none: Games Sample, the
 * engine's own project, made of the templates' game modules (src/Templates),
 * whose files may import the engine like any project's.
 */
export const ProjectOptions = {
	Default: resolve( RootDirectory, "Samples/GamesSample.cseproject" ),
	EngineRoot: RootDirectory,
	ImportRoots: [resolve( RootDirectory, "../../Templates" )],
	// Engine plugins (UI...): each folder with a .cseplugin.
	PluginsDirectories: [resolve( RootDirectory, "../Modules/Engine" )],
};

/**
 * The engine imports itself by package name (exports map), which Vite does not
 * self-resolve, so these mirror tsconfig "paths". Game scripts (the templates)
 * import the UI module's runtime by its package name; ProjectPlugin resolves
 * their imports from this project, where @cse/ui is not a dependency, so it
 * points at the sources too (the worker bundles as well: GameLogic loads the
 * project's modules). Shared with vitest.config.ts: the tests load the
 * templates, which import these.
 */
export const EngineAliases = {
	"@cse/core/events": resolve(
		RootDirectory,
		"Source/Engine/Core/EventHub.ts",
	),
	"@cse/core/modules": resolve(
		RootDirectory,
		"Source/Engine/Modules/ModuleManager.ts",
	),
	"@cse/core/projects": resolve(
		RootDirectory,
		"Source/Engine/Projects/ProjectDescriptor.ts",
	),
	"@cse/core/Engine": resolve( RootDirectory, "Source/Engine" ),
	"@cse/fastmath": resolve(
		RootDirectory,
		"../Modules/Common/FastMath/Source/Index.ts",
	),
	"@cse/datastream": resolve(
		RootDirectory,
		"../Modules/Common/DataStream/Source/Index.ts",
	),
	"@cse/di": resolve(
		RootDirectory,
		"../Modules/Common/DI/Source/Index.ts",
	),
	"@cse/task": resolve(
		RootDirectory,
		"../Modules/Common/Task/Source/Index.ts",
	),
	"@cse/scripting": resolve(
		RootDirectory,
		"../Modules/Scripting/Source/Index.ts",
	),
	// "@cse/sdf/render" before "@cse/sdf": aliases match by prefix
	"@cse/sdf/render": resolve(
		RootDirectory,
		"../Modules/Engine/SDF/Source/Render/Index.ts",
	),
	"@cse/sdf": resolve(
		RootDirectory,
		"../Modules/Engine/SDF/Source/Index.ts",
	),
	"@cse/ui/game": resolve(
		RootDirectory,
		"../Modules/Engine/UI/Source/Runtime/GameUiModule.ts",
	),
};

/** The project's folder and C# scripts project, for ScriptsWasmPlugin. */
function ScriptsProject(): { Directory: string; CSharp: string | null; } {
	const { Directory } = ResolveProject(
		process.env["CSE_PROJECT"],
		{ Registry: RegistryPath(), Default: ProjectOptions.Default },
	);

	return { Directory, CSharp: CSharpProjectIn( Directory ) };
}

export default defineConfig( ( { mode } ) => {
	const isProduction = mode === "production";

	// Set by the desktop app's Build (a project's own Binaries/Dev or
	// Binaries/Prod): the output goes there, and with relative URLs, so the
	// folder can be hosted anywhere (a sub-path, a static host, an Electron
	// shell).
	const OutputDirectory = process.env["CSE_OUT_DIR"];
	const Scripts = ScriptsProject();

	return {
		base: OutputDirectory ? "./" : "/",

		// `if (__DEV__) { ... }` blocks (and what they import) are removed from
		// production bundles.
		define: {
			__DEV__: JSON.stringify( !isProduction ),
		},

		plugins: [
			vue( { template: { transformAssetUrls } } ),
			// Auto-imports only the Quasar components the templates actually
			// use (q-btn, q-card, ...).
			quasar(),
			PhysicsWasmPlugin(
				PhysicsWasmFrameworkDirectory,
				ResolvePhysicsWasmNoSimdDirectory( RootDirectory ),
			),
			LogServerPlugin(),
			// The project being built: CSE_PROJECT (a .cseproject, a folder or
			// a registered name), else the samples.
			ProjectPlugin( { ...ProjectOptions, Thread: "Main" } ),
			// Its .contract files: TypeScript and C# calling each other.
			ContractsPlugin( {
				Directory: Scripts.Directory,
				CSharp: Scripts.CSharp !== null,
			} ),
			// Its C# scripts (a .csproj at its root): built, served, copied.
			ScriptsWasmPlugin( Scripts ),
			// The UI plugin draws UI documents on the page with the toolkit's
			// styles (its Tailwind kit too).
			tailwindcss(),
		],

		resolve: {
			alias: EngineAliases,
		},

		// @Inject( IContract ) fields: TypeScript's own (legacy) decorators.
		oxc: { decorator: { legacy: true } },

		// Models/textures/environments imported from TS get hashed into the
		// output, like any other asset.
		assetsInclude: [
			"**/*.glb",
			"**/*.gltf",
			"**/*.babylon",
			"**/*.env",
			"**/*.dds",
		],

		// Workers are ES modules (`new Worker(url, { type: "module" })`) and
		// use dynamic import() (dotnet.js, Babylon shaders), which Vite's
		// default "iife" worker format cannot bundle.
		worker: {
			format: "es",
			// The game logic worker loads the project's modules.
			plugins: () => (
				[ProjectPlugin( { ...ProjectOptions, Thread: "GameLogic" } )]
			),
		},

		build: {
			// Matches Core.esproj's <BuildOutputFolder> and what CI uploads.
			outDir: OutputDirectory
				? resolve( OutputDirectory )
				: resolve( RootDirectory, "../Binaries/Core" ),
			emptyOutDir: true,
			target: "es2022",
			sourcemap: isProduction,
			reportCompressedSize: false,
			rolldownOptions: {
				// The game's page (the UI toolkit and its gallery are the UI
				// module: Modules/Engine/UI). The key names the entry chunk
				// (index-<hash>.js).
				input: {
					index: resolve( RootDirectory, "index.html" ),
				},
				// The "plugin took 99% of the build" hint is noise for a build
				// dominated by one big dependency.
				checks: { pluginTimings: false },
			},
		},

		server: {
			host: "127.0.0.1",
			port: 5173,
			strictPort: true,
			watch: {
				ignored: [
					"**/.vs/**",
					"**/.git/**",
					"**/node_modules/**",
					"**/.e2e/**",
					"**/coverage/**",
				],
			},
		},

		preview: {
			host: "127.0.0.1",
			port: 4173,
			strictPort: true,
		},
	};
} );
