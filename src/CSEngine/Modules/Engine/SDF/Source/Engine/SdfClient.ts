// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { EditList } from "../Edits/EditList";
import {
	SdfDynamicEdits,
	type SdfDynamicEdit,
	type SdfDynamicInit,
} from "../Edits/SdfDynamicEdits";
import type { SdfEdit, SdfEditInit } from "../Edits/SdfEdit";
import { SplatEdit, type SdfSplatInit } from "../Edits/SdfSplat";
import type { SdfHit } from "../Field/SdfField";
import type { StandingOptions, StandingPlace } from "../Field/Standing";
import { FoldExcess } from "../World/SdfWorld";
import type {
	FromSdfWorker,
	SdfDistanceResult,
	SdfQuery,
	SdfQueryResult,
	SdfSceneDescriptor,
	ToSdfWorker,
} from "./SdfProtocol";

/**
 * The game's side of the SDF world, in GameLogic: only the recent edits (at
 * most MaxEdits; the oldest are folded - dropped here, merged into the base
 * in the SDF worker, which gets the folds in the deltas), ids handed out at
 * once, and questions answered by the SDF worker a frame later.
 */
export class SdfClient {
	/** The recent edits; replaced by every Load. */
	public Edits = new EditList();

	/**
	 * The dynamic edits: never sent to the SDF worker, drawn by the renderer
	 * (TakeDynamic). Cleared by every Load.
	 */
	public readonly Dynamic = new SdfDynamicEdits();

	public MaxEdits = 32;

	/** The scene being shown (it grows with every Load). */
	public Epoch = 0;

	/** Whether the current scene's world is ready (and an error, if not). */
	public Loaded = false;

	public LoadError: string | null = null;

	/** Whether the current scene's first area has been meshed. */
	public Meshed = false;

	/**
	 * Where the scene starts after all: the place to stand its
	 * StartOnSurface found (null: none asked or none found).
	 */
	public Start: [ number, number, number ] | null = null;

	private _whenMeshed: Array<() => void> = [];

	/** The dynamic edits' version the SDF worker was last told about. */
	private _physicsVersion = 0;

	private _hadPhysics = false;

	private _nextQuery = 1;

	private readonly _waiting = new Map<
		number,
		( result: SdfQueryResult ) => void
	>();

	public constructor(
		private readonly _post: (
			message: ToSdfWorker,
			transfer: Transferable[],
		) => void,
	) {
	}

	/** Shows a scene's SDF world (null: none). */
	public Load( scene: SdfSceneDescriptor | null ): void {
		this.Epoch++;
		this.Edits = new EditList();
		this.Dynamic.Clear();
		// a new scene's worker knows of none
		this._physicsVersion = this.Dynamic.Version;
		this._hadPhysics = false;
		this.MaxEdits = scene?.MaxEdits ?? 32;
		this.Loaded = false;
		this.LoadError = null;
		this.Meshed = false;
		this.Answer( null );
		if ( !scene ) {
			this.MarkMeshed();
		}
		this._post( { Type: "load", Epoch: this.Epoch, Scene: scene }, [] );
	}

	/** Adds an edit; the oldest fold into the base past MaxEdits. */
	public Add( init: SdfEditInit ): SdfEdit {
		const edit = this.Edits.Add( init );

		FoldExcess( this.Edits, this.MaxEdits );
		return edit;
	}

	public Update(
		id: number,
		changes: Partial<Omit<SdfEdit, "Id">>,
	): boolean {
		return this.Edits.Update( id, changes );
	}

	public Remove( id: number ): boolean {
		return this.Edits.Remove( id );
	}

	/**
	 * A splat sticks (SplatEdit): a real edit, kept with the recent ones and
	 * folded into the base when they are too many - so splats pile up as
	 * long as the game goes on.
	 */
	public Splat( splat: SdfSplatInit ): SdfEdit {
		return this.Add( SplatEdit( splat ) );
	}

	/** Adds a dynamic edit (at most MAX_DYNAMIC_EDITS at once). */
	public AddDynamic( init: SdfDynamicInit ): SdfDynamicEdit {
		return this.Dynamic.Add( init );
	}

	public UpdateDynamic(
		id: number,
		changes: Partial<Omit<SdfDynamicEdit, "Id">>,
	): boolean {
		return this.Dynamic.Update( id, changes );
	}

