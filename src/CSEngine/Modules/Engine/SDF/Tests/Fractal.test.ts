// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	CreateAabb,
	CreateBaseLayer,
	DeserializeBase,
	DenseSdfGrid,
	EditList,
	ExtractChunk,
	GroundPlane,
	FindStandingPlace,
	InvertedMandelbrot,
	InvertedMandelbulb,
	FormulaBase,
	MandelbulbBase,
	NoiseTerrain,
	SdfBakedLayer,
	SdfField,
	SdfMeshChunks,
	SdfOp,
	SdfShape,
	SdfSparseLayer,
	SdfVolume,
	SdfWorld,
	type SdfBaseLayer,
} from "../Source/Index";

/** Points on a Fibonacci sphere of a radius. */
function Shell( count: number, radius: number ): Array<
	[ number, number, number ]
> {
	return Array.from( { length: count }, ( _, i ) => {
		const a = i * 2.39996;
		const b = Math.acos( 1 - 2 * ( i + 0.5 ) / count );

		return [
			radius * Math.sin( b ) * Math.cos( a ),
			radius * Math.cos( b ),
			radius * Math.sin( b ) * Math.sin( a ),
		];
	} );
}

/** Whether the orbit of q under z^power + c leaves the bailout sphere. */
function Escapes(
	q: [ number, number, number ],
	power: number,
	iterations: number,
	bailout: number,
	julia: readonly [ number, number, number ] | null = null,
): boolean {
	let [ x, y, z ] = q;
	const [ cx, cy, cz ] = julia ?? q;

	for ( let i = 0; i < iterations; i++ ) {
		const r = Math.hypot( x, y, z );

		if ( r > bailout ) {
			return true;
		}

		const theta = Math.acos( r > 0 ? z / r : 0 ) * power;
		const phi = Math.atan2( y, x ) * power;
		const rp = r ** power;

		x = rp * Math.sin( theta ) * Math.cos( phi ) + cx;
		y = rp * Math.sin( theta ) * Math.sin( phi ) + cy;
		z = rp * Math.cos( theta ) + cz;
	}
	return Math.hypot( x, y, z ) > bailout;
}

