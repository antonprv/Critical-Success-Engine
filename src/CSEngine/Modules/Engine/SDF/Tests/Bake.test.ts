// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	BAKED_MAGIC,
	CreateAabb,
	EditList,
	GroundPlane,
	SdfBakedLayer,
	SdfEditFlags,
	SdfField,
	SdfOp,
	SdfShape,
	SdfWorld,
	type SdfEditInit,
} from "../Source/Index";

/** The editor's world: ground and a ball standing on it. */
function EditorWorld(): SdfField {
	const edits = new EditList();

	edits.Add( {
		Shape: SdfShape.Sphere,
		Position: [ 0, 1, 0 ],
		Params: [ 1.2, 0, 0, 0 ],
		MaterialId: 3,
	} );
	return new SdfField( edits, new GroundPlane( 0, 1 ) );
}

const Bounds = CreateAabb( -4, -2, -4, 4, 4, 4 );

function Bake( field = EditorWorld() ): SdfBakedLayer {
	return SdfBakedLayer.Bake( field, { Bounds, Spacing: 0.1 } );
}

/** Points scattered through the bounds. */
function Points( count: number ): Array<[ number, number, number ]> {
	return Array.from( { length: count }, ( _, i ) => [
		Math.sin( i * 12.99 ) * 3.9,
		Math.cos( i * 4.1 ) * 1.9 + 1,
		Math.sin( i * 7.3 ) * 3.9,
	] );
}

/** Points near the surface of the editor's world. */
function NearSurface( count: number ): Array<[ number, number, number ]> {
	return Array.from( { length: count }, ( _, i ) => {
		const a = i * 0.9;
		const b = i * 0.37;

		return i % 2 === 0
			? [ Math.sin( a ) * 3, 0.03 * Math.sin( b ), Math.cos( a ) * 3 ]
			: [
				1.21 * Math.cos( a ) * Math.cos( b ),
				1 + 1.21 * Math.sin( b ),
				1.21 * Math.sin( a ) * Math.cos( b ),
			];
	} );
}

describe( "SdfBakedLayer", () => {
	it(
		"keeps the surface within quantization and never overshoots far away",
		() => {
			const field = EditorWorld();
			const layer = Bake( field );

			expect( layer.Size ).toEqual( [ 10, 8, 10 ] );
			expect( layer.CellSize ).toBeCloseTo( 0.8, 12 );
			expect( layer.Range ).toBeCloseTo( 0.4, 12 );
			expect( layer.BrickCount ).toBeGreaterThan( 0 );
			expect( layer.BrickCount ).toBeLessThan( 800 );
			// trilinear between samples rounds the crease where the ball meets
			// the ground off by about a quarter of a spacing
			for ( const [ x, y, z ] of NearSurface( 300 ) ) {
				expect(
					Math.abs(
						layer.Distance( x, y, z ) - field.Distance( x, y, z ),
					),
				)
					.toBeLessThan( 0.03 );
			}
			// a bound: never farther than the truth (or rays step through), but
			// for up to a spacing where a cell without a brick reads "out of
			// range"; the side is right wherever quantization can't flip it
			for ( const [ x, y, z ] of Points( 2000 ) ) {
				const truth = field.Distance( x, y, z );
				const baked = layer.Distance( x, y, z );

				if ( Math.abs( truth ) > 0.03 ) {
					expect( Math.sign( baked ) ).toBe( Math.sign( truth ) );
				}
				expect( Math.abs( baked ) )
					.toBeLessThanOrEqual( Math.abs( truth ) + 0.1 );
			}
		},
	);

	it( "keeps materials", () => {
		const layer = Bake();

		layer.Distance( 0, 2.2, 0 );
		expect( layer.MaterialId ).toBe( 3 );
		layer.Distance( 3, 0, 3 );
		expect( layer.MaterialId ).toBe( 1 );
		// a cell without a brick: its center's material
		layer.Distance( 3.5, -1.5, 3.5 );
		expect( layer.MaterialId ).toBe( 1 );
	} );

	it( "is empty outside its box", () => {
		const layer = Bake();

		expect( layer.Distance( 10, 0, 0 ) ).toBeCloseTo( 6, 12 );
		expect( layer.Distance( 0, -2.05, 0 ) ).toBe( layer.Range );
		expect( layer.MaterialId ).toBe( 0 );
		// whole cells: 6 m of height hold 7.5 cells, so 8
		[ -4, -2, -4, 4, 4.4, 4 ].forEach( ( value, i ) => {
			expect( layer.Bounds[i] ).toBeCloseTo( value, 9 );
		} );
	} );

	it( "folds an edit in where it reaches", () => {
		const field = EditorWorld();
		const layer = Bake( field );
		const hole: SdfEditInit = {
			Shape: SdfShape.Sphere,
			Op: SdfOp.Subtract,
			Position: [ 0, 1, 1.2 ],
			Params: [ 0.6, 0, 0, 0 ],
			MaterialId: 5,
		};
		const edit = field.Edits.Add( hole );

		layer.Fold( edit, field.Edits.Reach( edit ) );
		// the baked layer alone now matches the world with the hole (but for
		// the rim's sharp edge, rounded off by trilinear filtering)
		for ( let i = 0; i < 200; i++ ) {
			const x = Math.sin( i ) * 0.55;
			const y = 1 + Math.cos( i * 1.7 ) * 0.55;
			const z = 0.6 + ( i % 10 ) * 0.07;

			expect(
				Math.abs(
					layer.Distance( x, y, z ) - field.Distance( x, y, z ),
				),
			)
				.toBeLessThan( 0.05 );
		}
		layer.Distance( 0, 1, 0.6 );
		expect( layer.MaterialId ).toBe( 5 );
		// nothing to do out of the box
		layer.Fold(
			{ ...edit, Position: [ 50, 0, 0 ] },
			CreateAabb( 49, -1, -1, 51, 1, 1 ),
		);
	} );

	it( "frees bricks a fold empties and reuses them", () => {
		// a ball floating in the air, nothing else
		const edits = new EditList();

		edits.Add(
			{
				Shape: SdfShape.Sphere,
				Position: [ 0, 1, 0 ],
				Params: [ 1.2, 0, 0, 0 ],
			},
		);

		const field = new SdfField( edits );
		const layer = Bake( field );
		const carve = edits.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.Subtract,
			Position: [ 0, 1, 0 ],
			Params: [ 2.5, 0, 0, 0 ],
		} );

		expect( layer.BrickCount ).toBeGreaterThan( 0 );
		layer.Fold( carve, edits.Reach( carve ) );
		expect( layer.BrickCount ).toBe( 0 );

		const ball = edits.Add(
			{ Shape: SdfShape.Sphere, Position: [ 0, 1, 0 ] },
		);

		layer.Fold( ball, edits.Reach( ball ) );
		expect( layer.BrickCount ).toBeGreaterThan( 0 );
		expect( Math.abs( layer.Distance( 0, 1.5, 0 ) ) ).toBeLessThan( 0.01 );
	} );

	it( "saves and loads, free slots included", () => {
		const field = EditorWorld();
		const layer = Bake( field );
		// a second ball, then carved away: its bricks go free
		const ball = field.Edits.Add( {
			Shape: SdfShape.Sphere,
			Position: [ 2.5, 2.5, 2.5 ],
			Params: [ 0.8, 0, 0, 0 ],
		} );

		layer.Fold( ball, field.Edits.Reach( ball ) );

		const before = layer.BrickCount;
		const carve = field.Edits.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.Subtract,
			Position: [ 2.5, 2.5, 2.5 ],
			Params: [ 2, 0, 0, 0 ],
		} );

		layer.Fold( carve, field.Edits.Reach( carve ) );
		expect( layer.BrickCount ).toBeLessThan( before );

		const loaded = SdfBakedLayer.Deserialize( layer.Serialize() );

		expect( loaded.BrickCount ).toBe( layer.BrickCount );
		expect( loaded.Min ).toEqual( layer.Min );
		expect( loaded.Spacing ).toBe( layer.Spacing );
		for ( const [ x, y, z ] of Points( 500 ) ) {
			expect( loaded.Distance( x, y, z ) )
				.toBe( layer.Distance( x, y, z ) );
		}
	} );

	it( "refuses other formats", () => {
		const buffer = Bake().Serialize();
		const head = new Uint32Array( buffer, 0, 2 );

		head[1] = 7;
		expect( () => SdfBakedLayer.Deserialize( buffer ) )
			.toThrow( "version 7" );
		head[0] = BAKED_MAGIC + 1;
		expect( () => SdfBakedLayer.Deserialize( buffer ) )
			.toThrow( "Not a baked" );
	} );
} );

