// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Scene } from "@babylonjs/core/scene";
import { describe, expect, it, vi } from "vitest";
import {
	ChunkKey,
	DYNAMIC_EDIT_FLOATS,
	CreateAabb,
	DenseSdfGrid,
	EditList,
	GroundPlane,
	SdfField,
	SdfMeshChunks,
	SdfOp,
	SdfShape,
	SdfVolume,
} from "../Source/Index";
import {
	CreateRaymarchMaterial,
	MAX_OCCLUDERS,
	SdfDynamicProxies,
	SdfMaterialFeatures,
	SdfMaterialPlugin,
	SdfMeshLayer,
	SdfRaymarchLayer,
	SdfRenderContext,
	SdfConeMarch,
	SdfRenderReceiver,
	SdfBrickTexture,
	SdfVolumeTexture,
	type RaymarchSettings,
} from "../Source/Render/Index";
import { NewScene } from "./RenderScene";

/** A scene with a sun, a sky and a camera. */
function LitScene(): {
	scene: Scene;
	sun: DirectionalLight;
	camera: FreeCamera;
} {
	const scene = NewScene();
	const sun = new DirectionalLight( "sun", new Vector3( 0, -1, 0 ), scene );
	const sky = new HemisphericLight( "sky", new Vector3( 0, 1, 0 ), scene );

	sky.groundColor = new Color3( 0.5, 0, 0 );

	const camera = new FreeCamera( "camera", new Vector3( 0, 2, 10 ), scene );

	return { scene, sun, camera };
}

/** A small sampled world: ground and a ball. */
function Grid( texels = 8 ): DenseSdfGrid {
	const list = new EditList();

	list.Add(
		{ Shape: SdfShape.Sphere, Params: [ 1, 0, 0, 0 ], MaterialId: 3 },
	);
	return new DenseSdfGrid(
		new SdfField( list, new GroundPlane( -1 ) ),
		CreateAabb( -2, -2, -2, 2, 2, 2 ),
		texels,
	);
}

/** Lets Babylon's deferred "mesh added" notifications through. */
async function Added(): Promise<void> {
	await new Promise( ( resolve ) => setTimeout( resolve, 5 ) );
}

const Settings: RaymarchSettings = {
	DebugView: 1,
	Quality: 2,
	StepScale: 0.8,
	ProxyThreshold: 0.05,
	Palette: Array.from( { length: 24 }, () => 0.5 ),
};

/** The effect a material draws a mesh with, once it is ready. */
function EffectOf( material: ShaderMaterial, mesh: AbstractMesh ): Effect {
	const subMesh = mesh.subMeshes[0]!;

	expect( material.isReadyForSubMesh( mesh, subMesh ) ).toBe( true );
	return subMesh.effect!;
}

/** Binds a material for a mesh's draw, as Babylon does. */
function Bind( material: ShaderMaterial, mesh: AbstractMesh ): void {
	material.bindForSubMesh(
		Matrix.Identity(),
		mesh as Mesh,
		mesh.subMeshes[0]!,
	);
}

describe( "SdfRenderContext", () => {
	it( "makes the sun's shadow map, only with a sun and shadows on", () => {
		const { scene, sun } = LitScene();
		const context = new SdfRenderContext( scene );

		expect( context.Sun ).toBe( sun );
		expect( context.Shadows ).not.toBeNull();
		expect( context.Shadows!.getShadowMap()!.getSize().width ).toBe( 1024 );
		// the depth range from the casters
		expect( sun.autoCalcShadowZBounds ).toBe( true );
		context.Dispose();

		const off = new SdfRenderContext( scene, { Shadows: false } );

		expect( off.Shadows ).toBeNull();
		off.Dispose();

		const dark = new SdfRenderContext( NewScene() );

		expect( dark.Sun ).toBeNull();
		expect( dark.Shadows ).toBeNull();
		dark.Dispose();
	} );

	it( "takes in the scene's meshes, but not the SDF's own", async () => {
		const { scene } = LitScene();
		const before = CreateBox( "before", {}, scene );

		before.material = new StandardMaterial( "plain", scene );

		const context = new SdfRenderContext( scene );
		const own = CreateBox( "own", {}, scene );
		const later = CreateBox( "later", {}, scene );
		const root = new Mesh( "root", scene );

		own.material = new StandardMaterial( "own", scene );
		context.Own( own, true, true );

		// by default the SDF's own mesh neither casts nor receives
		const bare = CreateBox( "bare", {}, scene );

		context.Own( bare );
		expect( bare.receiveShadows ).toBe( false );
		await Added();
		// no material yet: waits for one
		context.Update();
		expect( context.Meshes.has( later ) ).toBe( false );
		later.material = before.material;
		context.Update();
		expect( [ ...context.Meshes ].map( ( mesh ) => mesh.name ) )
			.toEqual( [ "before", "later" ] );
		expect( context.Meshes.has( root ) ).toBe( false );
		expect( later.receiveShadows ).toBe( true );
		expect( own.receiveShadows ).toBe( true );
		expect( context.Shadows!.getShadowMap()!.renderList!
			.map( ( mesh ) => mesh.name ) )
			.toEqual( [ "own", "before", "later" ] );
		expect( context.Meshes.has( bare ) ).toBe( false );
		expect( SdfMaterialPlugin.Of( before.material ) ).not.toBeNull();
		expect( SdfMaterialPlugin.Of( own.material ) ).toBeNull();
		// once is enough
		context.AddMesh( later );
		expect( context.Meshes.size ).toBe( 2 );

		// a disposed mesh leaves; one disposed while waiting is dropped
		later.dispose();
		expect( context.Meshes.has( later ) ).toBe( false );
		expect( context.Shadows!.getShadowMap()!.renderList )
			.not.toContain( later );
		root.dispose();
		context.Update();
		context.Dispose();
		expect( before.receiveShadows ).toBe( false );
	} );

	it( "takes in only what it is given without AutoMeshes", async () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, {
			AutoMeshes: false,
			Occlusion: false,
		} );
		const box = CreateBox( "box", {}, scene );

		box.material = new StandardMaterial( "plain", scene );
		await Added();
		context.Update();
		expect( context.Meshes.size ).toBe( 0 );
		context.AddMesh( box );
		// no occlusion: no plugin
		expect( SdfMaterialPlugin.Of( box.material ) ).toBeNull();
		// a plugin asked for anyway keeps only the cut
		expect( context.Plug( box.material, SdfMaterialFeatures.Occluders )
			.Features ).toBe( SdfMaterialFeatures.None );
		context.Dispose();
	} );

	it( "keeps the occluder spheres nearest to the camera", () => {
		const { scene, camera } = LitScene();
		const context = new SdfRenderContext( scene, {
			AutoMeshes: false,
			Shadows: false,
		} );

		// twenty boxes along the view, one too big, one hidden
		for ( let i = 0; i < 20; i++ ) {
			const box = CreateBox( `box ${ i }`, { size: 0.5 }, scene );

			box.position.set( 0, 0, 9 - i );
			box.computeWorldMatrix( true );
			context.AddMesh( box );
		}

		const big = CreateBox( "big", { size: 10 }, scene );
		const hidden = CreateBox( "hidden", {}, scene );

		hidden.isVisible = false;
		context.AddMesh( big );
		context.AddMesh( hidden );

		// a batch of thin instances (as the engine's PrimitiveBatch keeps
		// them): each one is a sphere of its own
		const balls = CreateSphere( "balls", { diameter: 1 }, scene );
		const matrices = new Float32Array( 32 );

		Matrix.Translation( 0, 0, 9.5 ).copyToArray( matrices, 0 );
		Matrix.Scaling( 2, 2, 2 ).multiply( Matrix.Translation( 0, 0, -50 ) )
			.copyToArray( matrices, 16 );
		balls.thinInstanceSetBuffer( "matrix", matrices, 16, false );
		context.AddMesh( balls );
		// where the camera is is known once its view is
		camera.getViewMatrix( true );
		context.Update();
		expect( context.OccluderCount ).toBe( MAX_OCCLUDERS );

		const spheres = context.Occluders;

		// the nearest first: the ball at 9.5, then the boxes from z = 9
		expect( [ ...spheres.slice( 0, 4 ) ].map( ( v ) => +v.toFixed( 3 ) ) )
			.toEqual( [ 0, 0, 9.5, 0.5 ] );
		expect( spheres[6] ).toBe( 9 );
		expect( spheres[MAX_OCCLUDERS * 4 - 2] ).toBe( 9 - 14 );
		// a farther one doesn't get in any more; a nearer one pushes out the
		// last
		expect( context.Occluders.includes( -50 ) ).toBe( false );
		// no camera: none
		scene.activeCamera = null;
		context.Update();
		expect( context.OccluderCount ).toBe( 0 );
		scene.activeCamera = camera;
		context.Dispose();
	} );

	it( "shows the shaders a volume and binds what they share", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const box = CreateBox( "box", {}, scene );

		box.material = new StandardMaterial( "plain", scene );

		const plugin = context.Plug(
			box.material,
			SdfMaterialFeatures.VolumeOcclusion,
		);
		const dirty = vi.spyOn( plugin, "markAllDefinesAsDirty" );
		const volume = SdfVolumeTexture.FromGrid( scene, Grid() );

		context.Volume = volume;
		context.Volume = volume;
		expect( dirty ).toHaveBeenCalledTimes( 1 );
		expect( context.Volume ).toBe( volume );

		const effect = {
			setFloatArray4: vi.fn(),
			setFloat: vi.fn(),
			setFloat2: vi.fn(),
			setFloat3: vi.fn(),
			setFloat4: vi.fn(),
			setTexture: vi.fn(),
			setVector3: vi.fn(),
			setColor3: vi.fn(),
			setMatrix: vi.fn(),
			setDepthStencilTexture: vi.fn(),
		};
		const bound = effect as unknown as Effect;

		context.BindTo( bound );
		context.BindTo( bound );
		// the arrays once a frame, the rest every time
		expect( effect.setFloatArray4 ).toHaveBeenCalledTimes( 2 );
		// the distance and the materials, apart
		expect( effect.setTexture )
			.toHaveBeenCalledWith( "sdfVolume", volume.Texture );
		expect( effect.setTexture )
			.toHaveBeenCalledWith( "sdfVolumeMaterials", volume.Materials );
		expect( effect.setFloat )
			.toHaveBeenCalledWith( "sdfDynamicLayered", 0 );
		expect( effect.setFloat3 )
			.toHaveBeenCalledWith( "sdfBoundsSize", 4, 4, 4 );
		context.BindTo( bound, false );
		expect( effect.setTexture ).toHaveBeenCalledTimes( 4 );
		context.Volume = null;
		// an edit whose mask leaves a layer out: the shaders follow the layers
		context.Dynamic.Add( { Shape: SdfShape.Sphere, Layer: 2, Mask: 2 } );
		context.BindTo( bound );
		expect( effect.setTexture ).toHaveBeenCalledTimes( 4 );
		expect( effect.setFloat )
			.toHaveBeenCalledWith( "sdfDynamicLayered", 1 );
		expect( dirty ).toHaveBeenCalledTimes( 2 );

		context.BindLights( bound );
		expect( effect.setColor3 )
			.toHaveBeenCalledWith( "groundColor", new Color3( 0.5, 0, 0 ) );
		context.BindShadowMap( bound );
		expect( effect.setDepthStencilTexture ).toHaveBeenCalledWith(
			"sdfShadowMap",
			context.Shadows!.getShadowMapForRendering(),
		);
		expect( effect.setFloat4 ).toHaveBeenCalledWith(
			"sdfShadowInfo",
			1024,
			1 / 1024,
			0.2,
			expect.any( Number ),
		);
		context.Dispose();

		// without shadows nothing is bound
		const flat = new SdfRenderContext( scene, { Shadows: false } );

		flat.BindShadowMap( bound );
		expect( effect.setDepthStencilTexture ).toHaveBeenCalledTimes( 1 );
		flat.Dispose();
		volume.Dispose();
	} );

	it( "keeps the shadow map steady while its casters stay in its box", () => {
		const { scene, sun } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const shadows = context.Shadows!;
		const box = CreateBox( "caster", { size: 2 }, scene );

		// no casters: nothing to fit
		context.Update();
		expect( sun.autoUpdateExtends ).toBe( true );
		shadows.addShadowCaster( box );
		box.computeWorldMatrix( true );
		// casters: Babylon fits the map this frame...
		context.Update();
		expect( sun.autoUpdateExtends ).toBe( true );
		// ...and the next it is snapped (as Babylon left it: set by hand here)
		sun.orthoLeft = -1.3;
		sun.orthoRight = 1.1;
		sun.orthoBottom = -0.9;
		sun.orthoTop = 1.2;
		sun.shadowMinZ = 0;
		sun.shadowMaxZ = 10;
		context.Update();
		expect( sun.autoUpdateExtends ).toBe( false );
		// 2.4 across: rounded up to 2^(6/4); centered on a texel
		expect( sun.orthoRight - sun.orthoLeft ).toBeCloseTo( 2 ** 1.5, 6 );
		expect( sun.orthoTop - sun.orthoBottom ).toBeCloseTo( 2 ** 1.5, 6 );

		const texel = 2 ** 1.5 / 1024;

		const center = ( sun.orthoLeft + sun.orthoRight ) / 2 / texel;

		expect( center - Math.round( center ) ).toBeCloseTo( 0, 6 );
		expect( sun.shadowMinZ ).toBeCloseTo( -1.3, 6 );
		expect( sun.shadowMaxZ ).toBeCloseTo( 11.3, 6 );
		// its texels are fine: the least normal bias
		expect( shadows.normalBias ).toBe( 0.02 );

		// the caster moves a little: the map stays
		box.position.x = 0.1;
		box.computeWorldMatrix( true );
		context.Update();
		expect( sun.autoUpdateExtends ).toBe( false );
		// out of the box: fitted again; and a wide map biases more
		box.position.x = 50;
		box.computeWorldMatrix( true );
		context.Update();
		expect( sun.autoUpdateExtends ).toBe( true );
		sun.orthoLeft = -100;
		sun.orthoRight = 100;
		context.Update();
		// 200 across: rounded up to 2^(31/4); a texel and a half
		expect( shadows.normalBias ).toBeCloseTo( 2 ** 7.75 / 1024 * 1.5, 6 );
		// shrunk to under half the box: fitted again
		box.scaling.setAll( 0.1 );
		box.computeWorldMatrix( true );
		context.Update();
		expect( sun.autoUpdateExtends ).toBe( true );
		context.Dispose();
	} );

	it( "draws the shadow map at most ShadowHz times a second", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { ShadowHz: 100 } );
		const map = context.Shadows!.getShadowMap()!;
		const reset = vi.spyOn( map, "resetRefreshCounter" );
		const now = vi.spyOn( performance, "now" ).mockReturnValue( 1000 );

		expect( map.refreshRate ).toBeGreaterThan( 1e6 );
		context.Update();
		now.mockReturnValue( 1005 );
		context.Update();
		now.mockReturnValue( 1010 );
		context.Update();
		expect( reset ).toHaveBeenCalledTimes( 2 );
		context.Dispose();

		// a limit without shadows: nothing to draw
		const flat = new SdfRenderContext( scene, {
			Shadows: false,
			ShadowHz: 100,
		} );

		expect( () => flat.Update() ).not.toThrow();
		flat.Dispose();
	} );
} );

