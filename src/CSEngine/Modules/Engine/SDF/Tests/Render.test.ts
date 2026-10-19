// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import {
	InternalTexture,
	InternalTextureSource,
} from "@babylonjs/core/Materials/Textures/internalTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ChunkKey,
	CreateAabb,
	DenseSdfGrid,
	EditList,
	GroundPlane,
	SdfField,
	SdfMeshChunks,
	SdfShape,
} from "../Source/Index";
import {
	DefaultPalette,
	PaletteColor,
	SdfDebugView,
	SdfMeshLayer,
	SdfQuality,
	SdfRaymarchLayer,
	SdfRenderReceiver,
} from "../Source/Render/Index";

const engines: NullEngine[] = [];

afterEach( () => {
	for ( const engine of engines.splice( 0 ) ) {
		engine.dispose();
	}
} );

function NewScene(): Scene {
	const engine = new NullEngine();

	// NullEngine has no GL to make 3D textures with
	vi.spyOn( engine, "createRawTexture3D" ).mockImplementation(
		() => new InternalTexture( engine, InternalTextureSource.Raw3D ),
	);
	vi.spyOn( engine, "updateRawTexture3D" ).mockImplementation( () => {
	} );

	engines.push( engine );
	return new Scene( engine );
}

function World() {
	const list = new EditList();
	const ball = list.Add(
		{ Shape: SdfShape.Sphere, Params: [ 1, 0, 0, 0 ], MaterialId: 3 },
	);
	const field = new SdfField( list, new GroundPlane( -1 ) );

	return { list, ball, field };
}

describe( "DenseSdfGrid", () => {
	it( "samples the field at texel centers", () => {
		const { field } = World();
		const grid = new DenseSdfGrid(
			field,
			CreateAabb( -2, -2, -2, 2, 1, 2 ),
			16,
		);

		expect( grid.Spacing ).toBe( 0.25 );
		expect( grid.Resolution ).toEqual( [ 16, 12, 16 ] );
		expect( grid.Size ).toEqual( [ 4, 3, 4 ] );
		expect( grid.Range ).toBe( 2 );

		// texel (8, 8, 8) is centered at (0.125, 0.125, 0.125): inside the ball
		const at = ( 8 + 8 * 16 + 8 * 16 * 12 ) * 4;

		// distance, material pair, then the mix (5 bits) and the layer (3)
		expect( grid.Data[at] ).toBeLessThan( 128 );
		expect( grid.Data[at + 1] ).toBe( 3 );
		expect( grid.Data[at + 2] ).toBe( 3 );
		expect( grid.Data[at + 3] ).toBe( 0 );
		// the corner texel: ground material, far outside the ball
		expect( grid.Data[1] ).toBe( 0 );
	} );

	it( "re-samples only what edits change inside it", () => {
		const { list, ball, field } = World();
		const grid = new DenseSdfGrid(
			field,
			CreateAabb( -4, -4, -4, 4, 4, 4 ),
			32,
			2,
		);

		expect( grid.Refresh() ).toBe( 0 );
		// nothing written: no slices
		expect( grid.Written[1] ).toBeLessThan( grid.Written[0] );
		list.Update( ball.Id, { Position: [ 0.5, 0, 0 ] } );

		const written = grid.Refresh();

		// the old and the new reach, a fraction of the grid each, in a few
		// of its slices
		expect( written ).toBeGreaterThan( 0 );
		expect( written ).toBeLessThan( 32 ** 3 );
		expect( grid.Written[0] ).toBeGreaterThan( 0 );
		expect( grid.Written[1] ).toBeLessThan( 31 );
		expect( grid.Written[1] ).toBeGreaterThanOrEqual( grid.Written[0] );
		list.Add( { Shape: SdfShape.Sphere, Position: [ 50, 0, 0 ] } );
		expect( grid.Refresh() ).toBe( 0 );
		grid.Dispose();
		list.Remove( ball.Id );
		expect( grid.Refresh() ).toBe( 0 );
	} );
} );

