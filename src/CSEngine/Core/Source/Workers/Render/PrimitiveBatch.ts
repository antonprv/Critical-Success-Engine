// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { Material } from "@babylonjs/core/Materials/material";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";

type Tuple3 = [number, number, number];

/** What the batch knows of an instance (for tests and tools). */
export interface InstanceInfo {
	Position: Tuple3;
	Rotation: [number, number, number, number];
	Color: Tuple3;
	Visible: boolean;
}

const PoseStride = 7;
const One = Vector3.One();

/**
 * Many entities of one shape drawn as one mesh: thin instances, each with its
 * own matrix and colour (the material's white times it). One draw call and no
 * per-entity scene object, where a mesh per entity costs Babylon a draw call
 * and its bookkeeping every frame. Slots are dense: a removed instance's slot
 * takes the last one.
 */
export class PrimitiveBatch {
	private _matrices: Float32Array;

	private _colors: Float32Array;

	private _poses: Float64Array;

	private _visible: boolean[] = [];

	private readonly _ids: number[] = [];

	private _dirty = false;

	private readonly _matrix = new Matrix();

	private readonly _rotation = new Quaternion();

	private readonly _position = new Vector3();

	public constructor(
		private readonly _mesh: Mesh,
		material: Material,
		private _capacity = 16,
	) {
		_mesh.material = material;
		// as a whole it is everywhere: the GPU drops what is off screen
		_mesh.alwaysSelectAsActiveMesh = true;
		this._matrices = new Float32Array( _capacity * 16 );
		this._colors = new Float32Array( _capacity * 4 );
		this._poses = new Float64Array( _capacity * PoseStride );
		this.Bind();
	}

	public get Count(): number {
		return this._ids.length;
	}

	/** The entity in a slot. */
	public IdAt( slot: number ): number {
		return this._ids[slot]!;
	}

	/** A new instance; returns its slot. */
	public Add(
		id: number,
		pose: readonly number[],
		color: readonly number[],
	): number {
		const slot = this._ids.length;

		if ( slot === this._capacity ) {
			this.Grow();
		}
		this._ids.push( id );
		this._visible.push( true );
		this.SetPose(
			slot,
			pose[0]!,
			pose[1]!,
			pose[2]!,
			pose[3]!,
			pose[4]!,
			pose[5]!,
			pose[6]!,
		);
		this.SetColor( slot, color );
		return slot;
	}

	public SetPose(
		slot: number, px: number, py: number, pz: number,
		qx: number, qy: number, qz: number, qw: number,
	): void {
		this._poses.set( [px, py, pz, qx, qy, qz, qw], slot * PoseStride );
		if ( this._visible[slot] ) {
			this.WriteMatrix( slot );
		}
	}

	public SetColor( slot: number, color: readonly number[] ): void {
		this._colors.set( [color[0]!, color[1]!, color[2]!, 1], slot * 4 );
		this._dirty = true;
	}

	/**
	 * A hidden instance has a zero-scale matrix (nothing is drawn); its pose is
	 * kept.
	 */
	public SetVisible( slot: number, visible: boolean ): void {
		this._visible[slot] = visible;
		if ( visible ) {
			this.WriteMatrix( slot );
		}
		else {
			this._matrices.fill( 0, slot * 16, slot * 16 + 16 );
			this._dirty = true;
		}
	}

	/**
	 * Removes an instance: the last one moves into its slot. Returns the entity
	 * that moved (now in `slot`), or null when it was the last.
	 */
	public Remove( slot: number ): number | null {
		const last = this._ids.length - 1;
		let moved: number | null = null;

		if ( slot !== last ) {
			moved = this._ids[last]!;
			this._ids[slot] = moved;
			this._visible[slot] = this._visible[last]!;
			this._matrices.copyWithin( slot * 16, last * 16, last * 16 + 16 );
			this._colors.copyWithin( slot * 4, last * 4, last * 4 + 4 );
			this._poses.copyWithin(
				slot * PoseStride,
				last * PoseStride,
				last * PoseStride + PoseStride,
			);
		}
		this._ids.pop();
		this._visible.pop();
		this._dirty = true;
		return moved;
	}

	public Describe( slot: number ): InstanceInfo {
		const pose = this._poses.subarray(
			slot * PoseStride,
			slot * PoseStride + PoseStride,
		);
		const color = this._colors.subarray( slot * 4, slot * 4 + 3 );
		const round = ( value: number ): number => FMath.Round(
			value * 1000,
		) / 1000;

		return {
			Position: [pose[0]!, pose[1]!, pose[2]!],
			Rotation: [pose[3]!, pose[4]!, pose[5]!, pose[6]!],
			Color: [round( color[0]! ), round( color[1]! ), round( color[2]! )],
			Visible: this._visible[slot]!,
		};
	}

	/** Drops the mesh (the material is shared: it stays). */
	public Dispose(): void {
		this._mesh.dispose( false, false );
	}

	/** Hands what changed to the GPU (once per frame, before drawing). */
	public Flush(): void {
		if ( !this._dirty ) {
			return;
		}
		this._dirty = false;
		this._mesh.thinInstanceBufferUpdated( "matrix" );
		this._mesh.thinInstanceBufferUpdated( "color" );
		this._mesh.thinInstanceCount = this._ids.length;
	}

	private WriteMatrix( slot: number ): void {
		const pose = this._poses;
		const base = slot * PoseStride;
		this._position.set( pose[base]!, pose[base + 1]!, pose[base + 2]! );
		this._rotation.set(
			pose[base + 3]!,
			pose[base + 4]!,
			pose[base + 5]!,
			pose[base + 6]!,
		);
		Matrix.ComposeToRef(
			One,
			this._rotation,
			this._position,
			this._matrix,
		);
		this._matrix.copyToArray( this._matrices, slot * 16 );
		this._dirty = true;
	}

	private Grow(): void {
		this._capacity *= 2;
		const grow = <T extends Float32Array | Float64Array>(
			old: T,
			stride: number,
		): T => {
			const next = new ( old.constructor as new ( length: number ) => T )(
				this._capacity * stride,
			);
			next.set( old );
			return next;
		};
		this._matrices = grow( this._matrices, 16 );
		this._colors = grow( this._colors, 4 );
		this._poses = grow( this._poses, PoseStride );
		this.Bind();
	}

	private Bind(): void {
		this._mesh.thinInstanceSetBuffer( "matrix", this._matrices, 16, false );
		this._mesh.thinInstanceSetBuffer( "color", this._colors, 4, false );
		this._mesh.thinInstanceCount = this._ids.length;
	}
}
