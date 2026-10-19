// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	ALL_LAYERS,
	CreateAabb,
	CurveEdits,
	CurvePoint,
	DYNAMIC_EDIT_FLOATS,
	EditList,
	FieldState,
	GroundPlane,
	LayerIndex,
	PackMaterial,
	RotationFromY,
	SegmentEdit,
	ShapeDistance,
	ShapeRadius,
	SdfDynamicEdits,
	SdfDynamicFlags,
	SdfField,
	SdfMeshChunks,
	SdfOp,
	SdfShape,
	Smin,
	SplatEdit,
	UnpackMaterial,
	type SdfEditInit,
} from "../Source/Index";

/** Two balls side by side, 1.6 apart: on what layers and masks they are. */
function Pair( second: Partial<SdfEditInit> ): SdfField {
	const list = new EditList();

	list.Add( {
		Shape: SdfShape.Sphere,
		Position: [ -0.8, 0, 0 ],
		Params: [ 1, 0, 0, 0 ],
		MaterialId: 1,
	} );
	list.Add( {
		Shape: SdfShape.Sphere,
		Op: SdfOp.SmoothUnion,
		Position: [ 0.8, 0, 0 ],
		Params: [ 1, 0, 0, 0 ],
		SmoothK: 0.6,
		MaterialId: 2,
		...second,
	} );
	return new SdfField( list );
}

describe( "layers and masks", () => {
	it( "merges what its mask has, with the materials fading", () => {
		const field = Pair( {} );
		// between the balls, above their seam: the smooth union fills it
		const d = field.Distance( 0, 0.7, 0 );

		expect( d )
			.toBeCloseTo(
				Smin(
					Math.hypot( 0.8, 0.7 ) - 1,
					Math.hypot( 0.8, 0.7 ) - 1,
					0.6,
				),
				6,
			);
		// half of each there
		expect( [ field.LastMaterial, field.LastMaterialB ].sort() )
			.toEqual( [ 1, 2 ] );
		expect( field.LastMix ).toBeCloseTo( 0.5, 6 );
		expect( field.LastLayer ).toBe( 0 );
		// inside the second ball: its own
		field.Distance( 1.2, 0, 0 );
		expect( field.LastMaterial ).toBe( 2 );
		expect( field.LastMix ).toBe( 0 );
	} );

	it( "keeps a hard seam with what its mask leaves out", () => {
		// the second on a layer of its own, merging only with that layer
		const field = Pair( { Layer: 2, Mask: 2 } );
		const seam = Math.hypot( 0.8, 0.7 ) - 1;

		// no fillet: the nearer surface's distance, and its material alone
		expect( field.Distance( 0, 0.7, 0 ) ).toBeCloseTo( seam, 6 );
		expect( field.LastMix ).toBe( 0 );
		field.Distance( 1.5, 0, 0 );
		expect( field.LastMaterial ).toBe( 2 );
		expect( field.LastLayer ).toBe( 1 );
	} );

	it( "cuts only the layers of its mask", () => {
		const list = new EditList();

		list.Add(
			{ Shape: SdfShape.Sphere, Params: [ 1, 0, 0, 0 ], MaterialId: 1 },
		);
		list.Add( {
			Shape: SdfShape.Sphere,
			Position: [ 3, 0, 0 ],
			Params: [ 1, 0, 0, 0 ],
			MaterialId: 2,
			Layer: 2,
			Mask: 2,
		} );
		// a slab through both, cutting layer 2 alone, its walls of material 5
		list.Add( {
			Shape: SdfShape.Box,
			Op: SdfOp.Subtract,
			Position: [ 1.5, 0, 0 ],
			Params: [ 3, 0.2, 3, 0 ],
			MaterialId: 5,
			Mask: 2,
		} );

		const field = new SdfField( list );

		// the first ball stays whole, the second is cut
		expect( field.Distance( 0, 0, 0 ) ).toBeCloseTo( -1, 9 );
		expect( field.Distance( 3, 0, 0 ) ).toBeGreaterThan( 0 );
		field.Distance( 3, 0.25, 0 );
		expect( field.LastMaterial ).toBe( 5 );
	} );

	it( "leaves its own layer as it is where that one is nearer", () => {
		const state = new FieldState();

		state.Reset();
		state.SetBase( 5, 0, 0, 0, 0 );
		// layer 1 holds a surface close by
		state.Apply( SdfOp.Union, 1, 1 << 1, -2, 0, 3 );
		// a union on layer 1 merging with layer 0 only, farther than layer 1's
		state.Apply( SdfOp.Union, 1, 1 << 0, 3, 0, 4 );
		expect( state.D[1] ).toBe( -2 );
		expect( state.A[1] ).toBe( 3 );
		expect( state.Result() ).toBe( -2 );
		// nothing at all: infinitely far, no material
		state.Reset();
		expect( state.Result() ).toBe( Infinity );
		expect( state.Material ).toBe( 0 );
	} );

	it(
		"skips only the edits that can't change a point (the compiled field "
			+ "agrees to the bit)",
		() => {
			const list = new EditList();
			const ops = [
				SdfOp.Union,
				SdfOp.SmoothUnion,
				SdfOp.Subtract,
				SdfOp.SmoothSubtract,
				SdfOp.Intersect,
				SdfOp.SmoothIntersect,
			];
			let seed = 7;
			const random = (): number => {
				seed = ( seed * 16807 ) % 2147483647;
				return seed / 2147483647;
			};

			for ( let i = 0; i < 40; i++ ) {
				const op = ops[Math.floor( random() * ( i < 30 ? 4 : 6 ) )]!;

				list.Add( {
					Shape: SdfShape.Sphere,
					Op: op,
					Position: [
						random() * 6 - 3,
						random() * 2,
						random() * 6 - 3,
					],
					Params: [ 0.3 + random() * 0.6, 0, 0, 0 ],
					SmoothK: random() * 0.4,
					MaterialId: 1 + ( i % 6 ),
					Layer: 1 << Math.floor( random() * 3 ),
					Mask: random() < 0.5
						? ALL_LAYERS
						: 1 << Math.floor( random() * 3 ),
				} );
			}

			const field = new SdfField( list, new GroundPlane( 0 ) );
			const program = field.Compile();

			for ( let i = 0; i < 2000; i++ ) {
				const x = random() * 8 - 4;
				const y = random() * 3 - 0.5;
				const z = random() * 8 - 4;

				expect( program.Distance( x, y, z ) )
					.toBe( field.Distance( x, y, z ) );
				expect(
					[
						program.LastMaterial,
						program.LastMaterialB,
						program.LastMix,
						program.LastLayer,
					],
				)
					.toEqual(
						[
							field.LastMaterial,
							field.LastMaterialB,
							field.LastMix,
							field.LastLayer,
						],
					);
			}
		},
	);

	it( "packs a material pair into one number", () => {
		const packed = PackMaterial( 300, 7, 0.25 );

		expect( UnpackMaterial( packed ) ).toEqual( [ 300, 7, 64 / 255 ] );
		expect( UnpackMaterial( PackMaterial( 3, 3, 0 ) ) )
			.toEqual( [ 3, 3, 0 ] );
		// a layer set's lowest layer; none: the first
		expect( LayerIndex( 0b1100 ) ).toBe( 2 );
		expect( LayerIndex( 0 ) ).toBe( 0 );
	} );
} );