describe( "SdfRaymarchLayer", () => {
	it( "draws the grid on a box around it and uploads changes", () => {
		const scene = NewScene();
		const { list, ball, field } = World();
		const grid = new DenseSdfGrid(
			field,
			CreateAabb( -2, -2, -2, 2, 2, 2 ),
			8,
		);
		const layer = new SdfRaymarchLayer( scene, grid, {
			Palette: [ new Color3( 1, 0, 0 ) ],
			Quality: SdfQuality.Plain,
			StepScale: 0.8,
		} );
		const update = vi.spyOn( layer.Volume, "Update" );

		expect( layer.Texture ).toBe( layer.Volume.Texture );
		expect( layer.Mesh.scaling.asArray() ).toEqual( [ 4, 4, 4 ] );
		expect( layer.Mesh.position.asArray() ).toEqual( [ 0, 0, 0 ] );
		expect( layer.Material.backFaceCulling ).toBe( true );
		expect( layer.Material.cullBackFaces ).toBe( false );
		expect( layer.Update() ).toBe( false );
		list.Update( ball.Id, { Scale: 1.2 } );
		// before every frame by itself
		scene.onBeforeRenderObservable.notifyObservers( scene );
		// the slices the edit changed
		expect( update ).toHaveBeenCalledWith( grid.Data, ...grid.Written );
		expect( layer.StepScale ).toBe( 0.8 );
		layer.Dispose();
		expect( layer.Mesh.isDisposed() ).toBe( true );
	} );

	it( "takes the scene's lights and its view settings", () => {
		const scene = NewScene();
		const { field } = World();
		const sun = new DirectionalLight(
			"sun",
			new Vector3( 0, -1, 0 ),
			scene,
		);
		const sky = new HemisphericLight(
			"sky",
			new Vector3( 0, 1, 0 ),
			scene,
		);

		new PointLight( "lamp", Vector3.Zero(), scene );
		sun.intensity = 2;
		sky.groundColor = new Color3( 0.5, 0, 0 );

		const layer = new SdfRaymarchLayer(
			scene,
			new DenseSdfGrid( field, CreateAabb( -1, -1, -1, 1, 1, 1 ), 4 ),
		);

		expect( layer.Quality ).toBe( SdfQuality.Shadows );
		layer.Quality = SdfQuality.Occlusion;
		expect( layer.Quality ).toBe( SdfQuality.Occlusion );
		layer.DebugView = SdfDebugView.Steps;
		expect( layer.DebugView ).toBe( SdfDebugView.Steps );
		layer.StepScale = 0.5;
		expect( layer.StepScale ).toBe( 0.5 );
		sun.intensity = 3;
		layer.SyncLights();
		expect( layer.Context.SunDirection ).toEqual( new Vector3( 0, -1, 0 ) );
		expect( layer.Context.SunColor ).toEqual( new Color3( 3, 3, 3 ) );
		expect( layer.Context.GroundColor ).toEqual( new Color3( 0.5, 0, 0 ) );
		// its own context: disposed with it
		const dispose = vi.spyOn( layer.Context, "Dispose" );

		layer.Dispose();
		expect( dispose ).toHaveBeenCalled();
	} );
} );

describe( "SdfMeshLayer", () => {
	it( "draws chunks with triangles and swaps them as they change", () => {
		const scene = NewScene();
		const { list, ball, field } = World();
		const chunks = new SdfMeshChunks( field, {
			CellSize: 0.5,
			ChunkCells: 4,
			Radius: 1,
			Budget: 100,
		} );
		const layer = new SdfMeshLayer( scene, chunks );
		const first = layer.Update();

		expect( first.Built ).toHaveLength( 27 );
		// chunks without a surface aren't drawn
		expect( layer.Count ).toBeGreaterThan( 0 );
		expect( layer.Count ).toBeLessThan( 27 );

		const mesh = layer.MeshOf( ChunkKey( 0, 0, 0 ) )!;

		expect( mesh.material ).toBe( layer.Material );
		expect( mesh.getVerticesData( "color" ) ).not.toBeNull();

		list.Update( ball.Id, { Position: [ 0.2, 0, 0 ] } );
		layer.Update();
		expect( mesh.isDisposed() ).toBe( true );
		expect( layer.MeshOf( ChunkKey( 0, 0, 0 ) ) ).not.toBe( mesh );

		chunks.CenterOn( 10, 0, 0 );
		layer.Update();
		expect( layer.MeshOf( ChunkKey( 0, 0, 0 ) ) ).toBeUndefined();
		layer.Dispose();
		expect( layer.Count ).toBe( 0 );
	} );

	it( "colors by the palette, wrapping ids past it", () => {
		expect( PaletteColor( DefaultPalette, 9 ) ).toBe( DefaultPalette[1] );

		const scene = NewScene();
		const { field } = World();
		const layer = new SdfMeshLayer(
			scene,
			new SdfMeshChunks(
				field,
				{ CellSize: 0.5, ChunkCells: 4, Radius: 0 },
			),
			{ Palette: [ new Color3( 1, 0, 0 ) ] },
		);

		layer.Update();

		const colors = layer.MeshOf( ChunkKey( 0, 0, 0 ) )!
			.getVerticesData( "color" )!;

		expect( colors[1] ).toBe( 0 );
		expect( colors[3] ).toBe( 1 );
		layer.Dispose();
	} );
} );

describe( "SdfRenderReceiver", () => {
	it( "draws the chunks of the current scene only", () => {
		const scene = NewScene();
		const { field } = World();
		const chunks = new SdfMeshChunks(
			field,
			{ CellSize: 0.5, ChunkCells: 4, Radius: 0 },
		);
		const built = chunks.Update().Built;
		const receiver = new SdfRenderReceiver( scene );

		expect( receiver.Handle( { Type: "begin", Epoch: 2, Settings: null } ) )
			.toBe( true );
		// an older scene's chunks, late
		expect(
			receiver.Handle(
				{ Type: "chunks", Epoch: 1, Built: built, Removed: [] },
			),
		)
			.toBe( false );
		expect( receiver.Layer.Count ).toBe( 0 );
		expect(
			receiver.Handle(
				{ Type: "chunks", Epoch: 2, Built: built, Removed: [] },
			),
		)
			.toBe( true );
		expect( receiver.Layer.Count ).toBe( 1 );
		// pushed, not pulled: Update takes nothing
		expect( receiver.Layer.Update().Built ).toEqual( [] );
		receiver.Handle( { Type: "begin", Epoch: 3, Settings: null } );
		expect( receiver.Layer.Count ).toBe( 0 );
		receiver.Dispose();
		chunks.Dispose();
	} );
} );
