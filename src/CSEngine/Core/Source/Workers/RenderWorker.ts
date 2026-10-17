// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { Logger } from "../Logging/Logger";
import { RenderMsg, RendOpType as RendOp } from "./Common/CommonEnums";
import { EntityMeshRegistry } from "./Render/EntityMeshRegistry";
import { RenderScene } from "./Render/RenderScene";
import { ExposePerf } from "../Engine/Diagnostics/PerfProbe";
import type {
	CameraPose,
	GameLogicToRenderMessage,
	RenderToGameLogicMessage,
} from "./Protocol/RenderGameLogicProtocol";
import type { MainToRenderMessage } from "./Protocol/RenderProtocol";

// Own static buffer per realm - App.ts's timer doesn't flush this one.
Logger.SetupAutoFlush();

/**
 * The render worker owns the display clock: once per displayed frame it
 * requests a frame from GameLogic (at most MaxOutstanding unanswered, so a slow
 * GameLogic can't build a queue) and draws the latest one received.
 */
const MaxOutstanding = 2;

// Only for "resize", which may arrive before "init"; everything after init gets
// the scene and registry passed in.
let renderScene: RenderScene | null = null;

let nextFrameId = 1;
let outstanding = 0;
let pendingFrame: {
	buffer: ArrayBuffer;
	entityCount: number;
	camera: CameraPose | null;
} | null = null;

self.onmessage = ( event: MessageEvent<MainToRenderMessage> ) => {
	const message = event.data;

	switch ( message.type ) {
		case RenderMsg.Init:
			Init( message );
			break;
		case RenderMsg.Resize:
			renderScene?.Resize(
				message.width,
				message.height,
				message.devicePixelRatio,
			);
			break;
		case RenderMsg.SetInspectorVisible:
			// Inspector needs `document`, which a worker doesn't have -
			// intentionally a no-op (see RenderScene).
			break;
	}
};

function Init(
	message: Extract<MainToRenderMessage, { type: RenderMsg.Init; }>,
): void {
	const scene = new RenderScene(
		message.canvas,
		message.width,
		message.height,
		message.devicePixelRatio,
		RenderScene.WebGl( message.antialias === "msaa" ),
	);

	if ( ( message.antialias ?? "fxaa" ) === "fxaa" ) {
		scene.UseFxaa();
	}

	if ( message.uncapped ) {
		scene.Uncap();
	}
	const registry = new EntityMeshRegistry( scene.Scene, scene.AssetLoader );
	renderScene = scene;
	const gameLogicPort = message.gameLogicPort;
	const Post = ( reply: RenderToGameLogicMessage ): void => (
		gameLogicPort.postMessage( reply )
	);

	registry.OnGltfLoaded = ( entityId ) => Post(
		{ type: RenderMsg.AssetLoaded, entityId },
	);
	gameLogicPort.onmessage = ( e: MessageEvent<GameLogicToRenderMessage> ) => {
		HandleGameLogicMessage( e.data, scene, registry, Post );
		// something new to draw (uncapped, the loop sleeps until then)
		scene.Wake();
	};

	scene.RunRenderLoop( () => BeforeRender( scene, registry, Post ) );
	ExposePerf( "Render", scene.Perf, () => scene.GpuInfo );
	Post( { type: RenderMsg.Ready } );
}

/**
 * Applies the newest game state (true when there was one) and asks for more.
 */
function BeforeRender(
	scene: RenderScene,
	registry: EntityMeshRegistry,
	Post: ( message: RenderToGameLogicMessage ) => void,
): boolean {
	const fresh = pendingFrame !== null;

	if ( pendingFrame ) {
		registry.ApplyTransformBatch(
			pendingFrame.buffer,
			pendingFrame.entityCount,
		);
		if ( pendingFrame.camera ) {
			scene.PoseCamera( pendingFrame.camera );
		}
		pendingFrame = null;
	}

	if ( outstanding < MaxOutstanding ) {
		outstanding++;
		Post(
			{
				type: RenderMsg.FrameRequest,
				frameId: nextFrameId++,
				time: performance.now(),
			},
		);
	}
	return fresh;
}

function HandleGameLogicMessage(
	message: GameLogicToRenderMessage,
	renderScene: RenderScene,
	registry: EntityMeshRegistry,
	Post: ( message: RenderToGameLogicMessage ) => void,
): void {

	switch ( message.operation ) {
		case RendOp.SpawnEntity:
			registry.Spawn(
				message.entityId,
				message.mesh,
				message.transform,
				message.color,
			);
			break;
		case RendOp.RemoveEntity:
			registry.Remove( message.entityId );
			break;
		case RendOp.SetVisible:
			registry.SetVisible( message.entityId, message.visible );
			break;
		case RendOp.SetColor:
			registry.SetColor( message.entityId, message.color );
			break;
		case RendOp.SetEnvironment:
			renderScene.SetClearColor( ...message.clearColor );
			break;
		case RendOp.ClearScene:
			registry.Clear();
			pendingFrame = null;
			break;
		case RendOp.Frame:
			outstanding = FMath.Max( 0, outstanding - 1 );
			// Latest frame wins: an older one that was never drawn is simply
			// superseded.
			pendingFrame = {
				buffer: message.buffer,
				entityCount: message.entityCount,
				camera: message.camera,
			};
			break;
		case RendOp.Sync:
			Post( { type: RenderMsg.SyncAck, token: message.token } );
			break;
	}
}
