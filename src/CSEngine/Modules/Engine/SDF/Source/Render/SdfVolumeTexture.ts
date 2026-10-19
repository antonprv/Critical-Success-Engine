// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Constants } from "@babylonjs/core/Engines/constants";
import "@babylonjs/core/Engines/Extensions/engine.rawTexture";
import { RawTexture3D } from "@babylonjs/core/Materials/Textures/rawTexture3D";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { DenseSdfGrid } from "../Bricks/DenseGrid";
import type { SdfVolumeBinding } from "./SdfRenderContext";

/** A sampled volume as it travels: what DenseSdfGrid holds. */
export interface SdfVolumeData {
	/**
	 * Per texel (x fastest): distance, material, second material, mix and layer
	 * (DenseGrid's TexelBytes).
	 */
	Data: Uint8Array;
	Resolution: Readonly<[ number, number, number ]>;
	Min: Readonly<[ number, number, number ]>;
	/** World size of a texel. */
	Spacing: number;
	/** World distance of a byte of 0 or 255. */
	Range: number;
	/**
	 * Data holds only the slices (z) from this one on - what an edit changed
	 * - instead of the whole volume. Default 0 with all of them.
	 */
	First?: number;
}

/**
 * The world sampled into two 3D textures: the distance alone (a byte a
 * texel, filtered by the hardware: what every step of the ray marcher, the
 * proxies and the meshes' occlusion read) and the materials (the pair, the
 * second's share and the layer: read where a ray stops or a mask asks for
 * the layer). Apart, the textures the hot loops fetch from stay a quarter
 * of the size.
 */
export class SdfVolumeTexture implements SdfVolumeBinding {
	/** The distance (R8, linear). */
	public readonly Texture: RawTexture3D;

	/**
	 * First and second material, then the mix and the layer (RGBA8, nearest).
	 */
	public readonly Materials: RawTexture3D;

	public readonly Min: Readonly<[ number, number, number ]>;

	public readonly Size: Readonly<[ number, number, number ]>;

	public readonly Resolution: Readonly<[ number, number, number ]>;

	public readonly Range: number;

	/** World size of a texel. */
	public readonly Spacing: number;

	/** The two textures' bytes, split out of the grid's texels. */
	private readonly _distance: Uint8Array;

	private readonly _materials: Uint8Array;

	public constructor( scene: Scene, volume: SdfVolumeData ) {
		const [ nx, ny, nz ] = volume.Resolution;
		const h = volume.Spacing;

		this.Resolution = [ nx, ny, nz ];
		this.Min = [ ...volume.Min ];
		this.Size = [ nx * h, ny * h, nz * h ];
		this.Range = volume.Range;
		this.Spacing = h;
		this._distance = new Uint8Array( nx * ny * nz );
		this._materials = new Uint8Array( nx * ny * nz * 4 );
		this.Split( volume.Data, 0, nz - 1 );
		this.Texture = Texture3D(
			scene,
			this._distance,
			this.Resolution,
			Constants.TEXTUREFORMAT_R,
			Texture.BILINEAR_SAMPLINGMODE,
		);
		this.Materials = Texture3D(
			scene,
			this._materials,
			this.Resolution,
			Constants.TEXTUREFORMAT_RGBA,
			Texture.NEAREST_SAMPLINGMODE,
		);
	}

	/** The texture of a dense grid. */
	public static FromGrid(
		scene: Scene,
		grid: DenseSdfGrid,
	): SdfVolumeTexture {
		return new SdfVolumeTexture( scene, grid );
	}

	/** Whether data of this shape fits the texture as it is. */
	public Fits( volume: SdfVolumeData ): boolean {
		return volume.Resolution.every( ( n, i ) => n === this.Resolution[i] )
			&& volume.Min.every( ( m, i ) => m === this.Min[i] )
			&& volume.Spacing === this.Spacing
			&& volume.Range === this.Range;
	}

	/**
	 * Uploads new texels (the same size): all of them, or only the slices
	 * z0..z1 (what a grid's Refresh wrote) - a few slices instead of the whole
	 * volume when an edit lands. `data` starts at slice `first` (a part of
	 * the volume, as a partial SdfVolumeData sends it).
	 */
	public Update(
		data: Uint8Array,
		z0 = 0,
		z1 = this.Resolution[2] - 1,
		first = 0,
	): void {
		const [ nx, ny, nz ] = this.Resolution;

		if ( z1 < z0 ) {
			return;
		}
		this.Split( data, z0, z1, first );

		const engine = this.Texture.getScene()?.getEngine() as unknown as {
			_gl?: WebGL2RenderingContext;
			_bindTextureDirectly?: (
				target: number,
				texture: unknown,
				force?: boolean,
			) => void;
		} | undefined;
		const gl = engine?._gl;
		const bind = engine?._bindTextureDirectly?.bind( engine );
		const distance = this.Texture.getInternalTexture();
		const materials = this.Materials.getInternalTexture();

		// the whole volume where a slice can't be sent alone (no WebGL2, or the
		// textures aren't on the GPU yet)
		if ( ( z0 === 0 && z1 === nz - 1 ) || !gl || !bind
			|| !distance?._hardwareTexture || !materials?._hardwareTexture ) {
			this.Texture.update( this._distance );
			this.Materials.update( this._materials );
			return;
		}

		const slice = nx * ny;
		const depth = z1 - z0 + 1;

		gl.pixelStorei( gl.UNPACK_ALIGNMENT, 1 );
		bind( gl.TEXTURE_3D, distance, true );
		gl.texSubImage3D(
			gl.TEXTURE_3D, 0, 0, 0, z0, nx, ny, depth, gl.RED, gl.UNSIGNED_BYTE,
			this._distance.subarray( z0 * slice, ( z1 + 1 ) * slice ),
		);
		bind( gl.TEXTURE_3D, materials, true );
		gl.texSubImage3D(
			gl.TEXTURE_3D, 0, 0, 0, z0, nx, ny, depth, gl.RGBA,
			gl.UNSIGNED_BYTE,
			this._materials.subarray( z0 * slice * 4, ( z1 + 1 ) * slice * 4 ),
		);
		bind( gl.TEXTURE_3D, null );
	}

	public Dispose(): void {
		this.Texture.dispose();
		this.Materials.dispose();
	}

	/**
	 * The grid's texels of slices z0..z1 into the two textures' bytes (`data`
	 * starting at slice `first`).
	 */
	private Split( data: Uint8Array, z0: number, z1: number, first = 0 ): void {
		const slice = this.Resolution[0] * this.Resolution[1];
		const distance = this._distance;
		const materials = this._materials;
		const offset = first * slice * 4;

		for ( let i = z0 * slice, end = ( z1 + 1 ) * slice; i < end; i++ ) {
			const at = i * 4;
			const from = at - offset;

			distance[i] = data[from]!;
			materials[at] = data[from + 1]!;
			materials[at + 1] = data[from + 2]!;
			materials[at + 2] = data[from + 3]!;
		}
	}
}

/** A 3D texture of these bytes, clamped at its edges. */
export function Texture3D(
	scene: Scene,
	data: Uint8Array,
	[ nx, ny, nz ]: Readonly<[ number, number, number ]>,
	format: number,
	sampling: number,
): RawTexture3D {
	const texture = new RawTexture3D(
		data,
		nx,
		ny,
		nz,
		format,
		scene,
		false,
		false,
		sampling,
	);

	texture.wrapU = Texture.CLAMP_ADDRESSMODE;
	texture.wrapV = Texture.CLAMP_ADDRESSMODE;
	texture.wrapR = Texture.CLAMP_ADDRESSMODE;
	return texture;
}
