// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	CreateMeshWorker,
	SdfWorkerHost,
	type PhysicsToSdf,
	type ToSdfWorker,
} from "@cse/sdf";
import { Logger } from "../Logging/Logger";
import type { MainToSdfMessage } from "./Protocol/SdfWorkerProtocol";

/**
 * The SDF world's own worker (SdfWorkerHost does the work): GameLogic's
 * edits and questions come in on one port, chunks go out to the render and
 * physics workers on theirs, and a pool of mesh workers it starts meshes
 * them. Nothing heavy waits in GameLogic, where the scripts run.
 */
Logger.SetupAutoFlush();

self.onmessage = ( event: MessageEvent<MainToSdfMessage> ) => {
	const message = event.data;
	const { gameLogicPort, renderPort, physicsPort, baseUrl } = message;
	const host = new SdfWorkerHost( {
		ToGameLogic: ( reply ) => gameLogicPort.postMessage( reply ),
		ToRender: ( chunks, transfer ) => renderPort.postMessage(
			chunks,
			transfer,
		),
		ToPhysics: ( chunks, transfer ) => physicsPort.postMessage(
			chunks,
			transfer,
		),
	}, {
		Spawn: CreateMeshWorker,
		Fetch: async ( url ) => {
			const response = await fetch( new URL( url, baseUrl ) );

			if ( !response.ok ) {
				throw new Error( `${ url }: HTTP ${ response.status }` );
			}
			return response.arrayBuffer();
		},
	} );

	gameLogicPort.onmessage = ( e: MessageEvent<ToSdfWorker> ) => {
		host.HandleGameLogic( e.data ).catch(
			( error ) => Logger.LogException( error, "[SdfWorker]" ),
		);
	};
	physicsPort.onmessage = ( e: MessageEvent<PhysicsToSdf> ) => (
		host.HandlePhysics( e.data )
	);
};
