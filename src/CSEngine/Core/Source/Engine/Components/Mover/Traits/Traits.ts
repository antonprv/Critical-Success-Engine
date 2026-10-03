// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Direct ports of Framework.Components.Mover.Traits.* (Common, Quake, Doom3, Hybrid, Realistic, Custom). Each trait is
// a few lines of velocity math; `velocity` is mutated in place, exactly like `ref Vector3 velocity` in the C# version.

import { Vec3 } from "../../../Math/Vec3";
import { Doom3Constants, MovementTrait, type MovementContext } from "../MovementTypes";

//#region Common

export class GravityTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (ctx.IsOnFloor) {
			if (velocity.Y < 0) velocity.Y = 0;
			return;
		}
		velocity.X += ctx.Gravity.X * delta;
		velocity.Y += ctx.Gravity.Y * delta;
		velocity.Z += ctx.Gravity.Z * delta;
	}
}

/** Jump with a "buffer" (press slightly before landing still jumps) and "coyote time" (slightly after leaving a ledge). */
export class JumpTrait extends MovementTrait {
	private _jumpBuffer = 0; // seconds remaining in the jump buffer window
	private _coyote = 0;     // seconds remaining in the coyote window

	public override PreProcess(ctx: MovementContext): void {
		if (ctx.JumpRequested) this._jumpBuffer = ctx.Profile.JumpBufferTime;

		if (ctx.IsOnFloor) this._coyote = ctx.Profile.CoyoteTime;
		else this._coyote -= ctx.Delta; // ctx.Delta is injected by the motor before PreProcess
	}

	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		this._jumpBuffer -= delta;

		if (this._jumpBuffer > 0 && this._coyote > 0) {
			const gravity = Math.max(0.0001, -ctx.Gravity.Y);
			velocity.Y = Math.sqrt(2 * gravity * ctx.Profile.JumpHeight);
			this._jumpBuffer = 0;
			this._coyote = 0;
			ctx.JumpConsumed = true;
		}
	}
}

//#endregion

//#region Quake

export class GroundAccelerationTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (!ctx.IsOnFloor) return;

		const wishDir = ctx.WishDirection;
		if (wishDir.IsNearlyZero()) return;

		const wishVel = wishDir.Mul(ctx.Profile.MaxSpeed);
		const deltaVel = wishVel.Sub(velocity);
		deltaVel.Y = 0;

		const deltaVelLen = deltaVel.Length();
		if (deltaVelLen < 0.001) return;

		let accel = ctx.Profile.GroundAcceleration * delta;
		if (accel > deltaVelLen) accel = deltaVelLen;

		velocity.AddInPlace(deltaVel.Normalized().Mul(accel));
	}
}

export class NoFrictionTrait extends MovementTrait {
	/** Per-tick multiplier applied to horizontal speed when grounded with no input (tick-rate dependent, like the original). */
	public PassiveDamping = 0.98;

	public override Process(ctx: MovementContext, velocity: Vec3, _delta: number): void {
		if (!ctx.IsOnFloor) return;
		if (ctx.WishDirection.Length() > 0.01) return;

		velocity.X *= this.PassiveDamping;
		velocity.Z *= this.PassiveDamping;
	}
}

export class QuakeAirStrafeTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (ctx.IsOnFloor) return;

		const wishDir = ctx.WishDirection;
		if (wishDir.IsNearlyZero()) return;

		const wishSpeed = ctx.Profile.AirMaxSpeed;
		const currentSpeed = velocity.Dot(wishDir);
		const addSpeed = wishSpeed - currentSpeed;
		if (addSpeed <= 0) return;

		let accel = ctx.Profile.AirAcceleration * delta;
		if (accel > addSpeed) accel = addSpeed;

		velocity.AddInPlace(wishDir.Mul(accel));
	}
}

//#endregion

//#region Doom 3

export class Doom3AccelerateTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		const inputMag = Math.min(ctx.WishDirection.Length(), 1);
		if (inputMag < 0.0001) return;

		const wishdir = ctx.WishDirection.Normalized();
		const wishspeed = ctx.Profile.MaxSpeed * inputMag;
		const accel = ctx.IsOnFloor ? Doom3Constants.PM_ACCELERATE : Doom3Constants.PM_AIRACCELERATE;

		Doom3AccelerateTrait.Accelerate(wishdir, wishspeed, accel, velocity, delta);
	}

	private static Accelerate(wishdir: Vec3, wishspeed: number, accel: number, velocity: Vec3, frametime: number): void {
		const currentspeed = velocity.Dot(wishdir);
		const addspeed = wishspeed - currentspeed;
		if (addspeed <= 0) return;

		let accelspeed = accel * frametime * wishspeed;
		if (accelspeed > addspeed) accelspeed = addspeed;

		velocity.AddInPlace(wishdir.Mul(accelspeed));
	}
}

export class Doom3FrictionTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		const vel = velocity.Clone();
		if (ctx.IsOnFloor) vel.Y = 0;

		const speed = vel.Length();
		if (speed < 1.0 * Doom3Constants.InchesToMeters) {
			if (Math.abs(velocity.Y) < 1e-5) velocity.Set(0, 0, 0);
			else velocity.Set(0, velocity.Y, 0);
			return;
		}

		let drop = 0;
		const k = Doom3Constants.InchesToMeters;

		if (ctx.IsOnFloor) {
			const stop = Doom3Constants.PM_STOPSPEED * k;
			const control = speed < stop ? stop : speed;
			drop += control * Doom3Constants.PM_FRICTION * delta;
		} else {
			drop += speed * Doom3Constants.PM_AIRFRICTION * delta;
		}

		let newSpeed = speed - drop;
		if (newSpeed < 0) newSpeed = 0;

		velocity.MulInPlace(newSpeed / speed);
	}
}

