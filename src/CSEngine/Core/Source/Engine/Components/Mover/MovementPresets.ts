// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	ClampedAirControlTrait, Doom3AccelerateTrait, Doom3FrictionTrait, Doom3GroundAccelTrait, Doom3JumpTrait,
	GravityTrait, GroundAccelerationTrait, GroundFrictionTrait, HybridAirControlTrait, HybridGroundTrait,
	JumpTrait, NoFrictionTrait, QuakeAirStrafeTrait, RealisticGroundAccelTrait, SmoothStopTrait, StrafeAirControlTrait,
} from "./Traits/Traits";
import {
	Doom3Constants, MovementPreset, type IMovementPreset, type IMovementProfile, type IMovementTrait,
} from "./MovementTypes";

// Ports of Framework.Components.Mover.Presets.* - the trait list (order matters) plus a default profile each.

class Doom3Preset implements IMovementPreset {
	public Build(): IMovementTrait[] {
		return [new Doom3JumpTrait(), new Doom3FrictionTrait(), new Doom3AccelerateTrait(), new GravityTrait()];
	}

	public SetDefaultProfile(profile: IMovementProfile): void {
		profile.MaxSpeed = 76 * Doom3Constants.InchesToMeters;
	}
}

class HybridPreset implements IMovementPreset {
	public Build(): IMovementTrait[] {
		return [new GravityTrait(), new JumpTrait(), new HybridGroundTrait(), new HybridAirControlTrait()];
	}

	public SetDefaultProfile(profile: IMovementProfile): void {
		profile.GroundAcceleration = 14; // lerp speed on ground
		profile.MaxSpeed = 6;
		profile.AirMaxSpeed = 5;
		profile.AirControl = 5;          // lerp speed in air
		profile.JumpHeight = 1.2;
		profile.JumpBufferTime = 0.15;
		profile.CoyoteTime = 0.15;
	}
}

class QuakePreset implements IMovementPreset {
	public Build(): IMovementTrait[] {
		return [new GravityTrait(), new JumpTrait(), new GroundAccelerationTrait(), new QuakeAirStrafeTrait(), new NoFrictionTrait()];
	}

	public SetDefaultProfile(profile: IMovementProfile): void {
		profile.GroundAcceleration = 25;
		profile.MaxSpeed = 7;
		profile.AirAcceleration = 10;
		profile.AirMaxSpeed = 0.7; // low cap = strafe-jump physics
		profile.JumpHeight = 1.5;
		profile.JumpBufferTime = 0.12;
		profile.CoyoteTime = 0.12;
	}
}

class QuakeStrafeDoom2016Preset implements IMovementPreset {
	public Build(): IMovementTrait[] {
		return [
			new GravityTrait(),
			new JumpTrait(),               // buffered + coyote - swap for Doom3JumpTrait
			new Doom3FrictionTrait(),      // ground stopping friction, PM_FRICTION (air friction = 0, harmless here)
			new Doom3GroundAccelTrait(),   // ground accel, PM_ACCELERATE curve
			new StrafeAirControlTrait(),   // air: Quake strafe mechanic + Doom3 curve + generous cap
		];
	}

	public SetDefaultProfile(profile: IMovementProfile): void {
		profile.MaxSpeed = 7;
		profile.AirAcceleration = 6;
		profile.AirMaxSpeed = 9;
		profile.JumpHeight = 1.4;
		profile.JumpBufferTime = 0.12;
		profile.CoyoteTime = 0.12;
	}
}

class RealisticPreset implements IMovementPreset {
	public Build(): IMovementTrait[] {
		return [
			new GravityTrait(), new JumpTrait(), new GroundFrictionTrait(),
			new RealisticGroundAccelTrait(), new SmoothStopTrait(), new ClampedAirControlTrait(),
		];
	}

	public SetDefaultProfile(profile: IMovementProfile): void {
		profile.GroundAcceleration = 20;
		profile.MaxSpeed = 5;
		profile.GroundFriction = 10;
		profile.AirAcceleration = 4;
		profile.AirMaxSpeed = 4;
		profile.AirControl = 1.5;
		profile.JumpHeight = 1.2;
		profile.JumpBufferTime = 0.10;
		profile.CoyoteTime = 0.10;
	}
}

/** Port of MovementPresetFactory. `Custom` has no preset object (the mover assembles its own trait list). */
export function CreateMovementPreset(preset: MovementPreset): IMovementPreset | null {
	switch (preset) {
		case MovementPreset.Doom3: return new Doom3Preset();
		case MovementPreset.Hybrid: return new HybridPreset();
		case MovementPreset.Quake: return new QuakePreset();
		case MovementPreset.QuakeStrafeDoom2016: return new QuakeStrafeDoom2016Preset();
		case MovementPreset.Realistic: return new RealisticPreset();
		default: return null;
	}
}