describe( "MandelbulbBase", () => {
	it( "is negative in the bulb and estimates the distance outside", () => {
		const bulb = new MandelbulbBase();

		expect( bulb.Power ).toBe( 8 );
		expect( bulb.Distance( 0, 0, 0 ) ).toBeLessThan( 0 );
		// far out: a positive bound under the true distance (the bulb
		// reaches about 1.2 from the center)
		const far = bulb.Distance( 10, 0, 0 );

		expect( far ).toBeGreaterThan( 2 );
		expect( far ).toBeLessThan( 10 - 1 );
		// its sign agrees with escaping where the estimate is clear of the
		// surface
		let agree = 0;
		let total = 0;

		for ( const p of [ 0.8, 1, 1.2 ].flatMap( ( r ) => Shell( 300, r ) ) ) {
			const d = bulb.Distance( ...p );

			if ( Math.abs( d ) < 0.02 ) {
				continue;
			}
			total++;
			agree += ( d > 0 ) === Escapes( p, 8, 10, 4 ) ? 1 : 0;
		}
		expect( total ).toBeGreaterThan( 200 );
		expect( agree / total ).toBeGreaterThan( 0.95 );
	} );

	it( "turns inside out by inversion, the distance scaled back", () => {
		const options = { Power: 2, Thickness: 0, DistanceScale: 1 };
		const plain = new MandelbulbBase( options );
		const inverted = new MandelbulbBase( { ...options, Invert: 1 } );

		// at p the inverted field is the plain one at p / |p|^2, times |p|^2
		// (away from the center, where a bound takes over)
		for ( const p of Shell( 50, 1.7 ) ) {
			const r2 = p[0] ** 2 + p[1] ** 2 + p[2] ** 2;
			const q = p.map( ( v ) => v / r2 ) as [ number, number, number ];

			expect( inverted.Distance( ...p ) )
				.toBeCloseTo( plain.Distance( ...q ) * r2, 9 );
		}
		// the center goes to infinity: open space, as far as the set's
		// inverse can come at the nearest (1 / bailout)
		expect( inverted.Distance( 0, 0, 0 ) ).toBeCloseTo( 0.25, 9 );
		expect( inverted.Distance( 0.05, 0, 0 ) ).toBeCloseTo( 0.2, 9 );
		// scaled and moved: the same field in world units
		const moved = new MandelbulbBase( {
			...options,
			Invert: 1,
			Scale: 10,
			Center: [ 5, 0, 0 ],
		} );

		expect( moved.Distance( 5 + 17, 0, 0 ) )
			.toBeCloseTo( inverted.Distance( 1.7, 0, 0 ) * 10, 9 );
	} );

	it( "iterates a Julia set with its constant fixed", () => {
		const julia = [ 0.166791, 0.651987, 0.07568 ] as const;
		const bulb = new MandelbulbBase( {
			Power: 2,
			Julia: julia,
			Iterations: 30,
		} );
		let agree = 0;
		let total = 0;

		for ( const p of Shell( 300, 1.2 ) ) {
			const d = bulb.Distance( ...p );

			if ( Math.abs( d ) < 0.05 ) {
				continue;
			}
			total++;
			agree += ( d > 0 ) === Escapes( p, 2, 30, 4, julia ) ? 1 : 0;
		}
		expect( agree / total ).toBeGreaterThan( 0.9 );
	} );

	it( "leaves out the detail finer than asked for", () => {
		const bulb = new MandelbulbBase( { Thickness: 0, DistanceScale: 1 } );
		const p: [ number, number, number ] = [ 0.9, 0.3, 0.2 ];

		// all of it, as without a detail
		expect( bulb.Distance( ...p, 0 ) ).toBe( bulb.Distance( ...p ) );
		// coarser than the whole bulb: no iteration at all - the estimate
		// of the point itself
		const r = Math.hypot( ...p );

		expect( bulb.Distance( ...p, 100 ) )
			.toBeCloseTo( 0.5 * Math.log( r ) * r, 12 );
		// in between: near the surface some orbits are cut short
		expect( Shell( 100, 1 ).some(
			( q ) => bulb.Distance( ...q, 0.05 ) !== bulb.Distance( ...q ),
		) ).toBe( true );
	} );

	it( "squares without trigonometry as with it", () => {
		// power 2 takes a closed form; a power a hair off it, the general one
		const exact = new MandelbulbBase( { Power: 2 } );
		const general = new MandelbulbBase( { Power: 2 + 1e-12 } );

		for ( const p of [
			...Shell( 200, 0.9 ),
			[ 0, 0, 0.7 ] as [ number, number, number ],
		] ) {
			expect( exact.Distance( ...p ) )
				.toBeCloseTo( general.Distance( ...p ), 6 );
		}
	} );

	it( "fades its two materials by the orbit trap", () => {
		const bulb = new MandelbulbBase( { Materials: [ 5, 6 ] } );

		bulb.Distance( 3, 0, 0 );
		expect( bulb.MaterialId ).toBe( 5 );
		expect( bulb.MaterialB ).toBe( 6 );
		expect( bulb.MaterialMix ).toBe( 1 );
		bulb.Distance( 0.01, 0, 0 );
		expect( bulb.MaterialMix ).toBeLessThan( 0.1 );
	} );
} );

describe( "SdfBaseDescriptor", () => {
	it( "builds the base it describes", () => {
		const ground = CreateBaseLayer(
			{ Kind: "Ground", Height: 2, MaterialId: 4 },
		);

		expect( ground ).toBeInstanceOf( GroundPlane );
		expect( ground.Distance( 0, 5, 0 ) ).toBe( 3 );
		expect( ground.MaterialId ).toBe( 4 );
		expect( CreateBaseLayer( { Kind: "Ground" } ).Distance( 0, 1, 0 ) )
			.toBe( 1 );
		expect( CreateBaseLayer( { Kind: "Noise", Options: { Seed: 3 } } ) )
			.toBeInstanceOf( NoiseTerrain );
		expect( CreateBaseLayer( { Kind: "Mandelbulb" } ) )
			.toBeInstanceOf( MandelbulbBase );

		// inside the Mandelbulb: a cave around the center, walls further out
		const cave = CreateBaseLayer( InvertedMandelbulb( 20 ) );

		expect( cave.Distance( 0, 0, 0 ) ).toBeGreaterThan( 0 );
		expect( cave.Distance( 5, 0, 0 ) ).toBeGreaterThan( 0 );
		expect( Shell( 200, 40 ).some( ( p ) => cave.Distance( ...p ) < 0 ) )
			.toBe( true );
		expect( InvertedMandelbulb() ).toEqual( InvertedMandelbulb( 20 ) );

		// the same world as a formula: the same field to the digit
		const formula = CreateBaseLayer( InvertedMandelbrot() );

		expect( formula ).toBeInstanceOf( FormulaBase );
		for ( const p of Shell( 40, 30 ) ) {
			expect( formula.Distance( ...p ) )
				.toBeCloseTo( cave.Distance( ...p ), 9 );
		}
	} );
} );

