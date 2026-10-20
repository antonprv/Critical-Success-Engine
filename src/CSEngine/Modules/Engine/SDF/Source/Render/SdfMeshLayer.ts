// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Effect } from "@babylonjs/core/Materials/effect";
import {
	ShadowDepthWrapper,
} from "@babylonjs/core/Materials/shadowDepthWrapper";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { IsCarving, IsGlobal } from "../Edits/SdfEdit";
import { SdfDynamicEdits } from "../Edits/SdfDynamicEdits";
import type {
	MeshChunksUpdate,
	SdfChunk,
	SdfChunkSource,
} from "../Mesh/MeshChunks";
import { DefaultPalette, PaletteColor, PaletteFloats } from "./Palette";
import { SdfDynamicProxies } from "./SdfDynamicProxies";
import { SdfShaderMaterial } from "./RaymarchMaterial";
import { SdfMaterialFeatures } from "./SdfMaterialPlugin";
import type { SdfRenderContext } from "./SdfRenderContext";
import {
	ChunkDepthFragment,
	ChunkDepthShaderName,
	ChunkDepthVertex,
} from "./Shaders";

/** The cone march's tiles by default (MeshLayerOptions.ConeTiles). */
const DefaultConeTiles: readonly number[] = [];

export interface MeshLayerOptions {
	/** Colors of material ids (linear); ids past the end wrap. */
	Palette?: readonly Color3[];
	/**
	 * What the chunks share with the scene's meshes: they cast and receive
	 * the sun's shadows, are occluded by the meshes, and the context's
	 * dynamic edits cut them and are drawn by proxies (SdfDynamicProxies).
	 */
	Context?: SdfRenderContext;
	/**
	 * The dynamic edits' hulls marched with the checkerboard (plan.md 21.7,
	 * SdfCheckerboard): half the rays a frame. Default on (where the GPU
	 * draws into float targets).
	 */
	Checkerboard?: boolean;
	/**
	 * The cone march the hulls start their rays from (plan.md 20.1): its
	 * tiles in pixels, coarsest first (none: off).
	 */
	ConeTiles?: readonly number[];
	/**
	 * Chunks of the levels of detail below this cast into the sun's shadow
	 * map (MeshChunksOptions.Levels; all receive). Default 2: the map
	 * fits its casters, and the far levels would spread it over the whole
	 * world - a few texels a metre, acne on every slope.
	 */
	ShadowLevels?: number;
}

/**
 * The mesh tier drawn by Babylon (plan.md 22.3): one mesh per chunk,
 * colored per vertex by its material and its baked occlusion, lit by the
 * scene's own lights - ordinary triangles, so depth, shadows and
 * transparency work as for any other mesh. Update remeshes within the
 * chunks' budget and swaps the results in. With a context, the dynamic edits
 * are never meshed: the chunks cut out where they change the world and the
 * proxies draw it there.
 */
export class SdfMeshLayer {
	public readonly Material: StandardMaterial;

	/**
	 * With a context: the material of the chunks a dynamic edit reaches,
	 * cut where it changes the world (on screen and in the shadow map). The
	 * others keep Material, which costs nothing of that.
	 */
	public readonly CutMaterial: StandardMaterial | null;

	private readonly _cut: Observer<Scene> | null;

	private readonly _meshes = new Map<string, Mesh>();

	private readonly _palette: readonly Color3[];

	private readonly _context: SdfRenderContext | null;

	private readonly _shadowLevels: number;

	/** The dynamic edits' proxies (with a context). */
	public readonly Proxies: SdfDynamicProxies | null;

