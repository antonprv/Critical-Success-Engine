// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	ChunkKey,
	EditList,
	ExtractChunk,
	GroundPlane,
	MAX_CHUNK_CELLS,
	SdfField,
	SdfMeshChunks,
	SdfOp,
	SdfShape,
	type SdfMeshData,
} from "../Source/Index";

const Ball = ( x: number, y: number, z: number ): number => (
	Math.hypot( x, y, z ) - 1.3
);

/** The unit normal of each triangle, by its winding. */
function FaceNormals( mesh: SdfMeshData ): Array<[ number, number, number ]> {
	const p = mesh.Positions;
	const out: Array<[ number, number, number ]> = [];

	for ( let t = 0; t < mesh.Indices.length; t += 3 ) {
		const [ a, b, c ] = [ 0, 1, 2 ].map(
			( k ) => mesh.Indices[t + k]! * 3,
		);
		const ux = p[b!]! - p[a!]!;
		const uy = p[b! + 1]! - p[a! + 1]!;
		const uz = p[b! + 2]! - p[a! + 2]!;
		const vx = p[c!]! - p[a!]!;
		const vy = p[c! + 1]! - p[a! + 1]!;
		const vz = p[c! + 2]! - p[a! + 2]!;
		const nx = uy * vz - uz * vy;
		const ny = uz * vx - ux * vz;
		const nz = ux * vy - uy * vx;
		const length = Math.hypot( nx, ny, nz ) || 1;

		out.push( [ nx / length, ny / length, nz / length ] );
	}
	return out;
}

