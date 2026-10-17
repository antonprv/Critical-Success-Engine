// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { MeshWorkerHost, type ToMeshWorker } from "./MeshWorkerHost";

// A mesh worker: new Worker(new URL("./MeshWorker.ts", import.meta.url),
// { type: "module" }) - SdfMeshWorkers drives it.
const host = new MeshWorkerHost();
const port = self as unknown as {
	onmessage: ( ( event: MessageEvent<ToMeshWorker> ) => void ) | null;
	postMessage( message: unknown, transfer: Transferable[] ): void;
};

port.onmessage = ( event ) => {
	const reply = host.Handle( event.data );

	if ( reply ) {
		port.postMessage( reply.Message, reply.Transfer );
	}
};