	public constructor(
		private readonly _scene: Scene,
		public readonly Chunks: SdfChunkSource | null,
		options: MeshLayerOptions = {},
	) {
		this._palette = options.Palette ?? DefaultPalette;
		this._context = options.Context ?? null;
		this._shadowLevels = options.ShadowLevels ?? 2;
		this.Material = ChunkMaterial( "sdfMeshTier", _scene );
		this.CutMaterial = null;
		this.Proxies = null;
		this._cut = null;
		if ( this._context ) {
			const context = this._context;

			context.Plug( this.Material, SdfMaterialFeatures.Occluders );
			this.CutMaterial = ChunkMaterial( "sdfMeshTierCut", _scene );
			context.Plug(
				this.CutMaterial,
				SdfMaterialFeatures.Carve | SdfMaterialFeatures.Occluders,
			);
			// in the shadow map the cuts too, with a shader of their own (the
			// material's would light and occlude every texel for nothing)
			if ( context.Shadows ) {
				this.CutMaterial.shadowDepthWrapper = new ShadowDepthWrapper(
					ChunkDepthMaterial( _scene, context ),
					_scene,
					{ standalone: true, doNotInjectCode: true },
				);
			}
			this._cut = _scene.onBeforeRenderObservable.add(
				() => this.AssignCuts(),
			);
			this.Proxies = new SdfDynamicProxies(
				_scene,
				this._context,
				{
					DebugView: 0,
					Quality: 1,
					StepScale: 0.9,
					Relaxation: 1,
					ProxyThreshold: this._context.CarveThreshold,
					Palette: PaletteFloats( this._palette ),
				},
				options.Checkerboard ?? true,
				options.ConeTiles ?? DefaultConeTiles,
			);
		}
	}

	/** Chunks drawn now. */
	public get Count(): number {
		return this._meshes.size;
	}

	/** Triangles drawn now (skirts too): the tier's budget (plan.md 23.4). */
	public get Triangles(): number {
		let total = 0;

		for ( const mesh of this._meshes.values() ) {
			total += mesh.getTotalIndices() / 3;
		}
		return total;
	}

	/** The mesh drawn for a chunk key, if any. */
	public MeshOf( key: string ): Mesh | undefined {
		return this._meshes.get( key );
	}

	/**
	 * Takes the chunks the source has ready; returns what changed. Without a
	 * source (the chunks are pushed with Apply) there is nothing to take.
	 */
	public Update(): MeshChunksUpdate {
		const update = this.Chunks?.Update()
			?? { Built: [], Removed: [], Remaining: 0 };

		this.Apply( update );
		return update;
	}

	/** Drops every chunk (a new scene). */
	public Clear(): void {
		for ( const key of [ ...this._meshes.keys() ] ) {
			this.Drop( key );
		}
	}

	/** Swaps in rebuilt chunks and drops the ones that left. */
	public Apply( update: MeshChunksUpdate ): void {
		for ( const key of update.Removed ) {
			this.Drop( key );
		}
		for ( const chunk of update.Built ) {
			this.Drop( chunk.Key );
			if ( chunk.Mesh.Indices.length > 0 ) {
				this._meshes.set( chunk.Key, this.Build( chunk ) );
			}
		}
	}

	/**
	 * Before every frame: the chunks a dynamic edit reaches get the cut
	 * material, the others the plain one.
	 */
	public AssignCuts(): void {
		// only what removes cuts: what an edit adds is drawn by its hull over
		// the chunks, which stay as they are
		const reaches = this._context!.Dynamic.Edits
			.filter( ( edit ) => IsCarving( edit.Op ) || IsGlobal( edit.Op ) )
			.map( ( edit ) => SdfDynamicEdits.Reach( edit, 0.05 ) );

		for ( const mesh of this._meshes.values() ) {
			const box = mesh.getBoundingInfo().boundingBox;
			const min = box.minimumWorld;
			const max = box.maximumWorld;
			const cut = reaches.some( ( reach ) => !reach || (
				reach[0]! <= max.x && reach[3]! >= min.x
				&& reach[1]! <= max.y && reach[4]! >= min.y
				&& reach[2]! <= max.z && reach[5]! >= min.z ) );
			const material = cut ? this.CutMaterial : this.Material;

			if ( mesh.material !== material ) {
				mesh.material = material;
			}
		}
	}

