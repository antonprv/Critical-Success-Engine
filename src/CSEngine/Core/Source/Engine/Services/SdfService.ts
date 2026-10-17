// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	SdfClient,
	type EditList,
	type FromSdfWorker,
	type SdfDistanceResult,
	type SdfEdit,
	type SdfEditInit,
	type SdfHit,
	type SdfSceneDescriptor,
} from "@cse/sdf";
import { Task } from "@cse/task";
import { Quat, type QuatTuple } from "../Math/Quat";
import { Vec3, type Vec3Tuple } from "../Math/Vec3";

/**
 * The scene's SDF world, as scripts see it (`this.Engine.Sdf`): edits made in
 * play - a hole dug, a tunnel that moves - and questions about the world.
 * The world itself lives in the SDF worker; here are only the recent edits
 * (the oldest fold into the world's base by themselves), so an edit's id is
 * known at once and nothing heavy runs on the scripts' thread. Questions
 * are answered a frame later. Without an SDF worker (or without SDF in the
 * scene) edits are kept but go nowhere, and questions answer null.
 */
export class SdfService {
	private readonly _client: SdfClient;

	/** How far ahead of the camera the world is meshed (the scene says). */
	private _focusAhead = 0;

	/** Where the scene's world is meshed first (while it loads). */
	private _start: Vec3Tuple = [ 0, 0, 0 ];

	public constructor( private readonly _port: MessagePort | null ) {
		this._client = new SdfClient(
			( message, transfer ) => _port?.postMessage( message, transfer ),
		);
		if ( _port ) {
			_port.onmessage = ( e: MessageEvent<FromSdfWorker> ) => (
				this._client.Handle( e.data )
			);
		}
	}

	/** The recent edits (the scene's own are baked into its base). */
	public get Edits(): EditList {
		return this._client.Edits;
	}

	/** Whether the current scene's SDF world is ready. */
	public get Loaded(): boolean {
		return this._client.Loaded;
	}

	/** Why the current scene's SDF world failed to load, if it did. */
	public get LoadError(): string | null {
		return this._client.LoadError;
	}

	/** Adds an edit (its id is set already). */
	public Add( init: SdfEditInit ): SdfEdit {
		return this._client.Add( init );
	}

	/** Changes an edit; false if it is gone (removed or folded). */
	public Update(
		id: number,
		changes: Partial<Omit<SdfEdit, "Id">>,
	): boolean {
		return this._client.Update( id, changes );
	}

	public Remove( id: number ): boolean {
		return this._client.Remove( id );
	}

	/** Where a ray meets the world, null if nowhere within `tMax`. */
	public Raycast(
		origin: Vec3Tuple,
		dir: Vec3Tuple,
		tMax = 1000,
	): Task<SdfHit | null> {
		return this._port
			? Task.From( this._client.Raycast( origin, dir, tMax ) )
			: Task.FromResult<SdfHit | null>( null );
	}

	/** The world's distance and material at a point. */
	public Distance( point: Vec3Tuple ): Task<SdfDistanceResult | null> {
		return this._port
			? Task.From( this._client.Distance( point ) )
			: Task.FromResult<SdfDistanceResult | null>( null );
	}

	/** A scene loads: its SDF world (null: none). The edits start empty. */
	public Load( scene: SdfSceneDescriptor | null ): void {
		this._focusAhead = scene?.FocusAhead ?? 0;
		this._start = scene?.Start ?? [ 0, 0, 0 ];
		this._client.Load( scene );
	}

	/**
	 * Completes once the area around the scene's start has been meshed (at
	 * once without an SDF worker or SDF in the scene, or if it failed to
	 * load): what the scene's entities wait for, so nothing falls through
	 * ground that isn't there yet.
	 */
	public WhenMeshed(): Task {
		return this._port
			? Task.From( this._client.WhenMeshed() )
			: Task.CompletedTask;
	}

	/** Once per frame while the scene loads: meshes around its start. */
	public TickLoading(): void {
		this._client.Tick( [ ...this._start ] );
	}

	/**
	 * Once per frame: the edits made since, and where to mesh - the camera,
	 * or the point the scene's FocusAhead in front of it (the camera looks
	 * along -Z).
	 */
	public Tick( position: Vec3Tuple, rotation: QuatTuple ): void {
		const ahead = Quat.FromTuple( rotation )
			.Rotate( new Vec3( 0, 0, -this._focusAhead ) );

		this._client.Tick( [
			position[0] + ahead.X,
			position[1] + ahead.Y,
			position[2] + ahead.Z,
		] );
	}
}
