// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

/**
 * Builds the extension into Binaries/Tools/CSEngineSupport: the extension itself (out/Extension.js), the TypeScript
 * server plugin as the package it is loaded as (node_modules/cse-ts-plugin), and the manifest. With --package, the
 * folder becomes a .vsix to install from (Extensions: Install from VSIX).
 */
const Here = dirname( fileURLToPath( import.meta.url ) );
const OutDirectory = resolve( Here, "../../Binaries/Tools/CSEngineSupport" );
const PluginDirectory = resolve( OutDirectory, "node_modules/cse-ts-plugin" );

async function Bundle( entry, outDir, name, external ) {
	await build( {
		configFile: false,
		root: Here,
		logLevel: "warn",
		build: {
			outDir,
			emptyOutDir: false,
			minify: false,
			sourcemap: false,
			target: "node20",
			lib: { entry: resolve( Here, entry ), formats: [ "cjs" ], fileName: () => `${name}.js` },
			rollupOptions: { external: [ ...external, /^node:/ ] },
		},
	} );
}

rmSync( OutDirectory, { recursive: true, force: true } );
mkdirSync( PluginDirectory, { recursive: true } );

await Bundle( "Source/Extension.ts", resolve( OutDirectory, "out" ), "Extension", [ "vscode" ] );
await Bundle( "Source/Plugin/Index.ts", PluginDirectory, "index", [] );

writeFileSync( resolve( PluginDirectory, "package.json" ), `${JSON.stringify( {
	name: "cse-ts-plugin",
	version: "1.0.0",
	main: "index.js",
	license: "SEE LICENSE IN LICENSE.md",
}, null, "\t" )}\n` );

copyFileSync( resolve( Here, "Extension/package.json" ), resolve( OutDirectory, "package.json" ) );
// the contract language (.contract files): highlighting, comments, brackets
mkdirSync( resolve( OutDirectory, "Syntaxes" ), { recursive: true } );
copyFileSync( resolve( Here, "Extension/Syntaxes/Contract.tmLanguage.json" ), resolve( OutDirectory, "Syntaxes/Contract.tmLanguage.json" ) );
copyFileSync( resolve( Here, "Extension/Contract.language-configuration.json" ), resolve( OutDirectory, "Contract.language-configuration.json" ) );
copyFileSync( resolve( Here, "README.md" ), resolve( OutDirectory, "README.md" ) );
copyFileSync( resolve( Here, "Extension/.vscodeignore" ), resolve( OutDirectory, ".vscodeignore" ) );

const License = resolve( Here, "../../../../LICENSE.md" );

if ( existsSync( License ) ) {
	copyFileSync( License, resolve( OutDirectory, "LICENSE.md" ) );
}

console.log( `Built ${OutDirectory}` );

if ( process.argv.includes( "--package" ) ) {
	// npm, not pnpm dlx: pnpm refuses the install script of vsce's signing helper (allowBuilds), and packing needs none.
	const result = spawnSync(
		"npm",
		[
			"exec", "--yes", "--package=@vscode/vsce@4", "--",
			"vsce", "package", "--allow-missing-repository", "--skip-license",
		],
		{
			cwd: OutDirectory,
			stdio: "inherit",
			shell: true,
			env: { ...process.env, npm_config_ignore_scripts: "true" },
		},
	);
	process.exit( result.status ?? 1 );
}
