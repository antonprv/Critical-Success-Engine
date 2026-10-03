// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Component } from "../Core/Component";
import type { Entity } from "../Core/Entity";
import { Quat } from "../Math/Quat";
import { Vec3, type Vec3Tuple } from "../Math/Vec3";

/**
 * Keeps this entity glued to another one (there is no transform hierarchy): `Offset` is in the target's local space when
 * `FollowRotation` is on. Uses the target's interpolated pose so a physics-driven target and its follower never drift apart
 * on screen. Typical use: the little "forward" marker on the player capsule.
 */
export class Follower extends Component {
	public TargetName = "Player";
	public Offset: Vec3Tuple = [0, 0, 0];
	public FollowRotation = true;

	private _target: Entity | undefined;
	private readonly _scratch = new Float64Array(7);

	public override Update(_dt: number): void {
		this._target ??= this.Engine.World.FindByName(this.TargetName);
		if (!this._target) return;

		this._target.Transform.WriteInterpolated(this.Engine.Time.RenderAlpha, this._scratch, 0);
		const s = this._scratch;
		const rotation = this.FollowRotation ? new Quat(s[3]!, s[4]!, s[5]!, s[6]!) : Quat.Identity();
		const offset = rotation.Rotate(Vec3.FromTuple(this.Offset));

		this.Transform.Position.Set(s[0]! + offset.X, s[1]! + offset.Y, s[2]! + offset.Z);
		this.Transform.Rotation.CopyFrom(rotation);
	}
}
