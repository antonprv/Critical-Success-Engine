// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Engine } from "@babylonjs/core/Engines/engine";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type {
	StandardMaterial,
} from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AssetLoader,
	AssetPriority,
} from "../Source/Engine/Assets/AssetLoader";
import { RendMesh } from "../Source/Workers/Common/CommonEnums";
import {
	EntityMeshRegistry, SphereSegments,
} from "../Source/Workers/Render/EntityMeshRegistry";
import { RenderScene } from "../Source/Workers/Render/RenderScene";
import { TRANSFORM_STRIDE } from "../Source/Workers/Protocol/TransformProtocol";
import { SilenceConsole } from "./helpers";

const engines: Engine[] = [];
afterEach( () => {
	for ( const engine of engines.splice( 0 ) ) {
		engine.dispose();
	}
} );

function MakeScene(): Scene {
	const engine = new NullEngine();
	engines.push( engine );
	return new Scene( engine );
}

/** Records AssetLoader calls instead of fetching anything. */
function FakeLoader() {
	const added: {
		name: string;
		rootUrl: string;
		file: string;
		onLoaded: ( meshes: AbstractMesh[] ) => void;
	}[] = [];
	const loader = {
		AddMesh: vi.fn(
			(
				_priority: string,
				name: string,
				rootUrl: string,
				file: string,
				onLoaded: ( meshes: AbstractMesh[] ) => void,
			) => added.push( { name, rootUrl, file, onLoaded } ),
		),
		LoadBackgroundInBackground: vi.fn(),
	};

	return { loader: loader as unknown as AssetLoader, added, raw: loader };
}

const Identity: [number, number, number, number, number, number, number] = [
	0,
	0,
	0,
	0,
	0,
	0,
	1,
];
const meshOf = ( scene: Scene, id: number ): AbstractMesh
	| null => scene.getMeshByName( `entity-${ id }` );