	public RemoveDynamic( id: number ): boolean {
		return this.Dynamic.Remove( id );
	}

	/**
	 * The dynamic edits packed for the renderer if they changed since the
	 * last call, else null.
	 */
	public TakeDynamic(): Float32Array | null {
		return this.Dynamic.TakeChanged() ? this.Dynamic.Packed() : null;
	}

	/**
	 * Once per game frame: sends the edits since the last call and where the
	 * world matters most (the camera or the player).
	 */
	public Tick( focus: [ number, number, number ] ): void {
		const delta = this.Edits.TakeDelta();
		const dynamic = this.TakePhysics();
		const transfer: Transferable[] = [ delta ];

		if ( dynamic ) {
			transfer.push( dynamic.buffer );
		}
		this._post(
			{ Type: "tick", Delta: delta, Focus: focus, Dynamic: dynamic },
			transfer,
		);
	}

	/**
	 * The dynamic edits the physics feels, packed, when they changed since
	 * the last tick (also when the last of them went: then none).
	 */
	private TakePhysics(): Float32Array | null {
		const dynamic = this.Dynamic;
		const has = dynamic.HasPhysics;

		if ( dynamic.Version === this._physicsVersion || ( !has
			&& !this._hadPhysics ) ) {
			this._physicsVersion = dynamic.Version;
			return null;
		}
		this._physicsVersion = dynamic.Version;
		this._hadPhysics = has;
		return dynamic.PackedPhysics();
	}

	/** Where a ray meets the world (null: nowhere within tMax). */
	public Raycast(
		origin: [ number, number, number ],
		dir: [ number, number, number ],
		tMax: number,
	): Promise<SdfHit | null> {
		return this.Ask( {
			Kind: "raycast",
			Origin: origin,
			Dir: dir,
			TMax: tMax,
		} ) as Promise<SdfHit | null>;
	}

	/** The world's distance and material at a point (null: no world). */
	public Distance(
		point: [ number, number, number ],
	): Promise<SdfDistanceResult | null> {
		return this.Ask( { Kind: "distance", Point: point } ) as Promise<
			SdfDistanceResult | null
		>;
	}

	/**
	 * A place to stand near a point (FindStandingPlace; null: none within
	 * the radius) - where to put a player down on a fractal.
	 */
	public FindStandingPlace(
		near: [ number, number, number ],
		options: StandingOptions = {},
	): Promise<StandingPlace | null> {
		return this.Ask( {
			Kind: "standing",
			Near: near,
			Options: options,
		} ) as Promise<StandingPlace | null>;
	}

	/**
	 * Resolves once the current scene's first area has been meshed (at once
	 * without an SDF world, or when it failed to load).
	 */
	public WhenMeshed(): Promise<void> {
		return this.Meshed
			? Promise.resolve()
			: new Promise( ( resolve ) => this._whenMeshed.push( resolve ) );
	}

	/** A message from the SDF worker. */
	public Handle( message: FromSdfWorker ): void {
		if ( message.Type === "loaded" ) {
			if ( message.Epoch === this.Epoch ) {
				this.Loaded = message.Error === null;
				this.LoadError = message.Error;
				this.Start = message.Start ?? null;
				if ( message.Error !== null ) {
					this.MarkMeshed();
				}
			}
			return;
		}
		if ( message.Type === "meshed" ) {
			if ( message.Epoch === this.Epoch ) {
				this.MarkMeshed();
			}
			return;
		}

		const resolve = this._waiting.get( message.Id );

		this._waiting.delete( message.Id );
		resolve?.( message.Result );
	}

	private Ask( query: SdfQuery ): Promise<SdfQueryResult> {
		const id = this._nextQuery++;

		return new Promise( ( resolve ) => {
			this._waiting.set( id, resolve );
			this._post( { Type: "query", Id: id, Query: query }, [] );
		} );
	}

	private MarkMeshed(): void {
		this.Meshed = true;
		for ( const resolve of this._whenMeshed.splice( 0 ) ) {
			resolve();
		}
	}

	/** Answers every waiting question with `result` (a scene went away). */
	private Answer( result: SdfQueryResult ): void {
		for ( const resolve of this._waiting.values() ) {
			resolve( result );
		}
		this._waiting.clear();
	}
}
