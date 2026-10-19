// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	DYNAMIC_EDIT_FLOATS,
	EditList,
	GroundPlane,
	IsEmptyAabb,
	MAX_DYNAMIC_EDITS,
	SdfDynamicEdits,
	SdfEditFlags,
	SdfField,
	SdfOp,
	SdfShape,
	type SdfDynamicInit,
} from "../Source/Index";

const Hole: SdfDynamicInit = {
	Shape: SdfShape.Sphere,
	Op: SdfOp.SmoothSubtract,
	Position: [ 0, 0, 0 ],
	Params: [ 1, 0, 0, 0 ],
	SmoothK: 0.3,
	MaterialId: 2,
};

describe( "SdfDynamicEdits", () => {
	it( "adds, changes and removes edits, keeping their order", () => {
		const dynamic = new SdfDynamicEdits();
		const a = dynamic.Add( { Shape: SdfShape.Box } );
		const b = dynamic.Add( Hole );
		const c = dynamic.Add( { Shape: SdfShape.Torus, MaterialId: 4 } );

		// the defaults of an edit list's edit
		expect( a ).toMatchObject( {
			Op: SdfOp.Union,
			Position: [ 0, 0, 0 ],
			Rotation: [ 0, 0, 0, 1 ],
			Scale: 1,
			Params: [ 0.5, 0.5, 0.5, 0 ],
			SmoothK: 0,
			MaterialId: 0,
		} );
		expect( [ a.Id, b.Id, c.Id ] ).toEqual( [ 1, 2, 3 ] );
		expect( dynamic.Get( b.Id ) ).toBe( b );
		expect( dynamic.Get( 99 ) ).toBeUndefined();
		expect( dynamic.Update( 99, { Scale: 2 } ) ).toBe( false );
		expect( dynamic.Remove( 99 ) ).toBe( false );

		// its own arrays: changing what was passed in changes nothing
		const position: [ number, number, number ] = [ 1, 2, 3 ];

		dynamic.Update( b.Id, { Position: position } );
		position[0] = 50;
		expect( b.Position ).toEqual( [ 1, 2, 3 ] );
		expect(
			[
				...dynamic.Data.slice(
					DYNAMIC_EDIT_FLOATS,
					DYNAMIC_EDIT_FLOATS + 3,
				),
			],
		).toEqual( [ 1, 2, 3 ] );

		dynamic.Remove( a.Id );
		expect( dynamic.Edits ).toEqual( [ b, c ] );
		// packed in their new places
		expect( dynamic.Data[DYNAMIC_EDIT_FLOATS + 13] ).toBe( SdfShape.Torus );
		expect( dynamic.Data[DYNAMIC_EDIT_FLOATS + 15] ).toBe( 4 );
		expect( dynamic.Packed() ).toHaveLength( 2 * DYNAMIC_EDIT_FLOATS );
	} );

	it( "says when it changed, once", () => {
		const dynamic = new SdfDynamicEdits();

		expect( dynamic.TakeChanged() ).toBe( false );

		const hole = dynamic.Add( Hole );

		expect( dynamic.TakeChanged() ).toBe( true );
		expect( dynamic.TakeChanged() ).toBe( false );
		dynamic.Update( hole.Id, { Scale: 2 } );
		expect( dynamic.TakeChanged() ).toBe( true );
		dynamic.Remove( hole.Id );
		expect( dynamic.TakeChanged() ).toBe( true );
		// clearing nothing changes nothing
		dynamic.Clear();
		expect( dynamic.TakeChanged() ).toBe( false );
		dynamic.Add( Hole );
		dynamic.TakeChanged();
		dynamic.Clear();
		expect( dynamic.Count ).toBe( 0 );
		expect( dynamic.TakeChanged() ).toBe( true );
	} );

	it( "holds at most MAX_DYNAMIC_EDITS", () => {
		const dynamic = new SdfDynamicEdits();

		for ( let i = 0; i < MAX_DYNAMIC_EDITS; i++ ) {
			dynamic.Add( Hole );
		}
		expect( () => dynamic.Add( Hole ) ).toThrow( RangeError );
	} );

	it( "travels packed and reads back the same", () => {
		const sender = new SdfDynamicEdits();

		sender.Add( {
			...Hole,
			Position: [ 1, 2, 3 ],
			Rotation: [ 0, 0.7071, 0, 0.7071 ],
			Scale: 1.5,
			Params: [ 0.8, 0.2, 0.1, 0.05 ],
		} );
		sender.Add( { Shape: SdfShape.Capsule, Op: SdfOp.Union } );

		const receiver = new SdfDynamicEdits();

		receiver.Load( sender.Packed() );
		expect( receiver.Count ).toBe( 2 );
		expect( receiver.Edits[0] ).toEqual( {
			...sender.Edits[0],
			Rotation: [ 0, Math.fround( 0.7071 ), 0, Math.fround( 0.7071 ) ],
			Params: [ 0.8, 0.2, 0.1, 0.05 ].map( Math.fround ),
			SmoothK: Math.fround( 0.3 ),
		} );
		expect( receiver.Data.slice( 0, 32 ) )
			.toEqual( sender.Data.slice( 0, 32 ) );
		expect( receiver.TakeChanged() ).toBe( true );

		// more than it can hold: the first MAX_DYNAMIC_EDITS
		receiver.Load(
			new Float32Array( ( MAX_DYNAMIC_EDITS + 2 ) * DYNAMIC_EDIT_FLOATS ),
		);
		expect( receiver.Count ).toBe( MAX_DYNAMIC_EDITS );
	} );

	it( "applies its edits as the field would, in their order", () => {
		const ground = new GroundPlane( 0 );
		const dynamic = new SdfDynamicEdits();
		const list = new EditList();
		const edits: SdfDynamicInit[] = [
			{ ...Hole, Position: [ 0.5, 0, 0 ] },
			{
				Shape: SdfShape.RoundBox,
				Op: SdfOp.SmoothUnion,
				Position: [ -1, 0.5, 0.3 ],
				Rotation: [ 0, 0.3827, 0, 0.9239 ],
				Params: [ 0.5, 0.4, 0.3, 0.1 ],
				SmoothK: 0.2,
			},
			{
				Shape: SdfShape.Cylinder,
				Op: SdfOp.Subtract,
				Position: [ -1, 0.5, 0.3 ],
				Scale: 0.5,
				Params: [ 2, 0.3, 0, 0 ],
			},
		];

		for ( const edit of edits ) {
			dynamic.Add( edit );
			list.Add( { ...edit, Flags: SdfEditFlags.None } );
		}

		const field = new SdfField( list, ground );

		for ( let i = 0; i < 200; i++ ) {
			const x = Math.sin( i * 1.3 ) * 2;
			const y = Math.cos( i * 0.7 ) * 1.5;
			const z = Math.sin( i * 2.1 ) * 1.5;

			expect( dynamic.Apply( ground.Distance( x, y, z ), x, y, z ) )
				.toBeCloseTo( field.Distance( x, y, z ), 5 );
		}
	} );

	it( "knows how far its edits reach and whether one carves", () => {
		const dynamic = new SdfDynamicEdits();

		expect( IsEmptyAabb( dynamic.Bounds() ) ).toBe( true );
		expect( dynamic.Carves ).toBe( false );

		const hole = dynamic.Add( { ...Hole, Position: [ 2, 0, 0 ] } );

		// the radius, the blend and the margin
		expect( [ ...SdfDynamicEdits.Reach( hole, 0.2 )! ] )
			.toEqual( [ 0.5, -1.5, -1.5, 3.5, 1.5, 1.5 ] );
		expect( dynamic.Carves ).toBe( true );
		dynamic.Add( { Shape: SdfShape.Sphere, Position: [ -2, 0, 0 ] } );
		// an intersection changes everything: no box
		dynamic.Add( { Shape: SdfShape.Sphere, Op: SdfOp.Intersect } );
		expect( SdfDynamicEdits.Reach( dynamic.Edits[2]! ) ).toBeNull();
		expect( [ ...dynamic.Bounds() ] )
			.toEqual( [ -2.5, -1.3, -1.3, 3.3, 1.3, 1.3 ] );
	} );
} );