describe( "SdfSparseLayer", () => {
	const Cave = InvertedMandelbulb( 20 );

	it( "is its analytic base where nothing was folded", () => {
		const layer = new SdfSparseLayer( Cave, 0.1 );
		const under = CreateBaseLayer( Cave );

		expect( layer.CellSize ).toBeCloseTo( 0.8, 12 );
		expect( layer.Range ).toBeCloseTo( 0.4, 12 );
		for ( const p of Shell( 30, 25 ) ) {
			expect( layer.Distance( ...p, 0.2 ) )
				.toBe( under.Distance( ...p, 0.2 ) );
			expect( layer.MaterialMix ).toBe( under.MaterialMix );
		}

		// a base without a second material: the first stands for it
		const ground = new SdfSparseLayer(
			{ Kind: "Ground", MaterialId: 2 },
			0.1,
		);

		ground.Distance( 0, 1, 0 );
		expect( ground.MaterialB ).toBe( 2 );
		expect( ground.MaterialMix ).toBe( 0 );
		expect( ground.LayerIndex ).toBe( 0 );
	} );

	it( "keeps the cells a fold changed, and only those", () => {
		const layer = new SdfSparseLayer( { Kind: "Ground", Height: 0 }, 0.1 );
		const edits = new EditList();
		const world = new SdfWorld( layer, { MaxEdits: 0 }, edits );

		// a ball on the ground, folded at once (no recent edits kept)
		world.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothUnion,
			Position: [ 0.3, 0.5, 0.2 ],
			Params: [ 0.6, 0, 0, 0 ],
			SmoothK: 0.1,
			MaterialId: 5,
		} );
		expect( edits.Count ).toBe( 0 );
		expect( layer.CellCount ).toBeGreaterThan( 0 );

		const truth = new SdfField( new EditList(), new GroundPlane( 0 ) );

		truth.Edits.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothUnion,
			Position: [ 0.3, 0.5, 0.2 ],
			Params: [ 0.6, 0, 0, 0 ],
			SmoothK: 0.1,
			MaterialId: 5,
		} );
		// near the surface the cells match the field within quantization
		for ( const p of Shell( 60, 0.62 ) ) {
			const q: [ number, number, number ] = [
				p[0] + 0.3,
				p[1] + 0.5,
				p[2] + 0.2,
			];

			expect(
				Math.abs( layer.Distance( ...q ) - truth.Distance( ...q ) ),
			)
				.toBeLessThan( 0.02 );
		}
		layer.Distance( 0.3, 1.09, 0.2 );
		expect( layer.MaterialId ).toBe( 5 );
		// far away: the plain ground, no cell kept
		expect( layer.Distance( 30, 2, 30 ) ).toBe( 2 );

		// a cell deep inside what a fold filled: only its center's bound
		const deep = new SdfSparseLayer( { Kind: "Ground", Height: 0 }, 0.1 );

		deep.Fold(
			{
				...edits.Add( {
					Shape: SdfShape.Box,
					Position: [ 0, 3, 0 ],
					Params: [ 3, 3, 3, 0 ],
				} ),
			},
			CreateAabb( -3, 0, -3, 3, 6, 3 ),
		);
		expect( deep.Distance( 0.4, 3, 0.4 ) )
			.toBeLessThan( -deep.Range + 1e-9 );
		expect( deep.Distance( 0.4, 3.2, 0.4 ) ).toBeLessThan( 0 );
		// and deep inside a cavity a fold carved out of the solid: air
		deep.Fold(
			edits.Add( {
				Shape: SdfShape.Box,
				Op: SdfOp.Subtract,
				Position: [ 0, -6, 0 ],
				Params: [ 3, 3, 3, 0 ],
			} ),
			CreateAabb( -3, -9, -3, 3, -3, 3 ),
		);
		expect( deep.Distance( 0.4, -6, 0.4 ) )
			.toBeGreaterThan( deep.Range - 1e-9 );
	} );

	it( "goes to a worker and back as it is", () => {
		const layer = new SdfSparseLayer( Cave, 0.1 );
		const edits = new EditList();

		layer.Fold(
			edits.Add( {
				Shape: SdfShape.Sphere,
				Op: SdfOp.Subtract,
				Position: [ 28, 0, 0 ],
				Params: [ 2, 0, 0, 0 ],
			} ),
			CreateAabb( 26, -2, -2, 30, 2, 2 ),
		);
		// and a big one: cells with no brick
		layer.Fold(
			edits.Add( {
				Shape: SdfShape.Box,
				Position: [ 0, 0, 0 ],
				Params: [ 2.5, 2.5, 2.5, 0 ],
			} ),
			CreateAabb( -2.5, -2.5, -2.5, 2.5, 2.5, 2.5 ),
		);

		const copy = DeserializeBase( layer.Serialize() ) as SdfSparseLayer;

		expect( copy ).toBeInstanceOf( SdfSparseLayer );
		expect( copy.CellCount ).toBe( layer.CellCount );
		expect( copy.Descriptor ).toEqual( Cave );
		expect( copy.Spacing ).toBe( 0.1 );
		for ( const p of [
			...Shell( 40, 28 ),
			...Shell( 40, 1.5 ),
			...Shell( 20, 40 ),
		] ) {
			expect( copy.Distance( ...p ) ).toBe( layer.Distance( ...p ) );
		}

		// a baked layer is read back as one
		const baked = SdfBakedLayer.Bake(
			new SdfField( new EditList(), new GroundPlane( 0 ) ),
			{ Bounds: CreateAabb( -1, -1, -1, 1, 1, 1 ), Spacing: 0.25 },
		);

		expect( DeserializeBase( baked.Serialize() ) )
			.toBeInstanceOf( SdfBakedLayer );
		expect( SdfWorld.FromBase( layer.Serialize() ).Base )
			.toBeInstanceOf( SdfSparseLayer );

		// another format, another version
		expect( () => SdfSparseLayer.Deserialize( new ArrayBuffer( 24 ) ) )
			.toThrow();

		const bytes = layer.Serialize();

		new DataView( bytes ).setUint32( 4, 99, true );
		expect( () => SdfSparseLayer.Deserialize( bytes ) )
			.toThrow( /version 99/ );
	} );
} );

