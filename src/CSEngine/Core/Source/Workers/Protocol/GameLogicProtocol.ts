// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { GameLogicMsg, InputEvtType as InputEvt } from "../Common/CommonEnums";

export type InputEvent =
	| { kind: InputEvt.KeyDown; code: string; }
	| { kind: InputEvt.KeyUp; code: string; }
	| { kind: InputEvt.PointerMove; dx: number; dy: number; }
	| { kind: InputEvt.PointerDown; button: number; }
	| { kind: InputEvt.PointerUp; button: number; }
	| { kind: InputEvt.ReleaseAll; };

export type MainToGameLogicMessage =
	| {
		type: GameLogicMsg.Init;
		renderPort: MessagePort;
		physicsPort: MessagePort;
		audioPort: MessagePort;
		uiPort: MessagePort;
	}
	| { type: GameLogicMsg.Input; event: InputEvent; };
