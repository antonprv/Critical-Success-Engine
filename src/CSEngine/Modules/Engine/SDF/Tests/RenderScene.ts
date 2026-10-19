// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import {
	InternalTexture,
	InternalTextureSource,
} from "@babylonjs/core/Materials/Textures/internalTexture";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, vi } from "vitest";

const engines: NullEngine[] = [];

afterEach( () => {
	for ( const engine of engines.splice( 0 ) ) {
		engine.dispose();
	}
} );

/**
 * A scene on Babylon's NullEngine (no GL), disposed after the test. It has no
 * GL to make 3D textures with: those are stand-ins.
 */
export function NewScene(): Scene {
	const engine = new NullEngine();

	vi.spyOn( engine, "createRawTexture3D" ).mockImplementation(
		() => new InternalTexture( engine, InternalTextureSource.Raw3D ),
	);
	vi.spyOn( engine, "updateRawTexture3D" ).mockImplementation( () => {
	} );

	engines.push( engine );
	return new Scene( engine );
}
