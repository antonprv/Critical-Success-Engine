// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { Decode } from "@cse/datastream";
import { ChannelHub } from "../Source/Engine/Core/Channels";

describe( "ChannelHub: plugin messages between threads", () => {
	it(
		"posts wait until the thread is connected, then go out in order; later "
			+ "posts go straight out",
		() => {
			const hub = new ChannelHub();
			hub.Post( "ui", { op: "show", id: "Hud" } );
			hub.Post( "audio", 1 );
			const send = vi.fn();
			hub.Connect( send );
			expect( send.mock.calls )
				.toEqual( [["ui", { op: "show", id: "Hud" }], ["audio", 1]] );
			hub.Post( "ui", 2 );
			expect( send ).toHaveBeenLastCalledWith( "ui", 2 );
			expect( hub.Connected ).toBe( true );
		},
	);

	it(
		"delivers what arrives to the handlers of that channel only, until "
			+ "they unsubscribe",
		() => {
			const hub = new ChannelHub();
			const ui = vi.fn();
			const other = vi.fn();
			const off = hub.On( "ui", ui );
			hub.On( "other", other );
			hub.Deliver( "ui", { op: "event" } );
			off();
			hub.Deliver( "ui", "late" );
			hub.Deliver( "nobody-listens", 0 );
			expect( ui.mock.calls ).toEqual( [[{ op: "event" }]] );
			expect( other ).not.toHaveBeenCalled();
		},
	);

	it(
		"across threads, everything posted in one synchronous run goes out as "
			+ "one MessagePack batch, and a batch from the other side is "
			+ "delivered message by message",
		async () => {
			const hub = new ChannelHub();
			hub.Post( "ui", { op: "show", id: "Hud" } ); // before connecting
			const batches: Uint8Array[] = [];
			hub.ConnectBatched( ( batch ) => batches.push( batch ) );
			hub.Post(
				"ui",
				{ op: "set-text", id: "Hud", widget: "Coins", text: "1" },
			);
			hub.Post( "input", { Rebind: "Jump" } );
			expect( batches ).toEqual( [] ); // not yet: the run isn't over
			await Promise.resolve();
			expect( batches ).toHaveLength( 1 );
			expect( Decode( batches[0]! ) ).toEqual( [
				["ui", { op: "show", id: "Hud" }],
				[
					"ui",
					{ op: "set-text", id: "Hud", widget: "Coins", text: "1" },
				],
				["input", { Rebind: "Jump" }],
			] );
			// Flush sends at once (the end of a frame doesn't wait)
			hub.Post( "ui", 2 );
			hub.Flush();
			hub.Flush(); // nothing left: nothing sent
			await Promise.resolve();
			expect( batches ).toHaveLength( 2 );
			expect( hub.Connected ).toBe( true );

			const got: unknown[] = [];
			const other = new ChannelHub();
			other.On( "ui", ( payload ) => got.push( payload ) );
			other.Receive( batches[0]! );
			expect( got ).toEqual( [
				{ op: "show", id: "Hud" },
				{ op: "set-text", id: "Hud", widget: "Coins", text: "1" },
			] );
		},
	);
} );
