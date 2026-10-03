// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../Logging/Logger";
import { SoundAction, SoundType } from "../Workers/Common/CommonEnums";
import type { AudioToMainMessage } from "../Workers/Protocol/AudioProtocol";

/**
 * The game's single AudioContext. AudioWorker resolves sounds; here they are only copied into an AudioBuffer, or
 * decoded once per sound id when the worker could not decode them.
 */
export class AudioPlayer {
	private readonly _context: AudioContext;
	private readonly _decodedCache = new Map<string, AudioBuffer>();

	public constructor(audioWorker: Worker) {
		this._context = new AudioContext();
		audioWorker.onmessage = (event: MessageEvent<AudioToMainMessage>) => this.OnMessage(event.data);
	}

	/** Call from a real user gesture (see DomInputBridge) - browsers refuse to start a suspended AudioContext otherwise. */
	public Resume(): void {
		void this._context.resume();
	}

	private OnMessage(message: AudioToMainMessage): void {
		if (message.action !== SoundAction.PlaySound) return;

		if (message.sound.kind === SoundType.Pcm) this.PlayPcm(message.sound, message.position);
		else this.PlayEncoded(message.soundId, message.sound.data, message.position);
	}

	private PlayPcm(sound: { sampleRate: number; channels: Float32Array[]; }, position?: [number, number, number]): void {
		const length = sound.channels[0]?.length ?? 0;
		const buffer = this._context.createBuffer(sound.channels.length, length, sound.sampleRate);
		// Channels arrive via postMessage transfer, so they are always backed by a plain ArrayBuffer (never a SharedArrayBuffer).
		sound.channels.forEach((channel, index) => buffer.copyToChannel(channel as Float32Array<ArrayBuffer>, index));
		this.Start(buffer, position);
	}

	private PlayEncoded(soundId: string, data: ArrayBuffer, position?: [number, number, number]): void {
		const cached = this._decodedCache.get(soundId);
		if (cached) {
			this.Start(cached, position);
			return;
		}

		this._context
			.decodeAudioData(data)
			.then((decoded) => {
				this._decodedCache.set(soundId, decoded);
				this.Start(decoded, position);
			})
			.catch((error) => Logger.LogException(error, `[AudioPlayer] failed to decode "${soundId}"`));
	}

	private Start(buffer: AudioBuffer, position?: [number, number, number]): void {
		const source = this._context.createBufferSource();
		source.buffer = buffer;

		if (position) {
			const panner = this._context.createPanner();
			panner.positionX.value = position[0];
			panner.positionY.value = position[1];
			panner.positionZ.value = position[2];
			source.connect(panner).connect(this._context.destination);
		} else {
			source.connect(this._context.destination);
		}

		source.start();
	}
}
