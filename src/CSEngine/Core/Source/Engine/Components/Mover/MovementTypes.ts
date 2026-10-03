// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Vec3 } from "../../Math/Vec3";

/** Port of Framework.Components.Mover.Core.Doom3Constants (units: inches, seconds - converted with InchesToMeters). */
export const Doom3Constants = {
	PM_STOPSPEED: 100.0,
	PM_SWIMSCALE: 0.5,
	PM_LADDERSPEED: 100.0,
	PM_STEPSCALE: 1.0,

	PM_ACCELERATE: 10.0,
	PM_AIRACCELERATE: 1.0,
	PM_WATERACCELERATE: 4.0,
	PM_FLYACCELERATE: 8.0,

	PM_FRICTION: 6.0,
	PM_AIRFRICTION: 0.0,
	PM_WATERFRICTION: 1.0,
	PM_FLYFRICTION: 3.0,
	PM_NOCLIPFRICTION: 12.0,

	MIN_WALK_NORMAL: 0.7, // can't walk on very steep slopes
	OVERCLIP: 1.001,

	DEFAULT_GRAVITY: 1066.0, // inches / sec^2

	InchesToMeters: 0.0254,
} as const;

export enum MovementPreset {
	Custom,
	Quake,
	Realistic,
	Hybrid,
	Doom3,
	QuakeStrafeDoom2016,
}

/** Tunables shared by all presets (Framework.Components.Mover.Core.Interfaces.IMovementProfile). */
export interface IMovementProfile {
	GroundAcceleration: number;
	MaxSpeed: number;
	GroundFriction: number;

	AirAcceleration: number;
	AirMaxSpeed: number;
	AirControl: number;

	JumpHeight: number;
	JumpBufferTime: number;
	CoyoteTime: number;
}

/** Port of Engine.Components.Mover.Resources.MProfile - same defaults. */
export class MProfile implements IMovementProfile {
	public GroundAcceleration = 20;
	public MaxSpeed = 7;
	public GroundFriction = 12;

	public AirAcceleration = 8;
	public AirMaxSpeed = 5;
	public AirControl = 3;

	public JumpHeight = 1.8;
	public JumpBufferTime = 0.15;
	public CoyoteTime = 0.12;
}

/** Per-tick input to the motor (a C# struct in the original; here a plain mutable object passed by reference). */
export interface MovementContext {
	WishDirection: Vec3;
	JumpRequested: boolean;
	/** Set by whichever trait actually fires the jump. */
	JumpConsumed: boolean;
	Delta: number;
	IsOnFloor: boolean;
	Gravity: Vec3;
	Profile: IMovementProfile;
}

/**
 * One slice of movement behaviour (gravity, friction, ground acceleration, ...). The motor runs every trait's PreProcess,
 * then every Process (which mutates `velocity` in place), then every PostProcess - order of the list matters.
 */
export interface IMovementTrait {
	PreProcess(ctx: MovementContext): void;
	Process(ctx: MovementContext, velocity: Vec3, delta: number): void;
	PostProcess(ctx: MovementContext): void;
}

export interface IMovementPreset {
	Build(): IMovementTrait[];
	SetDefaultProfile(profile: IMovementProfile): void;
}

/** Convenience base: no-op Pre/PostProcess, like most traits in the original. */
export abstract class MovementTrait implements IMovementTrait {
	public PreProcess(_ctx: MovementContext): void { /* nothing */ }
	public abstract Process(ctx: MovementContext, velocity: Vec3, delta: number): void;
	public PostProcess(_ctx: MovementContext): void { /* nothing */ }
}
