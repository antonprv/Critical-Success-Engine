// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import * as vscode from "vscode";
import { SyncCSharpProjects } from "./CSharpProjects";
import { LocateEngine } from "./Plugin/EnginePackages";

const PluginId = "cse-ts-plugin";
const EnginePathSetting = "enginePath";

interface TypeScriptApi {
	configurePlugin( pluginId: string, configuration: unknown ): void;
}

interface TypeScriptExports {
	getAPI( version: 0 ): TypeScriptApi | undefined;
}

/**
 * The engine repository the person set: ~ and ${workspaceFolder} work in it.
 */
function ConfiguredEnginePath(): string {
	const setting = vscode.workspace.getConfiguration( "cse" )
		.get<string>( EnginePathSetting, "" )
		.trim();
	const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

	return setting.replaceAll( "${workspaceFolder}", folder );
}

/**
 * The open projects' C# scripts build against the configured engine
 * (.cse/Engine.props); when that changes, the C# language server has to
 * reload the project to see it.
 */
function PointCSharpAtEngine( enginePath: string ): void {
	const engine = enginePath === "" ? undefined : LocateEngine( enginePath );

	if ( !engine ) {
		return;
	}
	const folders = ( vscode.workspace.workspaceFolders ?? [] )
		.map( ( folder ) => folder.uri.fsPath );
	const changed = SyncCSharpProjects( folders, engine );

	if ( changed.length > 0 ) {
		void vscode.window.showInformationMessage(
			"Critical Success Engine: the C# scripts of "
				+ `${ changed.join( ", " ) } now build against the engine at `
				+ `${ engine }. Restart the C# language server (or reload the `
				+ "window) to pick it up.",
		);
	}
}

export async function activate( context: vscode.ExtensionContext ): Promise<
	void
> {
	const typescript = vscode.extensions.getExtension<TypeScriptExports>(
		"vscode.typescript-language-features",
	);
	const api = ( await typescript?.activate() )?.getAPI( 0 );

	if ( !api ) {
		return;
	}

	const Configure = ( restart: boolean ): void => {
		const enginePath = ConfiguredEnginePath();

		if ( enginePath !== "" && LocateEngine( enginePath ) === undefined ) {
			void vscode.window.showWarningMessage(
				"Critical Success Engine: there is no engine at "
					+ `"${ enginePath }" (the folder with src/CSEngine/Core). `
					+ "Set cse.enginePath to the repository.",
			);
		}

		api.configurePlugin( PluginId, { enginePath } );
		PointCSharpAtEngine( enginePath );

		if ( restart ) {
			void vscode.commands.executeCommand( "typescript.restartTsServer" );
		}
	};

	Configure( false );

	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(
			() => PointCSharpAtEngine( ConfiguredEnginePath() ),
		),
		vscode.workspace.onDidChangeConfiguration( ( event ) => {
			if ( event.affectsConfiguration( `cse.${ EnginePathSetting }` ) ) {
				Configure( true );
			}
		} ),
	);
}

export function deactivate(): void {
	// nothing to release: the subscriptions are disposed by the host
}
