// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import type {
	MeshChunksUpdate,
	SdfChunk,
	SdfMeshChunks,
} from "../Mesh/MeshChunks";
import { DefaultPalette, PaletteColor } from "./Palette";

export interface MeshLayerOptions {
	/** Colors of material ids (linear); ids past the end wrap. */
	Palette?: readonly Color3[];
}

/**
 * The mesh tier drawn by Babylon (plan.md 22.3): one mesh per chunk,
 * colored per vertex by its material and its baked occlusion, lit by the
 * scene's own lights - ordinary triangles, so depth, shadows and
 * transparency work as for any other mesh. Update remeshes within the
 * chunks' budget and swaps the results in.
 */
export class SdfMeshLayer {
	public readonly Material: StandardMaterial;

	private readonly _meshes = new Map<string, Mesh>();

	private readonly _palette: readonly Color3[];

	public constructor(
		private readonly _scene: Scene,
		public readonly Chunks: SdfMeshChunks,
		options: MeshLayerOptions = {},
	) {
		this._palette = options.Palette ?? DefaultPalette;
		this.Material = new StandardMaterial( "sdfMeshTier", _scene );
		this.Material.specularColor = Color3.Black();
	}

	/** Chunks drawn now. */
	public get Count(): number {
		return this._meshes.size;
	}

	/** The mesh drawn for a chunk key, if any. */
	public MeshOf( key: string ): Mesh | undefined {
		return this._meshes.get( key );
	}

	/** Remeshes within the chunks' budget; returns what changed. */
	public Update(): MeshChunksUpdate {
		const update = this.Chunks.Update();

		this.Apply( update );
		return update;
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

	public Dispose(): void {
		for ( const key of [ ...this._meshes.keys() ] ) {
			this.Drop( key );
		}
		this.Material.dispose();
		this.Chunks.Dispose();
	}

	private Build( chunk: SdfChunk ): Mesh {
		const data = chunk.Mesh;
		const count = data.Ao.length;
		const colors = new Float32Array( count * 4 );

		for ( let v = 0; v < count; v++ ) {
			const color = PaletteColor( this._palette, data.MaterialIds[v]! );
			const ao = data.Ao[v]!;

			colors[v * 4] = color.r * ao;
			colors[v * 4 + 1] = color.g * ao;
			colors[v * 4 + 2] = color.b * ao;
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
