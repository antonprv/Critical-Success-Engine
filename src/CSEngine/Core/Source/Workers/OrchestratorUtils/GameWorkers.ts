// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { AudioPlayer } from "../../Audio/AudioPlayer";
import type { MainToAudioMessage } from "../Protocol/AudioProtocol";
import type { MainToGameLogicMessage } from "../Protocol/GameLogicProtocol";
import type { MainToPhysicsMessage } from "../Protocol/PhysicsProtocol";
import type {
	Antialiasing, MainToRenderMessage,
} from "../Protocol/RenderProtocol";
import type { MainToSdfMessage } from "../Protocol/SdfWorkerProtocol";
import type { MainToUiMessage } from "../Protocol/UiProtocol";
import {
	DefaultGravity,
	PhysicsFixedTimestepMs,
} from "../Common/EngineConstants";
import {
	UiMsg,
	RenderMsg,
	PhysicsMsg,
	GameLogicMsg,
	AudioMsg,
	SdfMsg,
} from "../Common/CommonEnums";

/**
 * The page's ?aa=: "msaa" or "off"; anything else FXAA, the default (on a weak
 * GPU multisampling costs most in heavy scenes).
 */
export function Antialias( value: string | null ): Antialiasing {
	return value === "msaa" || value === "off" ? value : "fxaa";
}

/**
 * The six workers and their MessageChannel wiring. The main thread talks to
 * every worker; GameLogic also has a direct port to each of the others: Physics
 * (commands, snapshots), Render (scene diffs, frames), Audio (play-sound), UI
 * (scenes, progress, HUD in; load-scene, capture out) and SDF (the game's SDF
 * edits and questions). The SDF worker has ports of its own to Render and
 * Physics: its chunks go there without passing through GameLogic.
 */
export class GameWorkers {
	public readonly RenderWorker: Worker;

	public readonly PhysicsWorker: Worker;

	public readonly GameLogicWorker: Worker;

	public readonly AudioWorker: Worker;

	/**
	 * Same constraint audio hits (no DOM in workers): this one owns UI *state
	 * and logic*, the main thread only renders it.
	 */
	public readonly UiWorker: Worker;

	/** The SDF world: its edits, its meshes (in its own mesh workers). */
	public readonly SdfWorker: Worker;

	/**
	 * Owns the real AudioContext that AudioWorker's resolved sounds actually
	 * play through.
	 */
	public readonly AudioPlayer: AudioPlayer;

	public constructor( canvas: HTMLCanvasElement, devMode: boolean ) {
		// `new URL(..., import.meta.url)` is understood natively by Vite as
		// "bundle this file as its own worker chunk" - no extra config.
		this.RenderWorker = new Worker(
			new URL( "../RenderWorker.ts", import.meta.url ),
			{ type: "module" },
		);
		this.PhysicsWorker = new Worker(
			new URL( "../PhysicsWorker.ts", import.meta.url ),
			{ type: "module" },
		);
		this.GameLogicWorker = new Worker(
			new URL( "../GameLogicWorker.ts", import.meta.url ),
			{ type: "module" },
		);
		this.AudioWorker = new Worker(
			new URL( "../AudioWorker.ts", import.meta.url ),
			{ type: "module" },
		);
		this.UiWorker = new Worker(
			new URL( "../UiWorker.ts", import.meta.url ),
			{ type: "module" },
		);
		this.SdfWorker = new Worker(
			new URL( "../SdfWorker.ts", import.meta.url ),
			{ type: "module" },
		);
		this.AudioPlayer = new AudioPlayer( this.AudioWorker );

		this.WireWorkers( canvas, devMode );
	}

