// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { SdfOp, SdfShape } from "@cse/sdf";
import { describe, expect, it } from "vitest";
import { SdfBody } from "../Source/Engine/Components/Sdf/SdfBody";
import { SdfWorm } from "../Source/Engine/Components/Sdf/SdfWorm";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { Quat } from "../Source/Engine/Math/Quat";
import { Vec3 } from "../Source/Engine/Math/Vec3";
import { SdfService } from "../Source/Engine/Services/SdfService";
import { MakeEngine } from "./engine";

/** A test engine with an SDF service of its own. */
function WithSdf() {
	const t = MakeEngine();
	const sdf = new SdfService( null );

	sdf.Load( null );
	Object.assign( t.engine, { Sdf: sdf } );
	return { t, sdf };
}

describe( "SdfBody", () => {
	it( "is a dynamic edit that follows its entity", () => {
		const { t, sdf } = WithSdf();
		const entity = t.world.Spawn( Ent( "Cube", [
			Comp( SdfBody, { MaterialId: 4, Layer: 2, Mask: 3 } ),
		], { position: [ 1, 0.5, 2 ] } ) );

		t.world.FlushLifecycle();
		expect( sdf.Dynamic.Count ).toBe( 1 );
		expect( sdf.Dynamic.Edits[0] ).toMatchObject( {
			Shape: SdfShape.RoundBox,
			Op: SdfOp.SmoothUnion,
			Position: [ 1, 0.5, 2 ],
			Params: [ 0.5, 0.5, 0.5, 0.08 ],
			MaterialId: 4,
			Layer: 2,
			Mask: 3,
		} );

		// moved and turned: the edit too, every frame
		entity.Transform.Position.Set( 3, 0.5, 2 );
		entity.Transform.Rotation.CopyFrom(
			Quat.FromAxisAngle( Vec3.Up(), Math.PI / 2 ),
		);
		t.frame();
		expect( sdf.Dynamic.Edits[0]!.Position ).toEqual( [ 3, 0.5, 2 ] );
		expect( sdf.Dynamic.Edits[0]!.Rotation[1] )
			.toBeCloseTo( Math.SQRT1_2, 6 );

		// switched off: gone, nothing to follow; on again: back, once
		const body = entity.GetComponent( SdfBody )!;

		entity.Active = false;
		expect( sdf.Dynamic.Count ).toBe( 0 );
		body.Update();
		entity.Active = true;
		t.world.FlushLifecycle();
		body.OnEnable();
		expect( sdf.Dynamic.Count ).toBe( 1 );
		entity.Destroy();
		t.world.FlushDestroyed();
		expect( sdf.Dynamic.Count ).toBe( 0 );
		body.OnDestroy();
		expect( sdf.Dynamic.Count ).toBe( 0 );
	} );
} );

describe( "SdfWorm", () => {
	it( "grows a tube of pieces behind its wandering head", () => {
		const { t, sdf } = WithSdf();
		const entity = t.world.Spawn( Ent( "Worm", [
			Comp( SdfWorm, { Speed: 2, Piece: 0.5, Area: 2, MaterialId: 3 } ),
		], { position: [ 0, 0.2, 0 ] } ) );

		t.world.FlushLifecycle();
		for ( let i = 0; i < 300; i++ ) {
			t.frame( 0.05 );
		}

		const worm = entity.GetComponent( SdfWorm )!;
		const edits = sdf.Edits.Edits;

		// 30 m at 2 m/s: a piece every half metre (the recent ones kept)
		expect( worm.Length ).toBeCloseTo( 30, 6 );
		expect( worm.Pieces ).toBeGreaterThan( 50 );
		expect( edits.length ).toBeGreaterThan( 0 );
		expect(
			edits.every(
				( edit ) => edit.Shape === SdfShape.RoundCone
					&& edit.MaterialId === 3,
			),
		).toBe( true );
		// it stayed near where it started (it turns back past its area)
		expect(
			edits.every(
				( edit ) => Math.abs( edit.Position[0] ) < 6
					&& Math.abs( edit.Position[2] ) < 6,
			),
		)
			.toBe( true );
	} );

	it( "stops at its length", () => {
		const { t, sdf } = WithSdf();
		const entity = t.world.Spawn(
			Ent( "Worm", [ Comp( SdfWorm, { MaxLength: 1 } ) ] ),
		);

		t.world.FlushLifecycle();
		for ( let i = 0; i < 100; i++ ) {
			t.frame( 0.05 );
		}
		expect( entity.GetComponent( SdfWorm )!.Length ).toBeLessThan( 1.1 );
		expect( sdf.Edits.Count ).toBeLessThanOrEqual( 3 );
	} );
} );

describe( "SdfService curves", () => {
	it( "adds a curve's pieces as edits", () => {
		const sdf = new SdfService( null );

		sdf.Load( null );

		const pieces = sdf.AddCurve(
			{
				Points: [ [ 0, 0, 0 ], [ 2, 0, 0 ] ],
				Radii: [ 0.3 ],
				Segments: 3,
			},
		);

		expect( pieces ).toHaveLength( 3 );
		expect(
			pieces.every( ( piece ) => sdf.Edits.Get( piece.Id ) === piece ),
		).toBe( true );
	} );
} );