/** Jump straight off the ground at a height given in inches - no buffering, no coyote time (Doom 3 style). */
export class Doom3JumpTrait extends MovementTrait {
	public MaxJumpHeightInches = 48;

	public override Process(ctx: MovementContext, velocity: Vec3, _delta: number): void {
		if (!ctx.IsOnFloor || !ctx.JumpRequested) return;

		const g = Math.max(ctx.Gravity.Length(), 0.0001);
		const h = this.MaxJumpHeightInches * Doom3Constants.InchesToMeters;
		velocity.Y = Math.sqrt(2 * h * g);
		ctx.JumpConsumed = true;
	}
}

//#endregion

//#region Custom (the QuakeStrafeDoom2016 preset's building blocks)

export class Doom3GroundAccelTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (!ctx.IsOnFloor) return;

		const inputMag = Math.min(ctx.WishDirection.Length(), 1);
		if (inputMag < 0.0001) return;

		const wishdir = ctx.WishDirection.Normalized();
		const wishspeed = ctx.Profile.MaxSpeed * inputMag;

		const currentspeed = velocity.Dot(wishdir);
		const addspeed = wishspeed - currentspeed;
		if (addspeed <= 0) return;

		let accelspeed = Doom3Constants.PM_ACCELERATE * delta * wishspeed;
		if (accelspeed > addspeed) accelspeed = addspeed;

		velocity.AddInPlace(wishdir.Mul(accelspeed));
	}
}

export class StrafeAirControlTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (ctx.IsOnFloor) return;

		const wishDir = ctx.WishDirection;
		if (wishDir.IsNearlyZero()) return;

		const wishSpeed = ctx.Profile.AirMaxSpeed;
		const currentSpeed = velocity.Dot(wishDir);
		const addSpeed = wishSpeed - currentSpeed;
		if (addSpeed <= 0) return;

		let accelSpeed = ctx.Profile.AirAcceleration * delta * wishSpeed;
		if (accelSpeed > addSpeed) accelSpeed = addSpeed;

		velocity.AddInPlace(wishDir.Mul(accelSpeed));
	}
}

//#endregion

//#region Hybrid

export class HybridGroundTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (!ctx.IsOnFloor) return;

		const target = ctx.WishDirection.Mul(ctx.Profile.MaxSpeed);
		const horizontal = new Vec3(velocity.X, 0, velocity.Z).Lerp(target, ctx.Profile.GroundAcceleration * delta);

		velocity.X = horizontal.X;
		velocity.Z = horizontal.Z;
	}
}

export class HybridAirControlTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (ctx.IsOnFloor) return;

		const wishDir = ctx.WishDirection;
		if (wishDir.IsNearlyZero()) return;

		const target = wishDir.Mul(ctx.Profile.AirMaxSpeed);
		const horizontal = new Vec3(velocity.X, 0, velocity.Z).Lerp(target, ctx.Profile.AirControl * delta);

		velocity.X = horizontal.X;
		velocity.Z = horizontal.Z;
	}
}

//#endregion

//#region Realistic

export class GroundFrictionTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (!ctx.IsOnFloor) return;

		const speed = new Vec3(velocity.X, 0, velocity.Z).Length();
		if (speed < 0.001) return;

		const drop = speed * ctx.Profile.GroundFriction * delta;
		const newSpeed = Math.max(speed - drop, 0);
		const scale = newSpeed / speed;

		velocity.X *= scale;
		velocity.Z *= scale;
	}
}

export class RealisticGroundAccelTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (!ctx.IsOnFloor) return;

		const wishDir = ctx.WishDirection;
		if (wishDir.IsNearlyZero()) return;

		const horizontal = new Vec3(velocity.X, 0, velocity.Z);
		const currentSpeed = horizontal.Dot(wishDir);
		const addSpeed = ctx.Profile.MaxSpeed - currentSpeed;
		if (addSpeed <= 0) return;

		let accel = ctx.Profile.GroundAcceleration * delta;
		if (accel > addSpeed) accel = addSpeed;

		velocity.X += wishDir.X * accel;
		velocity.Z += wishDir.Z * accel;
	}
}

export class SmoothStopTrait extends MovementTrait {
	public StopLerpSpeed = 10;

	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (!ctx.IsOnFloor) return;
		if (ctx.WishDirection.Length() > 0.01) return;

		const horizontal = new Vec3(velocity.X, 0, velocity.Z).Lerp(new Vec3(), this.StopLerpSpeed * delta);
		velocity.X = horizontal.X;
		velocity.Z = horizontal.Z;
	}
}

export class ClampedAirControlTrait extends MovementTrait {
	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (ctx.IsOnFloor) return;

		const wishDir = ctx.WishDirection;
		if (wishDir.IsNearlyZero()) return;

		const target = wishDir.Mul(ctx.Profile.AirMaxSpeed);
		const horizontal = new Vec3(velocity.X, 0, velocity.Z).Lerp(target, ctx.Profile.AirControl * delta);

		velocity.X = horizontal.X;
		velocity.Z = horizontal.Z;
	}
}

//#endregion

