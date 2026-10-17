// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { EditList } from "../Edits/EditList";
import type { SdfEdit, SdfEditInit } from "../Edits/SdfEdit";
import type { SdfHit } from "../Field/SdfField";
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

	public MaxEdits = 32;

	/** The scene being shown (it grows with every Load). */
	public Epoch = 0;

	/** Whether the current scene's world is ready (and an error, if not). */
	public Loaded = false;

	public LoadError: string | null = null;

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
		this.MaxEdits = scene?.MaxEdits ?? 32;
		this.Loaded = false;
		this.LoadError = null;
		this.Answer( null );
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
	 * Once per game frame: sends the edits since the last call and where the
	 * world matters most (the camera or the player).
	 */
	public Tick( focus: [ number, number, number ] ): void {
		const delta = this.Edits.TakeDelta();

		this._post( { Type: "tick", Delta: delta, Focus: focus }, [ delta ] );
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

	/** A message from the SDF worker. */
	public Handle( message: FromSdfWorker ): void {
		if ( message.Type === "loaded" ) {
			if ( message.Epoch === this.Epoch ) {
				this.Loaded = message.Error === null;
				this.LoadError = message.Error;
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

	/** Answers every waiting question with `result` (a scene went away). */
	private Answer( result: SdfQueryResult ): void {
		for ( const resolve of this._waiting.values() ) {
			resolve( result );
		}
		this._waiting.clear();
	}
}