describe( "SdfMaterialPlugin", () => {
	it( "adds what it is asked for to Standard and PBR materials", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const standard = new StandardMaterial( "standard", scene );
		const pbr = new PBRMaterial( "pbr", scene );
		const plugin = context.Plug(
			standard,
			SdfMaterialFeatures.VolumeOcclusion | SdfMaterialFeatures.Carve,
		);

		expect( plugin.getClassName() ).toBe( "SdfMaterialPlugin" );
		// a material keeps its first plugin
		expect( context.Plug( standard, SdfMaterialFeatures.Occluders ) )
			.toBe( plugin );

		const defines: Record<string, boolean> = {};

		// no volume yet: no occlusion from it
		plugin.prepareDefines( defines as never );
		expect( defines ).toEqual( {
			SDF_VOLUME_AO: false,
			SDF_OCCLUDERS: false,
			SDF_CARVE: true,
			SDF_CARVE_VOLUME: false,
			SDF_SHADE: false,
			SDF_PLUGIN: true,
			SDF_BRICKS: false,
		} );
		context.Volume = SdfVolumeTexture.FromGrid( scene, Grid() );
		plugin.prepareDefines( defines as never );
		expect( defines["SDF_VOLUME_AO"] ).toBe( true );
		// a cut follows the volume's layers once there is one
		expect( defines["SDF_CARVE_VOLUME"] ).toBe( true );
		expect( defines["SDF_SHADE"] ).toBe( true );

		const samplers: string[] = [];

		plugin.getSamplers( samplers );
		expect( samplers )
			.toEqual( [ "sdfVolume", "sdfVolumeMaterials", "sdfBrickMap" ] );
		expect( plugin.getUniforms().externalUniforms )
			.toContain( "sdfCarveThreshold" );

		const vertex = plugin.getCustomCode( "vertex" )!;
		const fragment = plugin.getCustomCode( "fragment" )!;

		expect( vertex["CUSTOM_VERTEX_MAIN_END"] ).toContain( "cseSdfVisible" );
		expect( fragment["CUSTOM_FRAGMENT_MAIN_BEGIN"] ).toContain( "discard" );
		expect( fragment["CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR"] )
			.toContain( "color.rgb *= vSdfVisible" );
		expect( plugin.getCustomCode( "compute" ) ).toBeNull();
		// PBR's color is finalColor
		expect( context.Plug( pbr, SdfMaterialFeatures.Occluders )
			.getCustomCode( "fragment" )!["CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR"] )
			.toContain( "finalColor.rgb *= vSdfVisible" );
		context.Dispose();
	} );

	it( "binds the context's values at every draw", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const material = new StandardMaterial( "standard", scene );
		const plugin = context.Plug( material, SdfMaterialFeatures.Occluders );
		const bind = vi.spyOn( context, "BindTo" ).mockImplementation( () => {
		} );
		const effect = { setFloat: vi.fn() };
		const near = CreateBox( "near", { size: 1 }, scene );
		const far = CreateBox( "far", { size: 1 }, scene );

		far.position.x = 40;
		far.computeWorldMatrix( true );
		// a hole by the first mesh, a blob far from both, an intersection
		// (it reaches everywhere)
		context.Dynamic.Add(
			{
				Shape: SdfShape.Sphere,
				Op: SdfOp.Subtract,
				Position: [ 1, 0, 0 ],
			},
		);
		context.Dynamic.Add(
			{ Shape: SdfShape.Sphere, Position: [ -20, 0, 0 ] },
		);
		plugin.hardBindForSubMesh(
			null as never,
			scene,
			scene.getEngine(),
			{ effect, getMesh: () => near } as never,
		);
		expect( bind ).toHaveBeenCalledWith( effect );
		// its shaders loop over the edits near it alone
		expect( effect.setFloat )
			.toHaveBeenLastCalledWith( "sdfMeshEdits", 0b01 );
		// the reaches are worked out once a frame
		plugin.hardBindForSubMesh(
			null as never,
			scene,
			scene.getEngine(),
			{ effect, getMesh: () => near } as never,
		);
		expect( effect.setFloat )
			.toHaveBeenLastCalledWith( "sdfMeshEdits", 0b01 );
		context.Dynamic.Add( { Shape: SdfShape.Box, Op: SdfOp.Intersect } );
		plugin.hardBindForSubMesh(
			null as never,
			scene,
			scene.getEngine(),
			{ effect, getMesh: () => far } as never,
		);
		expect( effect.setFloat )
			.toHaveBeenLastCalledWith( "sdfMeshEdits", 0b100 );
		// a batch of thin instances: its own box is one instance's, at the
		// origin - yet a hole by an instance far off is near it (inside it
		// the occlusion would see solid ground: black balls)
		const batch = CreateBox( "batch", { size: 0.5 }, scene );

		const matrices = new Float32Array( 32 );

		// (the null engine has no instancing: the instances as Babylon keeps
		// them)
		Matrix.Translation( 40, 0, 0 ).copyToArray( matrices, 0 );
		Matrix.Scaling( 2, 2, 2 ).multiply( Matrix.Translation( 0, 30, 0 ) )
			.copyToArray( matrices, 16 );
		Object.assign(
			batch,
			{
				_thinInstanceDataStorage: {
					instancesCount: 2,
					matrixData: matrices,
				},
			},
		);
		context.Dynamic.Add(
			{
				Shape: SdfShape.Sphere,
				Op: SdfOp.Subtract,
				Position: [ 40, -0.3, 0 ],
			},
		);
		plugin.hardBindForSubMesh(
			null as never,
			scene,
			scene.getEngine(),
			{ effect, getMesh: () => batch } as never,
		);
		// (the box around the instances reaches the first hole too)
		expect( effect.setFloat )
			.toHaveBeenLastCalledWith( "sdfMeshEdits", 0b1101 );
		plugin.hardBindForSubMesh(
			null as never,
			scene,
			scene.getEngine(),
			{ effect: null } as never,
		);
		expect( bind ).toHaveBeenCalledTimes( 4 );
		context.Dispose();
	} );
} );

