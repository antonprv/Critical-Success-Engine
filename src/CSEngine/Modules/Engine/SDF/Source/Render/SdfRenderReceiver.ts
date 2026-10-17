// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Scene } from "@babylonjs/core/scene";
import type { SdfToRender } from "../Engine/SdfProtocol";
import { SdfMeshLayer, type MeshLayerOptions } from "./SdfMeshLayer";

/**
 * The render worker's end of the SDF worker's port: the chunks it sends,
 * drawn as the mesh tier. A scene's "begin" drops the old scene's chunks,
 * and chunks of an older scene still on their way are ignored.
 */
export class SdfRenderReceiver {
	public readonly Layer: SdfMeshLayer;

	private _epoch = 0;

	public constructor( scene: Scene, options: MeshLayerOptions = {} ) {
		this.Layer = new SdfMeshLayer( scene, null, options );
	}

	/** Takes a message; true if something to draw changed. */
	public Handle( message: SdfToRender ): boolean {
		if ( message.Type === "begin" ) {
			this._epoch = message.Epoch;
			this.Layer.Clear();
			return true;
		}
		if ( message.Epoch !== this._epoch ) {
			return false;
		}
		this.Layer.Apply( {
			Built: message.Built,
			Removed: message.Removed,
			Remaining: 0,
		} );
		return true;
	}

	public Dispose(): void {
		this.Layer.Dispose();
	}
}
