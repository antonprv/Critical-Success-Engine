// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Constants } from "@babylonjs/core/Engines/constants";
import type {
	InternalTexture,
} from "@babylonjs/core/Materials/Textures/internalTexture";
import type {
	RawTexture3D,
} from "@babylonjs/core/Materials/Textures/rawTexture3D";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import { BRICK_STORED } from "../Bricks/BrickCodec";
import type { SdfVolume } from "../Bricks/SdfVolume";
import type { SdfBrickBinding, SdfVolumeBinding } from "./SdfRenderContext";
import { Texture3D } from "./SdfVolumeTexture";

/**
 * Past this share of the atlas's slots written at once, the whole atlas is
 * sent (one call, not thousands).
 */
const WholeAtlasShare = 1 / 8;

/**
 * The bricks of an SdfVolume as the shaders read them (plan.md 5, 21.8
 * item 12): the atlas of distances (R8, filtered: each slot's apron keeps
 * the filter inside it), the atlas of materials (RGBA8, nearest, the same
 * slots) and the map over them (RGBA8, a texel a cell of the window,
 * SdfVolume.MapTexels: a slot, solid, or how many cells of empty space
 * lie around). Only the bricks near a surface take memory - a world the
 * dense volume would need gigabytes for fits in a few megabytes - and an
 * empty cell tells the ray how far it may go. Update sends only the slots
 * written since (copy-on-write in the atlas: a slot is reused only after
 * the frame that drew it), and the map when it changed.
 */
export class SdfBrickTexture implements SdfVolumeBinding {
	/** The distances' atlas (R8, linear). */
	public readonly Texture: RawTexture3D;

	/** The materials' atlas (RGBA8, nearest). */
	public readonly Materials: RawTexture3D;

	public readonly Bricks: SdfBrickBinding;

	public readonly Range: number;

	/** The map's texels, sent as a whole when it changes. */
	private readonly _map: Uint8Array;

	private readonly _mapTexture: RawTexture3D;

	private _version = -1;

	public constructor( scene: Scene, public readonly Volume: SdfVolume ) {
		const atlas = Volume.Atlas;
		const m = Volume.Map.Size;

		if ( atlas.Materials.length === 0 ) {
			throw new Error( "SdfBrickTexture: a volume without materials" );
		}
		this.Range = Volume.Range;
		this._map = new Uint8Array( m * m * m * 4 );
		this.Texture = Texture3D(
			scene,
			atlas.Data,
			atlas.Size,
			Constants.TEXTUREFORMAT_R,
			Texture.BILINEAR_SAMPLINGMODE,
		);
		this.Materials = Texture3D(
			scene,
			atlas.Materials,
			atlas.Size,
			Constants.TEXTUREFORMAT_RGBA,
			Texture.NEAREST_SAMPLINGMODE,
		);
		this._mapTexture = Texture3D(
			scene,
			this._map,
			[ m, m, m ],
			Constants.TEXTUREFORMAT_RGBA,
			Texture.NEAREST_SAMPLINGMODE,
		);
		this.Bricks = {
			Map: this._mapTexture,
			Origin: Volume.Map.Origin,
			CellSize: Volume.Map.CellSize,
			MapSize: m,
		};
		// the slots written while it was made are in the texture already
		atlas.TakeDirty();
		this.Update();
	}

	/**
	 * The box drawn: the volume's bounds, else the map's window (the
	 * shaders read nothing beyond it), lowest corner in world units.
	 */
	public get Min(): Readonly<[ number, number, number ]> {
		const bounds = this.Volume.Bounds;

		if ( bounds ) {
			return [ bounds[0]!, bounds[1]!, bounds[2]! ];
		}

		const [ x, y, z ] = this.Volume.Map.Origin;
		const cell = this.Volume.Map.CellSize;

		return [ x * cell, y * cell, z * cell ];
	}