describe( "splats", () => {
	it( "leave a flattened blob along the normal, keeping their volume", () => {
		const edit = SplatEdit( {
			Position: [ 1, 2, 3 ],
			Normal: [ 1, 0, 0 ],
			Radius: 0.4,
			Flatness: 0.5,
			MaterialId: 4,
			Layer: 2,
			Mask: 2,
		} );
		const [ wide, thick, deep ] = edit.Params!;

		expect( edit.Op ).toBe( SdfOp.SmoothUnion );
		expect( edit.Shape ).toBe( SdfShape.Ellipsoid );
		expect( wide! * thick! * deep! ).toBeCloseTo( 0.4 ** 3, 9 );
		expect( thick! / wide! ).toBeCloseTo( 0.5, 9 );
		// a little sunk into the wall
		expect( edit.Position![0] ).toBeLessThan( 1 );
		expect( edit.SmoothK ).toBeCloseTo( 0.32, 9 );
		expect( [ edit.MaterialId, edit.Layer, edit.Mask ] )
			.toEqual( [ 4, 2, 2 ] );

		// the default flatness
		expect( SplatEdit( { Position: [ 0, 0, 0 ], Radius: 1 } ).Params![1] )
			.toBeCloseTo( 0.45 / Math.cbrt( 0.45 ), 9 );
		// the defaults: on the floor, merging with everything
		const floor = SplatEdit(
			{ Position: [ 0, 0, 0 ], Radius: 0.2, Flatness: 9 },
		);

		expect( floor.Rotation!.map( ( v ) => v + 0 ) )
			.toEqual( [ 0, 0, 0, 1 ] );
		expect( floor.Params![1] ).toBeCloseTo( floor.Params![0]!, 9 );
		expect( [ floor.MaterialId, floor.Layer, floor.Mask ] )
			.toEqual( [ 0, 1, ALL_LAYERS ] );
	} );

	it( "turn +Y onto any direction", () => {
		const Turn = (
			q: number[],
			v: [ number, number, number ],
		): number[] => {
			const [ x, y, z, w ] = q as [ number, number, number, number ];
			// v + 2 w (q x v) + 2 q x (q x v)
			const tx = 2 * ( y * v[2] - z * v[1] );
			const ty = 2 * ( z * v[0] - x * v[2] );
			const tz = 2 * ( x * v[1] - y * v[0] );

			return [
				v[0] + w * tx + y * tz - z * ty,
				v[1] + w * ty + z * tx - x * tz,
				v[2] + w * tz + x * ty - y * tx,
			];
		};

		for ( const d of [
			[ 1, 0, 0 ],
			[ 0, 0, -1 ],
			[ 0.6, 0.8, 0 ],
			[ 0, -1, 0 ],
		] as Array<[ number, number, number ]> ) {
			const turned = Turn( RotationFromY( ...d ), [ 0, 1, 0 ] );

			turned.forEach(
				( value, i ) => expect( value ).toBeCloseTo( d[i]!, 6 ),
			);
		}
	} );
} );

