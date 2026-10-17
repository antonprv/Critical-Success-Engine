// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The SDF demo (plan.md 15, M0 criterion): Babylon cubes and SDF shapes in
// one scene, sorted by depth both ways, with a hole that moves through the
// world as an ordinary edit. ?tier=mesh shows the mesh tier, ?view=0..3 the
// debug views, ?hole=0 stops the hole. ?scene=depth is the end-to-end check's
// still scene: a ball, a cube in front of it and a larger one behind.

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Scene } from "@babylonjs/core/scene";
import {
	ChooseTier,
	CreateAabb,
	DenseSdfGrid,
	DetectCapabilities,
	EditList,
	GroundPlane,
	SdfField,
	SdfMeshChunks,
	SdfOp,
	SdfShape,
	SdfTier,
} from "../Source/Index";
import {
	SdfMeshLayer,
	SdfRaymarchLayer,
	type SdfDebugView,
} from "../Source/Render/Index";

const params = new URLSearchParams( location.search );
const depthCheck = params.get( "scene" ) === "depth";
const canvas = document.getElementById( "view" ) as HTMLCanvasElement;
const engine = new Engine( canvas, true, { preserveDrawingBuffer: true } );
const scene = new Scene( engine );

// the engine's convention; ?lh=1 checks Babylon's default too
scene.useRightHandedSystem = params.get( "lh" ) !== "1";
scene.clearColor = new Color4( 0.08, 0.1, 0.14, 1 );

const camera = depthCheck
	? new ArcRotateCamera(
		"camera",
		Math.PI / 2,
		Math.PI / 2,
		10,
		Vector3.Zero(),
		scene,
	)
	: new ArcRotateCamera(
		"camera",
		-Math.PI / 2.6,
		1.05,
		17,
		new Vector3( 0, 1, 0 ),
		scene,
	);

camera.minZ = 0.05;
if ( !depthCheck ) {
	camera.attachControl( canvas, true );
}

const sky = new HemisphericLight( "sky", new Vector3( 0.2, 1, 0.1 ), scene );

sky.intensity = 0.65;
sky.groundColor = new Color3( 0.25, 0.25, 0.3 );

const sun = new DirectionalLight( "sun", new Vector3( -0.4, -1, -0.5 ), scene );

sun.intensity = 0.7;

// the world: ground, a blob of smoothly joined shapes, a carved tunnel
const edits = new EditList();
const field = new SdfField(
	edits,
	depthCheck ? null : new GroundPlane( 0, 0 ),
);

edits.Add( {
	Shape: SdfShape.Sphere,
	Position: depthCheck ? [ 0, 0, 0 ] : [ 0, 1.6, 0 ],
	Params: [ depthCheck ? 1 : 2, 0, 0, 0 ],
	MaterialId: 1,
} );
if ( !depthCheck ) {
	AddShowcase();
}

function AddShowcase(): void {
	edits.Add( {
		Shape: SdfShape.RoundBox,
		Op: SdfOp.SmoothUnion,
		Position: [ 2.4, 0.8, 1.2 ],
		Rotation: [ 0, 0.38, 0, 0.92 ],
		Params: [ 1.2, 0.8, 1.2, 0.25 ],
		SmoothK: 0.8,
		MaterialId: 3,
	} );
	edits.Add( {
		Shape: SdfShape.Torus,
		Op: SdfOp.SmoothUnion,
		Position: [ -3.2, 0.5, 1.5 ],
		Params: [ 1.3, 0.45, 0, 0 ],
		SmoothK: 0.5,
		MaterialId: 4,
	} );
	edits.Add( {
		Shape: SdfShape.Capsule,
		Op: SdfOp.Subtract,
		Position: [ 0, 1.4, 0 ],
		Rotation: [ 0.7071, 0, 0, 0.7071 ],
		Params: [ 3, 0.7, 0, 0 ],
		MaterialId: 5,
	} );
}

const hole = edits.Add( {
	Shape: SdfShape.Sphere,
	Op: SdfOp.SmoothSubtract,
	Position: depthCheck ? [ 0, -50, 0 ] : [ 0, 0, 3 ],
	Params: [ 0.9, 0, 0, 0 ],
	SmoothK: 0.3,
	MaterialId: 2,
} );

// Babylon meshes crossing the SDF shapes: the depth test sorts them
const cubeMaterial = new StandardMaterial( "cube", scene );

cubeMaterial.diffuseColor = new Color3( 0.25, 0.75, 0.95 );
for ( const [ x, y, z, size ] of depthCheck
	? [ [ 0, 0, 2.5, 0.5 ], [ 0, 0, -2.5, 3 ] ] as const
	: [
		[ 1.4, 2.4, 1.4, 1.2 ],
		[ -1.8, 3.2, -0.5, 0.9 ],
		[ 4, 0.4, -2.5, 1.4 ],
		[ 0, 1.4, 0, 0.8 ],
	] as const ) {
	const cube = CreateBox( "cube", { size }, scene );

	cube.position.set( x, y, z );
	if ( !depthCheck ) {
		cube.rotation.set( 0.4, 0.7, 0 );
	}
	cube.material = cubeMaterial;
}

