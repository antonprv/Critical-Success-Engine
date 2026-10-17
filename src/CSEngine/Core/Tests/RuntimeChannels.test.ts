// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { ChannelHub } from "../Source/Engine/Core/Channels";
import { UiMsg } from "../Source/Workers/Common/CommonEnums";
import { CreateRegistry, Harness } from "./Harness";
import { Decode, Encode } from "@cse/datastream";

describe( "plugin channels in the game logic runtime", () => {
	it(
		"what the game posts goes to the UI worker; what arrives from it "
			+ "reaches the channel's handlers",
		async () => {
			const channels = new ChannelHub();
			// before the runtime exists: it waits
			channels.Post( "ui", { op: "show", id: "Hud" } );
			const harness = new Harness( CreateRegistry(), channels );
			await Promise.resolve(); // a batch goes at the end of the run
			const batches = harness.ui.sent
				.filter(
					( m ) => ( m as { type: UiMsg; } ).type === UiMsg.Channel,
				)
				.map(
					( m ) => Decode( ( m as { batch: Uint8Array; } ).batch ),
				);
			// in the first batch, with what the engine's own plugins say
			expect( batches[0] )
				.toContainEqual( ["ui", { op: "show", id: "Hud" }] );
			const handler = vi.fn();
			channels.On( "ui", handler );
			harness.ui.Receive(
				{
					type: UiMsg.Channel,
					batch: Encode( [["ui", { op: "event" }]] ),
				},
			);
			expect( handler ).toHaveBeenCalledWith( { op: "event" } );
		},
	);

	it( "the engine module of every thread has its channels", async () => {
		const {
			default: EngineModule,
		} = await import( "../Source/Engine/EngineModule" );
		expect( new EngineModule().Channels ).toBeInstanceOf( ChannelHub );
	} );
} );