describe( "SdfBrickTexture", () => {
	function Bricks( bounds = true ): SdfVolume {
		const list = new EditList();

		list.Add( {
			Shape: SdfShape.Sphere,
			Params: [ 1, 0, 0, 0 ],
			MaterialId: 2,
		} );

		const volume = new SdfVolume( new SdfField( list ), {
			Spacing: 0.1,
			MapSize: 4,
			AtlasSize: [ 80, 80, 80 ],
			Budget: Infinity,
			Materials: true,
			RangeSpacings: 8,
			...bounds
				? { Bounds: CreateAabb( -1.5, -1.5, -1.5, 1.5, 1, 1.5 ) }
				: {},
		} );

		volume.Update();
		return volume;
	}

	it( "binds the map and the atlases, the bounds as the box", () => {
		const { scene } = LitScene();
		const volume = Bricks();
		const texture = new SdfBrickTexture( scene, volume );

		expect( texture.Range ).toBeCloseTo( 0.8, 12 );
		expect( texture.Min ).toEqual( [ -1.5, -1.5, -1.5 ] );
		expect( texture.Size ).toEqual( [ 3, 2.5, 3 ] );
		expect( texture.Resolution[0] ).toBeCloseTo( 30, 9 );
		expect( texture.Bricks.MapSize ).toBe( 4 );
		expect( texture.Bricks.CellSize ).toBeCloseTo( 0.8, 12 );
		expect( texture.Bricks.Origin ).toBe( volume.Map.Origin );
		// nothing changed since it was made
		expect( texture.Update() ).toBe( false );
		texture.Dispose();

		// no bounds: the window
		const window = new SdfBrickTexture( scene, Bricks( false ) );

		expect( window.Min ).toEqual( [ -1.6, -1.6, -1.6 ].map(
			( v ) => expect.closeTo( v, 9 ),
		) );
		expect( window.Size[1] ).toBeCloseTo( 3.2, 9 );
		window.Dispose();

		// a volume without materials can't be drawn
		const plain = new SdfVolume( new SdfField( new EditList() ), {
			Spacing: 0.1,
			MapSize: 4,
		} );

		expect( () => new SdfBrickTexture( scene, plain ) ).toThrow();
	} );

	it( "sends the slots written and the map as it changes", () => {
		const { scene } = LitScene();
		const volume = Bricks();
		const texture = new SdfBrickTexture( scene, volume );
		const map = vi.spyOn( texture.Bricks.Map as never, "update" as never );
		const whole = vi.spyOn( texture.Texture, "update" );
		const materials = vi.spyOn( texture.Materials, "update" );
		const list = volume.Field.Edits;

		// an edit: some bricks again; the GPU can't take a part yet
		list.Add( {
			Shape: SdfShape.Sphere,
			Position: [ 0.9, 0, 0 ],
			Params: [ 0.2, 0, 0, 0 ],
		} );
		volume.Update();
		expect( texture.Update() ).toBe( true );
		// the arrays themselves (compared by identity: they are large)
		expect( whole.mock.calls[0]![0] ).toBe( volume.Atlas.Data );
		expect( materials.mock.calls[0]![0] ).toBe( volume.Atlas.Materials );
		expect( map ).toHaveBeenCalledTimes( 1 );

		// with WebGL2 at hand: each slot alone, read out of the whole atlas
		const gl = {
			TEXTURE_3D: 1,
			UNPACK_ALIGNMENT: 2,
			UNPACK_ROW_LENGTH: 3,
			UNPACK_IMAGE_HEIGHT: 4,
			UNPACK_SKIP_PIXELS: 5,
			UNPACK_SKIP_ROWS: 6,
			UNPACK_SKIP_IMAGES: 7,
			RED: 8,
			RGBA: 9,
			UNSIGNED_BYTE: 10,
			pixelStorei: vi.fn(),
			texSubImage3D: vi.fn(),
		};
		const engine = scene.getEngine() as unknown as {
			_gl: unknown;
			_bindTextureDirectly: unknown;
		};
		const bind = vi.fn();

		engine._gl = gl;
		engine._bindTextureDirectly = bind;
		for ( const it of [ texture.Texture, texture.Materials ] ) {
			it.getInternalTexture()!._hardwareTexture = {} as never;
		}
		list.Add( {
			Shape: SdfShape.Sphere,
			Position: [ -0.9, 0, 0 ],
			Params: [ 0.2, 0, 0, 0 ],
		} );
		volume.Update();

		const written = volume.Atlas.TakeDirty();

		// put back: Update takes them
		for ( const slot of written ) {
			volume.Atlas.Write( slot, volume.Atlas.Read( slot ) );
		}
		texture.Update();
		expect( whole ).toHaveBeenCalledTimes( 1 );
		expect( gl.texSubImage3D ).toHaveBeenCalledTimes( written.length * 2 );

		const [ x, y, z ] = volume.Atlas.SlotOrigin( written[0]! );

		expect( gl.texSubImage3D.mock.calls[0]!.slice( 2, 9 ) )
			.toEqual( [ x, y, z, 10, 10, 10, gl.RED ] );
		expect( gl.texSubImage3D.mock.calls[0]![10] ).toBe( volume.Atlas.Data );
		expect( gl.pixelStorei )
			.toHaveBeenCalledWith( gl.UNPACK_ROW_LENGTH, 80 );
		expect( gl.pixelStorei )
			.toHaveBeenLastCalledWith( gl.UNPACK_SKIP_IMAGES, 0 );
		expect( bind ).toHaveBeenLastCalledWith( gl.TEXTURE_3D, null );

		// many at once: the whole atlas
		for ( let slot = 0; slot < volume.Atlas.Capacity; slot++ ) {
			volume.Atlas.Write( slot, volume.Atlas.Read( slot ) );
		}
		texture.Update();
		expect( whole ).toHaveBeenCalledTimes( 2 );
		texture.Dispose();
	} );

	it( "turns the shaders to bricks, and the layer draws them", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const plugin = context.Plug(
			new StandardMaterial( "standard", scene ),
			SdfMaterialFeatures.VolumeOcclusion,
		);
		const dirty = vi.spyOn( plugin, "markAllDefinesAsDirty" );
		const volume = Bricks();
		const layer = new SdfRaymarchLayer(
			scene,
			volume,
			{ Context: context },
		);
		const defines: Record<string, boolean> = {};

		expect( layer.Bricks ).toBe( volume );
		expect( context.Volume ).toBe( layer.Volume );
		expect( dirty ).toHaveBeenCalled();
		plugin.prepareDefines( defines as never );
		expect( defines["SDF_BRICKS"] ).toBe( true );
		expect( EffectOf( layer.Material, layer.Mesh ).defines )
			.toContain( "#define SDF_BRICKS" );

		const caster = layer.Material.shadowDepthWrapper!
			.baseMaterial as ShaderMaterial;

		expect( EffectOf( caster, layer.Mesh ).defines )
			.toContain( "#define SDF_BRICKS" );
		// the box drawn: the bounds
		layer.Mesh.computeWorldMatrix( true );
		expect( layer.Mesh.getBoundingInfo().boundingBox.minimumWorld.y )
			.toBeCloseTo( -1.5, 6 );

		// the map's uniforms
		const effect = SpyEffect();

		context.BindTo( effect as unknown as Effect );
		expect( effect.setTexture )
			.toHaveBeenCalledWith(
				"sdfBrickMap",
				( layer.Volume as SdfBrickTexture ).Bricks.Map,
			);
		expect( effect.setFloat4 ).toHaveBeenCalledWith(
			"sdfBrickInfo",
			...volume.Map.Origin,
			volume.Map.CellSize,
		);
		expect( effect.setFloat ).toHaveBeenCalledWith( "sdfBrickMapSize", 4 );

		// each frame: rebuilt within the budget and sent; replaced bricks
		// free once drawn
		const end = vi.spyOn( volume, "EndFrame" );

		expect( layer.Update() ).toBe( false );
		volume.Field.Edits.Add(
			{ Shape: SdfShape.Box, Position: [ 0, 0.8, 0 ] },
		);
		expect( layer.Update() ).toBe( true );
		scene.onAfterRenderObservable.notifyObservers( scene );
		expect( end ).toHaveBeenCalled();

		// a dense volume again: the shaders back
		dirty.mockClear();
		layer.Dispose();
		expect( dirty ).toHaveBeenCalled();
		end.mockClear();
		scene.onAfterRenderObservable.notifyObservers( scene );
		expect( end ).not.toHaveBeenCalled();

		const dense = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context },
		);

		expect( dense.Bricks ).toBeNull();
		scene.onAfterRenderObservable.notifyObservers( scene );
		dense.Dispose();
		context.Dispose();
	} );
} );

