// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { SlotCalls, type SlotExports } from "../Source/ScriptsWasmLoader.ts";

/**
 * A WebAssembly heap and C#'s side of the slots: it answers a request with its
 * bytes reversed.
 */
function Runtime( size = 8, depths = 2 ) {
	const base = 16;
	const heap = new Uint8Array( base + size * depths * 2 );
	let waiting: Uint8Array | null = null;
	const exports: SlotExports = {
		SlotsAddress: () => base,
		SlotSize: () => size,
		SlotDepths: () => depths,
		CallSlot: vi.fn( ( depth: number, length: number ) => {
			const at = base + depth * size;
			const answer = heap.slice( at, at + length ).reverse();

			// "a long answer": the request asks for more bytes than a slot
			// holds
			if ( answer[0] === 0xff ) {
				waiting = new Uint8Array( size + 1 );
				return -1;
			}
			heap.set( answer, at );
			return answer.length;
		} ),
		TakeOverflow: () => waiting!,
		Call: vi.fn( ( request: Uint8Array ) => request.slice().reverse() ),
	};

	return { heap, exports, base };
}

describe( "SlotCalls: calls through the memory TypeScript and C# share", () => {
	it(
		"a call into C# copies its request into the slot of its depth and "
			+ "reads the answer in place",
		() => {
			const { heap, exports, base } = Runtime();
			const slots = SlotCalls(
				() => heap,
				exports,
				() => new Uint8Array(),
			);
			const answer = slots.Call( Uint8Array.of( 1, 2, 3 ) );

			expect( [...answer] ).toEqual( [3, 2, 1] );
			// a view: nothing copied out
			expect( answer.buffer ).toBe( heap.buffer );
			expect( exports.CallSlot ).toHaveBeenCalledWith( 0, 3 );
			expect( [...heap.subarray( base, base + 3 )] ).toEqual( [3, 2, 1] );
			// an answer longer than a slot: C# keeps it aside
			expect( slots.Call( Uint8Array.of( 0xff ) ) ).toHaveLength( 9 );
		},
	);

	it(
		"a request longer than a slot, or nested deeper than the slots, goes "
			+ "as a byte array",
		() => {
			const { heap, exports } = Runtime( 4, 1 );
			let nested: Uint8Array | null = null;
			const slots = SlotCalls(
				() => heap,
				exports,
				() => new Uint8Array(),
			);
			expect( [...slots.Call( Uint8Array.of( 1, 2, 3, 4, 5 ) )] )
				.toEqual( [5, 4, 3, 2, 1] );
			vi.mocked( exports.CallSlot ).mockImplementationOnce( () => {
				// C# calling back into... C# again, past the last slot
				nested = slots.Call( Uint8Array.of( 7, 8 ) );
				return 0;
			} );
			slots.Call( Uint8Array.of( 1 ) );
			expect( [...nested!] ).toEqual( [8, 7] );
			expect( exports.Call ).toHaveBeenCalledTimes( 2 );
		},
	);

	it(
		"a call from C# is read from its outgoing slot and answered there; a "
			+ "long answer waits for TakeOverflow",
		() => {
			const { heap, exports, base } = Runtime( 8, 2 );
			const seen: number[][] = [];
			const serve = vi.fn( ( request: Uint8Array ) => {
				// a view of the heap: the answer goes over it
				seen.push( [...request] );
				return request[0] === 9
					? new Uint8Array( 20 )
					: Uint8Array.of( request.length, 42 );
			} );
			const slots = SlotCalls( () => heap, exports, serve );
			const outgoing = base + 2 * 8 + 8; // depth 1 of the outgoing slots
			heap.set( [5, 6, 7], outgoing );

			expect( slots.CallSlot( 1, 3 ) ).toBe( 2 );
			expect( seen[0] ).toEqual( [5, 6, 7] );
			expect( [...heap.subarray( outgoing, outgoing + 2 )] )
				.toEqual( [3, 42] );
			heap.set( [9], outgoing );
			expect( slots.CallSlot( 1, 1 ) ).toBe( -1 );
			expect( slots.TakeOverflow() ).toHaveLength( 20 );
		},
	);
} );
