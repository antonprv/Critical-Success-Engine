// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * Where the project's C# scripts are: the dev server serves them at the root;
 * a built site has them next to its assets folder (any base path), as the
 * physics.
 */
export function ScriptsWasmUrl(
	href: string | undefined,
	dev: boolean,
): string {
	return dev || !href?.includes( "/assets/" )
		? "/scripts-wasm/_framework/dotnet.js"
		: new URL( "../scripts-wasm/_framework/dotnet.js", href ).href;
}
