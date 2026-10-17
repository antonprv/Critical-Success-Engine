// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

const Tags = new Map<string, DataTag<unknown>>();
const TagsById: DataTag<unknown>[] = [];

/**
 * The label a message travels under. Publishers and subscribers share only the
 * tag, never a reference to each other. Tags are interned: one object per name
 * for the whole thread, with a small integer id, so a delivery is an array
 * lookup rather than a string hash. The type parameter is the message's type
 * (for the compiler only).
 */
export class DataTag<T> {
	private constructor(
		public readonly Name: string,
		public readonly Id: number,
	) {
	}

	/** The tag of this name (made on first use). */
	public static For<T>( name: string ): DataTag<T> {
		let tag = Tags.get( name );

		if ( !tag ) {
			tag = new DataTag<unknown>( name, TagsById.length );
			Tags.set( name, tag );
			TagsById.push( tag );
		}
		return tag as DataTag<T>;
	}

	/** The tag with this id (made earlier in this thread). */
	public static ById( id: number ): DataTag<unknown> {
		return TagsById[id]!;
	}

	public toString(): string {
		return this.Name;
	}

	/**
	 * Phantom member that keeps DataTag<A> and DataTag<B> apart for the
	 * compiler.
	 */
	declare private readonly _type?: T;
}

/** A tag, or its name. */
export type TagLike<T> = DataTag<T> | string;

export function TagOf<T>( tag: TagLike<T> ): DataTag<T> {
	return typeof tag === "string" ? DataTag.For<T>( tag ) : tag;
}