const gl = ( engine as unknown as { _gl: WebGL2RenderingContext; } )._gl;
const auto = ChooseTier( DetectCapabilities( gl, "gpu" in navigator ) );
let tier = params.get( "tier" ) === "mesh" ? SdfTier.Mesh
	: params.get( "tier" ) === "gl" ? SdfTier.Gl
		: auto.Tier;
let marched: SdfRaymarchLayer | null = null;
let meshed: SdfMeshLayer | null = null;
let view = Number( params.get( "view" ) ?? 0 ) as SdfDebugView;
let moving = !depthCheck && params.get( "hole" ) !== "0";

function Show( next: SdfTier ): void {
	marched?.Dispose();
	meshed?.Dispose();
	marched = null;
	meshed = null;
	tier = next;
	if ( tier === SdfTier.Mesh ) {
		const chunks = new SdfMeshChunks( field, {
			CellSize: 0.2,
			ChunkCells: 20,
			Radius: 2,
			Budget: Number( params.get( "budget" ) ?? 6 ),
		} );

		chunks.CenterOn( 0, depthCheck ? 0 : 1, 0 );
		meshed = new SdfMeshLayer( scene, chunks );
	} else {
		const grid = new DenseSdfGrid(
			field,
			depthCheck
				? CreateAabb( -2, -2, -2, 2, 2, 2 )
				: CreateAabb( -8, -1, -8, 8, 5, 8 ),
			Number( params.get( "res" ) ?? 160 ),
		);

		marched = new SdfRaymarchLayer( scene, grid );
		marched.DebugView = view;
	}
}

Show( tier );

document.querySelectorAll<HTMLButtonElement>( "[data-tier]" )
	.forEach( ( button ) => {
		button.onclick = () => Show(
			button.dataset["tier"] === "mesh" ? SdfTier.Mesh : SdfTier.Gl,
		);
	} );
document.querySelectorAll<HTMLButtonElement>( "[data-view]" )
	.forEach( ( button ) => {
		button.onclick = () => {
			view = Number( button.dataset["view"] ) as SdfDebugView;
			if ( marched ) {
				marched.DebugView = view;
			}
		};
	} );

const holeBox = document.getElementById( "hole" ) as HTMLInputElement;

holeBox.checked = moving;
holeBox.onchange = () => {
	moving = holeBox.checked;
};

const stats = document.getElementById( "stats" )!;
let time = 0;
let frames = 0;
let lastReport = performance.now();
let lastWork = 0;

scene.onBeforeRenderObservable.add( () => {
	if ( moving ) {
		time += engine.getDeltaTime() / 1000;
		edits.Update( hole.Id, {
			Position: [
				Math.sin( time * 0.7 ) * 3.5,
				0.2,
				Math.cos( time * 0.7 ) * 3.5,
			],
		} );
	}

	const start = performance.now();

	meshed?.Update();
	lastWork = performance.now() - start;
} );

engine.runRenderLoop( () => {
	scene.render();
	frames++;

	const now = performance.now();

	if ( now - lastReport > 500 ) {
		stats.textContent = [
			`tier ${ tier } (auto: ${ auto.Tier }, ${ auto.Reason })`,
			`${ ( frames * 1000 / ( now - lastReport ) ).toFixed( 0 ) } fps`,
			`edits ${ edits.Count }, version ${ edits.Version }`,
			meshed
				? `chunks ${ meshed.Count }, `
					+ `meshing ${ lastWork.toFixed( 1 ) } ms`
				: `grid ${ marched!.Grid.Resolution.join( "x" ) }`,
		].join( "\n" );
		frames = 0;
		lastReport = now;
	}
} );

window.addEventListener( "resize", () => engine.resize() );
/**
 * For the end-to-end check: the color drawn where a world point lands on
 * screen (0..1 per channel), and how many chunks still wait to be meshed.
 */
const probe = {
	async Pixel( x: number, y: number, z: number ): Promise<number[]> {
		const width = engine.getRenderWidth();
		const height = engine.getRenderHeight();
		const at = Vector3.Project(
			new Vector3( x, y, z ),
			Matrix.Identity(),
			scene.getTransformMatrix(),
			camera.viewport.toGlobal( width, height ),
		);
		const pixels = await engine.readPixels(
			Math.round( at.x ),
			Math.round( height - at.y ),
			1,
			1,
		) as Uint8Array;

		return [ ...pixels.slice( 0, 3 ) ].map( ( v ) => v / 255 );
	},
	get Pending(): number {
		return meshed?.Chunks.Pending ?? 0;
	},
};

Object.assign( window, { sdfProbe: probe, sdfReady: true } );
