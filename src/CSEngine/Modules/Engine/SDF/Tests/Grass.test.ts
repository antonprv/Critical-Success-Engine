// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { describe, expect, it, vi } from "vitest";
import {
	CreateAabb,
	DenseSdfGrid,
	EditList,
	GrassField,
	GroundPlane,
	SdfField,
	SdfShape,
	SurfaceAt,
} from "../Source/Index";
import {
	SdfGrassLayer,
	SdfRenderContext,
	type SdfVolumeData,
} from "../Source/Render/Index";
import { NewScene } from "./RenderScene";

/** Flat ground at 0 over 8 x 8 m, a rock (material 7) on it at (2, 2). */
function Ground(): DenseSdfGrid {
	const list = new EditList();

	list.Add( {
		Shape: SdfShape.Box,
		Position: [ 2, 0.4, 2 ],
		Params: [ 0.8, 0.6, 0.8, 0 ],
		MaterialId: 7,
	} );
	return new DenseSdfGrid(
		new SdfField( list, new GroundPlane( 0 ) ),
		CreateAabb( -4, -1, -4, 4, 2, 4 ),
		32,
	);
}

/** The same, 20 m across: grass enough for a few tiles. */
function Field(): DenseSdfGrid {
	return new DenseSdfGrid(
		new SdfField( new EditList(), new GroundPlane( 0 ) ),
		CreateAabb( -10, -1, -10, 10, 1, 10 ),
		40,
	);
}

const Options = {
	Bounds: [ -3, -3, 3, 3 ] as [ number, number, number, number ],
	Density: 9,
	TrampleTexels: 32,
};