describe( "ExtractChunk", () => {
	it( "refuses chunk sizes outside 16-bit indices", () => {
		const options = { Origin: [ 0, 0, 0 ] as const, CellSize: 1 };

		expect( () => ExtractChunk( Ball, { ...options, Cells: 0 } ) )
			.toThrow( RangeError );
		expect( () => ExtractChunk( Ball, { ...options, Cells: 2.5 } ) )
			.toThrow( RangeError );
		expect(
			() => ExtractChunk(
				Ball,
				{ ...options, Cells: MAX_CHUNK_CELLS + 1 },
			),
		)
			.toThrow( RangeError );
	} );

	it( "puts vertices on the surface and faces outward", () => {
		const mesh = ExtractChunk(
			Ball,
			{ Origin: [ -2, -2, -2 ], CellSize: 0.25, Cells: 16 },
		);
		const count = mesh.Positions.length / 3;

		expect( mesh.Indices ).toBeInstanceOf( Uint16Array );
		expect( mesh.Indices.length ).toBeGreaterThan( 0 );
		expect( Math.max( ...mesh.Indices ) ).toBe( count - 1 );
		for ( let v = 0; v < count; v++ ) {
			const [ x, y, z ] = [ 0, 1, 2 ].map(
				( k ) => mesh.Positions[v * 3 + k]!,
			);

			expect( Math.abs( Ball( x!, y!, z! ) ) ).toBeLessThan( 0.05 );
			// the normal of a ball points away from its center
			expect( mesh.Normals[v * 3]! * x! + mesh.Normals[v * 3 + 1]! * y!
				+ mesh.Normals[v * 3 + 2]! * z! ).toBeGreaterThan( 0 );
			// nothing covers a ball's outside (the vertex may sit a hair
			// inside)
			expect( mesh.Ao[v] ).toBeGreaterThan( 0.99 );
		}
		FaceNormals( mesh ).forEach( ( [ nx, ny, nz ], t ) => {
			const a = mesh.Indices[t * 3]! * 3;

			expect( nx * mesh.Positions[a]! + ny * mesh.Positions[a + 1]!
				+ nz * mesh.Positions[a + 2]! ).toBeGreaterThan( 0 );
		} );
		expect( mesh.MaterialIds.every( ( id ) => id === 0 ) ).toBe( true );
	} );

	it( "joins chunks without cracks or doubles", () => {
		// the ball across eight chunks of 8 cells
		const edges = new Map<string, number>();
		const vertices: number[] = [];

		for ( const ox of [ -2, 0 ] ) {
			for ( const oy of [ -2, 0 ] ) {
				for ( const oz of [ -2, 0 ] ) {
					const mesh = ExtractChunk( Ball, {
						Origin: [ ox, oy, oz ],
						CellSize: 0.25,
						Cells: 8,
						Ao: false,
					} );
					const Key = ( index: number ): string => [ 0, 1, 2 ]
						.map(
							( k ) => mesh.Positions[index * 3 + k]!.toFixed(
								5,
							),
						)
						.join( "," );

					for ( let t = 0; t < mesh.Indices.length; t += 3 ) {
						for ( let e = 0; e < 3; e++ ) {
							const a = Key( mesh.Indices[t + e]! );
							const b = Key( mesh.Indices[t + ( e + 1 ) % 3]! );

							// a directed edge: once one way, once the other
							edges.set(
								`${ a }>${ b }`,
								( edges.get( `${ a }>${ b }` ) ?? 0 ) + 1,
							);
						}
					}
					vertices.push( ...mesh.Ao );
				}
			}
		}
		expect( vertices.every( ( ao ) => ao === 1 ) ).toBe( true );
		for ( const [ edge, count ] of edges ) {
			const [ a, b ] = edge.split( ">" );

			expect( count ).toBe( 1 );
			expect( edges.get( `${ b }>${ a }` ) ).toBe( 1 );
		}
	} );

	it( "bakes occlusion in corners and materials", () => {
		// a floor meeting a wall at x = 1: the wall covers the floor by it
		const corner = ExtractChunk(
			( x, y ) => Math.min( y, 1 - x ),
			{ Origin: [ -2, -1, -2 ], CellSize: 0.25, Cells: 16 },
		);
		const covered = [ ...corner.Ao ].filter( ( ao ) => ao < 0.95 );

		expect( covered.length ).toBeGreaterThan( 0 );

		const tinted = ExtractChunk( Ball, {
			Origin: [ -2, -2, -2 ],
			CellSize: 0.5,
			Cells: 8,
			Material: ( x ) => ( x > 0 ? 2 : 1 ),
		} );

		expect( new Set( tinted.MaterialIds ) ).toEqual( new Set( [ 1, 2 ] ) );
	} );

	it( "faces a flat field up where there is no gradient", () => {
		const step = ExtractChunk(
			// a hard step: the gradient vanishes in the flat parts sampled
			( _x, y ) => ( y < 0.2 ? -1 : 1 ),
			{ Origin: [ 0, 0, 0 ], CellSize: 1, Cells: 2, Ao: false },
		);

		expect( step.Normals[1] ).toBe( 1 );
	} );
} );

