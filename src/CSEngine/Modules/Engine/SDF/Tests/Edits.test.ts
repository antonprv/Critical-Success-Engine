// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	CreateAabb,
	EDIT_LIST_MAGIC,
	EDIT_WORDS,
	EditList,
	IsCarving,
	IsGlobal,
	IsSmooth,
	PackEdit,
	SdfEditFlags,
	SdfOp,
	SdfPhysicsMode,
	SdfShape,
	UnpackEdit,
	type SdfEdit,
} from "../Source/Index";

function Sphere(
	list: EditList,
	x: number,
	radius = 1,
	op = SdfOp.Union,
): SdfEdit {
	return list.Add( {
		Shape: SdfShape.Sphere,
		Op: op,
		Position: [ x, 0, 0 ],
		Params: [ radius, 0, 0, 0 ],
	} );
}

describe( "packed edits", () => {
	it( "round-trip through 64 bytes", () => {
		const buffer = new ArrayBuffer( EDIT_WORDS * 4 * 2 );
		const floats = new Float32Array( buffer );
		const words = new Uint32Array( buffer );
		const edit: SdfEdit = {
			Id: 7,
			Shape: SdfShape.Torus,
			Op: SdfOp.SmoothSubtract,
			Position: [ 1.5, -2, 3 ],
			Rotation: [ 0, 0.5, 0, 0.75 ],
			Scale: 2,
			Params: [ 1, 0.25, 0, 0 ],
			SmoothK: 0.5,
			MaterialId: 0xfffe,
			Flags: SdfEditFlags.Preview | SdfEditFlags.Muted,
			PhysicsMode: SdfPhysicsMode.Sensor,
			Group: 3,
			Order: 42,
		};

		PackEdit( edit, floats, words, 1 );
		expect( UnpackEdit( 7, floats, words, 1 ) ).toEqual( edit );
	} );

	it( "classify operations", () => {
		expect( IsCarving( SdfOp.Subtract ) ).toBe( true );
		expect( IsCarving( SdfOp.SmoothSubtract ) ).toBe( true );
		expect( IsCarving( SdfOp.Union ) ).toBe( false );
		expect( IsGlobal( SdfOp.Intersect ) ).toBe( true );
		expect( IsGlobal( SdfOp.SmoothIntersect ) ).toBe( true );
		expect( IsGlobal( SdfOp.SmoothUnion ) ).toBe( false );
		expect( IsSmooth( SdfOp.SmoothUnion ) ).toBe( true );
		expect( IsSmooth( SdfOp.Subtract ) ).toBe( false );
	} );
} );

