// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { InputEvtType } from "../Common/CommonEnums";
import type { InputEvent } from "../Protocol/GameLogicProtocol";

/**
 * Tracks which keys are currently held and turns raw input events into
 * simple, named intents (e.g. {@link OnJumpPressed}). Knows nothing about
 * physics/render ports or what a jump should actually do - that decision
 * belongs to whoever wires up the callbacks (see GameLogicWorker.ts).
 */
export class PlayerInput {
	private readonly _pressedKeys = new Set<string>();

	public OnJumpPressed?: () => void;

	public Handle(event: InputEvent): void {
		switch (event.kind) {
			case InputEvtType.KeyDown:
				this._pressedKeys.add(event.code);
				if (event.code === "Space") {
					this.OnJumpPressed?.();
				}
				break;
			case InputEvtType.KeyUp:
				this._pressedKeys.delete(event.code);
				break;
			case InputEvtType.PointerMove:
			case InputEvtType.PointerDown:
			case InputEvtType.PointerUp:
				// Hook up camera look / interaction here once there's a real camera
				// rig driven from this worker instead of RenderScene's placeholder one.
				break;
		}
	}
}
