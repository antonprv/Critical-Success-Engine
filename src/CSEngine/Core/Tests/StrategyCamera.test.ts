// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	CameraComponent,
} from "../Source/Engine/Components/Camera/CameraComponent";
import {
	StrategyCamera,
} from "../Source/Engine/Components/Camera/StrategyCamera";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { InputEvtType } from "../Source/Workers/Common/CommonEnums";
import { MakeEngine } from "./engine";

function Rig( props: Parameters<typeof Comp<StrategyCamera>>[1] = {} ) {
	const t = MakeEngine();
	const player = t.world.Spawn(
		Ent( "Player", [], { position: [4, 1, 2] } ),
	);
	const camera = t.world.Spawn(
		Ent(
			"Camera",
			[
				Comp(
					StrategyCamera,
					{ TargetName: "Player", EyeHeight: 0, ...props },
				),
			],
		),
	);
	t.world.FlushLifecycle();
	t.input.CapturePlayerInput = true;
	const view = camera.GetComponent( StrategyCamera )!;
	const send = ( event: Parameters<typeof t.input.Handle>[0] ): void => {
		t.input.Handle( event );
	};

	return { t, player, view, send };
}

const near = ( a: number, b: number ) => Math.abs( a - b ) < 1e-6;
const xyz = ( v: { X: number; Y: number; Z: number; } ): number[] => (
	[v.X, v.Y, v.Z]
);

