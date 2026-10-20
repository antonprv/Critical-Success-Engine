// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Constants } from "@babylonjs/core/Engines/constants";
import type {
	RawTexture3D,
} from "@babylonjs/core/Materials/Textures/rawTexture3D";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { FormulaBase } from "../Field/Formula/FormulaBase";
import type { Aabb } from "../Spatial/Aabb";
import type {
	SdfFormulaBinding,
	SdfVolumeBinding,
} from "./SdfRenderContext";
import { Texture3D } from "./SdfVolumeTexture";

/**
 * A formula base (a fractal) as the shaders read it (SDF_FORMULA): no
 * texture - every step evaluates the formula on the GPU, its GLSL compiled
 * into the shaders (FormulaGlsl), its parameters and frame uniforms - so
 * the world has no box and no resolution of its own: `Box` is only what is
 * marched, `Spacing` the finest detail (normals, the step's floor). The
 * march asks the formula for no detail finer than the pixel's cone, so
 * far away it iterates less (plan.md 21.8 item 13).
 */
export class SdfFormulaVolume implements SdfVolumeBinding {
	/** Placeholders (one texel): the formula needs no texture. */
	public readonly Texture: RawTexture3D;

	public readonly Materials: RawTexture3D;

	public readonly Min: Readonly<[ number, number, number ]>;

	public readonly Size: Readonly<[ number, number, number ]>;

	public readonly Resolution: Readonly<[ number, number, number ]>;

	/** As far as the box reaches: the formula's distances aren't clamped. */
	public readonly Range: number;

	public readonly Formula: SdfFormulaBinding;

	public constructor(
		scene: Scene,
		public readonly Base: FormulaBase,
		box: Aabb,
		spacing: number,
	) {
		const size: [ number, number, number ] = [
			box[3]! - box[0]!,
			box[4]! - box[1]!,
			box[5]! - box[2]!,
		];

		this.Min = [ box[0]!, box[1]!, box[2]! ];
		this.Size = size;
		this.Resolution = [
			size[0] / spacing,
			size[1] / spacing,
			size[2] / spacing,
		];
		this.Range = Math.hypot( ...size );
		this.Texture = Texture3D(
			scene,
			new Uint8Array( 1 ),
			[ 1, 1, 1 ],
			Constants.TEXTUREFORMAT_R,
			Texture.NEAREST_SAMPLINGMODE,
		);
		this.Materials = Texture3D(
			scene,
			new Uint8Array( 4 ),
			[ 1, 1, 1 ],
			Constants.TEXTUREFORMAT_RGBA,
			Texture.NEAREST_SAMPLINGMODE,
		);
		this.Formula = {
			Key: Hash( Base.Glsl ),
			Glsl: Base.Glsl,
			Params: Base.ParamValues(),
			Frame: Base.FrameValues(),
		};
	}

	public Dispose(): void {
		this.Texture.dispose();
		this.Materials.dispose();
	}
}

/** A short name for a text (FNV-1a, hex): equal texts, equal names. */
function Hash( text: string ): string {
	let hash = 0x811c9dc5;

	for ( let i = 0; i < text.length; i++ ) {
		hash = Math.imul( hash ^ text.charCodeAt( i ), 0x01000193 );
	}
	return ( hash >>> 0 ).toString( 16 );
}
