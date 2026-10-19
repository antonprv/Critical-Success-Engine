// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	BRICK_STORED,
	BRICK_VOLUME,
	BrickAtlas,
	BrickClass,
	BrickIndex,
	BrickMap,
	BuildBrick,
	CELL_EMPTY,
	CELL_PENDING,
	CELL_SOLID,
	CELL_STALE,
	CellSlot,
	DecodeDistance,
	EditList,
	EncodeDistance,
	GroundPlane,
	CreateAabb,
	IsBrickCell,
	MapTexelBrick,
	MapTexelSolid,
	RANGE_SPACINGS,
	SdfField,
	SdfShape,
	SdfVolume,
} from "../Source/Index";

describe( "brick codec", () => {
	it( "encodes distances into a byte around 0.5", () => {
		const h = 0.1;

		expect( EncodeDistance( 0, h ) ).toBe( 128 );
		expect( EncodeDistance( 100, h ) ).toBe( 255 );
		expect( EncodeDistance( -100, h ) ).toBe( 0 );
		for ( let d = -0.25; d <= 0.25; d += 0.01 ) {
			const step = 2 * RANGE_SPACINGS * h / 255;

			expect(
				Math.abs( DecodeDistance( EncodeDistance( d, h ), h ) - d ),
			)
				.toBeLessThanOrEqual( step / 2 + 1e-12 );
		}
	} );

	it( "lays nodes -1..8 out x fastest", () => {
		expect( BrickIndex( -1, -1, -1 ) ).toBe( 0 );
		expect( BrickIndex( 0, 0, 0 ) )
			.toBe( 1 + BRICK_STORED + BRICK_STORED ** 2 );
		expect( BrickIndex( 8, 8, 8 ) ).toBe( BRICK_VOLUME - 1 );
	} );

	it( "tells of each node sampled, encoded for a unit", () => {
		const out = new Uint8Array( BRICK_VOLUME );
		const seen: number[] = [];

		BuildBrick(
			( x ) => x,
			0,
			0,
			0,
			0.1,
			out,
			( index ) => seen.push( index ),
			0.4,
		);
		expect( seen ).toHaveLength( BRICK_VOLUME );
		expect( seen[5] ).toBe( 5 );
		// node 8 along x: 0.8 away, within the wider unit's range (1.0)
		expect( DecodeDistance( out[BrickIndex( 8, 0, 0 )]!, 0.4 ) )
			.toBeCloseTo( 0.8, 1 );
	} );

	it( "tells empty, solid and surface bricks apart", () => {
		const out = new Uint8Array( BRICK_VOLUME );

		expect( BuildBrick( () => 5, 0, 0, 0, 0.1, out ) )
			.toBe( BrickClass.Empty );
		expect( out.every( ( byte ) => byte === 255 ) ).toBe( true );
		expect( BuildBrick( () => -5, 0, 0, 0, 0.1, out ) )
			.toBe( BrickClass.Solid );
		expect( BuildBrick( ( _x, y ) => y - 0.4, 0, 0, 0, 0.1, out ) )
			.toBe( BrickClass.Surface );
		// node (0, 4, 0) sits on the plane
		expect( out[BrickIndex( 0, 4, 0 )] ).toBe( 128 );
	} );
} );

describe( "BrickAtlas", () => {
	it( "hands out slots until full and takes them back", () => {
		const atlas = new BrickAtlas( 20, 20, 15 );

		expect( atlas.Slots ).toEqual( [ 2, 2, 1 ] );
		expect( atlas.Capacity ).toBe( 4 );
		expect( [ 0, 1, 2, 3 ].map( () => atlas.Allocate() ) )
			.toEqual( [ 0, 1, 2, 3 ] );
		expect( atlas.Allocate() ).toBe( -1 );
		expect( atlas.Used ).toBe( 4 );
		atlas.Release( 2 );
		expect( atlas.Allocate() ).toBe( 2 );
		// copy-on-write: a retired slot is free only after the frame
		atlas.Retire( 1 );
		expect( atlas.Allocate() ).toBe( -1 );
		atlas.EndFrame();
		expect( atlas.Allocate() ).toBe( 1 );
	} );

	it( "stores the materials of a brick beside its distances", () => {
		const atlas = new BrickAtlas( 20, 10, 10, true );
		const brick = new Uint8Array( BRICK_VOLUME ).fill( 9 );
		const materials = new Uint8Array( BRICK_VOLUME * 4 ).fill( 4 );

		atlas.Write( 1, brick, materials );
		expect( atlas.Materials[10 * 4] ).toBe( 4 );
		expect( atlas.Materials[0] ).toBe( 0 );
		// without materials given: the distances alone
		atlas.Write( 0, brick );
		expect( atlas.Materials[0] ).toBe( 0 );
		expect( atlas.Data[0] ).toBe( 9 );
	} );

	it( "stores bricks at their slot", () => {
		const atlas = new BrickAtlas( 20, 20, 20 );
		const brick = Uint8Array.from(
			{ length: BRICK_VOLUME },
			( _, i ) => i % 251,
		);

		expect( atlas.SlotOrigin( 3 ) ).toEqual( [ 10, 10, 0 ] );
		expect( atlas.SlotOrigin( 5 ) ).toEqual( [ 10, 0, 10 ] );
		atlas.Write( 5, brick );
		expect( atlas.Read( 5 ) ).toEqual( brick );
		expect( atlas.Data[10 + 20 * 20 * 10] ).toBe( 0 );
		expect( atlas.TakeDirty() ).toEqual( [ 5 ] );
		expect( atlas.TakeDirty() ).toEqual( [] );
		// a released slot isn't uploaded
		atlas.Write( 6, brick );
		atlas.Release( 6 );
		expect( atlas.TakeDirty() ).toEqual( [] );
	} );
} );

