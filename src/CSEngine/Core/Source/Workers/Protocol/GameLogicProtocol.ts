// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { GameLogicMsg, InputEvtType as InputEvt } from "../Common/CommonEnums";

export type InputEvent =
	| { kind: InputEvt.KeyDown; code: string; }
	| { kind: InputEvt.KeyUp; code: string; }
	| { kind: InputEvt.PointerMove; dx: number; dy: number; /** Where on the game view, 0..1 (free cursor only). */ x?: number; y?: number; }
	| { kind: InputEvt.PointerDown; button: number; }
	| { kind: InputEvt.PointerUp; button: number; }
	| { kind: InputEvt.ReleaseAll; }
	| { kind: InputEvt.Wheel; dy: number; }
	| { kind: InputEvt.PointerLeave; }
	| { kind: InputEvt.Gamepad; buttons: number[]; axes: number[]; };

export type MainToGameLogicMessage =
	| {
		type: GameLogicMsg.Init;
		/** Where the game's files are (data/*.csedata sit there): the page's folder. */
		baseUrl?: string;
		renderPort: MessagePort;
		physicsPort: MessagePort;
		audioPort: MessagePort;
		uiPort: MessagePort;
	}
	| { type: GameLogicMsg.Input; event: InputEvent; };
