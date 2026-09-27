// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { AudioBank } from "./Audio/AudioBank";
import type { AudioToMainMessage, MainToAudioMessage } from "./Protocol/AudioProtocol";
import type { GameLogicToAudioMessage } from "./Protocol/GameLogicAudioProtocol";

// No lazy construction needed - unlike a real-time AudioContext, AudioBank never
// touches audio output, so there's nothing here that depends on a user gesture.
const bank = new AudioBank();

self.onmessage = (event: MessageEvent<MainToAudioMessage>) => {
	const message = event.data;
	switch (message.type) {
		case "init":
			message.gameLogicPort.onmessage = (e: MessageEvent<GameLogicToAudioMessage>) => {
				if (e.data.type === "play-sound") void PlaySound(e.data.soundId, e.data.position);
			};
			break;
	}
};

async function PlaySound(soundId: string, position?: [number, number, number]): Promise<void> {
	const sound = await bank.Resolve(soundId);
	if (!sound) return;

	const message: AudioToMainMessage = { type: "play-sound", soundId, position, sound };
	const transfer = sound.kind === "pcm" ? sound.channels.map((c) => c.buffer) : [sound.data];
	self.postMessage(message, transfer);
}
