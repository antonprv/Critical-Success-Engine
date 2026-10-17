// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { DataStream } from "@cse/datastream";
import { ScriptBridge } from "./Bridge.ts";
import {
	CommandWriter, Hook, Lifecycle, ReadResults, TransformStride,
	type InputSnapshot, type LogLevel, type OverlapEvent,
} from "./ScriptProtocol.ts";

/** The .NET side: the game's C# components behind one call per phase. */
export interface ScriptBackend {
	/** The C# component classes it found (simple and full names). */
	readonly Names: string[];
	Run( commands: Uint8Array ): Uint8Array;
	/** TypeScript calling a contract implemented in C# (see Bridge.ts). */
	Call?( request: Uint8Array ): Uint8Array;
	/** Where C#'s calls of contracts implemented in TypeScript go. */
	Serve?( handler: ( request: Uint8Array ) => Uint8Array ): void;
}

/**
 * What the runtime needs from the engine around it (the game logic worker's
 * world, or a test's).
 */
export interface ScriptHostWorld {
	/**
	 * Writes the entity's position and rotation (x, y, z, x, y, z, w) at
	 * `offset`; false when it is gone.
	 */
	ReadTransform( entity: number, out: Float64Array, offset: number ): boolean;
	WriteTransform( entity: number, pose: Float64Array, offset: number ): void;
	DestroyEntity( entity: number ): void;
	Toast( text: string ): void;
	SetHud( key: string, text: string ): void;
	Log( level: LogLevel, text: string ): void;
	/**
	 * A C# component threw (or could not be made); `component` names it ("Class
	 * on \"Entity\"").
	 */
	ComponentFailed( component: string, message: string ): void;
}

export interface PhaseInfo {
	Elapsed: number;
	FrameCount: number;
	PhysicsStepCount: number;
	/**
	 * The player's input (the input phase sends it); a function is asked only
	 * when there are C# components to send it to.
	 */
	Input?: InputSnapshot | ( () => InputSnapshot ) | undefined;
}

/**
 * Runs C# components for the engine. A component's lifecycle and events are
 * queued as they happen; {@link RunHook}, once per phase after the TypeScript
 * components, sends them with the entities' transforms and the DataStream's
 * messages for C# in one call, and applies what comes back: moved transforms,
 * C#'s messages (delivered to TypeScript subscribers), HUD, toasts, logs,
 * destroyed entities. Without C# components and messages it costs nothing.
 */
export class ScriptRuntime {
	private readonly _commands = new CommandWriter();

	private readonly _backend: ScriptBackend;

	private readonly _world: ScriptHostWorld;

	private readonly _stream: DataStream;

	// set by the stream as it connects
	private _receive!: ( bytes: Uint8Array ) => void;

	// entity -> how many C# components it has
	private readonly _entities = new Map<number, number>();

	private _nextId = 1;

	// component -> "Class on "Entity"", for error reports
	private readonly _names = new Map<number, string>();

	private _live = 0;

	private _poses = new Float64Array( TransformStride * 16 );

	// inside a phase's call: C# calling TypeScript calling C# must not send
	// the queue again
	private _running = false;

	/**
	 * Calls between TypeScript and C# through contracts (.contract files).
	 * Before a call into C#, the queued commands go first (a component made
	 * this frame exists there), unless C# is the one running.
	 */
	public readonly Bridge: ScriptBridge;

	public constructor(
		backend: ScriptBackend,
		stream: DataStream,
		world: ScriptHostWorld,
	) {
		this._backend = backend;
		this._world = world;
		this._stream = stream;
		this.Bridge = new ScriptBridge( ( request ) => {
			if ( !backend.Call ) {
				throw new Error(
					"This C# runtime can't take calls (no bridge)",
				);
			}
			if ( !this._running && this._commands.Count > 0 ) {
				this.Send();
			}
			return backend.Call( request );
		} );
		backend.Serve?.( ( request ) => this.Bridge.Serve( request ) );
		stream.Connect( {
			Send: ( bytes ) => this._commands.Stream( bytes ),
			OnReceive: ( receive ) => {
				this._receive = receive;
			},
		} );
	}