describe( "SdfMeshChunks", () => {
	function World() {
		const list = new EditList();
		const field = new SdfField( list, new GroundPlane( 0.3 ) );
		const chunks = new SdfMeshChunks( field, {
			CellSize: 0.5,
			ChunkCells: 4,
			Radius: 1,
			Budget: 100,
		} );

		return { list, field, chunks };
	}

	it( "meshes the chunks around the center", () => {
		const { chunks } = World();

		expect( chunks.ChunkSize ).toBe( 2 );
		expect( chunks.Keys ).toHaveLength( 27 );
		expect( chunks.Pending ).toBe( 27 );
		// the same area, nearest chunk (0, 0, 0)
		chunks.CenterOn( 1, 1, 1 );

		const update = chunks.Update();

		expect( update.Built ).toHaveLength( 27 );
		expect( update.Removed ).toEqual( [] );
		expect( update.Remaining ).toBe( 0 );

		// the ground crosses the chunks at y = 0
		const ground = update.Built.find(
			( chunk ) => chunk.Key === ChunkKey( 0, 0, 0 ),
		)!;

		expect( ground.Mesh.Indices.length ).toBeGreaterThan( 0 );
		expect( ground.Version ).toBe( 0 );
		expect( update.Built[0]!.Key ).toBe( ChunkKey( 0, 0, 0 ) );
		expect( chunks.Update().Built ).toEqual( [] );
	} );

	it( "remeshes what an edit reaches, within the budget", () => {
		const { list, chunks } = World();

		chunks.Update();
		chunks.Budget = 2;

		const hole = list.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.Subtract,
			Position: [ 1, 0.3, 1 ],
			Params: [ 0.5, 0, 0, 0 ],
		} );
		const first = chunks.Update();

		expect( first.Built ).toHaveLength( 2 );
		expect( first.Remaining ).toBeGreaterThan( 0 );
		expect( first.Built[0]!.Version ).toBe( list.Version );
		expect( list.Get( hole.Id ) ).toBe( hole );

		// far from every chunk: nothing to remesh
		chunks.Budget = 100;
		chunks.Update();
		list.Add( { Shape: SdfShape.Sphere, Position: [ 50, 0, 0 ] } );
		expect( chunks.Update().Built ).toEqual( [] );
	} );

	it( "hands out chunks never meshed before rebuilds", () => {
		const { list, chunks } = World();

		chunks.CenterOn( 1, 1, 1 );
		expect( chunks.Next( 1 )[0]!.Key ).toBe( ChunkKey( 0, 0, 0 ) );
		// an edit at the center queues that chunk again: it now waits
		// behind the ones not meshed yet, however far they are
		list.Add(
			{
				Shape: SdfShape.Sphere,
				Position: [ 1, 1, 1 ],
				Params: [ 0.2, 0, 0, 0 ],
			},
		);
		chunks.Collect();
		expect( chunks.Next( 1 )[0]!.Key ).not.toBe( ChunkKey( 0, 0, 0 ) );

		// chunks the caller says are busy stay queued
		const waiting = chunks.Pending;
		const taken = chunks.Next(
			100,
			( key ) => key === ChunkKey( 0, 0, 0 ),
		);

		expect( taken ).toHaveLength( waiting - 1 );
		expect( chunks.Pending ).toBe( 1 );
		expect( chunks.Next( 1 )[0]!.Key ).toBe( ChunkKey( 0, 0, 0 ) );
	} );

	it( "drops the chunks that leave the area", () => {
		const { chunks } = World();

		chunks.Update();
		chunks.CenterOn( 2.5, 0, 0 );

		const update = chunks.Update();

		expect( update.Removed ).toHaveLength( 9 );
		expect( update.Removed ).toContain( ChunkKey( -1, 0, 0 ) );
		expect( update.Built ).toHaveLength( 9 );
		expect( chunks.Keys ).toContain( ChunkKey( 2, 0, 0 ) );
	} );

	it( "stops following the edits when disposed, and has defaults", () => {
		const { list, field, chunks } = World();

		chunks.Update();
		chunks.Dispose();
		list.Add( { Shape: SdfShape.Sphere } );
		expect( chunks.Update().Built ).toEqual( [] );

		const plain = new SdfMeshChunks(
			field,
			{ CellSize: 0.5, ChunkCells: 99 },
		);

		expect( plain.ChunkCells ).toBe( MAX_CHUNK_CELLS );
		expect( plain.Radius ).toBe( 2 );
		expect( plain.Budget ).toBe( 4 );
		expect( plain.Keys ).toHaveLength( 125 );
		plain.Dispose();

		const flat = new SdfMeshChunks(
			field,
			{ CellSize: 1, Ao: false, Radius: 0 },
		);

		expect( flat.ChunkCells ).toBe( 16 );
		expect(
			[ ...flat.Update().Built[0]!.Mesh.Ao ].every( ( ao ) => ao === 1 ),
		).toBe( true );
	} );
} );
