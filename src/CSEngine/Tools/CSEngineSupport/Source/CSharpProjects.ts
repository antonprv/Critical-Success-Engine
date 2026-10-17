// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { SyncEngineProps } from "../../../Core/BuildTools/Projects.ts";

/**
 * A project's C# scripts build against the engine through .cse/Engine.props
 * (its .csproj imports it): the C# language server then sees the engine's
 * scripting library and the project's C# has no red underlines. This keeps the
 * file pointing at the engine the extension knows, for every open project.
 *
 * `engine` is the engine's src/CSEngine (what LocateEngine gives). Projects
 * inside the engine's repository (the templates) need nothing: their .csproj
 * finds the engine around them. Returns the projects whose file it changed.
 */
export function SyncCSharpProjects(
	folders: string[],
	engine: string,
): string[] {
	const repository = resolve( engine, "../.." );
	const changed: string[] = [];

	for ( const folder of folders ) {
		const inside = !relative( repository, folder ).startsWith( ".." );

		if ( inside || !existsSync( folder ) ) {
			continue;
		}
		const isProject = readdirSync( folder ).some(
			( file ) => file.endsWith( ".cseproject" ),
		);

		if ( isProject && SyncEngineProps( folder, repository ) ) {
			changed.push( folder );
		}
	}
	return changed;
}