describe( "EntityMeshRegistry", () => {
	const Registry = () => {
		const scene = MakeScene();

		return {
			scene,
			registry: new EntityMeshRegistry( scene, FakeLoader().loader ),
		};
	};
	const batches = ( scene: Scene ) => scene.meshes.filter(
		( m ) => m.name.startsWith( "batch-" ),
	) as Mesh[];

	it(
		"draws primitives of one shape and size as one mesh of instances, each "
			+ "at its pose in its colour",
		() => {
			const { scene, registry } = Registry();
			registry.Spawn(
				1,
				{ shape: RendMesh.Sphere, diameter: 2 },
				[1, 2, 3, 0, 0, 0, 1],
				[1, 0, 0],
			);
			registry.Spawn(
				2,
				{ shape: RendMesh.Box, size: [2, 4, 6] },
				Identity,
			);
			registry.Spawn(
				3,
				{ shape: RendMesh.Capsule, radius: 0.5, height: 2 },
				Identity,
			);
			registry.Spawn(
				4,
				{ shape: RendMesh.Cylinder, diameter: 1, height: 3 },
				Identity,
			);
			registry.Spawn(
				5,
				{ shape: RendMesh.Box, size: [2, 4, 6] },
				[9, 0, 0, 0, 0, 0, 1],
				[0, 0, 1],
			);

			expect( registry.Describe( 1 ) )
				.toEqual(
					{
						Position: [1, 2, 3],
						Rotation: [0, 0, 0, 1],
						Color: [1, 0, 0],
						Visible: true,
						Batched: true,
					},
				);
			// default grey
			expect( registry.Describe( 2 )!.Color )
				.toEqual( [0.75, 0.78, 0.82] );
			// one mesh per shape and size: the two boxes share theirs
			expect( batches( scene ) ).toHaveLength( 4 );
			// right before drawing, the batches hand their changes to the GPU
			scene.onBeforeRenderObservable.notifyObservers( scene );
			const box = batches( scene )
				.find( ( m ) => m.name.includes( "\"size\"" ) )!;
			expect( box.thinInstanceCount ).toBe( 2 );
			box.refreshBoundingInfo();
			const extent = box.getBoundingInfo().boundingBox.extendSize;
			// full extents 2 x 4 x 6
			expect( [extent.x, extent.y, extent.z] ).toEqual( [1, 2, 3] );
			// the colour is per instance: the batch's material is white, lit,
			// culled
			const material = box.material as StandardMaterial;
			expect(
				[material.diffuseColor.asArray(), material.backFaceCulling],
			).toEqual( [[1, 1, 1], true] );
		},
	);

	it( "a small sphere is cut into fewer pieces than a big one", () => {
		expect(
			[
				SphereSegments( 0.2 ),
				SphereSegments( 0.6 ),
				SphereSegments( 1 ),
				SphereSegments( 5 ),
			],
		).toEqual( [8, 8, 12, 24] );
	} );

	it(
		"triangle soups get computed normals; a coloured one is double-sided, "
			+ "an uncoloured one keeps the default material",
		() => {
			const scene = MakeScene();
			const registry = new EntityMeshRegistry(
				scene,
				FakeLoader().loader,
			);
			const triangle = [0, 0, 0, 1, 0, 0, 0, 0, 1];

			registry.Spawn(
				1,
				{ shape: RendMesh.Triangles, vertices: triangle },
				Identity,
				[1, 1, 0],
			);
			registry.Spawn(
				2,
				{ shape: RendMesh.Triangles, vertices: triangle },
				Identity,
			);

			const coloured = meshOf( scene, 1 ) as Mesh;
			expect( coloured.getTotalVertices() ).toBe( 3 );
			expect( coloured.getIndices() ).toEqual( [0, 1, 2] );
			expect( coloured.getVerticesData( "normal" ) ).toHaveLength( 9 );
			expect( ( coloured.material as StandardMaterial ).backFaceCulling )
				.toBe( false );
			expect( meshOf( scene, 2 )!.material ).toBeNull();
		},
	);

	it( "re-spawning an id replaces what drew it", () => {
		const { scene, registry } = Registry();
		registry.Spawn( 1, { shape: RendMesh.Box, size: [1, 1, 1] }, Identity );
		registry.Spawn(
			1,
			{
				shape: RendMesh.Triangles,
				vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1],
			},
			Identity,
		);
		expect( registry.Describe( 1 )!.Batched ).toBe( false );
		registry.Spawn( 1, { shape: RendMesh.Sphere, diameter: 1 }, Identity );
		expect( scene.meshes.filter( ( m ) => m.name === "entity-1" ) )
			.toHaveLength( 0 );
		expect( registry.Describe( 1 )!.Batched ).toBe( true );
	} );

	it(
		"SetVisible, SetColor, Remove and Clear act on known ids and ignore "
			+ "unknown ones",
		() => {
			const { scene, registry } = Registry();
			const triangle = [0, 0, 0, 1, 0, 0, 0, 0, 1];
			registry.Spawn(
				1,
				{ shape: RendMesh.Box, size: [1, 1, 1] },
				Identity,
			);
			registry.Spawn(
				2,
				{ shape: RendMesh.Box, size: [1, 1, 1] },
				[2, 0, 0, 0, 0, 0, 1],
			);
			registry.Spawn(
				3,
				{ shape: RendMesh.Triangles, vertices: triangle },
				Identity,
			);

			registry.SetVisible( 1, false );
			registry.SetColor( 1, [0.5, 0.5, 0.5] );
			expect( registry.Describe( 1 ) )
				.toMatchObject( { Visible: false, Color: [0.5, 0.5, 0.5] } );
			registry.SetVisible( 3, false );
			registry.SetColor( 3, [0, 1, 0] );
			expect( registry.Describe( 3 ) )
				.toMatchObject(
					{ Visible: false, Color: [0, 1, 0], Batched: false },
				);
			expect( () => {
				registry.SetVisible( 99, true );
				registry.SetColor( 99, [1, 1, 1] );
				registry.Remove( 99 );
			} ).not.toThrow();
			expect( registry.Describe( 99 ) ).toBeNull();

			// removing the first instance moves the last one into its place: it
			// keeps its pose
			registry.Remove( 1 );
			expect( registry.Describe( 1 ) ).toBeNull();
			expect( registry.Describe( 2 )!.Position ).toEqual( [2, 0, 0] );
			registry.SetColor( 2, [1, 0, 0] );
			expect( registry.Describe( 2 )!.Color ).toEqual( [1, 0, 0] );
			const triangleMesh = meshOf( scene, 3 )!;
			registry.Clear();
			expect(
				[
					registry.Describe( 2 ),
					registry.Describe( 3 ),
					triangleMesh.isDisposed(),
				],
			).toEqual( [null, null, true] );
			expect(
				scene.meshes.filter( ( m ) => m.name.startsWith( "batch-" ) ),
			).toHaveLength( 0 );
		},
	);

	it(
		"applies a frame's transform batch to what it knows, skipping the rest",
		() => {
			const { registry } = Registry();
			registry.Spawn(
				5,
				{ shape: RendMesh.Box, size: [1, 1, 1] },
				Identity,
			);
			registry.Spawn(
				6,
				{
					shape: RendMesh.Triangles,
					vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1],
				},
				Identity,
			);

			const batch = new Float64Array( 3 * TRANSFORM_STRIDE );
			batch.set( [5, 1, 2, 3, 0, 1, 0, 0], 0 );
			batch.set( [6, 4, 5, 6, 0, 0, 1, 0], TRANSFORM_STRIDE );
			// an id the renderer never heard of
			batch.set( [77, 9, 9, 9, 0, 0, 0, 1], 2 * TRANSFORM_STRIDE );
			registry.ApplyTransformBatch( batch.buffer, 3 );

			expect( registry.Describe( 5 ) )
				.toMatchObject(
					{ Position: [1, 2, 3], Rotation: [0, 1, 0, 0] },
				);
			expect( registry.Describe( 6 ) )
				.toMatchObject(
					{ Position: [4, 5, 6], Rotation: [0, 0, 1, 0] },
				);
		},
	);

	it(
		"glTF models load in the background, are posed when they arrive, and "
			+ "announce themselves",
		() => {
			const scene = MakeScene();
			const { loader, added, raw } = FakeLoader();
			const registry = new EntityMeshRegistry( scene, loader );
			const loaded = vi.fn();
			registry.OnGltfLoaded = loaded;

			registry.Spawn(
				7,
				{
					shape: RendMesh.Gltf,
					rootUrl: "/assets/",
					sceneFilename: "crate.glb",
				},
				[4, 5, 6, 0, 0, 0, 1],
			);
			expect( added[0] )
				.toMatchObject(
					{
						name: "entity-7",
						rootUrl: "/assets/",
						file: "crate.glb",
					},
				);
			expect( raw.LoadBackgroundInBackground ).toHaveBeenCalledTimes( 1 );

			// nothing in the file: nothing to register
			added[0]!.onLoaded( [] );
			expect( loaded ).not.toHaveBeenCalled();

			const root = new Mesh( "__root__", scene );
			added[0]!.onLoaded( [root] );
			expect( root.position.asArray() ).toEqual( [4, 5, 6] );
			expect( loaded ).toHaveBeenCalledWith( 7 );

			registry.SetVisible( 7, false );
			expect( root.isEnabled() ).toBe( false );
		},
	);

	it( "a glTF arriving without anyone listening is still registered", () => {
		const scene = MakeScene();
		const { loader, added } = FakeLoader();
		const registry = new EntityMeshRegistry( scene, loader );
		registry.Spawn(
			8,
			{ shape: RendMesh.Gltf, rootUrl: "/", sceneFilename: "a.glb" },
			Identity,
		);
		const root = new Mesh( "root", scene );
		expect( () => added[0]!.onLoaded( [root] ) ).not.toThrow();
		registry.Remove( 8 );
		expect( root.isDisposed() ).toBe( true );
	} );
} );