describe( "SdfVolumeTexture", () => {
	it( "uploads a grid and says what fits it", () => {
		const scene = NewScene();
		const grid = Grid();
		const volume = SdfVolumeTexture.FromGrid( scene, grid );
		const update = vi.spyOn( volume.Texture, "update" );

		expect( volume.Resolution ).toEqual( [ 8, 8, 8 ] );
		expect( volume.Size ).toEqual( [ 4, 4, 4 ] );
		expect( volume.Spacing ).toBe( 0.5 );
		const data = {
			Data: grid.Data,
			Resolution: grid.Resolution,
			Min: grid.Min,
			Spacing: grid.Spacing,
			Range: grid.Range,
		};

		expect( volume.Fits( grid ) ).toBe( true );
		expect( volume.Fits( Grid( 4 ) ) ).toBe( false );
		expect( volume.Fits( { ...data, Min: [ 0, 0, 0 ] } ) ).toBe( false );
		expect( volume.Fits( { ...data, Spacing: 1 } ) ).toBe( false );
		expect( volume.Fits( { ...data, Range: 9 } ) ).toBe( false );
		// split: the distance a byte a texel, the materials four
		const materials = vi.spyOn( volume.Materials, "update" );

		volume.Update( grid.Data );

		const distance = update.mock.calls[0]![0] as Uint8Array;
		const pairs = materials.mock.calls[0]![0] as Uint8Array;

		expect( distance ).toHaveLength( 8 * 8 * 8 );
		expect( pairs ).toHaveLength( 8 * 8 * 8 * 4 );
		expect( distance[5] ).toBe( grid.Data[5 * 4] );
		expect( [ ...pairs.slice( 20, 23 ) ] )
			.toEqual( [ ...grid.Data.slice( 21, 24 ) ] );
		// nothing written: nothing sent
		volume.Update( grid.Data, 3, 2 );
		expect( update ).toHaveBeenCalledTimes( 1 );
		// a few slices: the whole volume while the GPU's can't take them alone
		volume.Update( grid.Data, 2, 3 );
		expect( update ).toHaveBeenCalledTimes( 2 );

		// with WebGL2 at hand, only those slices, of both textures
		const gl = {
			TEXTURE_3D: 1,
			UNPACK_ALIGNMENT: 2,
			RED: 3,
			RGBA: 4,
			UNSIGNED_BYTE: 5,
			pixelStorei: vi.fn(),
			texSubImage3D: vi.fn(),
		};
		const engine = scene.getEngine() as unknown as {
			_gl: unknown;
			_bindTextureDirectly: unknown;
		};
		const bind = vi.fn();

		engine._gl = gl;
		engine._bindTextureDirectly = bind;
		for ( const texture of [ volume.Texture, volume.Materials ] ) {
			texture.getInternalTexture()!._hardwareTexture = {} as never;
		}
		// a part of the volume: slices 2 and 3 alone, starting at slice 2
		const part = grid.Data.slice( 2 * 64 * 4, 4 * 64 * 4 );

		part[0] = 7;
		volume.Update( part, 2, 3, 2 );
		expect( update ).toHaveBeenCalledTimes( 2 );
		expect( gl.texSubImage3D ).toHaveBeenCalledTimes( 2 );
		expect( gl.texSubImage3D.mock.calls[0]!.slice( 4, 9 ) )
			.toEqual( [ 2, 8, 8, 2, gl.RED ] );
		expect( gl.texSubImage3D.mock.calls[0]![10] ).toHaveLength( 2 * 64 );
		expect( ( gl.texSubImage3D.mock.calls[0]![10] as Uint8Array )[0] )
			.toBe( 7 );
		expect( gl.texSubImage3D.mock.calls[1]![8] ).toBe( gl.RGBA );
		expect( gl.texSubImage3D.mock.calls[1]![10] )
			.toHaveLength( 2 * 64 * 4 );
		expect( bind ).toHaveBeenLastCalledWith( gl.TEXTURE_3D, null );
		volume.Dispose();
	} );
} );

describe( "CreateRaymarchMaterial", () => {
	it( "binds the march, the camera, the lights and the shadow map", () => {
		const { scene, camera } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );

		context.Volume = SdfVolumeTexture.FromGrid( scene, Grid() );

		const material = CreateRaymarchMaterial(
			scene,
			context,
			Settings,
			false,
		);
		const box = CreateBox( "box", { size: 2 }, scene );

		box.material = material;
		box.computeWorldMatrix( true );

		const effect = EffectOf( material, box );
		const vectors = vi.spyOn( effect, "setVector3" );
		const floats = vi.spyOn( effect, "setFloat" );
		const lights = vi.spyOn( context, "BindLights" );
		const shadows = vi.spyOn( context, "BindShadowMap" );

		Bind( material, box );
		expect( vectors )
			.toHaveBeenCalledWith( "marchMin", new Vector3( -1, -1, -1 ) );
		expect( vectors )
			.toHaveBeenCalledWith( "cameraPosition", camera.globalPosition );
		expect( floats ).toHaveBeenCalledWith( "debugMode", 1 );
		expect( floats ).toHaveBeenCalledWith( "quality", 2 );
		expect( floats ).toHaveBeenCalledWith( "stepScale", 0.8 );
		expect( lights ).toHaveBeenCalled();
		expect( shadows ).toHaveBeenCalled();
		// the far side of the box only
		expect( material.backFaceCulling ).toBe( true );
		expect( material.cullBackFaces ).toBe( false );

		// no camera: the rest is still bound
		scene.activeCamera = null;
		vectors.mockClear();
		Bind( material, box );
		expect( vectors ).not
			.toHaveBeenCalledWith( "cameraPosition", expect.anything() );
		expect( vectors )
			.toHaveBeenCalledWith( "marchMax", new Vector3( 1, 1, 1 ) );
		// no mesh: nothing of its own
		vectors.mockClear();
		material.bind( Matrix.Identity() );
		expect( vectors ).not.toHaveBeenCalled();

		// it casts: marched along the sun's rays
		const wrapper = material.shadowDepthWrapper!;

		expect( wrapper.standalone ).toBe( true );
		expect( wrapper.doNotInjectCode ).toBe( true );

		const caster = wrapper.baseMaterial as ShaderMaterial;
		const other = CreateBox( "other", { size: 2 }, scene );
		const casterEffect = EffectOf( caster, other );
		const casterVectors = vi.spyOn( casterEffect, "setVector3" );

		Bind( caster, other );
		expect( casterVectors )
			.toHaveBeenCalledWith( "marchMin", new Vector3( -1, -1, -1 ) );
		expect( casterEffect.defines ).toContain( "#define CASTER" );
		material.dispose();
		expect( caster.getScene().materials ).not.toContain( caster );
		context.Dispose();
	} );

	it( "marks a proxy, and casts nothing without shadows", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, {
			AutoMeshes: false,
			Shadows: false,
		} );
		const material = CreateRaymarchMaterial(
			scene,
			context,
			Settings,
			true,
		);
		const box = CreateBox( "box", {}, scene );

		box.material = material;
		const effect = EffectOf( material, box );

		expect( effect.defines ).toContain( "#define PROXY" );
		expect( effect.defines ).toContain( "#define DYNAMIC_MASK" );
		// the hulls' spheres and edits come per instance
		expect( effect.defines ).toContain( "#define PROXY_INSTANCED" );
		expect( effect.defines ).not.toContain( "SHADOWMAP" );
		expect( effect.defines ).not.toContain( "OCCLUDERS" );
		expect( material.shadowDepthWrapper ).toBeFalsy();
		expect( material.options.attributes )
			.toEqual(
				[ "position", "proxySphereInstance", "proxyMaskInstance" ],
			);

		// each hull bounds its own march: the box is everything
		const floats3 = vi.spyOn( effect, "setFloat3" );

		Bind( material, box );
		expect( floats3 ).toHaveBeenCalledWith( "marchMin", -1e6, -1e6, -1e6 );
		material.dispose();
		context.Dispose();
	} );
} );

