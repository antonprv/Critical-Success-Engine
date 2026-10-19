// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// `pnpm bench`: the CPU costs the frame budget is planned with (plan.md 13,
// S6-05's SDF scene): one brick, one mesh chunk, a moving hole re-sampled
// in the dense grid, a raycast, the edits reaching a region out of 1000.
// Each case warms up, then runs for about a second; the median of the
// rounds is printed (lower is better). Bundled by Vite and run in Node, as
// the game runs it: under a test runner every call into another module is
// several times slower.

/** Times `run` and prints its median per call. */
function bench(
	name: string,
	run: () => void,
	options: { iterations?: number; } = {},
): void {
	const rounds: number[] = [];

	{
		const budget = performance.now() + 1000;

		run();
		while ( rounds.length < ( options.iterations ?? 5 )
			|| ( performance.now() < budget && rounds.length < 1000 ) ) {
			const start = performance.now();

			run();
			rounds.push( performance.now() - start );
		}
		rounds.sort( ( a, b ) => a - b );
		console.log(
			`${ name.padEnd( 52 ) } `
				+ `${ rounds[rounds.length >> 1]!.toFixed( 3 ) } ms`
				+ `  (${ rounds.length } runs)`,
		);
	}
}

/** Prints a group's title. */
function describe( title: string, body: () => void ): void {
	console.log( `\n${ title }` );
	body();
}

import {
	BRICK_VOLUME,
	BuildBrick,
	CreateAabb,
	DenseSdfGrid,
	EditList,
	ExtractChunk,
	GroundPlane,
	Overlaps,
	SdfField,
	SdfOp,
	SdfShape,
	SdfVolume,
	SphereAabb,
	type SdfEdit,
} from "../Source/Index";

/** The demo's showcase: ground, ball, round box, torus, tunnel, hole. */
function Showcase(): { field: SdfField; hole: SdfEdit; } {
	const edits = new EditList();
	const field = new SdfField( edits, new GroundPlane( 0 ) );

	edits.Add(
		{
			Shape: SdfShape.Sphere,
			Position: [ 0, 1.6, 0 ],
			Params: [ 2, 0, 0, 0 ],
		},
	);
	edits.Add( {
		Shape: SdfShape.RoundBox,
		Op: SdfOp.SmoothUnion,
		Position: [ 2.4, 0.8, 1.2 ],
		Params: [ 1.2, 0.8, 1.2, 0.25 ],
		SmoothK: 0.8,
	} );
	edits.Add( {
		Shape: SdfShape.Torus,
		Op: SdfOp.SmoothUnion,
		Position: [ -3.2, 0.5, 1.5 ],
		Params: [ 1.3, 0.45, 0, 0 ],
		SmoothK: 0.5,
	} );
	edits.Add( {
		Shape: SdfShape.Capsule,
		Op: SdfOp.Subtract,
		Position: [ 0, 1.4, 0 ],
		Rotation: [ 0.7071, 0, 0, 0.7071 ],
		Params: [ 3, 0.7, 0, 0 ],
	} );

	const hole = edits.Add( {
		Shape: SdfShape.Sphere,
		Op: SdfOp.SmoothSubtract,
		Position: [ 0, 0, 3 ],
		Params: [ 0.9, 0, 0, 0 ],
		SmoothK: 0.3,
	} );

	return { field, hole };
}

describe( "bricks", () => {
	const { field } = Showcase();
	const out = new Uint8Array( BRICK_VOLUME );
	const program = field.Compile(
		field.Edits.Candidates( CreateAabb( -1, 0, 1, 1, 1, 2 ) ),
	);

	bench( "one surface brick (10^3 samples)", () => {
		BuildBrick(
			( x, y, z ) => program.Distance( x, y, z ),
			-0.4,
			0,
			1.6,
			0.1,
			out,
		);
	} );

	bench( "a 16^3-cell window around the showcase (h = 0.1)", () => {
		const volume = new SdfVolume( field, {
			Spacing: 0.1,
			MapSize: 16,
			Budget: 1e9,
		} );

		volume.CenterOn( 0, 1, 0, true );
		volume.Update();
		volume.Dispose();
	}, { iterations: 3 } );
} );

