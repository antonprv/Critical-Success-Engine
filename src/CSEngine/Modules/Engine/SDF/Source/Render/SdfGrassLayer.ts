// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Constants } from "@babylonjs/core/Engines/constants";
import { Effect } from "@babylonjs/core/Materials/effect";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/instancesVertex";
import { GrassField, type SdfGrassOptions } from "../Splats/GrassField";
import { PaletteColor } from "./Palette";
import { SdfShaderMaterial } from "./RaymarchMaterial";
import type { SdfRenderContext } from "./SdfRenderContext";
import {
	DynamicDeclarations,
	DynamicFunctions,
	ShadowMapDeclarations,
	ShadowMapFunctions,
	ShadowMapSampler,
	ShapeFunctions,
} from "./SdfGlsl";
import type { SdfVolumeData } from "./SdfVolumeTexture";

const GrassShaderName = "cseSdfGrass";

const GrassVertex = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec4 grassRoot;

#include<instancesDeclaration>

uniform mat4 viewProjection;
uniform sampler2D trampleMap;
// min x, min z, 1 / size x, 1 / size z
uniform vec4 trampleArea;
// wind direction x, z, sway, time
uniform vec4 wind;
uniform float sdfCarveThreshold;
${ DynamicDeclarations }

varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
varying vec3 vRootColor;

${ ShapeFunctions }
${ DynamicFunctions }

void main( void ) {
#include<instancesVertex>
	vec3 root = finalWorld[3].xyz;
	vec3 side = finalWorld[0].xyz;
	float height = length( finalWorld[1].xyz );
	vec4 pressed = texture(
		trampleMap,
		( root.xz - trampleArea.xy ) * trampleArea.zw
	);
	vec2 push = ( pressed.rg * 2.0 - 1.0 ) * pressed.b;
	float phase = grassRoot.a * 6.2831853;
	// pressed grass doesn't sway
	vec2 sway = wind.xy * wind.z * ( 0.6 + 0.4 * sin( wind.w * 1.7 + phase
		+ dot( root.xz, vec2( 0.31, 0.23 ) ) ) ) * ( 1.0 - pressed.b );
	vec2 lean = push * 1.45 + sway;
	float angle = min( length( lean ), 1.5 );
	vec2 dir = angle > 1e-4 ? lean / length( lean ) : vec2( 0.0, 1.0 );
	float h = position.y;
	float a = angle * h;
	// a blade bent evenly: an arc
	float lateral = angle > 1e-3 ? ( 1.0 - cos( a ) ) / angle : 0.0;
	float up = angle > 1e-3 ? sin( a ) / angle : h;
	// a dynamic edit that took the ground away takes the blade too
	float keep = cseSdfDynamicDistance( root, 0.0 ) > sdfCarveThreshold
		? 0.0
		: 1.0;
	vec3 p = root + ( side * position.x
		+ ( vec3( dir.x, 0.0, dir.y ) * lateral + vec3( 0.0, up, 0.0 ) )
		* height ) * keep;
	vec3 tangent = vec3( dir.x * sin( a ), cos( a ), dir.y * sin( a ) );

	vWorld = p;
	vNormal = normalize( cross( normalize( side ), tangent ) );
	vHeight = h;
	vRootColor = grassRoot.rgb;
	gl_Position = viewProjection * vec4( p, 1.0 );
}
`;

const GrassFragment = /* glsl */ `
precision highp float;
precision highp sampler2DShadow;

varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
varying vec3 vRootColor;

uniform vec3 tipColor;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyDirection;
uniform vec3 skyColor;
uniform vec3 groundColor;
#ifdef SHADOWMAP
${ ShadowMapSampler }
${ ShadowMapDeclarations }
${ ShadowMapFunctions }
#endif

