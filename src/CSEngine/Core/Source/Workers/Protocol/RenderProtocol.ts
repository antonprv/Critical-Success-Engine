// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { RenderMsg } from "../Common/CommonEnums";
/** How edges are smoothed. */
export type Antialiasing = "msaa" | "fxaa" | "off";

export type MainToRenderMessage =
	| {
		type: RenderMsg.Init;
		canvas: OffscreenCanvas;
		gameLogicPort: MessagePort;
		devMode: boolean;
		/**
		 * Draw as fast as possible instead of at the display's rate
		 * (?uncapped).
		 */
		uncapped?: boolean;
		/**
		 * Smooth edges: "fxaa" (the default: one cheap pass over the finished
		 * frame), "msaa" (multisampling, a cheaper pass over the finished
		 * frame) or "off" (?aa=).
		 */
		antialias?: Antialiasing;
		/**
		 * CSS size + DPR at transfer time; an OffscreenCanvas otherwise stays
		 * at the default 300x150.
		 */
		width: number;
		height: number;
		devicePixelRatio: number;
	}
	| {
		type: RenderMsg.Resize;
		width: number;
		height: number;
		devicePixelRatio: number
	}
	| { type: RenderMsg.SetInspectorVisible; visible: boolean };