describe( "GrassField", () => {
	it( "grows on the ground's materials, not on a rock", () => {
		const grid = Ground();
		const field = new GrassField( Options );

		// 6 x 6 m at 9 a square metre, less the rock's
		expect( field.Scatter( grid ) ).toBeGreaterThan( 250 );
		expect( field.Count ).toBeLessThan( 18 * 18 );

		for ( let b = 0; b < field.Count; b++ ) {
			const at = b * GrassField.Stride;
			const x = field.Blades[at]!;
			const z = field.Blades[at + 2]!;

			// on the ground, its material under the root, merging with it
			expect( Math.abs( field.Blades[at + 1]! ) ).toBeLessThan( 0.1 );
			expect( Math.abs( x - 2 ) < 0.7 && Math.abs( z - 2 ) < 0.7 )
				.toBe( false );
			expect( field.Blades[at + 6] ).toBe( 0 );
			expect( field.Blades[at + 9] ).toBe( 1 );
		}
		// its defaults
		expect(
			[
				field.Height,
				field.Width,
				field.Recovery,
				field.Wind,
				field.LodDistance,
			],
		)
			.toEqual( [ 0.35, 0.04, 2.5, 0.15, 12 ] );
		expect( new GrassField( { Bounds: [ 0, 0, 1, 1 ] } ).Texels )
			.toBe( 128 );

		// a mask without the ground's layer: roots of their own colour
		const apart = new GrassField( { ...Options, Mask: 2 } );

		apart.Scatter( grid );
		expect( apart.Blades[9] ).toBe( 0 );
	} );

	it( "is pressed flat under a ball and stands up again", () => {
		const field = new GrassField( { ...Options, Recover: 1 } );

		field.Scatter( Ground() );
		// a ball rolling at (0, 0.3, 0): flat under it, leaning away around it
		field.Press( 0, 0.3, 0, 0.3 );
		expect( field.FlatAt( 0, 0 ) ).toBeGreaterThan( 0.8 );
		expect( field.FlatAt( 0.35, 0 ) ).toBeGreaterThan( 0 );

		const n = field.Texels;
		const i = Math.floor( ( 0.35 + 3 ) / 6 * n );
		const j = Math.floor( ( 0 + 3 ) / 6 * n );

		expect( field.Trample[( i + j * n ) * 3] ).toBeGreaterThan( 0.9 );
		// far away, or flying over it: untouched
		expect( field.FlatAt( -2, -2 ) ).toBe( 0 );
		field.Press( -2, 3, -2, 0.3 );
		expect( field.FlatAt( -2, -2 ) ).toBe( 0 );
		// outside the grass
		expect( field.FlatAt( 9, 0 ) ).toBe( 0 );
		expect( field.FlatAt( 0, -9 ) ).toBe( 0 );
		// a lighter touch doesn't undo a deeper one
		const flat = field.FlatAt( 0, 0 );

		field.Press( 0, 0.5, 0, 0.3 );
		expect( field.FlatAt( 0, 0 ) ).toBe( flat );
		// right at a texel's centre: flat, leaning as it was
		const cx = -3 + ( 5 + 0.5 ) * 6 / n;

		field.Press( cx, 0.2, cx, 0.3 );
		expect( field.FlatAt( cx, cx ) ).toBeGreaterThan( 0.8 );

		// a second and it stood up again by e^-1
		field.Recover( 1 );
		expect( field.FlatAt( 0, 0 ) ).toBeCloseTo( flat * Math.exp( -1 ), 5 );

		// the map as bytes: direction around 128, flatness
		const bytes = new Uint8Array( n * n * 4 );

		field.Encode( bytes );
		expect( bytes[( i + j * n ) * 4] ).toBeGreaterThan( 230 );
		expect( bytes[( i + j * n ) * 4 + 3] ).toBe( 255 );
	} );

	it( "finds the surface under a point of a volume", () => {
		const grid = Ground();
		const ground = SurfaceAt( grid, -1, -1 )!;

		expect( ground.Y ).toBeCloseTo( 0, 1 );
		expect( [ ground.Material, ground.Layer, ground.Mix ] )
			.toEqual( [ 0, 0, 0 ] );
		expect( SurfaceAt( grid, 2, 2 )!.Material ).toBe( 7 );
		expect( SurfaceAt( grid, 2, 2 )!.Y ).toBeCloseTo( 1, 1 );
		// outside the volume
		expect( SurfaceAt( grid, -5, 0 ) ).toBeNull();
		expect( SurfaceAt( grid, 0, 5 ) ).toBeNull();

		// a column of air: no surface
		const air: SdfVolumeData = {
			Data: new Uint8Array( 2 * 2 * 2 * 4 ).fill( 255 ),
			Resolution: [ 2, 2, 2 ],
			Min: [ 0, 0, 0 ],
			Spacing: 1,
			Range: 1,
		};

		expect( SurfaceAt( air, 0.5, 0.5 ) ).toBeNull();
	} );
} );