describe( "Detail", () => {
	/** A base that remembers the detail it was asked for. */
	class Probe implements SdfBaseLayer {
		public readonly MaterialId = 0;

		public Asked: number[] = [];

		public Distance(
			_x: number,
			y: number,
			_z: number,
			detail = 0,
		): number {
			this.Asked.push( detail );
			return y;
		}
	}

	it( "goes from the samplers to the base: a cell, a texel", () => {
		const probe = new Probe();
		const field = new SdfField( new EditList(), probe );

		// a program: none unless set
		const program = field.Compile();

		program.Distance( 0, 1, 0 );
		expect( probe.Asked ).toEqual( [ 0 ] );
		program.Detail = 0.3;
		program.Distance( 0, 1, 0 );
		expect( probe.Asked.at( -1 ) ).toBe( 0.3 );

		// a chunk of level 1: its cell
		probe.Asked = [];
		new SdfMeshChunks( field, { CellSize: 0.25, ChunkCells: 4, Radius: 1 } )
			.Mesh( "c", [ 0, 0, 0 ], [], false, 1 );
		expect( new Set( probe.Asked ) ).toEqual( new Set( [ 0.5 ] ) );

		// a dense grid and the bricks: their spacing
		probe.Asked = [];
		new DenseSdfGrid( field, CreateAabb( -1, -1, -1, 1, 1, 1 ), 8 );
		expect( new Set( probe.Asked ) ).toEqual( new Set( [ 0.25 ] ) );
		probe.Asked = [];
		new SdfVolume(
			field,
			{ Spacing: 0.1, MapSize: 2, Budget: 4 },
		).Update();
		expect( new Set( probe.Asked ) ).toEqual( new Set( [ 0.1 ] ) );
	} );
} );

