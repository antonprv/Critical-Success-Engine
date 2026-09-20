// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { GameLogicToAudioMessage, MainToAudioMessage } from "./protocol";

/**
 * KNOWN LIMITATION (browser support): AudioContext inside a dedicated worker
 * is a fairly recent addition and not universal yet - Chrome/Edge support it;
 * as of writing, Firefox and Safari do not reliably. If `self.AudioContext`
 * is undefined here, this worker degrades to just logging what it would have
 * played, and does NOT crash the rest of the engine - see the `context`
 * null-checks below. If you need audio everywhere today, the pragmatic
 * fallback is to move playback back to the main thread (have this worker's
 * messages forwarded through the orchestrator to a main-thread Audio/WebAudio
 * player instead of played here) at the cost of losing the thread isolation
 * for audio specifically. Check current browser support before deciding:
 * https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext#browser_compatibility
 */

let context: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();

function tryCreateContext(): AudioContext | null {
	const Ctor = (self as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
	if (!Ctor) {
		console.warn("[audio.worker] AudioContext is not available in this worker context - audio disabled this session.");
		return null;
	}
	return new Ctor();
}

/** Registry of sound-id -> URL. Fill in with your actual asset list. */
const soundUrls: Record<string, string> = {
	// impact: "assets/audio/impact.wav",
};

async function loadSound(soundId: string): Promise<AudioBuffer | null> {
	if (!context) return null;
	const cached = buffers.get(soundId);
	if (cached) return cached;

	const url = soundUrls[soundId];
	if (!url) {
		console.warn(`[audio.worker] no URL registered for sound "${soundId}" - add it to soundUrls.`);
		return null;
	}

	const response = await fetch(url);
	const arrayBuffer = await response.arrayBuffer();
	const decoded = await context.decodeAudioData(arrayBuffer);
	buffers.set(soundId, decoded);
	return decoded;
}

function playSound(soundId: string): void {
	if (!context) {
		console.log(`[audio.worker] (no AudioContext) would play "${soundId}"`);
		return;
	}
	loadSound(soundId)
		.then((buffer) => {
			if (!buffer || !context) return;
			const source = context.createBufferSource();
			source.buffer = buffer;
			source.connect(context.destination);
			source.start();
		})
		.catch((error) => console.error(`[audio.worker] failed to play "${soundId}"`, error));
}

self.onmessage = (event: MessageEvent<MainToAudioMessage>) => {
	const message = event.data;
	switch (message.type) {
		case "init": {
			context = tryCreateContext();
			message.gameLogicPort.onmessage = (e: MessageEvent<GameLogicToAudioMessage>) => {
				if (e.data.type === "play-sound") playSound(e.data.soundId);
			};
			break;
		}
		case "unlock":
			void context?.resume();
			break;
	}
};