describe( "dynamic edits the physics feels", () => {
	it( "are packed apart, and tell the shaders when layers matter", () => {
		const dynamic = new SdfDynamicEdits();

		expect( dynamic.HasPhysics ).toBe( false );
		expect( dynamic.PackedPhysics() ).toHaveLength( 0 );
		dynamic.Add( { Shape: SdfShape.Sphere, Position: [ 1, 0, 0 ] } );
		dynamic.Add( {
			Shape: SdfShape.Sphere,
			Position: [ 2, 0, 0 ],
			Flags: SdfDynamicFlags.Physics,
		} );
		expect( dynamic.HasPhysics ).toBe( true );
		expect( dynamic.Layered ).toBe( false );

		const physics = dynamic.PackedPhysics();

		expect( physics ).toHaveLength( DYNAMIC_EDIT_FLOATS );
		expect( physics[0] ).toBe( 2 );
		// as edits: all of them, or the physics' alone, after the world's
		expect( dynamic.AsEdits() ).toHaveLength( 2 );
		expect( dynamic.AsEdits( true ).map( ( edit ) => edit.Position[0] ) )
			.toEqual( [ 2 ] );
		dynamic.Add( { Shape: SdfShape.Sphere, Layer: 2, Mask: 2 } );
		expect( dynamic.Layered ).toBe( true );
	} );
} );

describe( "SdfMeshChunks.ChunksIn", () => {
	it( "lists every chunk a box reaches", () => {
		const chunks = new SdfMeshChunks(
			new SdfField( new EditList(), new GroundPlane( 0 ) ),
			{
				CellSize: 0.25,
				ChunkCells: 8,
				Radius: 1,
			},
		);
		const jobs = chunks.ChunksIn(
			CreateAabb( -0.5, 0.1, 0.1, 2.5, 0.2, 0.2 ),
		);

		expect( jobs.map( ( job ) => job.Key ) )
			.toEqual( [ "-1,0,0", "0,0,0", "1,0,0" ] );
		expect( jobs[2]!.Coord ).toEqual( [ 1, 0, 0 ] );
		chunks.Dispose();
	} );
} );