describe( "SdfGrassLayer", () => {
	function Lit() {
		const scene = NewScene();

		new DirectionalLight( "sun", new Vector3( 0, -1, 0 ), scene );

		const camera = new FreeCamera(
			"camera",
			new Vector3( 0, 2, -2 ),
			scene,
		);

		scene.activeCamera = camera;
		return { scene, camera };
	}

	it( "draws the blades in tiles, fewer of them far away", () => {
		const { scene, camera } = Lit();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const grass = new SdfGrassLayer( scene, context, {
			Bounds: [ -9, -9, 9, 9 ],
			Density: 2,
			LodDistance: 3,
		}, [ new Color3( 0.5, 0.4, 0.3 ) ] );

		expect( grass.Count ).toBe( 0 );
		grass.Scatter( Field() );

		// 18 m at 8 m a tile: three a side
		expect( grass.Tiles ).toHaveLength( 9 );
		expect( grass.Count ).toBe( grass.Field.Count );
		expect( grass.Tiles.every( ( tile ) => tile.thinInstanceCount > 0 ) )
			.toBe( true );

		// near the camera (the middle tile) all of them; farther, a share
		const counts = grass.Tiles.map( ( tile ) => tile.thinInstanceCount );

		camera.position.copyFrom(
			grass.Tiles[4]!.getBoundingInfo().boundingBox.centerWorld,
		);
		camera.position.y += 1;
		camera.getViewMatrix( true );
		grass.Update( 0.016 );
		expect( grass.Tiles[4]!.thinInstanceCount ).toBe( counts[4] );
		expect( grass.Tiles[0]!.thinInstanceCount ).toBeLessThan( counts[0]! );
		expect( grass.Tiles[0]!.thinInstanceCount )
			.toBeGreaterThanOrEqual( counts[0]! / 6 );
		camera.position.set( 0, 40, -40 );
		camera.getViewMatrix( true );
		grass.Update( 0.016 );
		// far: at least a sixth of each
		expect( grass.Drawn ).toBeLessThan( grass.Count / 4 );
		expect( grass.Drawn )
			.toBeGreaterThanOrEqual( Math.floor( grass.Count / 6 ) );

		// scattered again: new tiles, the old ones gone
		const old = grass.Tiles[0]!;

		grass.Scatter( Field() );
		expect( old.isDisposed() ).toBe( true );
		expect( grass.Tiles ).toHaveLength( 9 );

		// no camera: left as they are
		scene.activeCamera = null;
		grass.Update( 0.016 );
		grass.Dispose();
		expect( grass.Tiles ).toHaveLength( 0 );
		expect( grass.Mesh.isDisposed() ).toBe( true );
	} );

	it(
		"is pressed by the context's meshes and binds its map, wind and lights",
		() => {
			const { scene } = Lit();
			const context = new SdfRenderContext(
				scene,
				{ AutoMeshes: false },
			);
			const grass = new SdfGrassLayer(
				scene,
				context,
				Options,
				[ new Color3( 0.5, 0.4, 0.3 ) ],
			);
			const ball = CreateSphere( "ball", { diameter: 0.6 }, scene );

			grass.Scatter( Ground() );
			ball.position.set( 0, 0.3, 0 );
			ball.computeWorldMatrix( true );
			context.AddMesh( ball );

			const upload = vi.spyOn( grass.Texture, "update" );

			// every frame by itself
			scene.onBeforeRenderObservable.notifyObservers( scene );
			expect( grass.Field.FlatAt( 0, 0 ) ).toBeGreaterThan( 0.5 );
			expect( upload ).toHaveBeenCalledTimes( 1 );
			// the map at most UploadHz
			grass.Update( 0.001 );
			expect( upload ).toHaveBeenCalledTimes( 1 );

			const effect = {
				setTexture: vi.fn(),
				setFloat: vi.fn(),
				setFloat2: vi.fn(),
				setFloat3: vi.fn(),
				setFloat4: vi.fn(),
				setFloatArray4: vi.fn(),
				setVector3: vi.fn(),
				setColor3: vi.fn(),
				setMatrix: vi.fn(),
				setDepthStencilTexture: vi.fn(),
			};

			// what the material binds, with its effect
			grass.Material.bind(
				Matrix.Identity(),
				grass.Tiles[0],
				effect as unknown as Effect,
			);
			expect( effect.setTexture )
				.toHaveBeenCalledWith( "trampleMap", grass.Texture );
			expect( effect.setFloat4 )
				.toHaveBeenCalledWith( "trampleArea", -3, -3, 1 / 6, 1 / 6 );
			expect( effect.setFloat3 )
				.toHaveBeenCalledWith( "tipColor", ...grass.Field.Color );
			grass.Dispose();
		},
	);

	it(
		"grows without shadows, roots of its own colour where it doesn't merge",
		() => {
			const { scene } = Lit();
			const context = new SdfRenderContext(
				scene,
				{ AutoMeshes: false, Shadows: false },
			);
			const grass = new SdfGrassLayer(
				scene,
				context,
				{ ...Options, Mask: 2, RootColor: [ 1, 0, 0 ] },
				[ new Color3( 0, 0, 1 ) ],
			);

			grass.Scatter( Ground() );
			expect( grass.Material.options.defines ).toEqual( [] );

			const roots = ( grass.Tiles[0] as unknown as {
				_userThinInstanceBuffersStorage: {
					data: Record<string, Float32Array>;
				};
			} )._userThinInstanceBuffersStorage.data["grassRoot"]!;

			expect( [ ...roots.slice( 0, 3 ) ] ).toEqual( [ 1, 0, 0 ] );
			grass.Dispose();
		},
	);
} );