describe( "BrickMap", () => {
	it( "addresses its window toroidally", () => {
		const map = new BrickMap( 4, 0.8 );

		expect( map.CellOf( -0.1, 0.8, 3.3 ) ).toEqual( [ -1, 1, 4 ] );
		expect( map.Contains( 0, 3, 0 ) ).toBe( true );
		expect( map.Contains( 0, 4, 0 ) ).toBe( false );
		expect( map.Index( -1, 0, 0 ) ).toBe( 3 );
		expect( map.Get( 9, 9, 9 ) ).toBe( CELL_PENDING );
		map.Set( 9, 9, 9, CELL_SOLID );
		map.Set( 1, 2, 3, CELL_EMPTY );
		expect( map.Get( 1, 2, 3 ) ).toBe( CELL_EMPTY );
	} );

	it( "moves its window, freeing the bricks that leave", () => {
		const map = new BrickMap( 4, 1 );

		map.Set( 0, 0, 0, 7 );
		map.Set( 3, 3, 3, ( 9 | CELL_STALE ) >>> 0 );

		const freed: number[] = [];
		const entered = map.MoveTo( 1, 0, 0, freed );

		expect( map.Origin ).toEqual( [ 1, 0, 0 ] );
		// the x = 4 slice came in where x = 0 was
		expect( entered ).toHaveLength( 16 );
		expect( entered.every( ( cell ) => cell[0] === 4 ) ).toBe( true );
		expect( freed ).toEqual( [ 7 ] );
		expect( map.Get( 4, 0, 0 ) ).toBe( CELL_PENDING );
		expect( map.Get( 3, 3, 3 ) ).toBe( ( 9 | CELL_STALE ) >>> 0 );
		expect( map.MoveTo( 1, 0, 0 ) ).toEqual( [] );
	} );

	it( "tells bricks from special cells", () => {
		expect( IsBrickCell( 5 ) ).toBe( true );
		expect( IsBrickCell( ( 5 | CELL_STALE ) >>> 0 ) ).toBe( true );
		expect( CellSlot( ( 5 | CELL_STALE ) >>> 0 ) ).toBe( 5 );
		expect( IsBrickCell( CELL_EMPTY ) ).toBe( false );
		expect( IsBrickCell( CELL_SOLID ) ).toBe( false );
		expect( IsBrickCell( CELL_PENDING ) ).toBe( false );
	} );
} );

