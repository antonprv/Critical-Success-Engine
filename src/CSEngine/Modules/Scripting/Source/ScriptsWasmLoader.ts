// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { ScriptBackend } from "./ScriptRuntime.ts";

/**
 * Where the engine serves a game's C# scripts
 * (Core/BuildTools/ScriptsWasmPlugin.ts).
 */
export const ScriptsWasmUrl = "/scripts-wasm/_framework/dotnet.js";

/** What C# offers for the shared slots (CSharp/Bridge/SharedSlots.cs). */
export interface SlotExports {
	SlotsAddress(): number;
	SlotSize(): number;
	SlotDepths(): number;
	CallSlot( depth: number, length: number ): number;
	TakeOverflow(): Uint8Array;
	Call( request: Uint8Array ): Uint8Array;
}

interface ScriptExports extends SlotExports {
	Start( assemblyName: string ): string;
	Run( commands: Uint8Array ): Uint8Array;
}

/**
 * Calls between TypeScript and C# through memory they share: a slot of the
 * WebAssembly heap per depth of nesting each way (C# keeps it pinned), so a
 * call copies its message into the heap and passes only its length - no array
 * is made on either side. A message larger than a slot, or a call nested
 * deeper than the slots, takes the byte array way. `heap` is the WebAssembly
 * memory as bytes (asked anew each time: the memory may have grown).
 */
export function SlotCalls(
	heap: () => Uint8Array,
	exports: SlotExports,
	serve: ( request: Uint8Array ) => Uint8Array,
) {
	const base = exports.SlotsAddress();
	const size = exports.SlotSize();
	const depths = exports.SlotDepths();
	let incoming = 0;
	let overflow: Uint8Array | null = null;

	return {
		/**
		 * TypeScript calling C#: the answer, read in place (read it at once).
		 */
		Call( request: Uint8Array ): Uint8Array {
			if ( request.length > size || incoming >= depths ) {
				return exports.Call( request );
			}
			const at = base + incoming * size;
			const depth = incoming++;

			try {
				heap().set( request, at );
				const length = exports.CallSlot( depth, request.length );

				return length < 0
					? exports.TakeOverflow()
					: heap().subarray( at, at + length );
			} finally {
				incoming--;
			}
		},
		/**
		 * C# calling TypeScript ([JSImport] "CallSlot"): the answer's length.
		 */
		CallSlot( depth: number, length: number ): number {
			const at = base + ( depths + depth ) * size;
			// read whole by serve before anything else runs
			const answer = serve( heap().subarray( at, at + length ) );

			if ( answer.length > size ) {
				overflow = answer.slice();
				return -1;
			}
			heap().set( answer, at );
			return answer.length;
		},
		/** The answer that didn't fit its slot ([JSImport] "TakeOverflow"). */
		TakeOverflow(): Uint8Array {
			const taken = overflow!;
			overflow = null;
			return taken;
		},
	};
}

type ResourceLoader = (
	type: string,
	name: string,
	defaultUri: string,
) => Promise<Response> | undefined;

interface DotnetBuilder {
	create(): Promise<{
		getConfig(): { mainAssemblyName: string; };
		localHeapViewU8(): Uint8Array;
		setModuleImports( name: string, imports: object ): void;
		getAssemblyExports( assembly: string ): Promise<
			{ CSEngine: { Browser: { ScriptExports: ScriptExports; }; }; }
		>;
	}>;
}

interface DotnetModule {
	dotnet: DotnetBuilder & {
		withResourceLoader( loader: ResourceLoader ): DotnetBuilder;
	};
}

/**
 * A published (Release) build ships every .wasm gzip-only, as the physics
 * does: a .wasm is fetched from its .gz and inflated here (unless the server
 * already did, with Content-Encoding). Without a .gz (a Debug build in
 * development) the .wasm itself is fetched - also when the server answers the
 * .gz with something else (a dev server's index.html fallback): the bytes
 * decide, not the status.
 */
export async function LoadGzippedWasm(
	defaultUri: string,
	get: typeof fetch = fetch,
): Promise<Response> {
	const response = await get( `${ defaultUri }.gz` );
	const received = response.ok
		? new Uint8Array( await response.arrayBuffer() )
		: new Uint8Array();
	const starts = ( ...bytes: number[] ) => bytes.every(
		( byte, i ) => received[i] === byte,
	);
	let payload: ArrayBuffer;

	if ( starts( 0x1f, 0x8b ) ) {
		payload = await new Response(
			new Blob( [received] ).stream()
				.pipeThrough( new DecompressionStream( "gzip" ) ),
		).arrayBuffer();
	}
	else if ( starts( 0x00, 0x61, 0x73, 0x6d ) ) {
		// "\0asm": the transport already inflated it
		payload = received.buffer as ArrayBuffer;
	}
	else {
		return get( defaultUri );
	}
	return new Response(
		payload,
		{ status: 200, headers: { "Content-Type": "application/wasm" } },
	);
}

/**
 * The resource loader for dotnet.js in a browser: every .wasm through
 * {@link LoadGzippedWasm}.
 */
export function WasmResourceLoader(
	_type: string,
	_name: string,
	uri: string,
): Promise<Response> | undefined {
	return uri.endsWith( ".wasm" ) ? LoadGzippedWasm( uri ) : undefined;
}

/**
 * Boots the .NET runtime of a game's scripts (its dotnet.js) and starts the
 * script host on the game's assembly.
 */
export async function LoadScriptsWasm(
	dotnetJsUrl: string = ScriptsWasmUrl,
	load: ( url: string ) => Promise<unknown> = ( url ) => (
		import( /* @vite-ignore */ url )
	),
): Promise<ScriptBackend> {
	const { dotnet } = await load( dotnetJsUrl ) as DotnetModule;
	// in Node (a file: URL) the runtime reads its files itself
	const builder = dotnetJsUrl.startsWith( "file:" )
		? dotnet
		: dotnet.withResourceLoader( WasmResourceLoader );
	const runtime = await builder.create();
	// C# calling TypeScript (ScriptExports' [JSImport] of "cse-bridge")
	let serve: ( request: Uint8Array ) => Uint8Array = () => {
		throw new Error( "C# called TypeScript before the bridge was ready" );
	};
	let slots: ReturnType<typeof SlotCalls> | null = null;
	runtime.setModuleImports( "cse-bridge", {
		Call: ( request: Uint8Array ) => serve( request ),
		CallSlot: ( depth: number, length: number ) => slots!.CallSlot(
			depth,
			length,
		),
		TakeOverflow: () => slots!.TakeOverflow(),
	} );
	const exports = ( await runtime.getAssemblyExports(
		"CSEngine.Scripting",
	) ).CSEngine.Browser.ScriptExports;
	const names = exports.Start( runtime.getConfig().mainAssemblyName );
	slots = SlotCalls(
		() => runtime.localHeapViewU8(),
		exports,
		( request ) => serve( request ),
	);

	return {
		Names: names === "" ? [] : names.split( "," ),
		Run: ( commands ) => exports.Run( commands ),
		Call: ( request ) => slots!.Call( request ),
		Serve: ( handler ) => {
			serve = handler;
		},
	};
}
