// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { SdfOp, SdfShape, type ToSdfWorker } from "@cse/sdf";
import { describe, expect, it } from "vitest";
import { SdfService } from "../Source/Engine/Services/SdfService";

class FakePort {
	public readonly sent: ToSdfWorker[] = [];

	public onmessage: ( ( event: { data: unknown; } ) => void ) | null = null;

	public postMessage( message: ToSdfWorker ): void {
		this.sent.push( message );
	}

	public Receive( data: unknown ): void {
		this.onmessage?.( { data } );
	}
}

describe( "SdfService", () => {
	it( "sends the scene, the edits and the focus to the SDF worker", () => {
		const port = new FakePort();
		const sdf = new SdfService( port as unknown as MessagePort );

		sdf.Load( { Base: { Url: "level.sdf" }, MaxEdits: 1 } );
		expect( port.sent[0] ).toMatchObject( { Type: "load", Epoch: 1 } );

		const hole = sdf.Add( { Shape: SdfShape.Sphere, Op: SdfOp.Subtract } );

		// at once: the id, and the edit to change
		expect( sdf.Edits.Get( hole.Id ) ).toBe( hole );
		expect( sdf.Update( hole.Id, { Position: [ 1, 2, 3 ] } ) ).toBe( true );
		sdf.Add( { Shape: SdfShape.Box } );
		// one recent edit kept: the older folded
		expect( sdf.Edits.Count ).toBe( 1 );
		expect( sdf.Remove( hole.Id ) ).toBe( false );
		sdf.Tick( [ 4, 5, 6 ], [ 0, 0, 0, 1 ] );
		expect( port.sent[1] )
			.toMatchObject( { Type: "tick", Focus: [ 4, 5, 6 ] } );

		port.Receive( { Type: "loaded", Epoch: 1, Error: "HTTP 404" } );
		expect( sdf.Loaded ).toBe( false );
		expect( sdf.LoadError ).toBe( "HTTP 404" );
	} );

	it( "answers questions with what the SDF worker says", async () => {
		const port = new FakePort();
		const sdf = new SdfService( port as unknown as MessagePort );

		sdf.Load( null );
		port.Receive( { Type: "loaded", Epoch: 1, Error: null } );
		expect( sdf.Loaded ).toBe( true );

		const hit = sdf.Raycast( [ 0, 5, 0 ], [ 0, -1, 0 ] );
		const distance = sdf.Distance( [ 0, 0, 0 ] );
		const [ , ray, point ] = port.sent as Array<
			Extract<ToSdfWorker, { Type: "query"; }>
		>;

		expect( ray!.Query ).toEqual( {
			Kind: "raycast",
			Origin: [ 0, 5, 0 ],
			Dir: [ 0, -1, 0 ],
			TMax: 1000,
		} );
		port.Receive(
			{
				Type: "result",
				Id: point!.Id,
				Result: { Distance: 2, MaterialId: 1 },
			},
		);
		port.Receive( { Type: "result", Id: ray!.Id, Result: null } );
		expect( await hit ).toBeNull();
		expect( await distance ).toEqual( { Distance: 2, MaterialId: 1 } );
	} );

	it( "meshes ahead of the camera as far as the scene says", () => {
		const port = new FakePort();
		const sdf = new SdfService( port as unknown as MessagePort );

		sdf.Load( { Base: { Url: "a.sdf" }, FocusAhead: 10 } );
		// turned 90 degrees to the left: looking along -X
		sdf.Tick( [ 1, 2, 3 ], [ 0, Math.SQRT1_2, 0, Math.SQRT1_2 ] );

		const focus = ( port.sent[1] as { Focus: number[]; } ).Focus;

		expect( focus[0] ).toBeCloseTo( -9, 9 );
		expect( focus[1] ).toBeCloseTo( 2, 9 );
		expect( focus[2] ).toBeCloseTo( 3, 9 );
	} );

	it( "keeps the dynamic edits for the renderer, not the SDF worker", () => {
		const port = new FakePort();
		const sdf = new SdfService( port as unknown as MessagePort );

		sdf.Load( { Base: { Url: "level.sdf" } } );
		expect( sdf.TakeDynamic() ).toBeNull();

		const hole = sdf.AddDynamic( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothSubtract,
		} );

		expect( sdf.UpdateDynamic( hole.Id, { Position: [ 1, 2, 3 ] } ) )
			.toBe( true );
		expect( sdf.Edits.Count ).toBe( 0 );
		expect( [ ...sdf.TakeDynamic()!.slice( 0, 3 ) ] )
			.toEqual( [ 1, 2, 3 ] );
		expect( sdf.TakeDynamic() ).toBeNull();
		expect( sdf.RemoveDynamic( hole.Id ) ).toBe( true );
		expect( sdf.RemoveDynamic( hole.Id ) ).toBe( false );
		expect( sdf.TakeDynamic() ).toHaveLength( 0 );
	} );

	it( "sticks splats as edits of the world", () => {
		const sdf = new SdfService( null );

		sdf.Load( null );

		const splat = sdf.Splat( { Position: [ 0, 1, 0 ], Radius: 0.3 } );

		expect( splat.Shape ).toBe( SdfShape.Ellipsoid );
		expect( sdf.Edits.Get( splat.Id ) ).toBe( splat );
	} );

	it( "answers null without an SDF worker", async () => {
		const sdf = new SdfService( null );

		sdf.Load( null );
		sdf.Add( { Shape: SdfShape.Sphere } );
		sdf.Tick( [ 0, 0, 0 ], [ 0, 0, 0, 1 ] );
		expect( await sdf.Raycast( [ 0, 0, 0 ], [ 1, 0, 0 ], 5 ) ).toBeNull();
		expect( await sdf.Distance( [ 0, 0, 0 ] ) ).toBeNull();
	} );
} );
