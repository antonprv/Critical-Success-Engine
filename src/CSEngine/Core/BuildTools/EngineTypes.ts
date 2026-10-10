// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * The engine's declarations for a code editor's TypeScript (Monaco): each package's sources compiled to .d.ts and put
 * where an import of the package looks for them, file:///node_modules/<package>/... (the sources folder mirrored at the
 * package's root). The export maps' short names ("@cse/core/modules", "@cse/ui/game") get small files leading to their
 * targets: an editor's TypeScript resolves the classic way and doesn't read export maps.
 */

export interface TypesPackage {
	/** The package's name ("@cse/core"). */
	Name: string;
	/** Its folder (where package.json and tsconfig.json are). */
	Root: string;
	/** The folder of its sources, mirrored at the package's root ("Source"). */
	Sources: string;
}

const Here = dirname(fileURLToPath(import.meta.url));

/** The engine's packages: the core, and the UI toolkit (with its game runtime). */
export function DefaultTypesPackages(): TypesPackage[] {
	return [
		{ Name: "@cse/core", Root: resolve(Here, ".."), Sources: "Source" },
		{ Name: "@cse/ui", Root: resolve(Here, "../../Modules/Engine/UI"), Sources: "Source" },
	];
}

const Slash = (path: string): string => path.split(sep).join("/");

function Declarations(pack: TypesPackage): Record<string, string> {
	const configFile = join(pack.Root, "tsconfig.json");
	const config = ts.readConfigFile(configFile, ts.sys.readFile).config as object;
	const parsed = ts.parseJsonConfigFileContent(config, ts.sys, pack.Root);
	const sources = join(pack.Root, pack.Sources);
	const out = join(pack.Root, ".types");
	const files = parsed.fileNames.filter((file) => file.startsWith(sources + sep) || file.startsWith(`${Slash(sources)}/`)).filter((file) => /\.ts$/.test(file) && !/\.test\.ts$/.test(file));
	// The project's own settings, without its own output places (the declarations go to memory).
	const settings: ts.CompilerOptions = { ...parsed.options };
	delete settings.outDir;
	delete settings.tsBuildInfoFile;
	const program = ts.createProgram(files, {
		...settings,
		// Emit whatever the plain compiler can't follow (the toolkit's .vue imports: vue-tsc's business): those come out as any.
		noEmit: false, noEmitOnError: false, declaration: true, emitDeclarationOnly: true, declarationMap: false, sourceMap: false,
		composite: false, incremental: false, rootDir: sources, declarationDir: out,
	});
	const types: Record<string, string> = {};
	program.emit(undefined, (fileName, text) => {
		types[`file:///node_modules/${pack.Name}/${Slash(relative(out, fileName))}`] = text;
	});
	return types;
}

/** "./events": "./Source/Engine/Core/EventHub.ts" makes events.d.ts: export * from "./Engine/Core/EventHub". */
function ShortNames(pack: TypesPackage, types: Record<string, string>): void {
	const exports = (JSON.parse(readFileSync(join(pack.Root, "package.json"), "utf8")) as { exports?: Record<string, string>; }).exports ?? {};
	for (const [key, target] of Object.entries(exports)) {
		if (key.includes("*")) continue; // a pattern: the mirrored sources answer it already
		const name = key === "." ? "index" : key.slice(2);
		const into = target.replace(`./${pack.Sources}/`, "./").replace(/\.ts$/, "");
		if (into === `./${name}`) continue; // it would lead to itself (a package's own index): the mirrored file is it
		types[`file:///node_modules/${pack.Name}/${name}.d.ts`] = `export * from "${into}";\n`;
	}
}

export function EngineTypes(packages: TypesPackage[] = DefaultTypesPackages()): Record<string, string> {
	const types: Record<string, string> = {};
	for (const pack of packages) {
		Object.assign(types, Declarations(pack));
		ShortNames(pack, types);
	}
	return types;
}

export const EngineTypesVirtualId = "virtual:cse/engine-types";

/** The engine's declarations as a module of the build (made once per build): import types from "virtual:cse/engine-types". */
export function EngineTypesPlugin(make: () => Record<string, string> = EngineTypes) {
	let types: Record<string, string> | null = null;
	return {
		name: "cse-engine-types",
		resolveId: (id: string) => (id === EngineTypesVirtualId ? `\0${EngineTypesVirtualId}` : undefined),
		load: (id: string) => {
			if (id !== `\0${EngineTypesVirtualId}`) return undefined;
			types ??= make();
			return `export default ${JSON.stringify(types)};`;
		},
	};
}