describe( "SdfDynamicProxies", () => {
	it( "puts a hull around every dynamic edit over the volume", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const proxies = new SdfDynamicProxies( scene, context, Settings );
		const [ adds, cuts ] = proxies.Meshes;
		const hole = context.Dynamic.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothSubtract,
			Position: [ 1, 0, 0 ],
			Params: [ 0.5, 0, 0, 0 ],
			SmoothK: 0.2,
		} );
		const map = context.Shadows!.getShadowMap()!;

		// two meshes, their hulls thin instances: what adds casts, what cuts
		// doesn't (the light falls in through the cut chunks)
		expect( map.renderList ).toContain( adds );
		expect( map.renderList ).not.toContain( cuts );
		expect( adds.material ).toBe( proxies.Material );

		// no volume to march: nothing shown
		scene.onBeforeRenderObservable.notifyObservers( scene );
		expect( proxies.Count ).toBe( 0 );
		expect( cuts.isEnabled() ).toBe( false );
		context.Volume = SdfVolumeTexture.FromGrid( scene, Grid() );
		proxies.Update();
		expect( proxies.Count ).toBe( 1 );
		expect( cuts.isEnabled() ).toBe( true );
		expect( cuts.thinInstanceCount ).toBe( 1 );
		// a sphere around the reach (0.5 + 0.2)
		expect( proxies.Hulls ).toEqual( [
			{ Center: [ 1, 0, 0 ], Radius: 0.7, Mask: 1, Casts: false },
		] );

		// a blob far away: a hull of its own, marching only itself; one
		// near: both march both
		context.Dynamic.Add( {
			Shape: SdfShape.Sphere,
			Position: [ -5, 0, 0 ],
			Params: [ 0.5, 0, 0, 0 ],
		} );
		context.Dynamic.Add( {
			Shape: SdfShape.Sphere,
			Position: [ 1.5, 0, 0 ],
			Params: [ 0.5, 0, 0, 0 ],
		} );
		proxies.Update();
		expect( proxies.Count ).toBe( 3 );
		expect( adds.thinInstanceCount ).toBe( 2 );
		expect( proxies.Hulls.map( ( hull ) => hull.Mask ) )
			.toEqual( [ 0b101, 0b010, 0b101 ] );
		expect( proxies.Hulls.map( ( hull ) => hull.Casts ) )
			.toEqual( [ false, true, true ] );

		// an intersection changes everything: no hull for it, every hull
		// marches it
		context.Dynamic.Add( { Shape: SdfShape.Box, Op: SdfOp.Intersect } );
		proxies.Update();
		expect( proxies.Count ).toBe( 3 );
		expect( proxies.Hulls[0]!.Mask ).toBe( 0b1101 );

		// more hulls than there was room for: the buffers grow
		for ( let i = 0; i < 8; i++ ) {
			context.Dynamic.Add(
				{ Shape: SdfShape.Sphere, Position: [ i, 3, 0 ] },
			);
		}
		proxies.Update();
		expect( adds.thinInstanceCount ).toBe( 10 );
		context.Dynamic.Remove( hole.Id );
		context.Dynamic.Clear();
		proxies.Update();
		expect( proxies.Count ).toBe( 0 );
		expect( adds.isEnabled() ).toBe( false );
		proxies.Dispose();
		expect( adds.isDisposed() ).toBe( true );
		context.Dispose();
	} );

	it(
		"marches half the corners a frame and resolves the pixels on screen",
		() => {
			const { scene, camera } = LitScene();
			const context = new SdfRenderContext(
				scene,
				{ AutoMeshes: false },
			);
			const engine = scene.getEngine();

			FloatTargets( scene, true );

			const proxies = new SdfDynamicProxies(
				scene,
				context,
				Settings,
				true,
			);
			const checker = proxies.Checker!;
			const [ even, odd ] = checker.Targets;
			const [ adds ] = proxies.Meshes;

			// a texel a corner: half a row of them (and one), a row more
			expect( even.getSize() ).toEqual( {
				width: Math.floor( engine.getRenderWidth() / 2 ) + 1,
				height: engine.getRenderHeight() + 1,
			} );
			expect( scene.customRenderTargets ).toContain( even );
			expect( scene.customRenderTargets ).toContain( odd );
			// on screen the resolve (it casts); the corners marched and lit
			expect( EffectOf( proxies.Material, adds ).defines )
				.toContain( "#define CHECKER_RESOLVE" );
			expect( proxies.Material.shadowDepthWrapper ).toBeTruthy();
			adds.material = checker.March;
			expect( EffectOf( checker.March, adds ).defines )
				.toContain( "#define CHECKER_PASS" );
			expect( EffectOf( checker.March, adds ).defines )
				.toContain( "#define SHADOWMAP" );
			expect( checker.March.shadowDepthWrapper ).toBeFalsy();
			adds.material = proxies.Material;

			// nothing to march: the parity turns, no pass
			const resets = [
				vi.spyOn( even, "resetRefreshCounter" ),
				vi.spyOn( odd, "resetRefreshCounter" ),
			];

			proxies.Update();
			expect( checker.Parity ).toBe( 1 );
			expect(
				resets[0]!.mock.calls.length + resets[1]!.mock.calls.length,
			)
				.toBe( 0 );
			// hulls: this frame's target drawn once more, over them
			context.Volume = SdfVolumeTexture.FromGrid( scene, Grid() );
			context.Dynamic.Add( { Shape: SdfShape.Sphere } );
			proxies.Update();
			expect( checker.Parity ).toBe( 0 );
			expect( checker.Current ).toBe( even );
			expect( checker.Previous ).toBe( odd );
			expect( resets[0] ).toHaveBeenCalledTimes( 1 );
			expect( [ ...even.renderList! ] ).toEqual( [ ...proxies.Meshes ] );
			// the same hulls: nothing to set again
			const lists = vi.spyOn( odd, "setMaterialForRendering" );

			proxies.Update();
			expect( lists ).not.toHaveBeenCalled();

			// before a frame is done: no history to resolve from
			const early = SpyEffect();

			proxies.Material.bind(
				Matrix.Identity(),
				adds,
				early as unknown as Effect,
			);
			expect( early.setFloat )
				.toHaveBeenCalledWith( "checkerHistory", 0 );
			// a frame done: its camera, for the next frame's history
			camera.computeWorldMatrix();
			scene.onAfterRenderObservable.notifyObservers( scene );
			expect( checker.HasHistory ).toBe( true );
			expect( checker.PreviousCamera.equals( camera.globalPosition ) )
				.toBe( true );

			// the corners' pass draws with the screen's view-projection
			const set = vi.spyOn( scene, "setTransformMatrix" );

			even.onBeforeRenderObservable.notifyObservers( 0 );
			expect( set )
				.toHaveBeenCalledWith(
					camera.getViewMatrix(),
					expect.anything(),
				);

			// the materials: the parity, the screen, the targets, the history
			const effect = SpyEffect();

			proxies.Material.bind(
				Matrix.Identity(),
				adds,
				effect as unknown as Effect,
			);
			expect( effect.setFloat )
				.toHaveBeenCalledWith( "checkerParity", checker.Parity );
			expect( effect.setFloat2 ).toHaveBeenCalledWith(
				"screenSize",
				engine.getRenderWidth(),
				engine.getRenderHeight(),
			);
			expect( effect.setTexture )
				.toHaveBeenCalledWith( "checkerCurrent", checker.Current );
			expect( effect.setTexture )
				.toHaveBeenCalledWith( "checkerPrevious", checker.Previous );
			expect( effect.setFloat )
				.toHaveBeenCalledWith( "checkerHistory", 1 );
			expect( effect.setVector3 )
				.toHaveBeenCalledWith(
					"previousCamera",
					checker.PreviousCamera,
				);
			// the corners' rays: a pixel of the screen, also inside the target
			const march = SpyEffect();

			checker.March.bind(
				Matrix.Identity(),
				adds,
				march as unknown as Effect,
			);
			expect( march.setFloat ).toHaveBeenCalledWith(
				"pixelAngle",
				expect.closeTo(
					Math.tan( camera.fov / 2 ) * 2 / engine.getRenderHeight(),
					6,
				),
			);
			expect( march.setTexture ).not
				.toHaveBeenCalledWith( "checkerCurrent", expect.anything() );

			// the screen resized: the targets follow, the history is gone
			vi.spyOn( engine, "getRenderWidth" ).mockReturnValue( 300 );
			proxies.Update();
			expect( even.getSize().width ).toBe( 151 );
			expect( checker.HasHistory ).toBe( false );

			// no camera: no history, nothing set
			const active = scene.activeCamera;

			scene.activeCamera = null;
			proxies.Update();
			set.mockClear();
			odd.onBeforeRenderObservable.notifyObservers( 0 );
			expect( set ).not.toHaveBeenCalled();
			scene.onAfterRenderObservable.notifyObservers( scene );
			expect( checker.HasHistory ).toBe( false );
			scene.activeCamera = active;

			proxies.Dispose();
			expect( scene.customRenderTargets ).not.toContain( even );

			// without float targets: every pixel marched
			FloatTargets( scene, false );
			expect(
				new SdfDynamicProxies( scene, context, Settings, true ).Checker,
			).toBeNull();
			context.Dispose();
		},
	);

} );

