// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Component } from "@cse/core/Engine/Core/Component";
import { FixedCamera } from "@cse/core/Engine/Components/Camera/CameraComponent";

/**
 * Flies its camera round a circle above the land, looking at the ground a
 * little ahead: the place the world is meshed around keeps moving, so its
 * chunks keep splitting and merging (levels of detail).
 */
export class Flyover extends Component {
	/** The circle's radius and height. */
	public Radius = 60;

	public Height = 18;

	/** Radians per second round the circle. */
	public Speed = 0.25;

	/** How far ahead along the circle it looks (radians). */
	public Lead = 0.35;

	private _angle = 0;

	public override Update( dt: number ): void {
		this._angle += this.Speed * dt;

		const camera = this.Entity.GetComponent( FixedCamera );
		const ahead = this._angle + this.Lead;

		this.Transform.Position.Set(
			Math.cos( this._angle ) * this.Radius,
			this.Height,
			Math.sin( this._angle ) * this.Radius,
		);
		if ( camera ) {
			camera.LookAt = [
				Math.cos( ahead ) * this.Radius,
				0,
				Math.sin( ahead ) * this.Radius,
			];
		}
	}
}
