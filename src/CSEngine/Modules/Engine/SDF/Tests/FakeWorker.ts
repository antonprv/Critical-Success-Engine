// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	MeshWorkerHost,
	type FromMeshWorker,
	type MeshWorkerPort,
	type ToMeshWorker,
} from "../Source/Index";

/** A worker in the same thread: messages are cloned, replies come later. */
export class FakeWorker implements MeshWorkerPort {
	public readonly Host = new MeshWorkerHost();

	public onmessage: ( ( event: { data: FromMeshWorker; } ) => void )
		| null = null;

	public Terminated = false;

	/** Replies waiting for Flush (with Manual), else sent on a microtask. */
	public readonly Held: FromMeshWorker[] = [];

	public constructor( public Manual = false ) {
	}

	public postMessage( message: ToMeshWorker ): void {
		const reply = this.Host.Handle( structuredClone( message ) );

		if ( !reply ) {
			return;
		}

		const copy = structuredClone( reply.Message );

		if ( this.Manual ) {
			this.Held.push( copy );
		} else {
			queueMicrotask( () => this.onmessage?.( { data: copy } ) );
		}
	}

	public Flush( index = 0 ): void {
		const [ message ] = this.Held.splice( index, 1 );

		this.onmessage?.( { data: message! } );
	}

	public terminate(): void {
		this.Terminated = true;
	}
}
