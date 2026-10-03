// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { RenderMsg } from "../Common/CommonEnums";
export type MainToRenderMessage =
	| {
			type: RenderMsg.Init;
			canvas: OffscreenCanvas;
			gameLogicPort: MessagePort;
			devMode: boolean;
			/** CSS size + DPR at transfer time; an OffscreenCanvas otherwise stays at the default 300x150. */
			width: number;
			height: number;
			devicePixelRatio: number;
	  }
	| { type: RenderMsg.Resize; width: number; height: number; devicePixelRatio: number }
	| { type: RenderMsg.SetInspectorVisible; visible: boolean };