describe( "Skirts on thin walls", () => {
	it( "never hang out of the far side of the solid", () => {
		// a wall 0.1 thick, skirts 0.4 deep
		const Wall = ( _x: number, y: number ): number => Math.abs( y ) - 0.05;
		const mesh = ExtractChunk( Wall, {
			Origin: [ -1, -1, -1 ],
			CellSize: 0.2,
			Cells: 10,
			Ao: false,
			Skirt: 0.4,
		} );
		let checked = 0;

		expect( mesh.SkirtFrom ).toBeGreaterThan( 0 );
		expect( mesh.SkirtFrom ).toBeLessThan( mesh.Indices.length );
		// every vertex - the wall's and the skirts' - in the wall or on it (a
		// skirt folded onto its edge)
		for ( let v = 0; v < mesh.Positions.length / 3; v++ ) {
			expect( Wall( 0, mesh.Positions[v * 3 + 1]! ) )
				.toBeLessThan( 1e-6 );
			checked++;
		}
		expect( checked ).toBeGreaterThan( 0 );
	} );
} );

describe( "FindStandingPlace", () => {
	it( "finds a floor facing up with room above, the nearest first", () => {
		// a box room: floor at 0, ceiling at 4, a pillar at the center
		const Room = {
			Distance: ( x: number, y: number, z: number ): number => Math.min(
				y,
				4 - y,
				Math.hypot( x, z ) - 1,
			),
		};
		const place = FindStandingPlace( Room, [ 0, 2, 0 ], { Radius: 5 } );

		expect( place ).not.toBeNull();
		expect( place!.Position[1] ).toBeCloseTo( 0, 2 );
		expect( place!.Normal[1] ).toBeGreaterThan( 0.99 );
		expect( Math.hypot( place!.Position[0], place!.Position[2] ) )
			.toBeGreaterThan( 1.3 );
		expect( FindStandingPlace( Room, [ 0, 2, 0 ], { Radius: 5 } ) )
			.toEqual( place );

		// too low a ceiling for the body; a floor too steep; nothing below
		expect(
			FindStandingPlace( Room, [ 3, 2, 0 ], { Radius: 2, Height: 5 } ),
		)
			.toBeNull();
		const Slope = {
			Distance: ( x: number, y: number ): number => (
				( y + x ) / Math.SQRT2
			),
		};

		expect(
			FindStandingPlace( Slope, [ 0, 1, 0 ], { Radius: 1, MinUp: 0.8 } ),
		)
			.toBeNull();
		expect(
			FindStandingPlace( Slope, [ 0, 1, 0 ], { Radius: 1, MinUp: 0.7 } ),
		)
			.not.toBeNull();
		expect(
			FindStandingPlace(
				{ Distance: () => 10 },
				[ 0, 0, 0 ],
				{ Radius: 1, Tries: 5 },
			),
		)
			.toBeNull();
		// a solid world: nowhere in the air
		expect(
			FindStandingPlace(
				{ Distance: () => -1 },
				[ 0, 0, 0 ],
				{ Tries: 5 },
			),
		)
			.toBeNull();
		// a surface with no sides (no gradient): not a floor
		expect( FindStandingPlace(
			{ Distance: ( _x: number, y: number ) => Math.abs( y - 1 ) },
			[ 0, 2, 0 ],
			{ Radius: 0.5, Tries: 3 },
		) ).toBeNull();
		// a flat floor right under: the normal there, all flat
		const flat = FindStandingPlace(
			{ Distance: ( _x: number, y: number ) => y },
			[ 0, 1, 0 ],
		);

		expect( flat!.Normal ).toEqual( [ 0, 1, 0 ] );
	} );

	it( "stands somewhere in the inverted Mandelbrot's cave", () => {
		const cave = CreateBaseLayer( InvertedMandelbrot( 20 ) );
		const place = FindStandingPlace( cave, [ 0, 0, 0 ], { Radius: 25 } )!;

		expect( place ).not.toBeNull();
		expect( cave.Distance( ...place.Position ) ).toBeLessThan( 0.01 );
		expect(
			cave.Distance(
				place.Position[0],
				place.Position[1] + 1,
				place.Position[2],
			),
		)
			.toBeGreaterThan( 0 );
		// the center itself: no infinite estimate, the bound
		expect( cave.Distance( 0, 0, 0 ) ).toBeCloseTo( 4.98, 6 );
		expect( new MandelbulbBase( { Invert: 1 } ).Distance( 0, 0, 0 ) )
			.toBeCloseTo( 0.23, 6 );
	} );
} );