void main( void ) {
	vec3 n = normalize( vNormal );

	if ( !gl_FrontFacing ) {
		n = -n;
	}

	vec3 albedo = mix( vRootColor, tipColor, smoothstep( 0.0, 0.8, vHeight ) );
	vec3 l = -normalize( sunDirection );
	// light passes through a blade: its back side is lit too, less
	float lit = max( dot( n, l ), 0.0 ) * 0.7 + max( -dot( n, l ), 0.0 ) * 0.35;
#ifdef SHADOWMAP
	lit *= cseSdfShadowMap( vWorld + l * 0.05 );
#endif
	// the blades around shade a blade's foot
	float ao = mix( 0.45, 1.0, vHeight );
	vec3 sky = mix(
		groundColor,
		skyColor,
		dot( n, skyDirection ) * 0.25 + 0.75
	);

	gl_FragColor = vec4( albedo * ( sky * ao + sunColor * lit ), 1.0 );
}
`;

/** The flattening map is uploaded at most this many times a second. */
const UploadHz = 60;

/**
 * Metres along a side of a tile of grass (one draw, culled and thinned alone).
 */
const TileSize = 8;

/** The least share of a tile's blades drawn, however far. */
const LodFloor = 1 / 6;

/**
 * Splat grass (GrassField) drawn: one thin instance per blade, a blade a
 * strip of three segments bent along an arc - by the flattening map (what
 * the context's meshes press, recovering over time) and the wind - cut away
 * by dynamic edits that take the ground, lit by the scene's sun and sky,
 * shaded by the sun's shadow map. The roots fade into the ground's colour
 * where the grass's mask has the ground's layer (GrassField).
 *
 * The blades go in tiles of TileSize metres, each a draw of its own: one out
 * of view isn't drawn, and one far away draws only a share of its blades
 * (they are in a random order, so any first part of them is spread evenly
 * over the tile).
 */
export class SdfGrassLayer {
	public readonly Field: GrassField;

	/** The blade every tile draws (never drawn itself). */
	public readonly Mesh: Mesh;

	/** The tiles drawn: thin instances of the blade. */
	public readonly Tiles: Mesh[] = [];

	/** Each tile's blades and its centre, as the LOD weighs it. */
	private readonly _tiles: Array<{ Count: number; Center: Vector3; }> = [];

	public readonly Material: SdfShaderMaterial;

	public readonly Texture: RawTexture;

	private readonly _bytes: Uint8Array;

	private readonly _update: Observer<Scene>;

	private _time = 0;

	private _sinceUpload = Infinity;

	public constructor(
		private readonly _scene: Scene,
		private readonly _context: SdfRenderContext,
		options: SdfGrassOptions,
		private readonly _palette: readonly Color3[],
	) {
		const field = new GrassField( options );
		const n = field.Texels;

		this.Field = field;
		this._bytes = new Uint8Array( n * n * 4 );
		field.Encode( this._bytes );
		this.Texture = new RawTexture(
			this._bytes,
			n,
			n,
			Constants.TEXTUREFORMAT_RGBA,
			_scene,
			false,
			false,
			Texture.BILINEAR_SAMPLINGMODE,
		);
		this.Texture.wrapU = Texture.CLAMP_ADDRESSMODE;
		this.Texture.wrapV = Texture.CLAMP_ADDRESSMODE;

		Effect.ShadersStore[`${ GrassShaderName }VertexShader`] = GrassVertex;
		Effect.ShadersStore[`${ GrassShaderName }FragmentShader`] =
			GrassFragment;
		this.Material = new SdfShaderMaterial(
			"sdfGrass",
			_scene,
			GrassShaderName,
			{
				attributes: [ "position", "grassRoot" ],
				uniforms: [
					"world",
					"viewProjection",
					"trampleArea",
					"wind",
					"sdfCarveThreshold",
					"sdfDynamic",
					"sdfDynamicCount",
					"sdfDynamicLayered",
					"tipColor",
					"sunDirection",
					"sunColor",
					"skyDirection",
					"skyColor",
					"groundColor",
					"sdfLightMatrix",
					"sdfShadowInfo",
				],
				samplers: [ "trampleMap", "sdfShadowMap" ],
				defines: _context.Shadows ? [ "SHADOWMAP" ] : [],
			},
			( effect ) => this.Bind( effect ),
		);
		this.Material.backFaceCulling = false;

		this.Mesh = BladeMesh( _scene );
		this.Mesh.material = this.Material;
		this.Mesh.isPickable = false;
		this.Mesh.setEnabled( false );

		this._update = _scene.onBeforeRenderObservable.add( () => this.Update(
			_scene.getEngine().getDeltaTime() / 1000,
		) );
	}

	/** Blades grown (drawn, in view and near enough, or not). */
	public get Count(): number {
		return this._tiles.reduce( ( sum, tile ) => sum + tile.Count, 0 );
	}

	/** Blades the tiles draw now (after the LOD). */
	public get Drawn(): number {
		return this.Tiles.reduce(
			( sum, tile ) => sum + tile.thinInstanceCount,
			0,
		);
	}

	/** Grows the grass over a volume (again when it changed). */
	public Scatter( volume: SdfVolumeData ): void {
		const field = this.Field;
		const count = field.Scatter( volume );
		const blades = field.Blades;
		const [ x0, z0 ] = field.Bounds;
		// the blades of each tile, in a random order (their phase is random)
		const tiles = new Map<number, number[]>();

		for ( let b = 0; b < count; b++ ) {
			const at = b * GrassField.Stride;
			const key = Math.floor( ( blades[at]! - x0 ) / TileSize )
				+ Math.floor( ( blades[at + 2]! - z0 ) / TileSize ) * 65536;
			let list = tiles.get( key );

			if ( !list ) {
				list = [];
				tiles.set( key, list );
			}
			list.push( b );
		}
		this.DropTiles();
		for ( const list of tiles.values() ) {
			list.sort( ( a, b ) => blades[a * GrassField.Stride + 5]!
				- blades[b * GrassField.Stride + 5]! );
			this.AddTile( list );
		}
	}

	/** A tile of blades (their indices): a draw with its own bounds. */
	private AddTile( list: readonly number[] ): void {
		const field = this.Field;
		const blades = field.Blades;
		const count = list.length;
		const matrices = new Float32Array( count * 16 );
		const roots = new Float32Array( count * 4 );
		const min = new Vector3( Infinity, Infinity, Infinity );
		const max = new Vector3( -Infinity, -Infinity, -Infinity );

		for ( let i = 0; i < count; i++ ) {
			const b = list[i]!;
			const at = b * GrassField.Stride;
			const yaw = blades[at + 3]!;
			const scale = blades[at + 4]!;
			const width = field.Width * scale;
			const height = field.Height * scale;
			const c = Math.cos( yaw );
			const s = Math.sin( yaw );
			const m = i * 16;

			// x: the blade's width across, y: up its height, z: unused
			matrices.set( [
				c * width, 0, -s * width, 0,
				0, height, 0, 0,
				s, 0, c, 0,
				blades[at]!, blades[at + 1]!, blades[at + 2]!, 1,
			], m );

			// the root's colour: the ground's where the grass merges with it
			const merges = blades[at + 9]! > 0.5;
			const a = PaletteColor( this._palette, blades[at + 6]! );
			const g = PaletteColor( this._palette, blades[at + 7]! );
			const t = blades[at + 8]!;
			const own = field.RootColor;

			roots[i * 4] = merges ? a.r + ( g.r - a.r ) * t : own[0];
			roots[i * 4 + 1] = merges ? a.g + ( g.g - a.g ) * t : own[1];
			roots[i * 4 + 2] = merges ? a.b + ( g.b - a.b ) * t : own[2];
			roots[i * 4 + 3] = blades[at + 5]!;
			min.minimizeInPlaceFromFloats(
				blades[at]!,
				blades[at + 1]!,
				blades[at + 2]!,
			);
			max.maximizeInPlaceFromFloats(
				blades[at]!,
				blades[at + 1]!,
				blades[at + 2]!,
			);
		}

		// a blade of its own (seven vertices): with the geometry shared, the
		// vertex array cached for it would keep the first tile's instances
		const tile = BladeMesh(
			this._scene,
			`sdfGrass ${ this.Tiles.length }`,
		);
		// a blade bends and sways up to its height around its root
		const reach = field.Height * 1.5;

		tile.material = this.Material;
		tile.isPickable = false;
		tile.thinInstanceRegisterAttribute( "grassRoot", 4 );
		tile.thinInstanceSetBuffer( "matrix", matrices, 16, true );
		tile.thinInstanceSetBuffer( "grassRoot", roots, 4, true );
		tile.setBoundingInfo( new BoundingInfo(
			min.subtractFromFloats( reach, 0, reach ),
			max.addInPlaceFromFloats( reach, reach, reach ),
		) );
		tile.doNotSyncBoundingInfo = true;
		tile.setEnabled( true );
		this._context.Own( tile );
		this.Tiles.push( tile );
		this._tiles.push( {
			Count: count,
			Center: tile.getBoundingInfo().boundingBox.centerWorld.clone(),
		} );
	}

	private DropTiles(): void {
		for ( const tile of this.Tiles ) {
			tile.dispose();
		}
		this.Tiles.length = 0;
		this._tiles.length = 0;
	}

	/** Each tile's share of blades by its distance to the camera. */
	private Thin(): void {
		const camera = this._scene.activeCamera;

		if ( !camera ) {
			return;
		}

		const eye = camera.globalPosition;
		const near = this.Field.LodDistance;

		this._tiles.forEach( ( tile, i ) => {
			const d = Vector3.Distance( eye, tile.Center );
			const share = d <= near
				? 1
				: Math.max( LodFloor, ( near / d ) ** 2 );

			this.Tiles[i]!.thinInstanceCount = Math.ceil( tile.Count * share );
		} );
	}

	/**
	 * Before every frame: what the meshes press, the grass standing up
	 * again, the map uploaded (at most UploadHz).
	 */
	public Update( dt: number ): void {
		const field = this.Field;

		this._time += dt;
		this.Thin();
		field.Recover( dt );
		this._context.ForEachSphere(
			( x, y, z, radius ) => field.Press( x, y, z, radius ),
		);
		this._sinceUpload += dt;
		if ( this._sinceUpload >= 1 / UploadHz ) {
			this._sinceUpload = 0;
			field.Encode( this._bytes );
			this.Texture.update( this._bytes );
		}
	}

	public Dispose(): void {
		this._scene.onBeforeRenderObservable.remove( this._update );
		this.DropTiles();
		this.Mesh.dispose();
		this.Material.dispose();
		this.Texture.dispose();
	}

	private Bind( effect: Effect ): void {
		const [ x0, z0, x1, z1 ] = this.Field.Bounds;
		const wind = this.Field.Wind;

		effect.setTexture( "trampleMap", this.Texture );
		effect.setFloat4(
			"trampleArea",
			x0,
			z0,
			1 / ( x1 - x0 ),
			1 / ( z1 - z0 ),
		);
		effect.setFloat4( "wind", 0.8 * wind, 0.6 * wind, 1, this._time );
		effect.setFloat3( "tipColor", ...this.Field.Color );
		this._context.BindTo( effect, false );
		this._context.BindLights( effect );
		this._context.BindShadowMap( effect );
	}
}

/**
 * One blade: a strip of three segments narrowing to a tip, x across (-0.5
 * .. 0.5), y up (0 .. 1).
 */
function BladeMesh( scene: Scene, name = "sdfGrass" ): Mesh {
	const mesh = new Mesh( name, scene );
	const data = new VertexData();
	const positions: number[] = [];
	const indices: number[] = [];

	for ( let s = 0; s < 3; s++ ) {
		const h = s / 3;
		const half = 0.5 * ( 1 - h * 0.8 );

		positions.push( -half, h, 0, half, h, 0 );
	}
	positions.push( 0, 1, 0 );
	for ( let s = 0; s < 2; s++ ) {
		const a = s * 2;

		indices.push( a, a + 2, a + 1, a + 1, a + 2, a + 3 );
	}
	indices.push( 4, 6, 5 );
	data.positions = positions;
	data.indices = indices;
	data.applyToMesh( mesh, false );
	return mesh;
}
