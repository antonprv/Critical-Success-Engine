// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

export type MainToRenderMessage =
	| {
			type: "init";
			canvas: OffscreenCanvas;
			gameLogicPort: MessagePort;
			devMode: boolean;
			/** CSS size + DPR at transfer time; an OffscreenCanvas otherwise stays at the default 300x150. */
			width: number;
			height: number;
			devicePixelRatio: number;
	  }
	| { type: "resize"; width: number; height: number; devicePixelRatio: number }
	| { type: "set-inspector-visible"; visible: boolean };
