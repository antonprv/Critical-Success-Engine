// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	ChunkKey,
	CreateAabb,
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

	it( "hangs skirts from its open borders, past a row of overlap", () => {
		const flat = ( _x: number, y: number ): number => y - 0.3;
		const options = {
			Origin: [ 0, -1, 0 ] as [ number, number, number ],
			CellSize: 0.5,
			Cells: 4,
			Ao: false,
		};
		const plain = ExtractChunk( flat, options );
		const skirted = ExtractChunk( flat, { ...options, Skirt: 1 } );
		const from = skirted.SkirtFrom!;
		const xs = ( mesh: SdfMeshData ): number[] => Array.from(
			{ length: mesh.Positions.length / 3 },
			( _, v ) => mesh.Positions[v * 3]!,
		);

		expect( plain.SkirtFrom ).toBeUndefined();
		// the surface reaches half a cell past the chunk on its far side too
		expect( Math.max( ...xs( plain ) ) ).toBeCloseTo( 1.75, 6 );
		expect( Math.max( ...xs( skirted ) ) ).toBeCloseTo( 2.25, 6 );
		// a 5 x 5 quad border: 20 edges, a quad each
		expect( ( skirted.Indices.length - from ) / 6 ).toBe( 20 );

		const skirt = FaceNormals( skirted ).slice( from / 3 );

		// straight down from the border, facing out of the chunk
		for ( let v = 0; v < skirted.Positions.length / 3; v++ ) {
			expect( [ 0.3, -0.7 ] ).toContain(
				Math.round( skirted.Positions[v * 3 + 1]! * 10 ) / 10,
			);
		}
		expect( skirt.every( ( [ , ny ] ) => Math.abs( ny ) < 1e-6 ) )
			.toBe( true );
		expect( FaceNormals( skirted ).slice( 0, from / 3 )
			.every( ( [ , ny ] ) => ny > 0.99 ) ).toBe( true );
	} );

	it( "keeps 16-bit indices: no skirts that would overflow them", () => {
		// a sponge whose sign flips every cell: a vertex in every one
		const sponge = ( x: number, y: number, z: number ): number => (
			Math.cos( x * 2 * Math.PI ) * Math.cos( y * 2 * Math.PI )
				* Math.cos( z * 2 * Math.PI ) + 0.1
		);
		const mesh = ExtractChunk( sponge, {
			Origin: [ 0, 0, 0 ],
			CellSize: 0.5,
			Cells: MAX_CHUNK_CELLS,
			Ao: false,
			Skirt: 0.5,
		} );

		expect( mesh.Positions.length / 3 ).toBeLessThan( 65536 );
		expect( mesh.SkirtFrom ).toBeUndefined();
	} );

	it( "steps the occlusion as it is told", () => {
		// a ceiling 1.35 above a floor: sampled a cell (1) apart, each sees
		// the other; a twentieth apart, neither does
		const field = ( _x: number, y: number ): number => Math.min(
			y - 0.25,
			1.6 - y,
		);
		const options = {
			Origin: [ 0, 0, 0 ] as [ number, number, number ],
			CellSize: 1,
			Cells: 2,
		};
		const coarse = ExtractChunk( field, options );
		const fine = ExtractChunk( field, { ...options, AoStep: 0.05 } );

		expect( Math.min( ...fine.Ao ) )
			.toBeGreaterThan( Math.min( ...coarse.Ao ) );
	} );
} );