	public Dispose(): void {
		this.Clear();
		this.Proxies?.Dispose();
		if ( this._cut ) {
			this._scene.onBeforeRenderObservable.remove( this._cut );
		}
		this.CutMaterial?.shadowDepthWrapper?.baseMaterial.dispose();
		this.CutMaterial?.shadowDepthWrapper?.dispose();
		this.CutMaterial?.dispose();
		this.Material.dispose();
		this.Chunks?.Dispose();
	}

	private Build( chunk: SdfChunk ): Mesh {
		const data = chunk.Mesh;
		const count = data.Ao.length;
		const colors = new Float32Array( count * 4 );

		for ( let v = 0; v < count; v++ ) {
			// two materials fade where the surfaces merged
			const a = PaletteColor( this._palette, data.MaterialIds[v]! );
			const b = PaletteColor( this._palette, data.MaterialIdsB[v]! );
			const t = data.MaterialMix[v]! / 255;
			const ao = data.Ao[v]!;

			colors[v * 4] = ( a.r + ( b.r - a.r ) * t ) * ao;
			colors[v * 4 + 1] = ( a.g + ( b.g - a.g ) * t ) * ao;
			colors[v * 4 + 2] = ( a.b + ( b.b - a.b ) * t ) * ao;
			colors[v * 4 + 3] = 1;
		}

		const vertices = new VertexData();
		const mesh = new Mesh( `sdfChunk ${ chunk.Key }`, this._scene );

		vertices.positions = data.Positions;
		vertices.normals = data.Normals;
		vertices.colors = colors;
		// the chunks wind counter-clockwise seen from outside; Babylon's front
		// faces are clockwise, in left- and right-handed scenes alike (it
		// mirrors the culling along with the view)
		vertices.indices = Flipped( data.Indices );
		vertices.applyToMesh( mesh, false );
		mesh.material = this.Material;
		mesh.isPickable = false;
		this._context?.Own(
			mesh,
			( chunk.Level ?? 0 ) < this._shadowLevels,
			true,
		);
		return mesh;
	}

	private Drop( key: string ): void {
		this._meshes.get( key )?.dispose();
		this._meshes.delete( key );
	}
}

/** The same triangles wound the other way. */
function Flipped( indices: Uint16Array ): Uint16Array {
	const out = indices.slice();

	for ( let t = 0; t < out.length; t += 3 ) {
		out[t + 1] = indices[t + 2]!;
		out[t + 2] = indices[t + 1]!;
	}
	return out;
}

/** The chunks' look: vertex colors lit by the scene's lights, no shine. */
function ChunkMaterial( name: string, scene: Scene ): StandardMaterial {
	const material = new StandardMaterial( name, scene );

	material.specularColor = Color3.Black();
	return material;
}

/** The chunks' material in the shadow map: depth, cut by the dynamic edits. */
function ChunkDepthMaterial(
	scene: Scene,
	context: SdfRenderContext,
): SdfShaderMaterial {
	Effect.ShadersStore[`${ ChunkDepthShaderName }VertexShader`]
		= ChunkDepthVertex;
	Effect.ShadersStore[`${ ChunkDepthShaderName }FragmentShader`]
		= ChunkDepthFragment;

	const material = new SdfShaderMaterial(
		"sdfChunkDepth",
		scene,
		ChunkDepthShaderName,
		{
			attributes: [ "position" ],
			uniforms: [
				"world",
				"viewProjection",
				"biasAndScaleSM",
				"depthValuesSM",
				"sdfDynamic",
				"sdfDynamicCount",
				"sdfDynamicLayered",
				"sdfCarveThreshold",
			],
		},
		( effect ) => context.BindTo( effect, false ),
	);

	material.backFaceCulling = false;
	return material;
}
