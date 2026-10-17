// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	ApplyOp,
	EditDistance,
	EditList,
	GroundPlane,
	NoiseTerrain,
	SdfEditFlags,
	SdfField,
	SdfOp,
	SdfShape,
	ShapeDistance,
	ShapeRadius,
	SmoothMax,
	SmoothMin,
	ValueNoise,
	type SdfEdit,
} from "../Source/Index";

type Params = [ number, number, number, number ];

describe( "shapes", () => {
	it( "measure the closed-form distances", () => {
		const unit: Params = [ 1, 1, 1, 0 ];

		expect( ShapeDistance( SdfShape.Sphere, unit, 2, 0, 0 ) ).toBe( 1 );
		expect( ShapeDistance( SdfShape.Box, unit, 0, 3, 0 ) ).toBe( 2 );
		expect( ShapeDistance( SdfShape.Box, unit, 0, 0.5, 0 ) ).toBe( -0.5 );
		expect( ShapeDistance( SdfShape.Box, unit, 2, 2, 1 ) )
			.toBeCloseTo( Math.SQRT2, 12 );
		expect( ShapeDistance( SdfShape.RoundBox, [ 1, 1, 1, 0.5 ], 2, 2, 2 ) )
			.toBeCloseTo( Math.sqrt( 3 * 1.5 * 1.5 ) - 0.5, 12 );
		expect( ShapeDistance( SdfShape.Capsule, [ 1, 0.5, 0, 0 ], 0, 3, 0 ) )
			.toBe( 1.5 );
		expect( ShapeDistance( SdfShape.Capsule, [ 1, 0.5, 0, 0 ], 2, 0.3, 0 ) )
			.toBe( 1.5 );
		expect( ShapeDistance( SdfShape.Torus, [ 2, 0.5, 0, 0 ], 2, 0, 0 ) )
			.toBe( -0.5 );
		expect( ShapeDistance( SdfShape.Torus, [ 2, 0.5, 0, 0 ], 0, 0, 0 ) )
			.toBe( 1.5 );
		expect( ShapeDistance( SdfShape.Cylinder, [ 1, 1, 0, 0 ], 0, 0, 0 ) )
			.toBe( -1 );
		expect( ShapeDistance( SdfShape.Cylinder, [ 1, 1, 0, 0 ], 4, 5, 0 ) )
			.toBe( 5 );
		expect( ShapeDistance( SdfShape.Ellipsoid, [ 2, 1, 1, 0 ], 3, 0, 0 ) )
			.toBeCloseTo( 1, 12 );
		expect( ShapeDistance( SdfShape.Ellipsoid, [ 2, 1, 3, 0 ], 0, 0, 0 ) )
			.toBe( -1 );
	} );

	it( "are held by their radius", () => {
		const p: Params = [ 1, 2, 3, 0.5 ];
		const shapes = [
			SdfShape.Sphere,
			SdfShape.Box,
			SdfShape.RoundBox,
			SdfShape.Capsule,
			SdfShape.Torus,
			SdfShape.Cylinder,
			SdfShape.Ellipsoid,
		];

		for ( const shape of shapes ) {
			const r = ShapeRadius( shape, p );

			// every point on the bounding sphere is outside or on the shape
			for ( let i = 0; i < 200; i++ ) {
				const u = Math.cos( i * 2.4 );
				const v = Math.sin( i * 2.4 ) * Math.sqrt(
					1 - ( i / 200 ) ** 2,
				);
				const w = ( i / 100 ) - 1;
				const length = Math.hypot( u, v, w );

				expect(
					ShapeDistance(
						shape,
						p,
						u / length * r,
						v / length * r,
						w / length * r,
					),
				)
					.toBeGreaterThanOrEqual( -1e-9 );
			}
		}
	} );
} );

