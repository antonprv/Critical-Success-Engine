// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Scene } from "@babylonjs/core/scene";

/**
 * The pixels of the frame the scene's camera draws: its output target's
 * (a render scale: FsrUpscaler) or else the canvas's. Unlike the engine's
 * render size it doesn't depend on which target is bound at the moment.
 */
export function FrameSize( scene: Scene ): { width: number; height: number; } {
	const target = scene.activeCamera?.outputRenderTarget;

	if ( target ) {
		return {
			width: target.getRenderWidth(),
			height: target.getRenderHeight(),
		};
	}

	const engine = scene.getEngine();

	return {
		width: engine.getRenderWidth(),
		height: engine.getRenderHeight(),
	};
}
