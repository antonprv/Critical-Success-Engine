// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Engine } from "@babylonjs/core/Engines/engine";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { PrimitiveBatch } from "../Source/Workers/Render/PrimitiveBatch";

const engines: Engine[] = [];
afterEach( () => {
	for ( const engine of engines.splice( 0 ) ) {
		engine.dispose();
	}
} );

function Make( capacity = 2 ) {
	const engine = new NullEngine();
	engines.push( engine );
	const scene = new Scene( engine );
	const mesh = CreateBox( "batch", { size: 1 }, scene );
	const batch = new PrimitiveBatch(
		mesh,
		new StandardMaterial( "white", scene ),
		capacity,
	);

	return { scene, mesh, batch };
}

/** An instance's matrix as the GPU gets it (the thin instance buffer). */
const matrixAt = ( mesh: unknown, slot: number ) => [...( mesh as {
	_thinInstanceDataStorage: { matrixData: Float32Array; };
} )._thinInstanceDataStorage.matrixData.subarray( slot * 16, slot * 16 + 16 )];

describe(
	"PrimitiveBatch: many entities of one shape as one mesh (thin instances)",
	() => {
		it(
			"adds instances with a pose and a colour; one mesh draws them all, "
			+ "never culled as a whole",
			() => {
				const { mesh, batch } = Make();
				expect( batch.Add( 10, [1, 2, 3, 0, 0, 0, 1], [1, 0, 0] ) )
					.toBe( 0 );
				expect( batch.Add( 11, [4, 5, 6, 0, 0, 0, 1], [0, 1, 0] ) )
					.toBe( 1 );
				// past the first capacity: it grows
				expect( batch.Add( 12, [7, 8, 9, 0, 0, 0, 1], [0, 0, 1] ) )
					.toBe( 2 );
				batch.Flush();

				expect(
					[
						batch.Count,
						mesh.thinInstanceCount,
						mesh.alwaysSelectAsActiveMesh,
					],
				).toEqual( [3, 3, true] );
				expect( matrixAt( mesh, 2 ).slice( 12, 15 ) )
					.toEqual( [7, 8, 9] );
				expect( batch.Describe( 1 ) )
					.toEqual(
						{
							Position: [4, 5, 6],
							Rotation: [0, 0, 0, 1],
							Color: [0, 1, 0],
							Visible: true,
						},
					);
				expect( batch.IdAt( 2 ) ).toBe( 12 );
			},
		);

		it(
			"moves, recolours, hides (a zero-scale matrix) and shows again "
				+ "where "
			+ "it was",
			() => {
				const { mesh, batch } = Make();
				batch.Add( 1, [0, 0, 0, 0, 0, 0, 1], [1, 1, 1] );
				batch.SetPose( 0, 5, 0, 0, 0, 1, 0, 0 );
				batch.SetColor( 0, [0.5, 0.5, 0.5] );
				batch.SetVisible( 0, false );
				batch.Flush();
				expect( matrixAt( mesh, 0 ).every( ( value ) => value === 0 ) )
					.toBe( true );
				batch.SetVisible( 0, true );
				batch.Flush();
				expect( matrixAt( mesh, 0 ).slice( 12, 15 ) )
					.toEqual( [5, 0, 0] );
				expect( batch.Describe( 0 ) )
					.toEqual(
						{
							Position: [5, 0, 0],
							Rotation: [0, 1, 0, 0],
							Color: [0.5, 0.5, 0.5],
							Visible: true,
						},
					);
				// a move while hidden is kept for when it shows
				batch.SetVisible( 0, false );
				batch.SetPose( 0, 9, 9, 9, 0, 0, 0, 1 );
				batch.SetVisible( 0, true );
				batch.Flush();
				expect( matrixAt( mesh, 0 ).slice( 12, 15 ) )
					.toEqual( [9, 9, 9] );
			},
		);

		it(
			"removes by moving the last instance into the hole (and says which "
			+ "entity moved)",
			() => {
				const { mesh, batch } = Make( 4 );
				batch.Add( 1, [1, 0, 0, 0, 0, 0, 1], [1, 0, 0] );
				batch.Add( 2, [2, 0, 0, 0, 0, 0, 1], [0, 1, 0] );
				batch.Add( 3, [3, 0, 0, 0, 0, 0, 1], [0, 0, 1] );
				// entity 3 now sits in slot 0
				expect( batch.Remove( 0 ) ).toBe( 3 );
				// the last one: nothing moves
				expect( batch.Remove( 1 ) ).toBeNull();
				batch.Flush();
				expect( [batch.Count, mesh.thinInstanceCount, batch.IdAt( 0 )] )
					.toEqual( [1, 1, 3] );
				expect( batch.Describe( 0 ) )
					.toMatchObject( { Position: [3, 0, 0], Color: [0, 0, 1] } );
				batch.Flush(); // nothing changed: nothing to upload
				batch.Remove( 0 );
				batch.Flush();
				expect( mesh.thinInstanceCount ).toBe( 0 );
				batch.Dispose();
				expect( mesh.isDisposed() ).toBe( true );
			},
		);
	},
);