describe( "operations", () => {
	it( "combine distances", () => {
		expect( ApplyOp( SdfOp.Union, 1, 2, 0 ) ).toBe( 1 );
		expect( ApplyOp( SdfOp.Subtract, 1, -2, 0 ) ).toBe( 2 );
		expect( ApplyOp( SdfOp.Intersect, 1, 2, 0 ) ).toBe( 2 );
		expect( ApplyOp( SdfOp.SmoothUnion, 1, 1, 1 ) ).toBe( 0.75 );
		expect( ApplyOp( SdfOp.SmoothSubtract, 1, -1, 1 ) ).toBe( 1.25 );
		expect( ApplyOp( SdfOp.SmoothIntersect, 1, 1, 1 ) ).toBe( 1.25 );
		// a first union over nothing is the edit, a first subtraction nothing
		expect( ApplyOp( SdfOp.Union, Infinity, 2, 0 ) ).toBe( 2 );
		expect( ApplyOp( SdfOp.Subtract, Infinity, 2, 0 ) ).toBe( Infinity );
	} );

	it( "blend only within k, also with infinities", () => {
		expect( SmoothMin( 0, 5, 1 ) ).toBe( 0 );
		expect( SmoothMin( 0, 0, 0 ) ).toBe( 0 );
		expect( SmoothMin( Infinity, Infinity, 1 ) ).toBe( Infinity );
		expect( SmoothMax( -Infinity, -Infinity, 1 ) ).toBe( -Infinity );
		expect( SmoothMax( 0, 0, 2 ) ).toBe( 0.5 );
	} );
} );

describe( "base layers", () => {
	it( "a ground plane is solid below its height", () => {
		const ground = new GroundPlane( 2, 3 );

		expect( ground.Distance( 9, 5, -9 ) ).toBe( 3 );
		expect( ground.MaterialId ).toBe( 3 );
		expect( new GroundPlane().Distance( 0, -1, 0 ) ).toBe( -1 );
	} );

	it( "terrain stays within its amplitude and never overestimates", () => {
		const terrain = new NoiseTerrain(
			{ Height: 1, Amplitude: 2, Seed: 5, MaterialId: 2 },
		);
		const flat = new NoiseTerrain();

		expect( terrain.MaterialId ).toBe( 2 );
		expect( flat.Height ).toBe( 0 );
		for ( let i = 0; i < 300; i++ ) {
			const x = i * 1.37 - 200;
			const z = i * 0.71 + 30;
			const h = terrain.HeightAt( x, z );

			expect( Math.abs( h - 1 ) ).toBeLessThanOrEqual( 2 );

			// 1-Lipschitz: the distance changes no faster than the point
			const a = terrain.Distance( x, 3, z );
			const b = terrain.Distance( x + 0.05, 3.02, z - 0.03 );

			expect( Math.abs( a - b ) )
				.toBeLessThanOrEqual( Math.hypot( 0.05, 0.02, 0.03 ) + 1e-12 );
			expect( terrain.Distance( x, h, z ) ).toBeCloseTo( 0, 12 );
		}
	} );

	it( "value noise is deterministic and within [-1, 1]", () => {
		for ( let i = 0; i < 500; i++ ) {
			const v = ValueNoise( i * 0.37 - 50, i * 0.11, 9 );

			expect( v ).toBeGreaterThanOrEqual( -1 );
			expect( v ).toBeLessThanOrEqual( 1 );
			expect( ValueNoise( i * 0.37 - 50, i * 0.11, 9 ) ).toBe( v );
		}
		expect( ValueNoise( 3, 4, 1 ) ).not.toBe( ValueNoise( 3, 4, 2 ) );
	} );
} );

