// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Vec3 } from "../../Math/Vec3";
import type { IMovementTrait, MovementContext } from "./MovementTypes";

/** Port of MovementMotor: owns the velocity vector and runs the trait list over it once per physics step. */
export class MovementMotor {
	public readonly Velocity = new Vec3();

	private _traits: IMovementTrait[];

	public constructor(traits: IMovementTrait[]) {
		this._traits = traits;
	}

	public SetTraits(traits: IMovementTrait[]): void {
		this._traits = traits;
	}

	public Simulate(delta: number, ctx: MovementContext): void {
		ctx.Delta = delta;

		for (const trait of this._traits) trait.PreProcess(ctx);
		for (const trait of this._traits) trait.Process(ctx, this.Velocity, delta);
		for (const trait of this._traits) trait.PostProcess(ctx);
	}
}