describe(
	"StrategyCamera (a top-down view as in Baldur's Gate 3 and Divinity: "
		+ "Original Sin 2)",
	() => {
		it(
			"is a camera the mover can walk by, and the main camera; it "
				+ "follows "
			+ "the player, looking down from its arm",
			() => {
				const { t, view } = Rig( { Zoom: 10 } );
				expect(
					t.world.FindByName( "Camera" )!
						.GetComponent( CameraComponent ),
				).toBe( view );
				expect( t.engine.Render.MainCamera ).toBe( view );
				t.frame();
				expect( xyz( view.Focus ) ).toEqual( [4, 1, 2] );
				const pose = view.GetPose( 1 ).transform;
				const back = view.GetForwardDirection().Mul( -10 );
				expect(
					[pose[0], pose[1], pose[2]].every(
						( v, i ) => near( v, [4, 1, 2][i]! + xyz( back )[i]! ),
					),
				).toBe( true );
				// above the player, looking down
				expect( pose[1] ).toBeGreaterThan( 1 );
			},
		);

		it(
			"the wheel zooms between its limits; nearer looks flatter, farther "
			+ "looks steeper",
			() => {
				const { t, view, send } = Rig(
					{
						Zoom: 16,
						ZoomMin: 6,
						ZoomMax: 30,
						PitchNear: -35,
						PitchFar: -70,
					},
				);
				t.frame();
				const middlePitch = view.Pitch;
				// towards the screen: closer
				send( { kind: InputEvtType.Wheel, dy: -100 } );
				t.frame();
				expect( view.Zoom ).toBeLessThan( 16 );
				expect( view.Pitch ).toBeGreaterThan( middlePitch );
				for ( let i = 0; i < 40; i++ ) {
					send( { kind: InputEvtType.Wheel, dy: -100 } ); t.frame();
				}
				expect( [view.Zoom, view.Pitch] ).toEqual( [6, -35] );
				for ( let i = 0; i < 60; i++ ) {
					send( { kind: InputEvtType.Wheel, dy: 100 } ); t.frame();
				}
				expect( [view.Zoom, view.Pitch] ).toEqual( [30, -70] );
			},
		);

		it(
			"dragging with the middle button moves the view over the ground "
				+ "(and "
			+ "it stops following); the mouse doesn't turn it",
			() => {
				const { t, view, send } = Rig(
					{ Zoom: 10, PanPerPixel: 0.01 },
				);
				t.frame();
				const [yaw, pitch] = [view.Yaw, view.Pitch];
				// without the button: nothing
				send( { kind: InputEvtType.PointerMove, dx: 50, dy: 0 } );
				t.frame();
				expect( xyz( view.Focus ) ).toEqual( [4, 1, 2] );
				send( { kind: InputEvtType.PointerDown, button: 1 } );
				// drag right and down: the world follows the hand
				send( { kind: InputEvtType.PointerMove, dx: 100, dy: 50 } );
				t.frame();
				const moved = view.Focus;
				// the view goes left
				expect( near( moved.X, 4 - 100 * 0.01 * 10 ) ).toBe( true );
				// and forward (up the screen is -Z at yaw 0)
				expect( near( moved.Z, 2 - 50 * 0.01 * 10 ) ).toBe( true );
				expect( moved.Y ).toBe( 1 );
				expect( [view.Yaw, view.Pitch] ).toEqual( [yaw, pitch] );
				expect( view.Following ).toBe( false );
				t.world.FindByName( "Player" )!.Transform.Position
					.Set( 0, 1, 0 );
				t.frame();
				// it stays where the player put it
				expect( view.Focus.X ).toBe( moved.X );
				// drawing between ticks doesn't pull it back to the player
				// either
				const pose = view.GetPose( 0.5 ).transform;
				const back = view.GetForwardDirection().Mul( -10 );
				expect( near( pose[0] - back.X, moved.X ) ).toBe( true );
			},
		);

		it(
			"Q and E turn the view around the focus (and it keeps following "
				+ "the "
			+ "player)",
			() => {
				const { t, view, send } = Rig( { RotateSpeed: 90 } );
				t.frame();
				const yaw = view.Yaw;
				send( { kind: InputEvtType.KeyDown, code: "KeyQ" } );
				for ( let i = 0; i < 10; i++ ) {
					t.frame();
				}
				send( { kind: InputEvtType.KeyUp, code: "KeyQ" } );
				expect( view.Yaw ).toBeGreaterThan( yaw );
				const turned = view.Yaw;
				send( { kind: InputEvtType.KeyDown, code: "KeyE" } );
				for ( let i = 0; i < 10; i++ ) {
					t.frame();
				}
				send( { kind: InputEvtType.KeyUp, code: "KeyE" } );
				expect( view.Yaw ).toBeLessThan( turned );
				expect( view.Following ).toBe( true );
				expect( xyz( view.Focus ) ).toEqual( [4, 1, 2] );
			},
		);

		it( "Home or walking brings it back to the player", () => {
			const { t, view, send } = Rig( { PanPerPixel: 0.01 } );
			send( { kind: InputEvtType.PointerDown, button: 1 } );
			send( { kind: InputEvtType.PointerMove, dx: 100, dy: 0 } );
			t.frame();
			send( { kind: InputEvtType.PointerUp, button: 1 } );
			send( { kind: InputEvtType.KeyDown, code: "Home" } );
			t.frame();
			expect( [view.Following, xyz( view.Focus )] )
				.toEqual( [true, [4, 1, 2]] );
			send( { kind: InputEvtType.KeyUp, code: "Home" } );
			send( { kind: InputEvtType.PointerDown, button: 1 } );
			send( { kind: InputEvtType.PointerMove, dx: 100, dy: 0 } );
			t.frame();
			send( { kind: InputEvtType.PointerUp, button: 1 } );
			send( { kind: InputEvtType.KeyDown, code: "KeyW" } );
			t.frame();
			expect( view.Following ).toBe( true );
		} );

		it(
			"edge scrolling, when switched on: the cursor at an edge moves the "
			+ "view that way; off by default, and not with no cursor",
			() => {
				const { t, view, send } = Rig( { Zoom: 10, EdgeSpeed: 1 } );
				t.frame();
				send(
					{
						kind: InputEvtType.PointerMove,
						dx: 0,
						dy: 0,
						x: 0.999,
						y: 0.5,
					},
				);
				t.frame();
				expect( xyz( view.Focus ) ).toEqual( [4, 1, 2] ); // off
				// the player switches it on in the settings
				t.engine.Settings.Set( "EdgeScroll", true );
				// the camera declared it
				expect(
					t.engine.Settings.Definitions.some(
						( d ) => d.Key === "EdgeScroll" && d.Kind === "Toggle",
					),
				).toBe( true );
				t.frame();
				// right edge: right
				expect( view.Focus.X ).toBeGreaterThan( 4 );
				expect( view.Following ).toBe( false );
				const x = view.Focus.X;
				send(
					{
						kind: InputEvtType.PointerMove,
						dx: 0,
						dy: 0,
						x: 0.5,
						y: 0.001,
					},
				);
				t.frame();
				// top edge: forward
				expect( [view.Focus.X, view.Focus.Z < 2] ).toEqual( [x, true] );
				const z = view.Focus.Z;
				send(
					{
						kind: InputEvtType.PointerMove,
						dx: 0,
						dy: 0,
						x: 0.001,
						y: 0.999,
					},
				);
				t.frame();
				// bottom left: left and back
				expect( [view.Focus.X < x, view.Focus.Z > z] )
					.toEqual( [true, true] );
				send(
					{
						kind: InputEvtType.PointerMove,
						dx: 0,
						dy: 0,
						x: 0.5,
						y: 0.5,
					},
				);
				const still = xyz( view.Focus );
				t.frame();
				// the middle: nothing
				expect( xyz( view.Focus ) ).toEqual( still );
				send( { kind: InputEvtType.PointerLeave } );
				t.frame();
				expect( xyz( view.Focus ) ).toEqual( still );
			},
		);

		it( "without a target it stays put, looking at its own focus", () => {
			const t = MakeEngine();
			const view = t.world.Spawn(
				Ent(
					"Camera",
					[Comp( StrategyCamera, { TargetName: "Nobody" } )],
					{ position: [1, 2, 3] },
				),
			).GetComponent( StrategyCamera )!;
			t.world.FlushLifecycle();
			t.frame();
			expect( xyz( view.Focus ) ).toEqual( [1, 2, 3] );
			expect( view.GetPose( 0 ).fov ).toBeGreaterThan( 0 );
		} );
	},
);

