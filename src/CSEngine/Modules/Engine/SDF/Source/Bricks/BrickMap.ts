// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";

/** A cell far outside every surface: rays cross it at once. */
export const CELL_EMPTY = 0xffffffff;

/** A cell far inside a solid: a ray that reaches it has hit. */
export const CELL_SOLID = 0xfffffffe;

/** Not generated yet: drawn with a fallback (plan.md 5.3). */
export const CELL_PENDING = 0xfffffffd;

/** Brick cells: set while the brick is older than the edits (plan.md 6.4). */
export const CELL_STALE = 0x80000000;

/** Values from here up are the special cells. */
const SpecialFrom = 0xfffffff0;

/** Whether a cell value points at a brick of the atlas. */
export function IsBrickCell( value: number ): boolean {
	return value < SpecialFrom;
}

/** The atlas slot of a brick cell. */
export function CellSlot( value: number ): number {
	return ( value & ~CELL_STALE ) >>> 0;
}

/**
 * One level of the brick map (plan.md 5.3, 5.4): a window of M^3 cells, each
 * a brick's worth of space, holding an atlas slot or EMPTY / SOLID / PENDING.
 * The window is addressed toroidally (cell coordinate mod M), so moving it
 * only touches the slice that came in; nothing is copied.
 */
export class BrickMap {
	/** Cell values (Uint32), indexed toroidally. */
	public readonly Cells: Uint32Array;

	/** World cell coordinates of the window's lowest corner. */
	private readonly _origin: [ number, number, number ] = [ 0, 0, 0 ];

	/**
	 * @param Size Cells along each axis of the window (M).
	 * @param CellSize World size of a cell: 8 sample spacings.
	 */
	public constructor(
		public readonly Size: number,
		public readonly CellSize: number,
	) {
		this.Cells = new Uint32Array( Size * Size * Size ).fill( CELL_PENDING );
	}

	public get Origin(): Readonly<[ number, number, number ]> {
		return this._origin;
	}

	/** The world cell that holds a point. */
	public CellOf( x: number, y: number, z: number ): [
		number,
		number,
		number,
	] {
		return [
			FMath.Floor( x / this.CellSize ),
			FMath.Floor( y / this.CellSize ),
			FMath.Floor( z / this.CellSize ),
		];
	}

	public Contains( cx: number, cy: number, cz: number ): boolean {
		const [ ox, oy, oz ] = this._origin;
		const m = this.Size;

		return cx >= ox && cx < ox + m
			&& cy >= oy && cy < oy + m
			&& cz >= oz && cz < oz + m;
	}

	/** Where a world cell's value lives in Cells. */
	public Index( cx: number, cy: number, cz: number ): number {
		const m = this.Size;

		return Wrap( cx, m ) + Wrap( cy, m ) * m + Wrap( cz, m ) * m * m;
	}

	/** A cell's value; PENDING outside the window. */
	public Get( cx: number, cy: number, cz: number ): number {
		return this.Contains( cx, cy, cz )
			? this.Cells[this.Index( cx, cy, cz )]!
			: CELL_PENDING;
	}

	/** Sets a cell inside the window (ignored outside). */
	public Set( cx: number, cy: number, cz: number, value: number ): void {
		if ( this.Contains( cx, cy, cz ) ) {
			this.Cells[this.Index( cx, cy, cz )] = value >>> 0;
		}
	}

	/**
	 * Moves the window's corner. The cells that came in turn PENDING and are
	 * returned (what to generate); `freed` gets the atlas slots of the bricks
	 * that went out.
	 */
	public MoveTo(
		ox: number,
		oy: number,
		oz: number,
		freed: number[] = [],
	): Array<[ number, number, number ]> {
		const entered: Array<[ number, number, number ]> = [];
		const m = this.Size;

		for ( let z = oz; z < oz + m; z++ ) {
			for ( let y = oy; y < oy + m; y++ ) {
				for ( let x = ox; x < ox + m; x++ ) {
					if ( this.Contains( x, y, z ) ) {
						continue;
					}

					const index = this.Index( x, y, z );
					const old = this.Cells[index]!;

					if ( IsBrickCell( old ) ) {
						freed.push( CellSlot( old ) );
					}
					this.Cells[index] = CELL_PENDING;
					entered.push( [ x, y, z ] );
				}
			}
		}
		this._origin[0] = ox;
		this._origin[1] = oy;
		this._origin[2] = oz;
		return entered;
	}
}

/** a mod m, never negative. */
function Wrap( a: number, m: number ): number {
	return ( ( a % m ) + m ) % m;
}
