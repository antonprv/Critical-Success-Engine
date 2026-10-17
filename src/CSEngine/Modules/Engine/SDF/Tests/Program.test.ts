// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	EditList,
	NoiseTerrain,
	SdfEditFlags,
	SdfField,
	SdfOp,
	SdfShape,
} from "../Source/Index";

const Shapes = [
	SdfShape.Sphere,
	SdfShape.Box,
	SdfShape.RoundBox,
	SdfShape.Capsule,
	SdfShape.Torus,
	SdfShape.Cylinder,
	SdfShape.Ellipsoid,
];

const Ops = [
	SdfOp.Union,
	SdfOp.Subtract,
	SdfOp.Intersect,
	SdfOp.SmoothUnion,
	SdfOp.SmoothSubtract,
	SdfOp.SmoothIntersect,
];

describe( "SdfProgram", () => {
	it( "gives what the field gives, for every shape and operation", () => {
		const list = new EditList();
		const field = new SdfField(
			list,
			new NoiseTerrain( { Amplitude: 1, MaterialId: 9 } ),
		);

		Shapes.forEach( ( shape, s ) => {
			Ops.forEach( ( op, o ) => {
				const angle = s * 0.7 + o * 0.3;

				list.Add( {
					Shape: shape,
					Op: op,
					Position: [ s - 3, o * 0.4, ( s * o ) % 3 - 1 ],
					Rotation: [
						Math.sin( angle ) * 0.6,
						0,
						Math.sin( angle ) * 0.8,
						Math.cos( angle ),
					],
					Scale: 0.6 + o * 0.1,
					Params: [ 0.8, 0.5, 0.6, 0.2 ],
					SmoothK: 0.3,
					MaterialId: s * 10 + o,
				} );
			} );
		} );

		// a muted edit is left out of both
		const muted = list.Add(
			{ Shape: SdfShape.Sphere, Params: [ 5, 0, 0, 0 ] },
		);

		list.Update( muted.Id, { Flags: SdfEditFlags.Muted } );

		const program = field.Compile();

		expect( program.Count ).toBe( Shapes.length * Ops.length );
		for ( let i = 0; i < 2000; i++ ) {
			const x = Math.sin( i * 1.3 ) * 4;
			const y = Math.cos( i * 0.7 ) * 2;
			const z = Math.sin( i * 0.37 ) * 2;
			const expected = field.Evaluate( list.Edits, x, y, z );

			expect( program.Distance( x, y, z ) ).toBeCloseTo( expected, 9 );
			expect( program.LastMaterial ).toBe( field.LastMaterial );
		}
	} );

	it( "covers the ellipsoid's center and an empty world", () => {
		const list = new EditList();
		const field = new SdfField( list );

		expect( field.Compile().Distance( 0, 0, 0 ) ).toBe( Infinity );
		list.Add(
			{
				Shape: SdfShape.Ellipsoid,
				Params: [ 2, 1, 3, 0 ],
				MaterialId: 4,
			},
		);

		const program = field.Compile();

		expect( program.Distance( 0, 0, 0 ) ).toBe( -1 );
		expect( program.LastMaterial ).toBe( 4 );
	} );
} );