/** An effect that takes every uniform and says nothing. */
function SpyEffect() {
	return {
		setTexture: vi.fn(),
		setFloat: vi.fn(),
		setFloat2: vi.fn(),
		setFloat3: vi.fn(),
		setFloat4: vi.fn(),
		setFloatArray4: vi.fn(),
		setArray3: vi.fn(),
		setInt: vi.fn(),
		setVector3: vi.fn(),
		setColor3: vi.fn(),
		setMatrix: vi.fn(),
		setDepthStencilTexture: vi.fn(),
	};
}

/** Says the GPU draws into float targets, or not. */
function FloatTargets( scene: Scene, on: boolean ): void {
	const engine = scene.getEngine();

	vi.spyOn( engine, "getCaps" )
		.mockReturnValue( { ...engine.getCaps(), textureFloatRender: on } );
}

describe( "SdfConeMarch", () => {
	it( "marches cones a tile each, coarsest first, into float targets", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const engine = scene.getEngine();
		const cone = new SdfConeMarch(
			scene,
			context,
			Settings,
			false,
			[ 4, 16 ],
		);
		const [ coarse, fine ] = cone.Levels;
		const box = CreateBox( "box", { size: 1 }, scene );

		// a level is a texel a tile; the coarsest drawn first
		expect( cone.Levels.map( ( level ) => level.Tile ) )
			.toEqual( [ 16, 4 ] );
		expect( coarse!.Target.getSize() ).toEqual( {
			width: Math.ceil( engine.getRenderWidth() / 16 ),
			height: Math.ceil( engine.getRenderHeight() / 16 ),
		} );
		expect( coarse!.Target.textureType ).toBe( 1 );
		const targets = scene.customRenderTargets;

		expect( targets.indexOf( coarse!.Target ) )
			.toBeLessThan( targets.indexOf( fine!.Target ) );
		// the screen pass starts from the finest
		expect( cone.Start.Target() ).toBe( fine!.Target );

		// the first marches from the box, the next from the first
		box.material = coarse!.Material;
		context.Volume = SdfVolumeTexture.FromGrid( scene, Grid() );
		expect( EffectOf( coarse!.Material, box ).defines )
			.toContain( "#define CONE_PASS" );
		expect( EffectOf( coarse!.Material, box ).defines )
			.not.toContain( "CONE_START" );
		// a cone pass lights nothing, casts nothing
		expect( EffectOf( coarse!.Material, box ).defines )
			.not.toContain( "SHADOWMAP" );
		expect( coarse!.Material.shadowDepthWrapper ).toBeFalsy();
		box.material = fine!.Material;
		expect( EffectOf( fine!.Material, box ).defines )
			.toContain( "#define CONE_START" );

		// a texel's pixels are its target's, its start the coarser one's
		const effect = SpyEffect();

		fine!.Material.bind(
			Matrix.Identity(),
			box,
			effect as unknown as Effect,
		);
		const height = fine!.Target.getSize().height;
		const camera = scene.activeCamera!;

		expect( effect.setFloat ).toHaveBeenCalledWith(
			"pixelAngle",
			expect.closeTo( Math.tan( camera.fov / 2 ) * 2 / height, 6 ),
		);
		expect( effect.setTexture )
			.toHaveBeenCalledWith( "coneStart", coarse!.Target );
		expect( effect.setFloat2 ).toHaveBeenCalledWith(
			"coneStartScale",
			coarse!.Target.getSize().width / fine!.Target.getSize().width,
			coarse!.Target.getSize().height / height,
		);
		expect( effect.setFloat ).toHaveBeenCalledWith(
			"coneStartTan",
			expect.closeTo(
				Math.tan( camera.fov / 2 ) * 2
					/ coarse!.Target.getSize().height * 1.5,
				6,
			),
		);

		// drawn while there's something to march, over these meshes
		const draws = vi.spyOn( fine!.Target, "setMaterialForRendering" );

		cone.Draw( [ box ], true );
		expect( [ ...fine!.Target.renderList! ] ).toEqual( [ box ] );
		expect( draws ).toHaveBeenCalledWith( box, fine!.Material );
		expect( fine!.Target.refreshRate ).toBe( 1 );
		draws.mockClear();
		cone.Draw( [ box ], false );
		expect( draws ).not.toHaveBeenCalled();
		expect( fine!.Target.refreshRate ).toBe( 0 );

		// the screen resized: the levels follow
		const resize = vi.spyOn( fine!.Target, "resize" );

		vi.spyOn( engine, "getRenderWidth" ).mockReturnValue( 400 );
		cone.Draw( [ box ], true );
		expect( resize ).toHaveBeenCalledWith(
			{ width: 100, height: fine!.Target.getSize().height },
		);

		// no camera: no cone
		scene.activeCamera = null;
		expect( cone.Start.Tan() ).toBe( 0 );
		scene.activeCamera = camera;

		cone.Dispose();
		expect( targets ).not.toContain( fine!.Target );
		expect( targets ).not.toContain( coarse!.Target );
		context.Dispose();
	} );

	it( "starts the tier's rays, and the hulls' when asked", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );

		// no float targets: no cones
		FloatTargets( scene, false );
		expect( SdfConeMarch.Supported( scene ) ).toBe( false );
		const plain = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context },
		);

		expect( plain.Cone ).toBeNull();
		plain.Dispose();

		// by default a level of 8, drawn while the box is
		FloatTargets( scene, true );
		const layer = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context, Checkerboard: false },
		);
		const level = layer.Cone!.Levels[0]!;

		expect( layer.Cone!.Levels.map( ( it ) => it.Tile ) ).toEqual( [ 8 ] );
		expect( EffectOf( layer.Material, layer.Mesh ).defines )
			.toContain( "#define CONE_START" );
		layer.Update();
		expect( [ ...level.Target.renderList! ] ).toEqual( [ layer.Mesh ] );
		expect( level.Target.refreshRate ).toBe( 1 );

		// the screen pass reads it at the screen's pixels
		const effect = SpyEffect();
		const engine = scene.getEngine();

		layer.Material.bind(
			Matrix.Identity(),
			layer.Mesh,
			effect as unknown as Effect,
		);
		expect( effect.setFloat2 ).toHaveBeenCalledWith(
			"coneStartScale",
			level.Target.getSize().width / engine.getRenderWidth(),
			level.Target.getSize().height / engine.getRenderHeight(),
		);
		layer.Dispose();
		expect( scene.customRenderTargets ).not.toContain( level.Target );

		// with the checkerboard (by default): the corners start from the
		// cones, at the screen's pixels while they march into their target
		const checkered = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context },
		);
		const corners = checkered.Checker!;
		const coarse = checkered.Cone!.Levels[0]!;

		checkered.Mesh.material = corners.March;
		expect( EffectOf( corners.March, checkered.Mesh ).defines )
			.toContain( "#define CONE_START" );
		checkered.Mesh.material = checkered.Material;
		expect( EffectOf( checkered.Material, checkered.Mesh ).defines )
			.not.toContain( "CONE_START" );
		checkered.Update();
		expect( [ ...corners.Current.renderList! ] )
			.toEqual( [ checkered.Mesh ] );

		const marching = SpyEffect();

		corners.March.bind(
			Matrix.Identity(),
			checkered.Mesh,
			marching as unknown as Effect,
		);
		expect( marching.setFloat2 ).toHaveBeenCalledWith(
			"coneStartScale",
			coarse.Target.getSize().width / engine.getRenderWidth(),
			coarse.Target.getSize().height / engine.getRenderHeight(),
		);
		// the pixels resolved on screen from the corners
		const resolving = SpyEffect();

		checkered.Material.bind(
			Matrix.Identity(),
			checkered.Mesh,
			resolving as unknown as Effect,
		);
		expect( resolving.setTexture )
			.toHaveBeenCalledWith( "checkerCurrent", corners.Current );
		checkered.Dispose();
		expect( scene.customRenderTargets ).not.toContain( corners.Current );

		// asked for none: none
		const none = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context, ConeTiles: [] },
		);

		expect( none.Cone ).toBeNull();
		none.Dispose();

		// the hulls: none by default; asked, marched while they're shown
		expect( new SdfDynamicProxies( scene, context, Settings ).Cone )
			.toBeNull();
		const proxies = new SdfDynamicProxies(
			scene,
			context,
			Settings,
			false,
			[ 8 ],
		);
		const hulls = proxies.Cone!.Levels[0]!;

		context.Volume = SdfVolumeTexture.FromGrid( scene, Grid() );
		proxies.Update();
		expect( hulls.Target.refreshRate ).toBe( 0 );
		context.Dynamic.Add( { Shape: SdfShape.Sphere } );
		proxies.Update();
		expect( [ ...hulls.Target.renderList! ] )
			.toEqual( [ ...proxies.Meshes ] );
		expect( hulls.Target.refreshRate ).toBe( 1 );
		// the hulls grow in the cone pass: its vertices see the camera
		proxies.Meshes[0].material = hulls.Material;
		expect( EffectOf( hulls.Material, proxies.Meshes[0] ).defines )
			.toContain( "#define PROXY_INSTANCED" );
		proxies.Dispose();
		expect( scene.customRenderTargets ).not.toContain( hulls.Target );
		context.Dispose();
	} );
} );

