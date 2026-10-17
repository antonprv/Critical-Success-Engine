// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { PlayerLoop, Task, TaskStatus } from "@cse/task";
import { CreateRegistry, Harness } from "./Harness";
import { SyncTracker, WithTimeout } from "../Source/Engine/Core/SyncTracker";
import { RenderMsg } from "../Source/Workers/Common/CommonEnums";

describe( "the engine's tasks", () => {
	it( "a sync marker is a task, done when its token comes back", () => {
		const tracker = new SyncTracker();
		const sent: number[] = [];
		const done = tracker.Begin( ( token ) => sent.push( token ) );
		expect( done.IsCompleted ).toBe( false );
		tracker.Acknowledge( sent[0]! );
		expect( done.Status ).toBe( TaskStatus.Succeeded );
		tracker.Acknowledge( 999 ); // an unknown token: nothing
	} );

	it(
		"WithTimeout: true when the task succeeds in time, false when it fails "
			+ "or takes too long",
		async () => {
			vi.useFakeTimers();
			expect( await WithTimeout( Task.CompletedTask, 100 ) ).toBe( true );
			const failed = WithTimeout(
				Task.FromError( new Error( "x" ) ),
				100,
			);
			const never = WithTimeout( new Task(), 100 );
			vi.advanceTimersByTime( 100 );
			expect( await failed ).toBe( false );
			expect( await never ).toBe( false );
			vi.useRealTimers();
		},
	);

	it(
		"the game's frames tick the player loop: Task.NextFrame completes on "
			+ "the next frame",
		async () => {
			const harness = new Harness( CreateRegistry() );
			await harness.BootToScene();
			const next = Task.NextFrame();
			const before = PlayerLoop.Default.Frame;
			harness.render.Receive(
				{ type: RenderMsg.FrameRequest, frameId: 1 },
			);
			expect( PlayerLoop.Default.Frame ).toBe( before + 1 );
			expect( next.IsCompleted ).toBe( true );
		},
	);
} );
