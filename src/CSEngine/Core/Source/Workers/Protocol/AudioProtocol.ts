// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { AudioMsg, SoundAction, SoundType } from "../Common/CommonEnums";

export type MainToAudioMessage = { type: AudioMsg.Init; gameLogicPort: MessagePort; };

/** "pcm": AudioBank decoded the sound in the worker. "encoded": the main thread has to decode it once. */
export type ResolvedSound =
	| { kind: SoundType.Pcm; sampleRate: number; channels: Float32Array[]; }
	| { kind: SoundType.Encoded; data: ArrayBuffer; };

/** AudioWorker -> main: a sound to play. Its buffers are transferred; AudioBank keeps its own copy. */
export type AudioToMainMessage = {
	action: SoundAction.PlaySound;
	soundId: string;
	position?: [number, number, number] | undefined;
	sound: ResolvedSound;
};