	/**
	 * One MessageChannel per worker GameLogic talks to: port1 goes to
	 * GameLogic, port2 to the other worker; and the SDF worker's to Render
	 * and Physics (port1 to the SDF worker).
	 */
	private WireWorkers( canvas: HTMLCanvasElement, devMode: boolean ): void {
		const render = new MessageChannel();
		const physics = new MessageChannel();
		const audio = new MessageChannel();
		const ui = new MessageChannel();
		const sdf = new MessageChannel();
		const sdfRender = new MessageChannel();
		const sdfPhysics = new MessageChannel();

		this.InitRender( canvas, devMode, render.port2, sdfRender.port2 );
		this.InitPhysics( physics.port2, sdfPhysics.port2 );
		this.InitGameLogic(
			render.port1,
			physics.port1,
			audio.port1,
			ui.port1,
			sdf.port1,
		);
		this.InitAudio( audio.port2 );
		this.InitUi( ui.port2 );
		this.InitSdf( sdf.port2, sdfRender.port1, sdfPhysics.port1 );
	}

	private InitRender(
		canvas: HTMLCanvasElement,
		devMode: boolean,
		gameLogicPort: MessagePort,
		sdfPort: MessagePort,
	): void {
		const offscreenCanvas = canvas.transferControlToOffscreen();
		const message: MainToRenderMessage = {
			type: RenderMsg.Init,
			canvas: offscreenCanvas,
			gameLogicPort,
			sdfPort,
			devMode,
			width: canvas.clientWidth,
			height: canvas.clientHeight,
			devicePixelRatio: window.devicePixelRatio,
			// ?uncapped: no frame rate limit (the perf harness measures so)
			uncapped: new URLSearchParams( location.search ).has( "uncapped" ),
			// ?aa=msaa / ?aa=off: multisampled edges, or none
			antialias: Antialias(
				new URLSearchParams( location.search ).get( "aa" ),
			),
		};
		this.RenderWorker.postMessage(
			message,
			[offscreenCanvas, gameLogicPort, sdfPort],
		);
	}

	private InitPhysics(
		gameLogicPort: MessagePort,
		sdfPort: MessagePort,
	): void {
		const message: MainToPhysicsMessage = {
			type: PhysicsMsg.Init,
			gameLogicPort,
			sdfPort,
			settings: { gravity: [...DefaultGravity] },
			fixedTimestepMs: PhysicsFixedTimestepMs,
		};
		this.PhysicsWorker.postMessage( message, [gameLogicPort, sdfPort] );
	}

	private InitGameLogic(
		renderPort: MessagePort,
		physicsPort: MessagePort,
		audioPort: MessagePort,
		uiPort: MessagePort,
		sdfPort: MessagePort,
	): void {
		// the game's files (data assets) sit next to the page
		const baseUrl = new URL( ".", document.baseURI ).href;
		const message: MainToGameLogicMessage = {
			type: GameLogicMsg.Init,
			renderPort,
			physicsPort,
			audioPort,
			uiPort,
			sdfPort,
			baseUrl,
			// ?scene=<id>: start in that scene (tests, the perf harness)
			startScene: new URLSearchParams( location.search ).get( "scene" ),
		};
		this.GameLogicWorker.postMessage(
			message,
			[renderPort, physicsPort, audioPort, uiPort, sdfPort],
		);
	}

	private InitAudio( gameLogicPort: MessagePort ): void {
		const message: MainToAudioMessage = {
			type: AudioMsg.Init,
			gameLogicPort,
		};
		this.AudioWorker.postMessage( message, [gameLogicPort] );
	}

	private InitUi( gameLogicPort: MessagePort ): void {
		const message: MainToUiMessage = { type: UiMsg.Init, gameLogicPort };
		this.UiWorker.postMessage( message, [gameLogicPort] );
	}

	private InitSdf(
		gameLogicPort: MessagePort,
		renderPort: MessagePort,
		physicsPort: MessagePort,
	): void {
		const message: MainToSdfMessage = {
			type: SdfMsg.Init,
			gameLogicPort,
			renderPort,
			physicsPort,
			baseUrl: new URL( ".", document.baseURI ).href,
		};
		this.SdfWorker.postMessage(
			message,
			[gameLogicPort, renderPort, physicsPort],
		);
	}

	/** Call once on page teardown (SPA navigation away, hot-reload, etc). */
	public Dispose(): void {
		this.RenderWorker.terminate();
		this.PhysicsWorker.terminate();
		this.GameLogicWorker.terminate();
		this.AudioWorker.terminate();
		this.UiWorker.terminate();
		this.SdfWorker.terminate();
	}
}