describe( "RenderScene: frames without the display's limit", () => {
	// long enough for the loop's message to come through, however busy the run
	const tick = () => new Promise<void>( ( done ) => setTimeout( done, 10 ) );

	function Uncapped( gl: Partial<WebGL2RenderingContext> | null = null ) {
		const engine = new NullEngine();
		engines.push( engine );
		( engine as unknown as { _gl: unknown; } )._gl = gl;
		const scene = new RenderScene(
			{ width: 0, height: 0 } as OffscreenCanvas,
			10,
			10,
			1,
			() => engine,
		);
		const render = vi.spyOn( scene.Scene, "render" )
			.mockImplementation( () => undefined );
		let fresh = false;
		scene.Uncap();
		scene.RunRenderLoop( () => {
			const was = fresh;
			fresh = false;
			return was;
		} );
		return { scene, engine, render, arrive: () => {
			fresh = true;
			scene.Wake();
		} };
	}

	it(
		"draws when a new game state arrives, then sleeps (no spinning) until "
			+ "the next one",
		async () => {
			const { render, arrive, engine } = Uncapped();
			await tick();
			expect( render ).toHaveBeenCalledTimes( 1 ); // the first frame
			await tick();
			await tick();
			expect( render ).toHaveBeenCalledTimes( 1 ); // nothing new: asleep
			arrive();
			await tick();
			expect( render ).toHaveBeenCalledTimes( 2 );
			arrive();
			arrive(); // two arrivals before it ran: one frame
			await tick();
			await tick();
			expect( render ).toHaveBeenCalledTimes( 3 );
			engine.stopRenderLoop();
		},
	);

	it(
		"a wake while the loop isn't waiting only marks something to draw; "
			+ "without a canvas the GPU facts say 0 x 0",
		() => {
			const engine = new NullEngine();
			engines.push( engine );
			const scene = new RenderScene(
				{ width: 0, height: 0 } as OffscreenCanvas,
				10,
				10,
				1,
				() => engine,
			);
			scene.Uncap();
			expect( () => scene.Wake() ).not.toThrow();
			vi.spyOn( engine, "getRenderingCanvas" ).mockReturnValue( null );
			expect( scene.GpuInfo ).toMatchObject( { width: 0, height: 0 } );
		},
	);

	it(
		"keeps at most four frames in flight on the GPU: while they run, a new "
			+ "state waits",
		async () => {
			let done = false;
			const gl = {
				SYNC_GPU_COMMANDS_COMPLETE: 1, SYNC_STATUS: 2, SIGNALED: 3,
				UNSIGNALED: 4,
				fenceSync: () => ( {} as WebGLSync ),
				getSyncParameter: () => ( done ? 3 : 4 ),
				deleteSync: vi.fn(),
				flush: vi.fn(),
			} as unknown as Partial<WebGL2RenderingContext>;
			const { render, arrive, engine, scene } = Uncapped( gl );
			await tick();
			for ( let i = 0; i < 3; i++ ) {
				arrive();
				await tick();
			}
			expect( render ).toHaveBeenCalledTimes( 4 );
			arrive(); // four frames still on the GPU
			await tick();
			await tick();
			expect( render ).toHaveBeenCalledTimes( 4 );
			// a newer state while the GPU is busy: the older one is never drawn
			arrive();
			done = true; // the GPU caught up: the waiting state is drawn
			await tick();
			await tick();
			expect( render ).toHaveBeenCalledTimes( 5 );
			expect( gl.deleteSync ).toHaveBeenCalledTimes( 4 );
			// fps counts frames drawn with a new state: four were (three
			// intervals), not the five that arrived
			expect( scene.Perf.Take()["fresh"] ).toHaveLength( 3 );
			engine.stopRenderLoop();
		},
	);
} );

