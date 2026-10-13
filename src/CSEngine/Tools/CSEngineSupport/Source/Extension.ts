// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import * as vscode from "vscode";
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
				`Critical Success Engine: there is no engine at "${enginePath}" (the folder with src/CSEngine/Core). Set cse.enginePath to the repository.`,
			);
		}

		api.configurePlugin( PluginId, { enginePath } );

		if ( restart ) {
			void vscode.commands.executeCommand( "typescript.restartTsServer" );
		}
	};

	Configure( false );

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration( ( event ) => {
			if ( event.affectsConfiguration( `cse.${EnginePathSetting}` ) ) {
				Configure( true );
			}
		} ),
	);
}

export function deactivate(): void {
	// nothing to release: the subscriptions are disposed by the host
}
