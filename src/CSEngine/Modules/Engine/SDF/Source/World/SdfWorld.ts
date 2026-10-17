// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { SdfBakedLayer } from "../Bake/SdfBakedLayer";
import { EditList } from "../Edits/EditList";
import {
	SdfEditFlags,
	type SdfEdit,
	type SdfEditInit,
} from "../Edits/SdfEdit";
import { SdfField } from "../Field/SdfField";

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
	public readonly Edits = new EditList();

	public readonly Field: SdfField;

	public MaxEdits: number;

	public constructor(
		public readonly Base: SdfBakedLayer,
		options: SdfWorldOptions = {},
	) {
		this.MaxEdits = options.MaxEdits ?? 32;
		this.Field = new SdfField( this.Edits, Base );
		this.Edits.OnFold = ( edit, reach ) => Base.Fold( edit, reach );
	}

	/** A replica for another worker: the base read back from its bytes. */
	public static FromBase(
		base: ArrayBuffer,
		options: SdfWorldOptions = {},
	): SdfWorld {
		return new SdfWorld( SdfBakedLayer.Deserialize( base ), options );
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
		let folded = 0;

		while ( this.Edits.Count > this.MaxEdits ) {
			const oldest = this.Edits.Edits.find( ( edit ) => (
				edit.Flags & ( SdfEditFlags.Keep | SdfEditFlags.Preview ) )
					=== 0 );

			if ( !oldest ) {
				break;
			}
			this.Edits.Fold( oldest.Id );
			folded++;
		}
		return folded;
	}
}