describe( "Meshing the empty space and the edits faster", () => {
	// ground with holes dug all over it, and a ball sunk in it
	function Dug(): SdfField {
		const list = new EditList();
		let seed = 7;
		const Random = (): number => {
			seed = ( seed * 16807 ) % 2147483647;
			return seed / 2147483647;
		};

		for ( let i = 0; i < 60; i++ ) {
			list.Add( {
				Shape: SdfShape.Sphere,
				Op: SdfOp.SmoothSubtract,
				Position: [ Random() * 8 - 4, 0, Random() * 8 - 4 ],
				Params: [ 0.2 + Random() * 0.4, 0, 0, 0 ],
				SmoothK: 0.2,
			} );
		}
		list.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothUnion,
			Position: [ 0.5, 0.3, 0.5 ],
			Params: [ 0.6, 0, 0, 0 ],
			SmoothK: 0.3,
		} );
		return new SdfField( list, new GroundPlane( 0 ) );
	}

	it( "makes the same mesh as sampling every node with every edit", () => {
		const field = Dug();
		const chunks = new SdfMeshChunks( field, {
			CellSize: 0.1,
			ChunkCells: 20,
			Radius: 1,
		} );

		for ( const coord of [
			[ 0, -1, 0 ],
			[ -1, -1, 0 ],
			[ 0, 0, 0 ],
		] as const ) {
			const fast = chunks.Mesh( "fast", coord, [], false ).Mesh;
			// the chunk's own edits, every node sampled
			const box = CreateAabb(
				coord[0] * 2 - 1,
				coord[1] * 2 - 1,
				coord[2] * 2 - 1,
				coord[0] * 2 + 3,
				coord[1] * 2 + 3,
				coord[2] * 2 + 3,
			);
			const program = field.Compile( field.Edits.Candidates( box ) );
			const plain = ExtractChunk(
				( x, y, z ) => program.Distance( x, y, z ),
				{
					Origin: [ coord[0] * 2, coord[1] * 2, coord[2] * 2 ],
					CellSize: 0.1,
					Cells: 20,
					Ao: false,
					SkipEmpty: false,
				},
			);

			expect( fast.Indices.length ).toBe( plain.Indices.length );
			expect( [ ...fast.Indices ] ).toEqual( [ ...plain.Indices ] );
			expect( [ ...fast.Positions ] ).toEqual( [ ...plain.Positions ] );
			fast.Normals.forEach( ( n, i ) => {
				expect( n ).toBeCloseTo( plain.Normals[i]!, 5 );
			} );
		}
	} );

	it( "samples only the blocks near the surface, with their edits", () => {
		const field = Dug();
		const program = field.Compile();
		let calls = 0;
		const Count = ( x: number, y: number, z: number ): number => {
			calls++;
			return program.Distance( x, y, z );
		};
		const options = {
			Origin: [ 2, -1, 2 ] as [ number, number, number ],
			CellSize: 0.1,
			Cells: 20,
			Ao: false,
		};

		ExtractChunk( Count, { ...options, SkipEmpty: false } );
		const every = calls;

		calls = 0;
		ExtractChunk( Count, options );
		expect( calls ).toBeLessThan( every * 0.6 );

		// a block's own field: its nodes and its vertices' normals
		const boxes: number[][] = [];
		let own = 0;

		calls = 0;
		ExtractChunk( Count, {
			...options,
			Region: ( min, max ) => {
				boxes.push( [ ...min, ...max ] );
				return ( x, y, z ) => {
					own++;
					return program.Distance( x, y, z );
				};
			},
		} );
		expect( boxes.length ).toBeGreaterThan( 0 );
		// a block of 4 nodes (3 cells), three cells grown each way
		expect( boxes[0]![3]! - boxes[0]![0]! ).toBeCloseTo( 0.9, 9 );
		expect( own ).toBeGreaterThan( calls );
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

describe( "Levels of detail", () => {
	/** The world box of an area chunk (level from its key). */
	function Box( key: string, size: number ): number[] {
		const [ level, rest ] = key.includes( ":" )
			? [ Number( key.split( ":" )[0] ), key.split( ":" )[1]! ]
			: [ 0, key ];
		const s = size * 2 ** level;
		const c = rest.split( "," ).map( Number );

		return [
			...c.map( ( v ) => v * s ),
			...c.map( ( v ) => ( v + 1 ) * s ),
		];
	}

	function Overlap( a: number[], b: number[] ): boolean {
		return [ 0, 1, 2 ].every(
			( i ) => a[i]! < b[i + 3]! && a[i + 3]! > b[i]!,
		);
	}

	const Flat = (): SdfField => new SdfField(
		new EditList(),
		new GroundPlane( 0.3 ),
	);

	it( "fills the area with chunks growing with the distance", () => {
		const chunks = new SdfMeshChunks( Flat(), {
			CellSize: 0.5,
			ChunkCells: 4,
			Radius: 1,
			Levels: 3,
		} );

		chunks.CenterOn( 0.3, 0.2, 0.1 );

		const keys = chunks.Keys;
		const volume = keys.reduce( ( sum, key ) => {
			const b = Box( key, 2 );

			return sum + ( b[3]! - b[0]! )
				* ( b[4]! - b[1]! )
				* ( b[5]! - b[2]! );
		}, 0 );

		expect( chunks.SizeAt( 2 ) ).toBe( 8 );
		// near the center the finest, then coarser: all three levels
		expect( keys ).toContain( ChunkKey( 0, 0, 0 ) );
		expect( keys.some( ( key ) => key.startsWith( "1:" ) ) ).toBe( true );
		expect( keys.some( ( key ) => key.startsWith( "2:" ) ) ).toBe( true );
		expect( ChunkKey( 1, 2, 3, 2 ) ).toBe( "2:1,2,3" );
		// the coarsest level's cube, every bit of it once
		expect( volume ).toBe( ( 3 * 8 ) ** 3 );
		for ( let i = 0; i < keys.length; i++ ) {
			for ( let j = i + 1; j < keys.length; j++ ) {
				expect( Overlap( Box( keys[i]!, 2 ), Box( keys[j]!, 2 ) ) )
					.toBe( false );
			}
		}
	} );

	it( "meshes a coarse chunk with bigger cells and skirts", () => {
		const chunks = new SdfMeshChunks( Flat(), {
			CellSize: 0.5,
			ChunkCells: 4,
			Levels: 2,
		} );
		const fine = chunks.Mesh( "0,0,0", [ 0, 0, 0 ] );
		const coarse = chunks.Mesh( "1:0,0,0", [ 0, 0, 0 ], [], true, 1 );

		expect( coarse.Level ).toBe( 1 );
		// 4 cells of 1 m (and a row past them): it spans 4 m, not 2
		expect(
			Math.max(
				...coarse.Mesh.Positions.filter( ( _, i ) => i % 3 === 0 ),
			),
		)
			.toBeGreaterThan( 4 );
		expect(
			Math.max(
				...fine.Mesh.Positions.filter( ( _, i ) => i % 3 === 0 ),
			),
		)
			.toBeLessThan( 2.5 );
		expect( coarse.Mesh.SkirtFrom ).toBeGreaterThan( 0 );
		// one level: no skirts
		const plain = new SdfMeshChunks(
			Flat(),
			{ CellSize: 0.5, ChunkCells: 4 },
		);

		expect( plain.Mesh( "0,0,0", [ 0, 0, 0 ] ).Mesh.SkirtFrom )
			.toBeUndefined();
		expect( new SdfMeshChunks( Flat(), {
			CellSize: 0.5,
			ChunkCells: 4,
			Levels: 2,
			Skirts: false,
		} ).Mesh( "0,0,0", [ 0, 0, 0 ] ).Mesh.SkirtFrom ).toBeUndefined();
	} );

	it( "keeps what leaves until its place is built", () => {
		const chunks = new SdfMeshChunks( Flat(), {
			CellSize: 0.5,
			ChunkCells: 4,
			Radius: 1,
			Levels: 2,
			Budget: 1000,
		} );
		const shown = new Set<string>();
		const Apply = ( update: ReturnType<SdfMeshChunks["Update"]> ): void => {
			update.Removed.forEach( ( key ) => shown.delete( key ) );
			update.Built.forEach( ( chunk ) => shown.add( chunk.Key ) );
		};

		chunks.CenterOn( 0, 0, 0 );
		Apply( chunks.Update() );
		expect( shown.size ).toBe( chunks.Keys.length );

		// a move under an eighth of a chunk changes nothing
		chunks.CenterOn( 0.2, 0, 0 );
		expect( chunks.Pending ).toBe( 0 );

		// farther: the chunks split and merge, one a frame
		chunks.Budget = 1;
		chunks.CenterOn( 5, 0, 0 );

		const first = chunks.Update();
		const area = chunks.Keys.map( ( key ) => Box( key, 2 ) );
		const InArea = ( key: string ): boolean => area.some(
			( box ) => Overlap( Box( key, 2 ), box ),
		);

		Apply( first );
		// what left the area altogether went at once; what is replaced
		// waits for its place to be built
		expect( first.Removed.length ).toBeGreaterThan( 0 );
		expect( first.Removed.every( ( key ) => !InArea( key ) ) ).toBe( true );
		expect( [ ...shown ].some(
			( key ) => !chunks.Keys.includes( key ) && InArea( key ),
		) ).toBe( true );
		for ( let i = 0; i < 200 && chunks.Pending > 0; i++ ) {
			Apply( chunks.Update() );
		}
		Apply( chunks.Update() );
		expect( [ ...shown ].sort() ).toEqual( [ ...chunks.Keys ].sort() );

		// back before a leaving chunk was gone: it stays, nothing waits on it
		chunks.CenterOn( 0, 0, 0 );
		chunks.CenterOn( 5, 0, 0 );
		Apply( chunks.Update() );
		for ( let i = 0; i < 200 && chunks.Pending > 0; i++ ) {
			Apply( chunks.Update() );
		}
		Apply( chunks.Update() );
		expect( [ ...shown ].sort() ).toEqual( [ ...chunks.Keys ].sort() );
		// out of the area altogether: gone at once
		chunks.CenterOn( 500, 0, 0 );
		expect( chunks.TakeRemoved().length ).toBeGreaterThan( 0 );
		expect( chunks.TakeRemoved() ).toEqual( [] );
	} );

	it(
		"finds the chunk at its level over a box, and marks it for an edit",
		() => {
			const field = Flat();
			const chunks = new SdfMeshChunks( field, {
				CellSize: 0.5,
				ChunkCells: 4,
				Radius: 1,
				Levels: 2,
			} );

			chunks.CenterOn( 0, 0, 0 );
			chunks.Budget = 1000;
			chunks.Update();

			const far = chunks.ChunksIn(
				CreateAabb( 5, 0.1, 0.1, 5.5, 0.2, 0.2 ),
			);

			// past the fine chunks: the coarse one that holds the box
			expect( far )
				.toEqual(
					[ { Key: "1:1,0,0", Coord: [ 1, 0, 0 ], Level: 1 } ],
				);
			expect(
				chunks.ChunksIn(
					CreateAabb( 0.1, 0.1, 0.1, 0.2, 0.2, 0.2 ),
				)[0]!.Level,
			)
				.toBe( 0 );
			// past the area: of level 0
			expect(
				chunks.ChunksIn( CreateAabb( 100, 0, 0, 100.1, 0.1, 0.1 ) ),
			)
				.toEqual(
					[ { Key: "50,0,0", Coord: [ 50, 0, 0 ], Level: 0 } ],
				);

			// an edit out there remeshes the coarse chunk
			field.Edits.Add(
				{
					Shape: SdfShape.Sphere,
					Position: [ 5.2, 0.3, 0.2 ],
					Params: [ 0.4, 0, 0, 0 ],
				},
			);
			chunks.Collect();
			expect( chunks.Next( 100 ).map( ( job ) => job.Key ) )
				.toContain( "1:1,0,0" );
		},
	);
} );