describe( "SdfLightBuffer", () => {
	it( "marches the shadows and occlusion at a lower resolution", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const engine = scene.getEngine();

		// none without float targets, or asked for none
		FloatTargets( scene, false );
		const plain = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context },
		);

		expect( plain.Light ).toBeNull();
		plain.Dispose();
		FloatTargets( scene, true );
		const none = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context, LightResolution: 0 },
		);

		expect( none.Light ).toBeNull();
		none.Dispose();

		// by default half the screen across and down, before the corners
		const layer = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context },
		);
		const light = layer.Light!;
		const targets = scene.customRenderTargets;

		expect( light.Resolution ).toBe( 0.5 );
		expect( targets.indexOf( light.Target ) )
			.toBeLessThan( targets.indexOf( layer.Checker!.Current ) );
		layer.Mesh.material = light.Material;
		expect( EffectOf( light.Material, layer.Mesh ).defines )
			.toContain( "#define LIGHT_PASS" );
		layer.Mesh.material = layer.Checker!.March;
		expect( EffectOf( layer.Checker!.March, layer.Mesh ).defines )
			.toContain( "#define LIGHT_START" );
		layer.Mesh.material = layer.Material;

		// drawn while the box is, at its size for the screen
		const reset = vi.spyOn( light.Target, "resetRefreshCounter" );

		layer.Update();
		expect( [ ...light.Target.renderList! ] ).toEqual( [ layer.Mesh ] );
		expect( reset ).toHaveBeenCalledTimes( 1 );
		expect( light.Target.getSize().width )
			.toBe( Math.ceil( engine.getRenderWidth() * 0.5 ) );
		layer.Mesh.setEnabled( false );
		layer.Update();
		expect( reset ).toHaveBeenCalledTimes( 1 );

		// the corners read it in screen pixels; its own pass at its size
		const [ sx, sy ] = light.Scale();
		const marching = SpyEffect();

		layer.Checker!.March.bind(
			Matrix.Identity(),
			layer.Mesh,
			marching as unknown as Effect,
		);
		expect( marching.setTexture )
			.toHaveBeenCalledWith( "lightBuffer", light.Target );
		expect( marching.setFloat2 )
			.toHaveBeenCalledWith( "lightBufferScale", sx, sy );
		expect( sx ).toBeCloseTo(
			light.Target.getSize().width / engine.getRenderWidth(),
		);

		const lighting = SpyEffect();
		const camera = scene.activeCamera!;

		light.Material.bind(
			Matrix.Identity(),
			layer.Mesh,
			lighting as unknown as Effect,
		);
		expect( lighting.setFloat ).toHaveBeenCalledWith(
			"pixelAngle",
			expect.closeTo(
				Math.tan( camera.fov / 2 ) * 2 / light.Target.getSize().height,
				4,
			),
		);

		// the screen grown: the buffer too
		const width = vi.spyOn( engine, "getRenderWidth" )
			.mockReturnValue( 333 );

		layer.Mesh.setEnabled( true );
		layer.Update();
		expect( light.Target.getSize().width ).toBe( 167 );
		width.mockRestore();

		layer.Dispose();
		expect( targets ).not.toContain( light.Target );

		// without the checkerboard the screen pass reads it
		const direct = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context, Checkerboard: false },
		);

		expect( EffectOf( direct.Material, direct.Mesh ).defines )
			.toContain( "#define LIGHT_START" );
		direct.Dispose();
		context.Dispose();
	} );
} );

describe( "SdfShadowCache", () => {
	it( "keeps the box's shadow while nothing it depends on changes", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const shadows = context.Shadows!;

		// none without float targets, shadows, or when asked for none
		FloatTargets( scene, false );
		const plain = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context },
		);

		expect( plain.ShadowCache ).toBeNull();
		plain.Dispose();
		FloatTargets( scene, true );
		const none = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context, ShadowCache: false },
		);

		expect( none.ShadowCache ).toBeNull();
		none.Dispose();

		const layer = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context },
		);
		const cache = layer.ShadowCache!;
		const map = shadows.getShadowMap()!;
		const reset = vi.spyOn( cache.Target, "resetRefreshCounter" );

		expect( cache.Target.getSize().width ).toBe( map.getSize().width );
		expect( scene.customRenderTargets ).toContain( cache.Target );

		// the screen material casts what the cache keeps, while it's valid
		const caster = layer.Material.shadowDepthWrapper!
			.baseMaterial as ShaderMaterial;
		const casterEffect = EffectOf( caster, layer.Mesh );
		const kept = vi.spyOn( casterEffect, "setFloat" );
		const texture = vi.spyOn( casterEffect, "setTexture" );

		expect( casterEffect.defines ).toContain( "#define CASTER_CACHED" );
		Bind( caster, layer.Mesh );
		expect( kept ).toHaveBeenCalledWith( "casterCached", 0 );
		expect( texture ).toHaveBeenCalledWith( "casterCache", cache.Target );

		// changed (the first frame): marched by the shadow pass; the same
		// the frame after: marched into the cache, once
		layer.Update();
		expect( cache.Valid ).toBe( false );
		expect( reset ).not.toHaveBeenCalled();
		layer.Update();
		expect( cache.Valid ).toBe( true );
		expect( reset ).toHaveBeenCalledTimes( 1 );
		expect( [ ...cache.Target.renderList! ] ).toEqual( [ layer.Mesh ] );
		layer.Update();
		expect( reset ).toHaveBeenCalledTimes( 1 );
		kept.mockClear();
		Bind( caster, layer.Mesh );
		expect( kept ).toHaveBeenCalledWith( "casterCached", 1 );

		// the dynamic edits change: the shadow pass marches until they hold
		context.Dynamic.Add( { Shape: SdfShape.Sphere } );
		layer.Update();
		expect( cache.Valid ).toBe( false );
		layer.Update();
		expect( cache.Valid ).toBe( true );
		expect( reset ).toHaveBeenCalledTimes( 2 );

		// so do an upload, the step, the box and the map
		layer.Grid.Field.Edits.Add( { Shape: SdfShape.Box } );
		layer.Update();
		expect( cache.Valid ).toBe( false );
		layer.Update();
		layer.StepScale = 0.5;
		layer.Update();
		expect( cache.Valid ).toBe( false );
		layer.Update();
		layer.Mesh.position.x += 1;
		layer.Mesh.computeWorldMatrix( true );
		layer.Update();
		expect( cache.Valid ).toBe( false );
		layer.Update();
		shadows.bias = 0.01;
		layer.Update();
		expect( cache.Valid ).toBe( false );
		layer.Update();
		expect( cache.Valid ).toBe( true );

		// a store not ready yet: tried again the next frame
		const ready = vi.spyOn( cache.Store, "isReady" )
			.mockReturnValue( false );

		shadows.bias = 0.02;
		layer.Update();
		layer.Update();
		expect( cache.Valid ).toBe( false );
		ready.mockRestore();
		layer.Update();
		expect( cache.Valid ).toBe( true );

		// the store binds what the shadow generator would
		const store = cache.Store;

		layer.Mesh.material = store;
		const storeEffect = EffectOf( store, layer.Mesh );
		const floats = vi.spyOn( storeEffect, "setFloat3" );
		const pairs = vi.spyOn( storeEffect, "setFloat2" );

		expect( storeEffect.defines ).toContain( "#define CASTER_STORE" );
		Bind( store, layer.Mesh );
		expect( floats ).toHaveBeenCalledWith(
			"biasAndScaleSM",
			shadows.bias,
			shadows.normalBias,
			shadows.depthScale,
		);
		expect( pairs )
			.toHaveBeenCalledWith(
				"depthValuesSM",
				expect.any( Number ),
				expect.any( Number ),
			);
		layer.Mesh.material = layer.Material;

		// drawn in the sun's view
		const transform = vi.spyOn( scene, "setTransformMatrix" );

		cache.Target.onBeforeRenderObservable.notifyObservers( 0 );
		expect( transform ).toHaveBeenCalledWith(
			expect.anything(),
			shadows.getTransformMatrix(),
		);

		// another list or another map size: changed
		cache.Refresh( [], [] );
		expect( cache.Valid ).toBe( false );
		const size = vi.spyOn( map, "getSize" )
			.mockReturnValue( { width: 64, height: 64 } );

		cache.Refresh( [], [] );
		expect( cache.Target.getSize().width ).toBe( 64 );
		size.mockRestore();

		layer.Dispose();
		expect( scene.customRenderTargets ).not.toContain( cache.Target );
		context.Dispose();
	} );
} );

describe( "SdfRaymarchLayer with a context", () => {
	it( "shares the context's volume and leaves the context alone", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const layer = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context },
		);

		expect( layer.Context ).toBe( context );
		expect( context.Volume ).toBe( layer.Volume );
		expect( context.Shadows!.getShadowMap()!.renderList )
			.toContain( layer.Mesh );
		layer.SyncLights();
		layer.Dispose();
		expect( context.Volume ).toBeNull();
		// the context stays: it was given, not made
		expect( context.Shadows!.getShadowMap() ).not.toBeNull();

		// another volume shown meanwhile is not taken away
		const second = new SdfRaymarchLayer(
			scene,
			Grid(),
			{ Context: context },
		);
		const other = SdfVolumeTexture.FromGrid( scene, Grid( 4 ) );

		context.Volume = other;
		second.Dispose();
		expect( context.Volume ).toBe( other );
		context.Dispose();
	} );
} );