describe( "StrategyCamera with a gamepad", () => {
	const pad = ( buttons: number[], axes: number[] ) => ( {
		kind: InputEvtType.Gamepad as const,
		buttons,
		axes,
	} );

	it(
		"the right stick moves the view (and it stops following); the d-pad "
			+ "zooms in and out",
		() => {
			const { t, view, send } = Rig( { Zoom: 10, PadPanSpeed: 1 } );
			t.frame();
			send( pad( [], [0, 0, 1, 0] ) ); // right stick right
			t.frame();
			expect( view.Focus.X ).toBeGreaterThan( 4 );
			expect( view.Following ).toBe( false );
			send( pad( [], [0, 0, 0, -1] ) ); // right stick up: forward
			const z = view.Focus.Z;
			t.frame();
			expect( view.Focus.Z ).toBeLessThan( z );
			const buttons = Array( 17 ).fill( 0 );
			buttons[12] = 1; // d-pad up: zoom in
			send( pad( buttons, [0, 0, 0, 0] ) );
			t.frame();
			expect( view.Zoom ).toBeLessThan( 10 );
			buttons[12] = 0;
			buttons[13] = 1; // d-pad down: zoom out
			send( pad( buttons, [0, 0, 0, 0] ) );
			const zoom = view.Zoom;
			t.frame();
			expect( view.Zoom ).toBeGreaterThan( zoom );
		},
	);
} );

describe( "CameraComponent with a gamepad", () => {
	it(
		"the right stick turns the view in degrees per second; with look off "
			+ "it doesn't",
		() => {
			const t = MakeEngine();
			const camera = t.world.Spawn(
				Ent(
					"Camera",
					[Comp( CameraComponent, { PadLookSpeed: 100 } )],
				),
			).GetComponent( CameraComponent )!;
			t.world.FlushLifecycle();
			t.input.CapturePlayerInput = true;
			// right and up, full tilt
			t.input.Handle(
				{
					kind: InputEvtType.Gamepad,
					buttons: [],
					axes: [0, 0, 1, -1],
				},
			);
			t.frame();
			expect( camera.Yaw ).toBeLessThan( 0 ); // right turns right
			expect( camera.Pitch ).toBeGreaterThan( 0 ); // up looks up
			const [yaw, pitch] = [camera.Yaw, camera.Pitch];
			camera.LookEnabled = false;
			t.frame();
			expect( [camera.Yaw, camera.Pitch] ).toEqual( [yaw, pitch] );
		},
	);
} );
