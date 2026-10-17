// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Component } from "@cse/core/Engine/Core/Component";
import { Quat } from "@cse/core/Engine/Math/Quat";
import { Vec3 } from "@cse/core/Engine/Math/Vec3";

/**
 * Turns its entity around the vertical axis (a kinematic paddle stirring the
 * physics load).
 */
export class Spin extends Component {
	/** Radians per second. */
	public Speed = 1.5;

	private _angle = 0;

	public override Update( dt: number ): void {
		this._angle += this.Speed * dt;
		this.Entity.Transform.Rotation.CopyFrom(
			Quat.FromAxisAngle( Vec3.Up(), this._angle ),
		);
	}
}