describe( "SdfWorld", () => {
	function Dig( world: SdfWorld, i: number, flags = SdfEditFlags.None ) {
		return world.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.Subtract,
			Position: [ -3 + i * 0.5, 0, 0 ],
			Params: [ 0.4, 0, 0, 0 ],
			Flags: flags,
		} );
	}

	it( "keeps only the last edits and folds the rest into the base", () => {
		const world = new SdfWorld( Bake(), { MaxEdits: 3 } );
		const kept = Dig( world, 0, SdfEditFlags.Keep );

		for ( let i = 1; i < 8; i++ ) {
			Dig( world, i );
		}
		expect( world.Edits.Count ).toBe( 3 );
		expect( world.Edits.Get( kept.Id ) ).toBe( kept );
		// a folded hole is still there, now in the base
		expect( world.Field.Distance( -2.5, 0, 0 ) ).toBeCloseTo( 0.4, 1 );
		expect( world.FoldExcess() ).toBe( 0 );
		expect( new SdfWorld( Bake() ).MaxEdits ).toBe( 32 );
	} );

	it( "keeps more than MaxEdits when they are all kept", () => {
		const world = new SdfWorld( Bake(), { MaxEdits: 1 } );

		Dig( world, 0, SdfEditFlags.Keep );
		Dig( world, 1, SdfEditFlags.Keep );
		expect( world.Edits.Count ).toBe( 2 );
	} );

	it( "stays identical in a worker that replays its deltas", () => {
		const base = Bake();
		const main = new SdfWorld( base, { MaxEdits: 2 } );
		const replica = SdfWorld.FromBase(
			base.Serialize(),
			{ MaxEdits: 1000 },
		);

		for ( let i = 0; i < 4; i++ ) {
			Dig( main, i );
		}
		replica.Edits.ApplyDelta( main.Edits.TakeDelta() );
		for ( let i = 4; i < 9; i++ ) {
			const edit = Dig( main, i );

			main.Edits.Update( edit.Id, { Scale: 1.1 } );
		}
		replica.Edits.ApplyDelta( main.Edits.TakeDelta() );
		expect( replica.Edits.Edits ).toEqual( main.Edits.Edits );
		for ( const [ x, y, z ] of Points( 500 ) ) {
			expect( replica.Field.Distance( x, y, z ) )
				.toBe( main.Field.Distance( x, y, z ) );
		}
	} );

	it( "folds without a base to merge into, and not twice", () => {
		const list = new EditList();
		const edit = list.Add( { Shape: SdfShape.Sphere } );

		expect( list.Fold( edit.Id ) ).toBe( true );
		expect( list.Fold( edit.Id ) ).toBe( false );
		expect( list.Count ).toBe( 0 );
	} );
} );
