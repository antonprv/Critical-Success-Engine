// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../Logging/Logger";
import { AudioBank } from "./Audio/AudioBank";
import type { AudioToMainMessage, MainToAudioMessage } from "./Protocol/AudioProtocol";
import type { GameLogicToAudioMessage } from "./Protocol/GameLogicAudioProtocol";

// No lazy construction needed - unlike a real-time AudioContext, AudioBank never
// touches audio output, so there's nothing here that depends on a user gesture.
const bank = new AudioBank();

// lib is "dom" only here (no "webworker"), so `self` is typed as Window and its postMessage
// overload wants a targetOrigin - narrow to the worker signature we actually have at runtime.
const mainThread = self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void };

// Own static buffer per realm - App.ts's timer doesn't flush this one.
Logger.SetupAutoFlush();

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
	mainThread.postMessage(message, transfer);
}