describe( "SdfVolume", () => {
	function World(
		budget = 100000,
		atlas: [ number, number, number ] = [ 160, 160, 160 ],
	) {
		const list = new EditList();
		const ball = list.Add(
			{ Shape: SdfShape.Sphere, Params: [ 1, 0, 0, 0 ] },
		);
		const field = new SdfField( list );
		const volume = new SdfVolume( field, {
			Spacing: 0.1,
			MapSize: 8,
			AtlasSize: atlas,
			Budget: budget,
		} );

		return { list, ball, field, volume };
	}

	it( "caches the field in bricks around the surface", () => {
		const { field, volume } = World();
		const stats = volume.Update();

		expect( stats.Remaining ).toBe( 0 );
		expect( stats.Starved ).toBe( false );
		expect( stats.Bricks ).toBeGreaterThan( 0 );
		expect( volume.Pending ).toBe( 0 );
		expect( volume.Range ).toBeCloseTo( 0.25, 12 );

		// near the surface the cache matches the field within quantization
		// and interpolation error
		for ( let i = 0; i < 200; i++ ) {
			const r = 0.9 + ( i % 20 ) * 0.01;
			const a = i * 0.7;
			const b = i * 0.3;
			const x = r * Math.cos( a ) * Math.cos( b );
			const y = r * Math.sin( b );
			const z = r * Math.sin( a ) * Math.cos( b );

			expect(
				Math.abs(
					volume.Sample( x, y, z ) - field.Distance( x, y, z ),
				),
			)
				.toBeLessThan( 0.01 );
		}

		// far away: empty; out of the window: unknown
		expect( volume.Sample( 2.9, 2.9, 2.9 ) ).toBe( volume.Range );
		expect( volume.Sample( 50, 0, 0 ) ).toBeNaN();
	} );

	it( "marks cells deep inside solid", () => {
		const { list, ball, volume } = World();

		list.Update( ball.Id, { Params: [ 2.5, 0, 0, 0 ] } );
		volume.Update();
		expect( volume.Map.Get( -1, -1, -1 ) ).toBe( CELL_SOLID );
		expect( volume.Sample( -0.4, -0.4, -0.4 ) ).toBe( -volume.Range );
	} );

	it( "rebuilds what an edit touches, nearest the eye first", () => {
		const { list, ball, volume } = World( 4 );

		volume.CenterOn( 0, 0, 0 );

		const first = volume.Update();

		expect( first.Generated ).toBe( 4 );
		expect( first.Remaining ).toBe( 8 ** 3 - 4 );
		// the cells around the eye went first
		const around = [ -1, 0 ].flatMap( ( x ) => [ -1, 0 ].flatMap(
			( y ) => [ -1, 0 ].map( ( z ) => volume.Map.Get( x, y, z ) ),
		) );

		expect( around.filter( ( cell ) => cell !== CELL_PENDING ) )
			.toHaveLength( 4 );

		while ( volume.Update().Remaining > 0 ) {
			volume.EndFrame();
		}

		const before = volume.Map.Get( 1, 0, 0 );

		expect( IsBrickCell( before ) ).toBe( true );
		list.Update( ball.Id, { Position: [ 0.3, 0, 0 ] } );
		volume.Budget = 0;

		const stalled = volume.Update();

		// marked stale, the old brick kept until rebuilt
		expect( stalled.Generated ).toBe( 0 );
		expect( stalled.Remaining ).toBeGreaterThan( 0 );
		expect( volume.Map.Get( 1, 0, 0 ) )
			.toBe( ( before | CELL_STALE ) >>> 0 );
		volume.Budget = 100000;
		volume.Update();
		expect( IsBrickCell( volume.Map.Get( 1, 0, 0 ) ) ).toBe( true );
		expect( volume.Map.Get( 1, 0, 0 ) & CELL_STALE ).toBe( 0 );
		// the old slot is free once the frame is drawn
		const used = volume.Atlas.Used;

		volume.EndFrame();
		expect( volume.Atlas.Used ).toBeLessThan( used );
	} );

	it( "reports a full atlas and keeps the rest queued", () => {
		const { volume } = World( 100000, [ 20, 10, 10 ] );
		const stats = volume.Update();

		expect( stats.Starved ).toBe( true );
		expect( stats.Bricks ).toBe( 2 );
		expect( stats.Remaining ).toBeGreaterThan( 0 );
	} );

	it( "follows the eye with hysteresis", () => {
		const { volume } = World();

		volume.Update();

		const origin = [ ...volume.Map.Origin ];

		volume.CenterOn( 0.9, 0, 0 );
		expect( volume.Map.Origin ).toEqual( origin );
		expect( volume.Pending ).toBe( 0 );
		volume.CenterOn( 2.5, 0, 0 );
		expect( volume.Map.Origin[0] ).toBe( origin[0]! + 3 );
		expect( volume.Pending ).toBe( 3 * 64 );

		// a far jump drops what was queued and is now outside
		volume.CenterOn( -100, 0, 0 );
		expect( volume.Pending ).toBe( 8 ** 3 );
		volume.EndFrame();
		expect( volume.Atlas.Used ).toBe( 0 );
	} );

	it( "has defaults", () => {
		const volume = new SdfVolume(
			new SdfField( new EditList() ),
			{ Spacing: 1 },
		);

		expect( volume.Map.Size ).toBe( 32 );
		expect( volume.Atlas.Capacity ).toBe( 4096 );
		expect( volume.Budget ).toBe( 256 );
		volume.CenterOn( 15, 0, 0 );
		expect( volume.Map.Origin[0] ).toBe( -16 );
		volume.CenterOn( 16, 0, 0 );
		expect( volume.Map.Origin[0] ).toBe( -14 );
	} );

	it( "keeps materials, a wider range and only its bounds when asked", () => {
		const list = new EditList();

		list.Add( {
			Shape: SdfShape.Sphere,
			Params: [ 1, 0, 0, 0 ],
			MaterialId: 3,
		} );
		// a second ball the bounds leave out
		list.Add( {
			Shape: SdfShape.Sphere,
			Position: [ 0, 2.4, 0 ],
			Params: [ 0.3, 0, 0, 0 ],
		} );

		const field = new SdfField( list );
		const volume = new SdfVolume( field, {
			Spacing: 0.1,
			MapSize: 8,
			Materials: true,
			RangeSpacings: 8,
			Bounds: CreateAabb( -2, -2, -2, 2, 1.5, 2 ),
		} );
		const version = volume.Version;

		volume.Update();
		expect( volume.Version ).toBeGreaterThan( version );
		expect( volume.Range ).toBeCloseTo( 0.8, 12 );
		expect( volume.Bounds ).not.toBeNull();
		// the wider range: still exact near the surface, and farther out
		expect( volume.Sample( 1.5, 0, 0 ) ).toBeCloseTo( 0.5, 1 );
		// out of the bounds: nothing, though the field has a ball there
		expect( volume.Map.Get( 0, 2, 0 ) ).toBe( CELL_EMPTY );
		expect( volume.Map.Get( 0, 3, 0 ) ).toBe( CELL_EMPTY );

		// every node of the ball's bricks keeps its material
		const atlas = volume.Atlas;
		const cell = volume.Map.Get( 1, 0, 0 );

		expect( IsBrickCell( cell ) ).toBe( true );
		expect( atlas.Materials ).toHaveLength( atlas.Data.length * 4 );

		const [ x, y, z ] = atlas.SlotOrigin( CellSlot( cell ) );
		const [ width, height ] = atlas.Size;

		expect( atlas.Materials[( x + ( y + z * height ) * width ) * 4] )
			.toBe( 3 );

		// without materials the atlas keeps none
		const plain = new SdfVolume( field, { Spacing: 0.1, MapSize: 4 } );

		plain.Update();
		expect( plain.Atlas.Materials ).toHaveLength( 0 );
		expect( plain.Bounds ).toBeNull();
	} );

	it( "lays its map out as texels: slots, solid, empty space", () => {
		const list = new EditList();

		list.Add( { Shape: SdfShape.Sphere, Params: [ 2.5, 0, 0, 0 ] } );

		const volume = new SdfVolume( new SdfField( list ), {
			Spacing: 0.1,
			MapSize: 8,
			Budget: Infinity,
		} );
		const map = volume.Map;
		const texels = new Uint8Array( 8 * 8 * 8 * 4 );
		const At = ( cx: number, cy: number, cz: number ): number[] => {
			const at = map.Index( cx, cy, cz ) * 4;

			return [ ...texels.subarray( at, at + 4 ) ];
		};

		// nothing built yet: pending, not known to be empty
		volume.MapTexels( texels );
		expect( At( 0, 0, 0 )[3] ).toBe( 0 );
		volume.Update();
		volume.MapTexels( texels );

		// a brick: its slot in slots, x fastest
		const value = map.Get( 3, 0, 0 );
		const slot = CellSlot( value );
		const [ sx, sy ] = volume.Atlas.Slots;

		expect( IsBrickCell( value ) ).toBe( true );
		expect( At( 3, 0, 0 ) ).toEqual( [
			slot % sx,
			Math.floor( slot / sx ) % sy,
			Math.floor( slot / ( sx * sy ) ),
			MapTexelBrick,
		] );
		// deep inside: solid
		expect( At( 0, 0, 0 )[3] ).toBe( MapTexelSolid );

		// an empty cell: its distance in cells to the nearest that isn't,
		// or to the window's edge
		const empty: Array<[ number, number, number ]> = [];

		for ( let z = -4; z < 4; z++ ) {
			for ( let y = -4; y < 4; y++ ) {
				for ( let x = -4; x < 4; x++ ) {
					if ( map.Get( x, y, z ) === CELL_EMPTY ) {
						empty.push( [ x, y, z ] );
					}
				}
			}
		}
		expect( empty.length ).toBeGreaterThan( 0 );
		for ( const [ x, y, z ] of empty ) {
			let nearest = Math.min(
				x + 5,
				y + 5,
				z + 5,
				4 - x,
				4 - y,
				4 - z,
			);

			for ( let cz = -4; cz < 4; cz++ ) {
				for ( let cy = -4; cy < 4; cy++ ) {
					for ( let cx = -4; cx < 4; cx++ ) {
						if ( map.Get( cx, cy, cz ) !== CELL_EMPTY ) {
							nearest = Math.min( nearest, Math.max(
								Math.abs( cx - x ),
								Math.abs( cy - y ),
								Math.abs( cz - z ),
							) );
						}
					}
				}
			}
			expect( At( x, y, z ) ).toEqual( [ 0, 0, 0, nearest ] );
		}
	} );

	it( "stops following the edits when disposed", () => {
		const { list, field, volume } = World();

		field.Base = new GroundPlane( -0.5 );
		volume.Update();
		volume.Dispose();
		list.Add( { Shape: SdfShape.Sphere, Position: [ 2, 2, 2 ] } );
		expect( volume.Update().Generated ).toBe( 0 );
	} );
} );