describe( "round cones and curves", () => {
	it(
		"measures a round cone exactly, also where one end holds the other",
		() => {
		// against the distance to the union of spheres along its axis
			const Brute = (
				x: number,
				y: number,
				z: number,
				half: number,
				r1: number,
				r2: number,
			): number => {
				let best = Infinity;

				for ( let i = 0; i <= 4000; i++ ) {
					const t = i / 4000;
					const cy = -half + 2 * half * t;
					const r = r1 + ( r2 - r1 ) * t;

					best = Math.min( best, Math.hypot( x, y - cy, z ) - r );
				}
				return best;
			};

			for ( const [ half, r1, r2 ] of [
				[ 1, 0.3, 0.6 ],
				[ 0.5, 0.4, 0.1 ],
				[ 0.1, 0.8, 0.2 ],
				[ 0.1, 0.2, 0.8 ],
				[ 0, 0.3, 0.3 ],
				[ 0, 0.2, 0.5 ],
			] as Array<[ number, number, number ]> ) {
				for ( const [ x, y, z ] of [
					[ 2, 0, 0 ],
					[ 0.5, 1.2, 0.2 ],
					[ 0.1, -1.5, 0 ],
					[ 0, 0, 0.05 ],
				] as Array<[ number, number, number ]> ) {
					const exact = ShapeDistance(
						SdfShape.RoundCone,
						[ half, r1, r2, 0 ],
						x,
						y,
						z,
					);

					// outside it is exact; inside, the spheres' union is a
					// bound
					if ( exact > 0 ) {
						expect( exact )
							.toBeCloseTo( Brute( x, y, z, half, r1, r2 ), 3 );
					} else {
						expect( Brute( x, y, z, half, r1, r2 ) )
							.toBeLessThan( 1e-3 );
					}
				}
			}
			expect( ShapeRadius( SdfShape.RoundCone, [ 1, 0.3, 0.6, 0 ] ) )
				.toBe( 1.6 );

			// the compiled field agrees
			const list = new EditList();

			list.Add(
				{
					Shape: SdfShape.RoundCone,
					Params: [ 1, 0.3, 0.6, 0 ],
					Rotation: RotationFromY( 1, 0, 0 ),
				},
			);

			const field = new SdfField( list );

			expect( field.Compile().Distance( 1.5, 0.2, 0 ) )
				.toBe( field.Distance( 1.5, 0.2, 0 ) );
			// along its axis (local Y turned onto X): 0.6 thick at +X's end
			expect( field.Distance( 1.6, 0, 0 ) ).toBeCloseTo( 0, 6 );
		},
	);

	it( "builds a tube through points, its pieces meeting end to end", () => {
		const edits = CurveEdits( {
			Points: [ [ 0, 0, 0 ], [ 2, 0, 0 ], [ 2, 0, 2 ] ],
			Radii: [ 0.2, 0.4 ],
			Segments: 4,
			MaterialId: 3,
		} );

		expect( edits ).toHaveLength( 8 );
		expect( edits.every( ( edit ) => edit.Shape === SdfShape.RoundCone ) )
			.toBe( true );
		expect( edits[0] )
			.toMatchObject(
				{
					Op: SdfOp.SmoothUnion,
					MaterialId: 3,
					Layer: 1,
					Mask: ALL_LAYERS,
				},
			);
		// radii rise to the second point's and stay (the last repeats)
		expect( edits[0]!.Params![1] ).toBe( 0.2 );
		expect( edits[3]!.Params![2] ).toBeCloseTo( 0.4, 9 );
		expect( edits[7]!.Params![2] ).toBe( 0.4 );

		// each piece starts where the last ended, with its radius: no seams
		const field = new SdfField( ( () => {
			const list = new EditList();

			edits.forEach( ( edit ) => list.Add( edit ) );
			return list;
		} )() );

		// on the points themselves, inside the tube
		expect( field.Distance( 0, 0, 0 ) ).toBeCloseTo( -0.2, 1 );
		expect( field.Distance( 2, 0, 0 ) ).toBeLessThan( -0.35 );
		expect( field.Distance( 2, 0, 2 ) ).toBeLessThan( -0.35 );
		// fewer than two points: nothing; a piece of no length points up
		expect( CurveEdits( { Points: [ [ 0, 0, 0 ] ], Radii: [ 1 ] } ) )
			.toEqual( [] );
		expect(
			SegmentEdit( [ 1, 1, 1 ], [ 1, 1, 1 ], 0.2, 0.2 ).Rotation!
				.map( ( v ) => v + 0 ),
		)
			.toEqual( [ 0, 0, 0, 1 ] );
		expect(
			CurveEdits(
				{ Points: [ [ 0, 0, 0 ], [ 1, 0, 0 ] ], Radii: [] },
			)[0]!.Params![1],
		).toBe( 0.1 );
	} );

	it( "passes through its points (Catmull-Rom)", () => {
		const points: Array<[ number, number, number ]> = [
			[ 0, 0, 0 ],
			[ 1, 2, 0 ],
			[ 3, 2, 1 ],
		];

		expect( CurvePoint( points, 0, 0 ) ).toEqual( [ 0, 0, 0 ] );
		expect( CurvePoint( points, 0, 1 ) ).toEqual( [ 1, 2, 0 ] );
		expect( CurvePoint( points, 1, 1 ) ).toEqual( [ 3, 2, 1 ] );
	} );

	it( "leaves a crater where a carving splat hits", () => {
		const edit = SplatEdit(
			{
				Position: [ 0, 1, -5.6 ],
				Normal: [ 0, 0, 1 ],
				Radius: 0.2,
				Carve: true,
				MaterialId: 1,
			},
		);

		expect( edit.Op ).toBe( SdfOp.SmoothSubtract );
		// deeper along the normal than wide, mostly inside the wall
		expect( edit.Params![1] ).toBeGreaterThan( edit.Params![0]! );
		expect( edit.Position![2] ).toBeLessThan( -5.6 );
		expect( [ edit.MaterialId, edit.Layer, edit.Mask ] )
			.toEqual( [ 1, 1, ALL_LAYERS ] );
		const plain = SplatEdit(
			{
				Position: [ 0, 0, 0 ],
				Radius: 0.2,
				Carve: true,
				SmoothK: 0.1,
				Layer: 2,
				Mask: 2,
			},
		);

		expect( plain )
			.toMatchObject(
				{ SmoothK: 0.1, Layer: 2, Mask: 2, MaterialId: 0 },
			);
		expect( plain.Rotation!.map( ( v ) => v + 0 ) )
			.toEqual( [ 0, 0, 0, 1 ] );
	} );
} );
