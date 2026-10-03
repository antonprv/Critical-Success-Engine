// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { SoundAction } from "../../Workers/Common/CommonEnums";
import type { GameLogicToAudioMessage } from "../../Workers/Protocol/GameLogicAudioProtocol";
import type { Vec3 } from "../Math/Vec3";

export class AudioService {
	private readonly _port: MessagePort;

	public constructor(port: MessagePort) {
		this._port = port;
	}

	public PlaySound(soundId: string, position?: Vec3): void {
		const message: GameLogicToAudioMessage = position
			? { action: SoundAction.PlaySound, soundId, position: position.ToTuple() }
			: { action: SoundAction.PlaySound, soundId };
		this._port.postMessage(message);
	}
}