describe( "SdfMeshLayer with a context", () => {
	function Chunks() {
		const list = new EditList();

		list.Add( { Shape: SdfShape.Sphere, Params: [ 1, 0, 0, 0 ] } );
		return new SdfMeshChunks( new SdfField( list, new GroundPlane( -1 ) ), {
			CellSize: 0.5,
			ChunkCells: 4,
			Radius: 1,
			Budget: 100,
		} );
	}

	it( "counts its triangles; the far levels cast no shadow", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const layer = new SdfMeshLayer( scene, null, { Context: context } );
		const mesh = Chunks().Mesh( ChunkKey( 0, 0, 0 ), [ 0, 0, 0 ] ).Mesh;
		const map = context.Shadows!.getShadowMap()!;

		expect( layer.Triangles ).toBe( 0 );
		layer.Apply( {
			Built: [
				{ Key: "near", Coord: [ 0, 0, 0 ], Mesh: mesh, Version: 0 },
				{
					Key: "mid",
					Coord: [ 0, 0, 0 ],
					Level: 1,
					Mesh: mesh,
					Version: 0,
				},
				{
					Key: "far",
					Coord: [ 0, 0, 0 ],
					Level: 2,
					Mesh: mesh,
					Version: 0,
				},
			],
			Removed: [],
			Remaining: 0,
		} );
		expect( layer.Triangles ).toBe( mesh.Indices.length );
		expect( map.renderList ).toContain( layer.MeshOf( "near" ) );
		expect( map.renderList ).toContain( layer.MeshOf( "mid" ) );
		expect( map.renderList ).not.toContain( layer.MeshOf( "far" ) );
		// all of them receive
		expect( layer.MeshOf( "far" )!.receiveShadows ).toBe( true );
		layer.Dispose();
		context.Dispose();
	} );

	it( "cuts only the chunks a dynamic edit reaches", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, { AutoMeshes: false } );
		const layer = new SdfMeshLayer( scene, Chunks(), { Context: context } );

		layer.Update();

		const center = layer.MeshOf( ChunkKey( 0, 0, 0 ) )!;
		const far = layer.MeshOf( ChunkKey( -1, -1, -1 ) )!;

		expect( layer.Proxies ).not.toBeNull();
		expect( layer.CutMaterial ).not.toBeNull();
		expect( SdfMaterialPlugin.Of( layer.Material )!.Features )
			.toBe( SdfMaterialFeatures.Occluders );
		expect( SdfMaterialPlugin.Of( layer.CutMaterial! )!.Features )
			.toBe( SdfMaterialFeatures.Carve | SdfMaterialFeatures.Occluders );
		// the chunks cast and receive
		expect( center.receiveShadows ).toBe( true );
		expect( context.Shadows!.getShadowMap()!.renderList )
			.toContain( center );
		// cut in the shadow map too, by a shader of its own
		expect( layer.CutMaterial!.shadowDepthWrapper!.standalone )
			.toBe( true );

		center.computeWorldMatrix( true );
		far.computeWorldMatrix( true );
		context.Dynamic.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.Subtract,
			Position: [ 1, 1, 1 ],
			Params: [ 0.3, 0, 0, 0 ],
		} );
		scene.onBeforeRenderObservable.notifyObservers( scene );
		expect( center.material ).toBe( layer.CutMaterial );
		expect( far.material ).toBe( layer.Material );
		// an intersection reaches every chunk
		context.Dynamic.Add( { Shape: SdfShape.Box, Op: SdfOp.Intersect } );
		layer.AssignCuts();
		expect( far.material ).toBe( layer.CutMaterial );
		context.Dynamic.Clear();
		layer.AssignCuts();
		expect( center.material ).toBe( layer.Material );

		// the cut chunks' depth shader binds the edits, not the volume
		const depth = layer.CutMaterial!.shadowDepthWrapper!
			.baseMaterial as ShaderMaterial;
		const bind = vi.spyOn( context, "BindTo" );

		const depthEffect = EffectOf( depth, center );

		Bind( depth, center );
		expect( bind ).toHaveBeenCalledWith( depthEffect, false );
		layer.Dispose();
		expect( layer.Count ).toBe( 0 );
		context.Dispose();
	} );

	it( "has no cut material without shadows in the cut's map", () => {
		const { scene } = LitScene();
		const context = new SdfRenderContext( scene, {
			AutoMeshes: false,
			Shadows: false,
		} );
		const layer = new SdfMeshLayer( scene, null, { Context: context } );

		expect( layer.CutMaterial!.shadowDepthWrapper ).toBeFalsy();
		layer.Dispose();
		context.Dispose();
	} );
} );

describe( "SdfRenderReceiver with an SDF scene", () => {
	it( "makes a context per scene and takes its volume and edits", () => {
		const { scene } = LitScene();
		const receiver = new SdfRenderReceiver( scene, {
			ShadowMapSize: 512,
			ShadowHz: 120,
		} );
		const grid = Grid();
		const volume = {
			Data: grid.Data,
			Resolution: grid.Resolution,
			Min: grid.Min,
			Spacing: grid.Spacing,
			Range: grid.Range,
		};

		// no SDF world: nothing to apply the edits to
		expect( receiver.SetDynamic( new Float32Array( 16 ) ) ).toBe( false );
		expect( receiver.Handle( {
			Type: "begin",
			Epoch: 1,
			Settings: { Shadows: true },
		} ) ).toBe( true );

		const context = receiver.Context!;

		expect( context.Shadows!.getShadowMap()!.getSize().width ).toBe( 512 );
		expect(
			receiver.Handle( { Type: "volume", Epoch: 0, Volume: volume } ),
		)
			.toBe( false );
		expect(
			receiver.Handle( { Type: "volume", Epoch: 1, Volume: volume } ),
		)
			.toBe( true );

		const first = context.Volume as SdfVolumeTexture;
		const update = vi.spyOn( first, "Update" );

		// the same shape: uploaded into the same texture
		receiver.Handle( { Type: "volume", Epoch: 1, Volume: volume } );
		expect( context.Volume ).toBe( first );
		expect( update ).toHaveBeenCalledWith( grid.Data, 0, 7, 0 );
		// a part (the slices an edit changed): those slices alone
		const part = grid.Data.slice( 2 * 64 * 4, 4 * 64 * 4 );

		receiver.Handle( {
			Type: "volume",
			Epoch: 1,
			Volume: { ...volume, Data: part, First: 2 },
		} );
		expect( update ).toHaveBeenLastCalledWith( part, 2, 3, 2 );
		// another: a new texture
		receiver.Handle( {
			Type: "volume",
			Epoch: 1,
			Volume: { ...volume, Range: 9 },
		} );
		expect( context.Volume ).not.toBe( first );
		expect( receiver.SetDynamic( new Float32Array( DYNAMIC_EDIT_FLOATS ) ) )
			.toBe( true );
		expect( context.Dynamic.Count ).toBe( 1 );

		// a scene without an SDF world: no context, its volume ignored
		receiver.Handle( { Type: "begin", Epoch: 2, Settings: null } );
		expect( receiver.Context ).toBeNull();
		// a part of a volume it hasn't: waits for a whole one
		expect( receiver.Handle( {
			Type: "volume",
			Epoch: 2,
			Volume: { ...volume, Data: part, First: 2 },
		} ) ).toBe( false );
		expect(
			receiver.Handle( { Type: "volume", Epoch: 2, Volume: volume } ),
		)
			.toBe( true );
		receiver.Dispose();
	} );

	it( "grows the scene's grass once its volume comes", () => {
		const { scene } = LitScene();
		const receiver = new SdfRenderReceiver( scene );
		const grid = Grid();
		const volume = {
			Data: grid.Data,
			Resolution: grid.Resolution,
			Min: grid.Min,
			Spacing: grid.Spacing,
			Range: grid.Range,
		};

		receiver.Handle( {
			Type: "begin",
			Epoch: 1,
			Settings: {
				Shadows: true,
				Grass: { Bounds: [ -2, -2, 2, 2 ], Density: 16 },
			},
		} );
		expect( receiver.Grass ).toBeNull();
		receiver.Handle( { Type: "volume", Epoch: 1, Volume: volume } );

		const grass = receiver.Grass!;

		// on the ground around the ball
		expect( grass.Count ).toBeGreaterThan( 0 );
		// a new volume: the same grass, grown again
		receiver.Handle( { Type: "volume", Epoch: 1, Volume: volume } );
		expect( receiver.Grass ).toBe( grass );
		// a new scene without grass: gone
		receiver.Handle(
			{ Type: "begin", Epoch: 2, Settings: { Shadows: true } },
		);
		expect( receiver.Grass ).toBeNull();
		receiver.Dispose();
	} );

	it( "keeps shadows off when told to", () => {
		const { scene } = LitScene();
		const receiver = new SdfRenderReceiver( scene, {
			Shadows: false,
			Occlusion: false,
		} );

		receiver.Handle(
			{ Type: "begin", Epoch: 1, Settings: { Shadows: true } },
		);
		expect( receiver.Context!.Shadows ).toBeNull();
		receiver.Dispose();
	} );
} );