describe( "RenderScene", () => {
	function Make( width = 400, height = 300, dpr = 2 ) {
		const canvas = { width: 0, height: 0 } as OffscreenCanvas;
		let engine: NullEngine | null = null;
		const scene = new RenderScene( canvas, width, height, dpr, () => {
			engine = new NullEngine();
			engines.push( engine );
			vi.spyOn( engine, "getRenderingCanvas" )
				.mockReturnValue( canvas as unknown as HTMLCanvasElement );
			return engine;
		} );

		return { scene, canvas, engine: engine! };
	}

	it( "UseFxaa adds an FXAA pass to the camera", () => {
		const { scene } = Make();
		scene.UseFxaa();
		expect(
			scene.Scene.activeCamera!._postProcesses.map( ( p ) => p?.name ),
		).toEqual( ["fxaa"] );
	} );

	it(
		"sizes the canvas in device pixels and sets up a right-handed scene "
			+ "with a camera and two lights",
		() => {
			const { scene, canvas } = Make( 400, 300, 2 );
			expect( [canvas.width, canvas.height] ).toEqual( [800, 600] );
			expect( scene.Scene.useRightHandedSystem ).toBe( true );
			expect( scene.Scene.activeCamera?.name ).toBe( "MainCamera" );
			expect( scene.Scene.lights.map( ( l ) => l.name ) )
				.toEqual( ["Sky", "Sun"] );
			expect( scene.AssetLoader ).toBeInstanceOf( AssetLoader );
		},
	);

	it( "never makes a zero-sized canvas", () => {
		const { canvas } = Make( 0, 0, 1 );
		expect( [canvas.width, canvas.height] ).toEqual( [1, 1] );
	} );

	it( "SetClearColor, PoseCamera and Resize", () => {
		const { scene, canvas, engine } = Make( 100, 100, 1 );
		scene.SetClearColor( 0.1, 0.2, 0.3 );
		expect( scene.Scene.clearColor.asArray() )
			.toEqual( [0.1, 0.2, 0.3, 1] );

		scene.PoseCamera( { transform: [1, 2, 3, 0, 1, 0, 0], fov: 1.2 } );
		const camera = scene.Scene.activeCamera!;
		expect( camera.position.asArray() ).toEqual( [1, 2, 3] );
		expect( camera.fov ).toBe( 1.2 );

		const resize = vi.spyOn( engine, "resize" );
		scene.Resize( 640, 360, 1.5 );
		expect( [canvas.width, canvas.height] ).toEqual( [960, 540] );
		expect( resize ).toHaveBeenCalled();
	} );

	it( "Resize without a rendering canvas only tells the engine", () => {
		const { scene, engine } = Make();
		vi.spyOn( engine, "getRenderingCanvas" ).mockReturnValue( null );
		const resize = vi.spyOn( engine, "resize" );
		scene.Resize( 10, 10, 1 );
		expect( resize ).toHaveBeenCalled();
	} );

	it(
		"each render loop iteration runs the callback, then renders the scene",
		() => {
			const { scene, engine } = Make();
			let loop: ( () => void ) | undefined;
			vi.spyOn( engine, "runRenderLoop" )
				.mockImplementation( ( callback ) => {
					loop = callback;
				} );
			const render = vi.spyOn( scene.Scene, "render" )
				.mockImplementation( () => undefined );
			const order: string[] = [];
			render.mockImplementation( () => {
				order.push( "render" );
			} );

			scene.RunRenderLoop( () => {
				order.push( "before" );
			} );
			loop!();
			expect( order ).toEqual( ["before", "render"] );
			// the perf probe: every frame's CPU time, draw calls and triangles;
			// the time between frames from the second one on
			loop!();
			const taken = scene.Perf.Take();
			expect( Object.keys( taken ).sort() )
				.toEqual( ["draws", "frame", "render", "triangles"] );
			expect(
				[
					taken["frame"]!.length,
					taken["render"]!.length,
					taken["draws"],
					taken["triangles"],
				],
			)
				.toEqual( [1, 2, [0, 0], [0, 0]] );
			// draw calls: what each frame added to Babylon's growing counter
			const counter = ( engine as unknown as {
				_drawCalls: { current: number; };
			} )._drawCalls;
			vi.spyOn( counter, "current", "get" ).mockReturnValueOnce( 5 )
				.mockReturnValueOnce( 12 )
				.mockReturnValueOnce( 3 );
			loop!();
			loop!();
			loop!();
			expect( scene.Perf.Take()["draws"] ).toEqual( [5, 7, 3] );
			expect( scene.GpuInfo )
				.toMatchObject(
					{
						width: expect.any( Number ),
						height: expect.any( Number ),
					},
				);
		},
	);

	it(
		"by default it asks for a real WebGL engine (which Node cannot "
			+ "provide)",
		() => {
			const canvas = {
				width: 0,
				height: 0,
				getContext: () => null,
				addEventListener: () => undefined,
				removeEventListener: () => undefined,
			};
			SilenceConsole();
			expect(
				() => new RenderScene(
					canvas as unknown as OffscreenCanvas,
					10,
					10,
					1,
				),
			).toThrow( /WebGL not supported/ );
		},
	);
} );