	public get Size(): Readonly<[ number, number, number ]> {
		const bounds = this.Volume.Bounds;

		if ( bounds ) {
			return [
				bounds[3]! - bounds[0]!,
				bounds[4]! - bounds[1]!,
				bounds[5]! - bounds[2]!,
			];
		}

		const side = this.Volume.Map.Size * this.Volume.Map.CellSize;

		return [ side, side, side ];
	}

	/**
	 * Samples along the box's edges: a spacing apart, as a dense grid's
	 * texels (the shaders take the spacing from it).
	 */
	public get Resolution(): Readonly<[ number, number, number ]> {
		const h = this.Volume.Spacing;
		const [ x, y, z ] = this.Size;

		return [ x / h, y / h, z / h ];
	}

	/**
	 * Sends what the volume changed since: the slots written, the map if
	 * any cell changed. True if anything was sent.
	 */
	public Update(): boolean {
		const volume = this.Volume;
		const atlas = volume.Atlas;
		const slots = atlas.TakeDirty();
		const mapped = volume.Version !== this._version;

		if ( slots.length > 0 ) {
			this.SendSlots( slots );
		}
		if ( mapped ) {
			this._version = volume.Version;
			volume.MapTexels( this._map );
			this._mapTexture.update( this._map );
		}
		return slots.length > 0 || mapped;
	}

	public Dispose(): void {
		this.Texture.dispose();
		this.Materials.dispose();
		this._mapTexture.dispose();
	}

	/**
	 * The slots' texels of both atlases: each slot alone (WebGL2 reads it
	 * out of the whole array), or the whole atlas when many changed or the
	 * GPU's textures can't take a part.
	 */
	private SendSlots( slots: readonly number[] ): void {
		const atlas = this.Volume.Atlas;
		const engine = this.Texture.getScene()?.getEngine() as unknown as {
			_gl?: WebGL2RenderingContext;
			_bindTextureDirectly?: (
				target: number,
				texture: InternalTexture | null,
				force?: boolean,
			) => void;
		} | undefined;
		const gl = engine?._gl;
		const bind = engine?._bindTextureDirectly?.bind( engine );
		const distance = this.Texture.getInternalTexture();
		const materials = this.Materials.getInternalTexture();

		if ( slots.length > atlas.Capacity * WholeAtlasShare || !gl || !bind
			|| !distance?._hardwareTexture || !materials?._hardwareTexture ) {
			this.Texture.update( atlas.Data );
			this.Materials.update( atlas.Materials );
			return;
		}

		const [ width, height ] = atlas.Size;
		const Send = (
			texture: InternalTexture,
			format: number,
			data: Uint8Array,
		): void => {
			bind( gl.TEXTURE_3D, texture, true );
			for ( const slot of slots ) {
				const [ x, y, z ] = atlas.SlotOrigin( slot );

				gl.pixelStorei( gl.UNPACK_SKIP_PIXELS, x );
				gl.pixelStorei( gl.UNPACK_SKIP_ROWS, y );
				gl.pixelStorei( gl.UNPACK_SKIP_IMAGES, z );
				gl.texSubImage3D(
					gl.TEXTURE_3D, 0, x, y, z,
					BRICK_STORED, BRICK_STORED, BRICK_STORED,
					format, gl.UNSIGNED_BYTE, data,
				);
			}
		};

		gl.pixelStorei( gl.UNPACK_ALIGNMENT, 1 );
		gl.pixelStorei( gl.UNPACK_ROW_LENGTH, width );
		gl.pixelStorei( gl.UNPACK_IMAGE_HEIGHT, height );
		Send( distance, gl.RED, atlas.Data );
		Send( materials, gl.RGBA, atlas.Materials );
		for ( const name of [
			gl.UNPACK_ROW_LENGTH,
			gl.UNPACK_IMAGE_HEIGHT,
			gl.UNPACK_SKIP_PIXELS,
			gl.UNPACK_SKIP_ROWS,
			gl.UNPACK_SKIP_IMAGES,
		] ) {
			gl.pixelStorei( name, 0 );
		}
		bind( gl.TEXTURE_3D, null );
	}
}
