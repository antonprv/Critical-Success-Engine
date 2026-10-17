// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	Bvh,
	CreateAabb,
	Enclose,
	Expanded,
	IsEmptyAabb,
	Overlaps,
	RayAabb,
	SphereAabb,
	type BvhItem,
} from "../Source/Index";

/** A deterministic scatter of small boxes. */
function Scatter( count: number ): BvhItem[] {
	return Array.from( { length: count }, ( _, i ) => ( {
		Id: i + 100,
		Box: SphereAabb(
			Math.sin( i * 12.9898 ) * 40,
			Math.cos( i * 78.233 ) * 10,
			Math.sin( i * 37.719 ) * 25,
			0.5 + ( i % 5 ) * 0.4,
		),
	} ) );
}

function Brute( items: BvhItem[], box: Float64Array ): number[] {
	return items.filter( ( item ) => Overlaps( item.Box, box ) )
		.map( ( item ) => item.Id )
		.sort( ( a, b ) => a - b );
}

describe( "boxes", () => {
	it( "enclose, grow and overlap", () => {
		const box = CreateAabb();

		expect( IsEmptyAabb( box ) ).toBe( true );
		Enclose( box, SphereAabb( 1, 1, 1, 1 ) );
		expect( [ ...box ] ).toEqual( [ 0, 0, 0, 2, 2, 2 ] );
		expect( IsEmptyAabb( box ) ).toBe( false );
		expect( IsEmptyAabb( CreateAabb( 0, 1, 0, 1, 0, 1 ) ) ).toBe( true );
		expect( IsEmptyAabb( CreateAabb( 0, 0, 1, 1, 1, 0 ) ) ).toBe( true );
		expect( [ ...Expanded( box, 1 ) ] ).toEqual( [ -1, -1, -1, 3, 3, 3 ] );
		expect( Overlaps( box, CreateAabb( 2, 2, 2, 3, 3, 3 ) ) ).toBe( true );
		expect( Overlaps( box, CreateAabb( 2.1, 0, 0, 3, 1, 1 ) ) )
			.toBe( false );
	} );

	it( "meet rays", () => {
		const box = CreateAabb( 0, 0, 0, 1, 1, 1 );

		expect( RayAabb( box, -1, 0.5, 0.5, 1, 0, 0, 10 ) ).toBe( 1 );
		expect( RayAabb( box, 0.5, 0.5, 0.5, 1, 0, 0, 10 ) ).toBe( 0 );
		expect( RayAabb( box, -1, 0.5, 0.5, -1, 0, 0, 10 ) ).toBe( -1 );
		expect( RayAabb( box, -1, 2, 0.5, 1, 0, 0, 10 ) ).toBe( -1 );
		expect( RayAabb( box, -5, 0.5, 0.5, 1, 0, 0, 2 ) ).toBe( -1 );
		expect( RayAabb( box, -1, -1, 0.5, 1, 1, 0, 10 ) ).toBe( 1 );
		expect( RayAabb( box, -1, -1, 0.5, 3, 1, 0, 10 ) ).toBe( -1 );
	} );
} );

describe( "Bvh", () => {
	it( "is empty before a build", () => {
		const tree = new Bvh();

		expect( tree.Count ).toBe( 0 );
		expect( tree.Query( CreateAabb( -1e9, -1e9, -1e9, 1e9, 1e9, 1e9 ) ) )
			.toEqual( [] );
		expect( IsEmptyAabb( tree.Bounds ) ).toBe( true );
		tree.Build( [] );
		expect( tree.QueryRay( [ 0, 0, 0 ], [ 1, 0, 0 ], 10 ) ).toEqual( [] );
	} );

	it( "finds exactly what a brute force finds", () => {
		const items = Scatter( 300 );
		const tree = new Bvh();

		tree.Build( items );
		expect( tree.Count ).toBe( 300 );
		for ( let i = 0; i < 50; i++ ) {
			const box = SphereAabb(
				i * 1.6 - 40,
				( i % 7 ) - 3,
				( i % 11 ) * 4 - 20,
				3,
			);

			expect( tree.Query( box ).sort( ( a, b ) => a - b ) )
				.toEqual( Brute( items, box ) );
		}
		expect( [ ...tree.Bounds ] ).toEqual( [
			...items.reduce(
				( all, item ) => Enclose( all, item.Box ),
				CreateAabb(),
			),
		] );
	} );

	it( "refits a moved item and everything above it", () => {
		const items = Scatter( 64 );
		const tree = new Bvh();
		const far = SphereAabb( 500, 500, 500, 1 );

		tree.Build( items );
		expect( tree.Refit( 1, far ) ).toBe( false );
		expect( tree.Refit( 120, far ) ).toBe( true );
		expect( tree.Query( SphereAabb( 500, 500, 500, 0.1 ) ) )
			.toEqual( [ 120 ] );
		expect( tree.Bounds[3] ).toBe( 501 );
	} );

	it( "finds the boxes on a ray", () => {
		const tree = new Bvh();

		tree.Build( [
			{ Id: 1, Box: SphereAabb( 5, 0, 0, 1 ) },
			{ Id: 2, Box: SphereAabb( 5, 5, 0, 1 ) },
			{ Id: 3, Box: SphereAabb( 20, 0, 0, 1 ) },
		] );
		expect( tree.QueryRay( [ 0, 0, 0 ], [ 1, 0, 0 ], 10 ) )
			.toEqual( [ 1 ] );
		expect( tree.QueryRay( [ 0, 0, 0 ], [ 1, 0, 0 ], 30 ).sort() )
			.toEqual( [ 1, 3 ] );
	} );
} );