describe( "mesh tier", () => {
	const { field } = Showcase();
	const program = field.Compile(
		field.Edits.Candidates( CreateAabb( -3, -1, -3, 1, 3, 1 ) ),
	);
	const Distance = ( x: number, y: number, z: number ): number => (
		program.Distance( x, y, z )
	);

	bench( "one chunk, 20^3 cells of 0.2 m, with AO", () => {
		ExtractChunk(
			Distance,
			{ Origin: [ -2, -0.5, -2 ], CellSize: 0.2, Cells: 20 },
		);
	} );

	bench( "one chunk, 20^3 cells of 0.2 m, no AO", () => {
		ExtractChunk( Distance, {
			Origin: [ -2, -0.5, -2 ],
			CellSize: 0.2,
			Cells: 20,
			Ao: false,
		} );
	} );

	bench( "the same, every node sampled (no skipping)", () => {
		ExtractChunk( Distance, {
			Origin: [ -2, -0.5, -2 ],
			CellSize: 0.2,
			Cells: 20,
			Ao: false,
			SkipEmpty: false,
		} );
	} );

	// a chunk of open ground: the surface a slice of it
	bench( "a chunk of ground, no AO", () => {
		ExtractChunk( Distance, {
			Origin: [ 4, -2, 4 ],
			CellSize: 0.2,
			Cells: 20,
			Ao: false,
		} );
	} );

	bench( "the same, every node sampled (no skipping)", () => {
		ExtractChunk( Distance, {
			Origin: [ 4, -2, 4 ],
			CellSize: 0.2,
			Cells: 20,
			Ao: false,
			SkipEmpty: false,
		} );
	} );
} );

describe( "mesh tier, a dug world", () => {
	// 300 holes over 20 x 20 m: a 4 m chunk has a dozen or so in reach
	const edits = new EditList();
	const field = new SdfField( edits, new GroundPlane( 0 ) );
	let seed = 1;
	const Random = (): number => {
		seed = ( seed * 16807 ) % 2147483647;
		return seed / 2147483647;
	};

	for ( let i = 0; i < 300; i++ ) {
		edits.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothSubtract,
			Position: [ Random() * 20 - 10, 0, Random() * 20 - 10 ],
			Params: [ 0.3 + Random() * 0.6, 0, 0, 0 ],
			SmoothK: 0.2,
		} );
	}

	const box = CreateAabb( -2.4, -2.4, -2.4, 2.4, 2.4, 2.4 );
	const list = edits.Candidates( box );
	const program = field.Compile( list );
	const Distance = ( x: number, y: number, z: number ): number => (
		program.Distance( x, y, z )
	);
	const options = {
		Origin: [ -2, -2, -2 ] as [ number, number, number ],
		CellSize: 0.2,
		Cells: 20,
		Ao: false,
	};

	bench( `one chunk, ${ list.length } edits in reach, no AO`, () => {
		ExtractChunk( Distance, options );
	} );

	bench( "the same, each block its own edits", () => {
		ExtractChunk( Distance, {
			...options,
			Region: ( min, max ) => {
				const block = CreateAabb( ...min, ...max );
				const part = field.Compile( list.filter(
					( edit ) => Overlaps( edits.Reach( edit ), block ),
				) );

				return ( x, y, z ) => part.Distance( x, y, z );
			},
		} );
	} );
} );

describe( "dense grid (M0)", () => {
	const { field, hole } = Showcase();
	const grid = new DenseSdfGrid(
		field,
		CreateAabb( -8, -1, -8, 8, 5, 8 ),
		160,
	);
	let time = 0;

	bench( "re-sample after the hole moves (160x60x160)", () => {
		time += 0.016;
		field.Edits.Update( hole.Id, {
			Position: [ Math.sin( time ) * 3.5, 0.2, Math.cos( time ) * 3.5 ],
		} );
		grid.Refresh();
	} );
} );

describe( "gameplay queries", () => {
	const { field } = Showcase();
	const many = new EditList();

	for ( let i = 0; i < 1000; i++ ) {
		many.Add( {
			Shape: SdfShape.Sphere,
			Position: [
				( i % 10 ) * 4,
				( ( i / 10 ) % 10 | 0 ) * 4,
				( i / 100 | 0 ) * 4,
			],
		} );
	}

	bench( "a raycast through the showcase", () => {
		field.Raycast( [ -10, 1.6, 0.3 ], [ 1, 0, 0 ], 30 );
	} );

	bench( "the edits reaching a 2 m box, out of 1000 (BVH)", () => {
		many.Candidates( SphereAabb( 18, 18, 18, 1 ) );
	} );
} );