	/** The C# component classes scenes can name. */
	public get Names(): string[] {
		return this._backend.Names;
	}

	/** Live C# components. */
	public get Count(): number {
		return this._live;
	}

	/**
	 * Makes a C# component on an entity; returns its id. It gets the entity's
	 * transform with it.
	 */
	public Create(
		entity: number,
		entityName: string,
		className: string,
		fields: Record<string, unknown> | null,
	): number {
		const id = this._nextId++;
		this._commands.Create( id, entity, entityName, className, fields );
		this._entities.set( entity, ( this._entities.get( entity ) ?? 0 ) + 1 );
		this._names.set( id, `${ className } on "${ entityName }"` );
		this._live++;
		const pose = new Float64Array( TransformStride );
		pose[0] = entity;
		if ( this._world.ReadTransform( entity, pose, 1 ) ) {
			this._commands.Transforms( pose );
		}
		return id;
	}

	public Awake( component: number ): void {
		this._commands.Lifecycle( component, Lifecycle.Awake );
	}

	public Start( component: number ): void {
		this._commands.Lifecycle( component, Lifecycle.Start );
	}

	public Event(
		component: number,
		kind: OverlapEvent,
		other: number,
		otherName: string,
	): void {
		this._commands.Event( component, kind, other, otherName );
	}

	public SetEnabled( component: number, enabled: boolean ): void {
		this._commands.Enabled( component, enabled );
	}

	public Destroy( component: number, entity: number ): void {
		this._commands.Destroy( component );
		this._names.delete( component );
		const left = this._entities.get( entity )! - 1;

		if ( left > 0 ) {
			this._entities.set( entity, left );
		}
		else {
			this._entities.delete( entity );
		}
		this._live--;
	}

	/** Runs a hook on the C# components (and everything queued before it). */
	public RunHook( hook: Hook, dt: number, phase: PhaseInfo ): void {
		this._stream.Flush();
		if ( this._live === 0 && this._commands.Count === 0 ) {
			return;
		}
		this._commands.Time(
			phase.Elapsed,
			phase.FrameCount,
			phase.PhysicsStepCount,
		);
		if ( phase.Input && hook === Hook.InputUpdate ) {
			this._commands.Input(
				typeof phase.Input === "function" ? phase.Input() : phase.Input,
			);
		}
		this.QueueTransforms();
		this._commands.Hook( hook, dt );
		this.Send();
	}

	/** Sends the queue and applies what comes back. */
	private Send(): void {
		this._running = true;
		try {
			this.Apply( this._backend.Run( this._commands.Take() ) );
		} finally {
			this._running = false;
		}
	}

	private QueueTransforms(): void {
		const needed = this._entities.size * TransformStride;

		if ( this._poses.length < needed ) {
			this._poses = new Float64Array( needed * 2 );
		}
		let offset = 0;

		for ( const entity of this._entities.keys() ) {
			this._poses[offset] = entity;
			if ( this._world.ReadTransform(
				entity,
				this._poses,
				offset + 1,
			) ) {
				offset += TransformStride;
			}
		}
		if ( offset > 0 ) {
			this._commands.Transforms( this._poses.subarray( 0, offset ) );
		}
	}

	private Apply( bytes: Uint8Array ): void {
		const results = ReadResults( bytes );
		const transforms = results.Transforms;

		for ( let offset = 0; offset
			< transforms.length; offset += TransformStride ) {
			this._world.WriteTransform(
				transforms[offset]!,
				transforms,
				offset + 1,
			);
		}
		for ( const batch of results.Stream ) {
			this._receive( batch );
		}
		for ( const text of results.Toasts ) {
			this._world.Toast( text );
		}
		for ( const [key, text] of Object.entries( results.Hud ) ) {
			this._world.SetHud( key, text );
		}
		for ( const [level, text] of results.Logs ) {
			this._world.Log( level, text );
		}
		for ( const [component, message] of results.Errors ) {
			this._world.ComponentFailed(
				this._names.get( component ) ?? `#${ component }`,
				message,
			);
		}
		for ( const entity of results.Destroy ) {
			this._world.DestroyEntity( entity );
		}
	}
}