describe( "AssetLoader", () => {
	it(
		"routes mesh and texture tasks to the critical or background queue and "
			+ "reports success",
		() => {
			const scene = MakeScene();
			const assets = new AssetLoader( scene );
			const managers = assets as unknown as {
				_critical: {
					addMeshTask: () => unknown;
					addTextureTask: () => unknown;
				};
				_background: {
					addMeshTask: () => unknown;
					addTextureTask: () => unknown;
				};
			};

			const tasks: Record<
				string,
				{
					onSuccess?: ( t: unknown ) => void;
					onError?: ( t: unknown, m: string, e?: unknown ) => void;
					name: string;
				}
			> = {};
			const fakeTask = ( name: string ) => ( tasks[name] = { name } );
			const criticalMesh = vi.spyOn( managers._critical, "addMeshTask" )
				.mockImplementation(
					( ( name: string ) => fakeTask( name ) ) as never,
				);
			const backgroundMesh = vi.spyOn(
				managers._background,
				"addMeshTask",
			)
				.mockImplementation(
					( ( name: string ) => fakeTask( name ) ) as never,
				);
			const criticalTexture = vi.spyOn(
				managers._critical,
				"addTextureTask",
			)
				.mockImplementation(
					( ( name: string ) => fakeTask( name ) ) as never,
				);
			const backgroundTexture = vi.spyOn(
				managers._background,
				"addTextureTask",
			)
				.mockImplementation(
					( ( name: string ) => fakeTask( name ) ) as never,
				);

			const meshes = vi.fn(),
				texture = vi.fn();
			assets.AddMesh(
				AssetPriority.Critical,
				"level",
				"/assets/",
				"level.glb",
				meshes,
			);
			assets.AddMesh(
				AssetPriority.Background,
				"prop",
				"/assets/",
				"prop.glb",
			);
			assets.AddTexture(
				AssetPriority.Critical,
				"sky",
				"/assets/sky.png",
				texture,
			);
			assets.AddTexture(
				AssetPriority.Background,
				"dirt",
				"/assets/dirt.png",
			);

			expect( criticalMesh )
				.toHaveBeenCalledWith( "level", "", "/assets/", "level.glb" );
			expect( backgroundMesh )
				.toHaveBeenCalledWith( "prop", "", "/assets/", "prop.glb" );
			expect( criticalTexture )
				.toHaveBeenCalledWith( "sky", "/assets/sky.png" );
			expect( backgroundTexture )
				.toHaveBeenCalledWith( "dirt", "/assets/dirt.png" );

			tasks["level"]!.onSuccess!( { loadedMeshes: ["m"] } );
			tasks["sky"]!.onSuccess!( { texture: "t" } );
			// no callback given: fine
			tasks["prop"]!.onSuccess!( { loadedMeshes: [] } );
			tasks["dirt"]!.onSuccess!( { texture: "t" } );
			expect( meshes ).toHaveBeenCalledWith( ["m"] );
			expect( texture ).toHaveBeenCalledWith( "t" );
		},
	);

	it(
		"logs failed tasks with their name (using the exception when there is "
			+ "one)",
		() => {
			const log = SilenceConsole();
			const scene = MakeScene();
			const assets = new AssetLoader( scene );
			const managers = assets as unknown as {
				_background: {
					addMeshTask: () => unknown;
					addTextureTask: () => unknown;
				};
			};
			const tasks: {
				onError?: ( t: unknown, m: string, e?: unknown ) => void;
			}[] = [];
			vi.spyOn( managers._background, "addMeshTask" )
				.mockImplementation( ( () => {
					const t = {}; tasks.push( t ); return t;
				} ) as never );
			vi.spyOn( managers._background, "addTextureTask" )
				.mockImplementation( ( () => {
					const t = {}; tasks.push( t ); return t;
				} ) as never );

			assets.AddMesh( AssetPriority.Background, "prop", "/", "prop.glb" );
			assets.AddTexture( AssetPriority.Background, "dirt", "/dirt.png" );
			tasks[0]!.onError!(
				{ name: "prop" },
				"404",
				new Error( "not found" ),
			);
			tasks[1]!.onError!( { name: "dirt" }, "bad image" );

			const lines = log.error.mock.calls.map( ( c ) => String( c[0] ) );
			expect( lines[0] )
				.toContain( "[AssetLoader] failed to load prop: 404" );
			expect( lines[0] ).toContain( "not found" );
			expect( lines[1] )
				.toContain( "[AssetLoader] failed to load dirt: bad image" );
		},
	);

	it(
		"critical assets: resolves when everything loaded, rejects on the "
			+ "first failure",
		async () => {
			const scene = MakeScene();
			const assets = new AssetLoader( scene );
			const critical = ( assets as unknown as {
				_critical: {
					load: () => void;
					onFinish: () => void;
					onTaskError: ( t: { name: string; } ) => void;
				};
			} )._critical;

			vi.spyOn( critical, "load" )
				.mockImplementationOnce( () => critical.onFinish() );
			await expect( assets.LoadCriticalAsync() ).resolves.toBeUndefined();

			vi.spyOn( critical, "load" )
				.mockImplementationOnce(
					() => critical.onTaskError( { name: "level" } ),
				);
			await expect( assets.LoadCriticalAsync() ).rejects
				.toThrow( "Critical asset failed: level" );
		},
	);

	it(
		"background loading reports progress and idleness when someone listens",
		() => {
			const scene = MakeScene();
			const assets = new AssetLoader( scene );
			const background = ( assets as unknown as {
				_background: {
					load: () => void;
					onProgress: ( remaining: number, total: number ) => void;
					onFinish: () => void;
				};
			} )._background;
			const load = vi.spyOn( background, "load" )
				.mockImplementation( () => undefined );

			background.onProgress( 1, 4 ); // nobody listening yet: fine
			background.onFinish();

			const progress = vi.fn(),
				idle = vi.fn();
			assets.OnBackgroundProgress = progress;
			assets.OnBackgroundIdle = idle;
			assets.LoadBackgroundInBackground();
			background.onProgress( 1, 4 );
			background.onFinish();

			expect( load ).toHaveBeenCalled();
			expect( progress ).toHaveBeenCalledWith( 3, 4 );
			expect( idle ).toHaveBeenCalled();
		},
	);
} );
