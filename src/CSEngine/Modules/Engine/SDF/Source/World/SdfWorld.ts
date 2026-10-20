// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { BAKED_MAGIC, SdfBakedLayer } from "../Bake/SdfBakedLayer";
import { SdfSparseLayer } from "../Bake/SdfSparseLayer";
import { EditList } from "../Edits/EditList";
import {
	SdfEditFlags,
	type SdfEdit,
	type SdfEditInit,
} from "../Edits/SdfEdit";
import { SdfField } from "../Field/SdfField";

/**
 * A base old edits fold into: the editor's bake over a box, or a sparse
 * layer over an analytic base (a fractal: no bounds).
 */
export type SdfFoldBase = SdfBakedLayer | SdfSparseLayer;

/** A base read back from its saved form, whichever kind it is. */
export function DeserializeBase( buffer: ArrayBuffer ): SdfFoldBase {
	return new DataView( buffer ).getUint32( 0, true ) === BAKED_MAGIC
		? SdfBakedLayer.Deserialize( buffer )
		: SdfSparseLayer.Deserialize( buffer );
}

export interface SdfWorldOptions {
	/**
	 * Edits kept as edits; past that the oldest ones are folded into the
	 * base. Default 32.
	 */
	MaxEdits?: number;
}

/**
 * The SDF world as the game holds it: the base the editor baked from all
 * its edits, and only the last few edits made in play on top of it. When
 * there are more than MaxEdits, the oldest are folded into the base - only
 * the cells they reach are sampled again - so the cost of every sample and
 * the size of every message stay small however long the game is played.
 * Edits flagged Keep (a moving hole) are never folded.
 *
 * Folds travel in the edit list's deltas: a worker holding a replica (the
 * same baked base, the deltas applied) folds the same edits in the same
 * order and stays identical.
 */
export class SdfWorld {
	public readonly Field: SdfField;

	public MaxEdits: number;

	/**
	 * @param Edits The recent edits to start with (by default none).
	 */
	public constructor(
		public readonly Base: SdfFoldBase,
		options: SdfWorldOptions = {},
		public readonly Edits = new EditList(),
	) {
		this.MaxEdits = options.MaxEdits ?? 32;
		this.Field = new SdfField( this.Edits, Base );
		this.Edits.OnFold = ( edit, reach ) => Base.Fold( edit, reach );
	}

	/**
	 * A replica for another worker: the base and the recent edits read back
	 * from their saved forms (the base's Serialize, EditList.Serialize).
	 */
	public static FromBase(
		base: ArrayBuffer,
		options: SdfWorldOptions = {},
		edits: ArrayBuffer | null = null,
	): SdfWorld {
		return new SdfWorld(
			DeserializeBase( base ),
			options,
			edits ? EditList.Deserialize( edits ) : new EditList(),
		);
	}

	/** Adds an edit, folding the oldest ones if there are now too many. */
	public Add( init: SdfEditInit ): SdfEdit {
		const edit = this.Edits.Add( init );

		this.FoldExcess();
		return edit;
	}

	/**
	 * Folds the oldest foldable edits until at most MaxEdits are left;
	 * returns how many it folded.
	 */
	public FoldExcess(): number {
		return FoldExcess( this.Edits, this.MaxEdits );
	}
}

/**
 * The world's fold policy on any edit list: folds the oldest edits (not Keep,
 * not Preview) until at most `max` are left; returns how many. A list
 * without a base (the game's thin copy in GameLogic) just drops them - the
 * folds go out in its deltas, and the world that has the base merges them.
 */
export function FoldExcess( edits: EditList, max: number ): number {
	let folded = 0;

	while ( edits.Count > max ) {
		const oldest = edits.Edits.find( ( edit ) => (
			edit.Flags & ( SdfEditFlags.Keep | SdfEditFlags.Preview ) ) === 0 );

		if ( !oldest ) {
			break;
		}
		edits.Fold( oldest.Id );
		folded++;
	}
	return folded;
}
