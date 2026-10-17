// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { MessagePackReader, MessagePackWriter } from "@cse/datastream";

// The protocol between this runtime and the C# ScriptHost
// (CSharp/Protocol.cs, where it is described): one call per phase, an array of
// commands in, a map of results out. Both sides must change together.

export const enum Command {
	Create = 0,
	Lifecycle = 1,
	Hook = 2,
	Event = 3,
	Enabled = 4,
	Destroy = 5,
	Transforms = 6,
	Stream = 7,
	Input = 8,
	Time = 9,
}

export const enum Lifecycle {
	Awake = 0,
	Start = 1,
}

export const enum Hook {
	InputUpdate = 0,
	Update = 1,
	UIUpdate = 2,
	PhysicsUpdate = 3,
}

export const enum OverlapEvent {
	TriggerEnter = 0,
	TriggerExit = 1,
	CollisionEnter = 2,
	CollisionExit = 3,
}

export const enum LogLevel {
	Info = 0,
	Warning = 1,
	Error = 2,
}

/**
 * Numbers per transform record: entity, position (3), rotation (x, y, z, w).
 */
export const TransformStride = 8;

/** The input state C# components see in OnInputUpdate. */
export interface InputSnapshot {
	Down: string[];
	JustPressed: string[];
	Values: Record<string, number>;
	Move: [number, number];
}

/**
 * A phase's commands, written as they come; Take() gives the batch and starts
 * the next one.
 */
export class CommandWriter {
	private readonly _body = new MessagePackWriter();

	private readonly _batch = new MessagePackWriter();

	private _count = 0;

	public get Count(): number {
		return this._count;
	}

	public Create(
		component: number,
		entity: number,
		entityName: string,
		className: string,
		fields: Record<string, unknown> | null,
	): this {
		return this.Add(
			Command.Create,
			component,
			entity,
			entityName,
			className,
			fields,
		);
	}

	public Lifecycle( component: number, kind: Lifecycle ): this {
		return this.Add( Command.Lifecycle, component, kind );
	}

	public Hook( hook: Hook, dt: number ): this {
		return this.Add( Command.Hook, hook, dt );
	}

	public Event(
		component: number,
		kind: OverlapEvent,
		other: number,
		otherName: string,
	): this {
		return this.Add( Command.Event, component, kind, other, otherName );
	}

	public Enabled( component: number, enabled: boolean ): this {
		return this.Add( Command.Enabled, component, enabled );
	}

	public Destroy( component: number ): this {
		return this.Add( Command.Destroy, component );
	}

	/**
	 * Transform records (see {@link TransformStride}), as float64
	 * little-endian.
	 */
	public Transforms( records: Float64Array ): this {
		return this.Add(
			Command.Transforms,
			new Uint8Array(
				records.buffer,
				records.byteOffset,
				records.byteLength,
			),
		);
	}

	/** A DataStream batch for C#. */
	public Stream( batch: Uint8Array ): this {
		return this.Add( Command.Stream, batch );
	}

	public Input( input: InputSnapshot ): this {
		return this.Add(
			Command.Input,
			input.Down,
			input.JustPressed,
			input.Values,
			input.Move[0],
			input.Move[1],
		);
	}

	public Time(
		elapsed: number,
		frameCount: number,
		physicsStepCount: number,
	): this {
		return this.Add( Command.Time, elapsed, frameCount, physicsStepCount );
	}

	/** The batch so far (a new array), and an empty writer for the next one. */
	public Take(): Uint8Array {
		this._batch.Reset();
		this._batch.WriteArrayHeader( this._count );
		this._batch.WriteRaw( this._body.Bytes );
		this._body.Reset();
		this._count = 0;
		return this._batch.Bytes.slice();
	}

	private Add( command: Command, ...values: unknown[] ): this {
		this._body.WriteArrayHeader( values.length + 1 );
		this._body.WriteNumber( command );
		// (C# reads numbers by what it expects, whether they came as integers
		// or floats)
		for ( const value of values ) {
			this._body.Write( value );
		}
		this._count++;
		return this;
	}
}

/** What a phase gave back. */
export interface ScriptResults {
	/** Transform records of the entities C# moved. */
	Transforms: Float64Array;
	/** DataStream batches from C#. */
	Stream: Uint8Array[];
	Toasts: string[];
	Hud: Record<string, string>;
	Logs: [LogLevel, string][];
	/** Entities C# asked to destroy. */
	Destroy: number[];
	/** Component id, message. */
	Errors: [number, string][];
}

export function ReadResults( bytes: Uint8Array ): ScriptResults {
	const map = new MessagePackReader( bytes ).Read() as Record<
		string,
		unknown
	>;
	const transforms = map["Transforms"] as Uint8Array;
	// copied out of the result buffer into an aligned array
	const records = new Float64Array( transforms.byteLength / 8 );
	new Uint8Array( records.buffer ).set( transforms );

	return {
		Transforms: records,
		Stream: map["Stream"] as Uint8Array[],
		Toasts: map["Toasts"] as string[],
		Hud: map["Hud"] as Record<string, string>,
		Logs: map["Logs"] as [LogLevel, string][],
		Destroy: map["Destroy"] as number[],
		Errors: map["Errors"] as [number, string][],
	};
}
