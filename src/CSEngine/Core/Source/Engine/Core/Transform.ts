// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Quat } from "../Math/Quat";
import { Vec3 } from "../Math/Vec3";

/**
 * Physics poses kept to draw from: the two a frame falls between, and a burst.
 */
const HistoryLength = 4;

/** An entry of the history: the step, x, y, z, qx, qy, qz, qw. */
const HistoryStride = 8;

/**
 * World-space transform (no hierarchy yet). Physics-driven entities keep the
 * last few steps' poses, each with its step, and `WriteInterpolated` draws
 * the pose at a step time between them: steps that come late or several at
 * once (the physics worker catches up in bursts) don't show on screen.
 */
export class Transform {
	public Position = new Vec3();

	public Rotation = Quat.Identity();

	public PreviousPosition = new Vec3();

	public PreviousRotation = Quat.Identity();

	/**
	 * True once something (a physics body component) feeds this transform with
	 * PushPhysicsPose.
	 */
	public IsPhysicsDriven = false;

	/**
	 * The pose the renderer was last sent (x, y, z, qx, qy, qz, qw), or null
	 * before the first: a frame sends only poses that differ from it.
	 */
	public SentPose: Float64Array | null = null;

	/** The last physics poses, oldest first (HistoryStride numbers each). */
	private readonly _history = new Float64Array(
		HistoryLength * HistoryStride,
	);

	private _historyCount = 0;

	/**
	 * The pose of a physics step (TimeInfo.PhysicsStepCount; by default the
	 * one after the last).
	 */
	public PushPhysicsPose(
		position: Vec3,
		rotation: Quat,
		step = this.LastStep() + 1,
	): void {
		this.PreviousPosition.CopyFrom( this.Position );
		this.PreviousRotation.CopyFrom( this.Rotation );
		// steps without a pose (it slept): it stood where it was until now
		if ( this._historyCount > 0 && step - this.LastStep() > 1 ) {
			this.Remember( step - 1, this.Position, this.Rotation );
		}
		this.Position.CopyFrom( position );
		this.Rotation.CopyFrom( rotation );
		this.Remember( step, position, rotation );
		this.IsPhysicsDriven = true;
	}

	/**
	 * Snap both poses to the same value (spawn / teleport) so no interpolation
	 * streak is drawn.
	 */
	public Teleport( position: Vec3, rotation?: Quat ): void {
		this.Position.CopyFrom( position );
		this.PreviousPosition.CopyFrom( position );
		if ( rotation ) {
			this.Rotation.CopyFrom( rotation );
			this.PreviousRotation.CopyFrom( rotation );
		}
		// drawn where it is now, whatever the step
		if ( this._historyCount > 0 ) {
			const step = this.LastStep();

			this._historyCount = 0;
			this.Remember( step, this.Position, this.Rotation );
		}
	}

	/**
	 * Pose to draw this frame: physics-driven, the pose at step time `at`
	 * (TimeInfo.RenderStep) between the two steps around it - the newest past
	 * them, the oldest before; else the pose as it is.
	 */
	public WriteInterpolated(
		at: number,
		out: Float64Array,
		offset: number,
	): void {
		if ( !this.IsPhysicsDriven || this._historyCount === 0 ) {
			out[offset] = this.Position.X;
			out[offset + 1] = this.Position.Y;
			out[offset + 2] = this.Position.Z;
			out[offset + 3] = this.Rotation.X;
			out[offset + 4] = this.Rotation.Y;
			out[offset + 5] = this.Rotation.Z;
			out[offset + 6] = this.Rotation.W;
			return;
		}

		const h = this._history;
		let i = this._historyCount - 1;

		// the newest entry at or before `at` (the oldest if none is)
		while ( i > 0 && h[i * HistoryStride]! > at ) {
			i--;
		}

		const a = i * HistoryStride;

		if ( i === this._historyCount - 1 || h[a]! >= at ) {
			out.set( h.subarray( a + 1, a + HistoryStride ), offset );
			return;
		}

		const b = a + HistoryStride;
		const t = ( at - h[a]! ) / ( h[b]! - h[a]! );

		for ( let k = 1; k <= 3; k++ ) {
			out[offset + k - 1] = h[a + k]! + ( h[b + k]! - h[a + k]! ) * t;
		}

		const q = Quat.Slerp(
			new Quat( h[a + 4]!, h[a + 5]!, h[a + 6]!, h[a + 7]! ),
			new Quat( h[b + 4]!, h[b + 5]!, h[b + 6]!, h[b + 7]! ),
			t,
		);

		out[offset + 3] = q.X;
		out[offset + 4] = q.Y;
		out[offset + 5] = q.Z;
		out[offset + 6] = q.W;
	}

	/** The step of the newest pose kept (-1: none). */
	private LastStep(): number {
		return this._historyCount > 0
			? this._history[( this._historyCount - 1 ) * HistoryStride]!
			: -1;
	}

	/**
	 * Keeps a step's pose: the same step again replaces it, a full history
	 * drops its oldest.
	 */
	private Remember( step: number, position: Vec3, rotation: Quat ): void {
		const h = this._history;

		if ( this._historyCount > 0 && this.LastStep() === step ) {
			this._historyCount--;
		} else if ( this._historyCount === HistoryLength ) {
			h.copyWithin( 0, HistoryStride );
			this._historyCount--;
		}

		const e = this._historyCount * HistoryStride;

		h[e] = step;
		h[e + 1] = position.X;
		h[e + 2] = position.Y;
		h[e + 3] = position.Z;
		h[e + 4] = rotation.X;
		h[e + 5] = rotation.Y;
		h[e + 6] = rotation.Z;
		h[e + 7] = rotation.W;
		this._historyCount++;
	}

	public ToFlat(): [number, number, number, number, number, number, number] {
		return [
			this.Position.X, this.Position.Y, this.Position.Z,
			this.Rotation.X, this.Rotation.Y, this.Rotation.Z, this.Rotation.W,
		];
	}
}