describe( "SdfField", () => {
	function World(): { list: EditList; field: SdfField; ball: SdfEdit; } {
		const list = new EditList();
		const ball = list.Add( {
			Shape: SdfShape.Sphere,
			Params: [ 1, 0, 0, 0 ],
			MaterialId: 1,
		} );

		return { list, field: new SdfField( list ), ball };
	}

	it( "is empty without edits and ground", () => {
		const field = new SdfField( new EditList() );

		expect( field.Distance( 0, 0, 0 ) ).toBe( Infinity );
		expect( field.Normal( 0, 0, 0 ) ).toEqual( [ 0, 1, 0 ] );
	} );

	it( "applies edits in order on top of the base", () => {
		const { list, field, ball } = World();

		field.Base = new GroundPlane( -5, 7 );
		expect( field.Distance( 3, 0, 0 ) ).toBe( 2 );
		expect( field.MaterialAt( 0, 1, 0 ) ).toBe( 1 );
		expect( field.MaterialAt( 0, -5, 0 ) ).toBe( 7 );

		const hole = list.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.Subtract,
			Position: [ 1, 0, 0 ],
			Params: [ 0.5, 0, 0, 0 ],
			MaterialId: 9,
		} );

		expect( field.Distance( 1, 0, 0 ) ).toBe( 0.5 );
		// the carved surface is the hole's; elsewhere it is the ball's
		expect( field.MaterialAt( 0.5, 0, 0 ) ).toBe( 9 );
		expect( field.MaterialAt( -1, 0, 0 ) ).toBe( 1 );

		list.Update( hole.Id, { Flags: SdfEditFlags.Muted } );
		expect( field.Distance( 1, 0, 0 ) ).toBe( 0 );
		expect( field.Distance( 0, 0, 0 ) ).toBe( -1 );
		expect( list.Get( ball.Id ) ).toBe( ball );
	} );

	it( "moves edits into their frame", () => {
		const half = Math.SQRT1_2;
		const box: SdfEdit = {
			...World().ball,
			Shape: SdfShape.Box,
			Position: [ 10, 0, 0 ],
			// 90 degrees around Z: the long X side stands along Y
			Rotation: [ 0, 0, half, half ],
			Params: [ 2, 0.5, 0.5, 0 ],
			Scale: 2,
		};

		expect( EditDistance( box, 10, 5, 0 ) ).toBeCloseTo( 1, 12 );
		expect( EditDistance( box, 13, 0, 0 ) ).toBeCloseTo( 2, 12 );
	} );

	it( "points normals outward", () => {
		const { field } = World();
		const [ x, y, z ] = field.Normal( 0, 2, 0 );

		expect( x ).toBeCloseTo( 0, 6 );
		expect( y ).toBeCloseTo( 1, 6 );
		expect( z ).toBeCloseTo( 0, 6 );
	} );

	it( "raycasts against the edits on the ray", () => {
		const { field } = World();
		const hit = field.Raycast( [ -5, 0, 0 ], [ 2, 0, 0 ], 10 )!;

		expect( hit.T ).toBeCloseTo( 2, 2 );
		expect( hit.Position[0] ).toBeCloseTo( -1, 2 );
		expect( hit.Normal[0] ).toBeCloseTo( -1, 3 );
		expect( hit.MaterialId ).toBe( 1 );
		expect( field.Raycast( [ -5, 3, 0 ], [ 1, 0, 0 ], 10 ) ).toBeNull();
		expect( field.Raycast( [ -5, 0, 0 ], [ 1, 0, 0 ], 2 ) ).toBeNull();
		expect( field.Raycast( [ 0, 0, 0 ], [ 0, 0, 0 ], 10 ) ).toBeNull();
		expect( field.Raycast( [ 0, 0, 0 ], [ 0, 1, 0 ], 10 )!.T ).toBe( 0 );
	} );

	it( "gives up after its step limit", () => {
		const list = new EditList();
		const field = new SdfField( list, new GroundPlane( 0 ) );

		// grazing the ground: steps shrink and never arrive
		expect( field.Raycast( [ 0, 1, 0 ], [ 1, -1e-6, 0 ], 1e9 ) ).toBeNull();
	} );
} );