describe( "EditList", () => {
	it( "adds edits in order with defaults and own copies", () => {
		const list = new EditList();
		const position: [ number, number, number ] = [ 1, 2, 3 ];
		const a = list.Add( { Shape: SdfShape.Box, Position: position } );
		const b = Sphere( list, 4 );

		position[0] = 99;
		expect( a.Position ).toEqual( [ 1, 2, 3 ] );
		expect( a.Op ).toBe( SdfOp.Union );
		expect( a.Rotation ).toEqual( [ 0, 0, 0, 1 ] );
		expect( a.Id ).not.toBe( b.Id );
		expect( list.Edits ).toEqual( [ a, b ] );
		expect( list.Count ).toBe( 2 );
		expect( list.Version ).toBe( 2 );
		expect( list.Get( a.Id ) ).toBe( a );
	} );

	it( "updates, reorders and removes", () => {
		const list = new EditList();
		const a = Sphere( list, 0 );
		const b = Sphere( list, 5 );

		expect( list.Update( 999, { Scale: 2 } ) ).toBe( false );
		expect( list.Update( a.Id, { Order: b.Order + 1 } ) ).toBe( true );
		expect( list.Edits.map( ( edit ) => edit.Id ) )
			.toEqual( [ b.Id, a.Id ] );

		// a later add still goes last
		const c = Sphere( list, 9 );

		expect( list.Edits.at( -1 ) ).toBe( c );
		expect( list.Remove( b.Id ) ).toBe( true );
		expect( list.Remove( b.Id ) ).toBe( false );
		expect( list.Edits.map( ( edit ) => edit.Id ) )
			.toEqual( [ a.Id, c.Id ] );
		// a tie in order falls back to the id
		list.Update( c.Id, { Order: a.Order } );
		expect( list.Edits.map( ( edit ) => edit.Id ) )
			.toEqual( [ a.Id, c.Id ] );
		list.Clear();
		expect( list.Count ).toBe( 0 );
	} );

	it( "reaches as far as the shape, its scale and its blend", () => {
		const list = new EditList();
		const plain = Sphere( list, 0, 1 );
		const smooth = list.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothUnion,
			Params: [ 1, 0, 0, 0 ],
			Scale: 2,
			SmoothK: 0.5,
		} );
		const clip = list.Add(
			{ Shape: SdfShape.Sphere, Op: SdfOp.Intersect },
		);

		expect( [ ...list.Reach( plain ) ] ).toEqual( [ -1, -1, -1, 1, 1, 1 ] );
		expect( list.Reach( smooth )[3] ).toBe( 2.5 );
		expect( list.Reach( clip )[0] ).toBe( -Infinity );
	} );

	it(
		"finds the edits that reach a box, by order, without muted ones",
		() => {
			const list = new EditList();
			const near = Sphere( list, 0 );

			Sphere( list, 10 );

			const muted = Sphere( list, 0.5 );
			const clip = list.Add( {
				Shape: SdfShape.Sphere,
				Op: SdfOp.Intersect,
				Position: [ 50, 0, 0 ],
			} );

			list.Update( muted.Id, { Flags: SdfEditFlags.Muted } );

			const found = list.Candidates(
				CreateAabb( -0.5, -0.5, -0.5, 0.5, 0.5, 0.5 ),
			);

			expect( found ).toEqual( [ near, clip ] );
		},
	);

	it( "keeps the tree in step with moves and op changes", () => {
		const list = new EditList();
		const a = Sphere( list, 0 );
		const box = CreateAabb( 19, -1, -1, 21, 1, 1 );

		expect( list.Candidates( box ) ).toEqual( [] );
		// built: a move refits it
		list.Update( a.Id, { Position: [ 20, 0, 0 ] } );
		expect( list.Candidates( box ) ).toEqual( [ a ] );
		// global and back
		list.Update( a.Id, { Op: SdfOp.Intersect } );
		expect( list.Candidates( CreateAabb( 90, 90, 90, 91, 91, 91 ) ) )
			.toEqual( [ a ] );
		list.Update( a.Id, { Op: SdfOp.Union } );
		expect( list.Candidates( CreateAabb( 90, 90, 90, 91, 91, 91 ) ) )
			.toEqual( [] );
	} );

	it( "finds the edits along a ray", () => {
		const list = new EditList();
		const hit = Sphere( list, 5 );

		// off the ray
		list.Add( { Shape: SdfShape.Sphere, Position: [ 0, 5, 0 ] } );

		const clip = list.Add(
			{ Shape: SdfShape.Sphere, Op: SdfOp.SmoothIntersect },
		);

		expect( list.CandidatesOnRay( [ 0, 0, 0 ], [ 1, 0, 0 ], 10 ) )
			.toEqual( [ hit, clip ] );
	} );

	it( "reports the changed boxes to every watcher", () => {
		const list = new EditList();
		const first = list.Watch();
		const a = Sphere( list, 0 );
		const second = list.Watch();

		list.Update( a.Id, { Position: [ 3, 0, 0 ] } );
		// add, then the old and the new place
		expect( first.Take() ).toHaveLength( 3 );
		expect( first.Take() ).toHaveLength( 0 );
		expect( second.Take().map( ( box ) => box[0] ) ).toEqual( [ -1, 2 ] );
		second.Stop();
		list.Remove( a.Id );
		expect( second.Take() ).toHaveLength( 0 );
		expect( first.Take() ).toHaveLength( 1 );
	} );

	it( "replays its changes on another list", () => {
		const source = new EditList();
		const target = new EditList();
		const a = Sphere( source, 0 );
		const b = Sphere( source, 3 );

		source.Update( a.Id, { Scale: 3 } );
		expect( target.ApplyDelta( source.TakeDelta() ) )
			.toBe( source.Version );
		expect( target.Edits ).toEqual( source.Edits );

		source.Update( b.Id, { MaterialId: 4 } );
		source.Remove( a.Id );
		target.ApplyDelta( source.TakeDelta() );
		expect( target.Edits ).toEqual( source.Edits );

		// ids continue after the adopted ones
		expect( target.Add( { Shape: SdfShape.Box } ).Id ).toBe( b.Id + 1 );
		expect( new Uint32Array( source.TakeDelta() )[0] ).toBe( 0 );
	} );

	it( "saves and loads, without previews", () => {
		const list = new EditList();
		const kept = Sphere( list, 1 );
		const preview = Sphere( list, 2 );

		list.Update( preview.Id, { Flags: SdfEditFlags.Preview } );

		const loaded = EditList.Deserialize( list.Serialize() );

		expect( loaded.Edits ).toEqual( [ kept ] );
		expect( loaded.Version ).toBe( 0 );
		// the next id skips the dropped preview
		expect( loaded.Add( { Shape: SdfShape.Box } ).Id )
			.toBe( preview.Id + 1 );
	} );

	it( "refuses other formats", () => {
		const buffer = new EditList().Serialize();
		const head = new Uint32Array( buffer );

		head[1] = 99;
		expect( () => EditList.Deserialize( buffer ) ).toThrow( "version 99" );
		head[0] = EDIT_LIST_MAGIC + 1;
		expect( () => EditList.Deserialize( buffer ) ).toThrow( "Not an SDF" );
	} );
} );
