// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../../../Logging/Logger";
import { CollisionLayer } from "../../Core/CollisionLayer";
import { Quat } from "../../Math/Quat";
import { Vec3 } from "../../Math/Vec3";
import type { InputService } from "../../Services/InputService";
import type { UiService } from "../../Services/UiService";
import { CameraComponent } from "../Camera/CameraComponent";
import { CharacterBody } from "../Physics/CharacterBody";
import { CreateMovementPreset } from "./MovementPresets";
import { MovementMotor } from "./MovementMotor";
import {
	MovementPreset, MProfile, type IMovementProfile, type IMovementTrait, type MovementContext,
} from "./MovementTypes";
import {
	Doom3AccelerateTrait, Doom3FrictionTrait, Doom3JumpTrait, GravityTrait, QuakeAirStrafeTrait,
} from "./Traits/Traits";

/**
 * The player's movement - port of Engine.Components.Mover.MoverComponent (a BepuCharacterBody3D that runs a trait-based
 * MovementMotor each physics step). Input -> WishDirection (camera-relative, horizontal) -> motor traits -> Velocity ->
 * MoveAndSlide.
 *
 * Differences forced by the worker split, none of them behavioural:
 *  - MoveAndSlide's result arrives with the next physics snapshot (see CharacterBody), so the motor's velocity is
 *    re-synced from the clipped velocity at the START of OnPhysicsUpdate instead of right after MoveAndSlide.
 *  - Because of that, change `Velocity` (knock-back, launch pads) from OnPhysicsUpdate - the next snapshot overwrites it.
 *
 * Keys: WASD move, Space jump, N noclip, 1-5 movement preset (Quake / Realistic / Hybrid / Doom3 / Quake-Strafe-Doom2016).
 */
export class MoverComponent extends CharacterBody {
	public RotationSpeed = 6;

	public Profile: IMovementProfile | null = null;
	public InitialMode: MovementPreset = MovementPreset.QuakeStrafeDoom2016;
	public Doom3JumpTraitHeight = 90;

	public CameraName = "Camera";
	public NoclipSpeed = 10;
	public ShowHud = true;

	private _motor!: MovementMotor;
	private readonly _context: MovementContext = {
		WishDirection: new Vec3(),
		JumpRequested: false,
		JumpConsumed: false,
		Delta: 0,
		IsOnFloor: false,
		Gravity: new Vec3(),
		Profile: new MProfile(),
	};
	private _currentMode = MovementPreset.QuakeStrafeDoom2016;
	private _camera: CameraComponent | undefined;
	private readonly _inputDirection = new Vec3();
	private _jumpInput = false;
	private readonly _facing = Quat.Identity();

	private _noclip = false;
	private _savedLayer: number = CollisionLayer.Character;

	public get IsNoclip(): boolean { return this._noclip; }
	public get CurrentMode(): MovementPreset { return this._currentMode; }

	public override Awake(): void {
		super.Awake();

		if (!this.Profile) {
			// Same as the .tres the Godot Player prefab ships: a stock MProfile with a slightly higher jump.
			const profile = new MProfile();
			profile.JumpHeight = 1.8;
			this.Profile = profile;
		}

		this._currentMode = this.InitialMode;
		this._motor = new MovementMotor(this.BuildTraitsForPreset(this._currentMode));
	}

	public override Start(): void {
		const cameraEntity = this.Engine.World.FindByName(this.CameraName);
		this._camera = cameraEntity?.GetComponent(CameraComponent);
	}

	//#region Hooks

	public override OnInputUpdate(input: InputService, _dt: number): void {
		if (input.JustPressed("KeyN")) this.SetNoclip(!this._noclip);

		const presets: [string, MovementPreset][] = [
			["Digit1", MovementPreset.Quake],
			["Digit2", MovementPreset.Realistic],
			["Digit3", MovementPreset.Hybrid],
			["Digit4", MovementPreset.Doom3],
			["Digit5", MovementPreset.QuakeStrafeDoom2016],
		];
		for (const [key, preset] of presets) {
			if (input.JustPressed(key)) this.SetMovementMode(preset);
		}
	}

	public override OnPhysicsUpdate(dt: number): void {
		// The snapshot (OnPhysicsSync) already refreshed Velocity with the plane-clipped result of the last move;
		// the motor carries on from that, not from its own pre-collision value.
		if (this.HasMoveResult && !this._noclip) this._motor.Velocity.CopyFrom(this.Velocity);

		this.HandleInput();

		if (this._noclip) this.SimulateNoclip();
		else this.SimulateMovement(dt);

		this.DisplayRotation(dt);
		this.MoveAndSlide(dt);
	}

	public override OnUIUpdate(ui: UiService, _dt: number): void {
		if (!this.ShowHud) return;

		const horizontalSpeed = Math.hypot(this.Velocity.X, this.Velocity.Z);
		ui.SetHud("mover.mode", `Mode: ${MovementPreset[this._currentMode]}${this._noclip ? "  (NOCLIP)" : ""}`);
		ui.SetHud("mover.speed", `Speed: ${horizontalSpeed.toFixed(1)} m/s   Vertical: ${this.Velocity.Y.toFixed(1)}`);

		const ground = this.GroundEntityId ? this.Engine.World.Get(this.GroundEntityId) : undefined;
		ui.SetHud("mover.floor", `Floor: ${this.IsOnFloor ? ground?.Name ?? "yes" : "air"}`);
	}

	//#endregion

	//#region Noclip

	/** Noclip (Doom's IDCLIP): collisions off, no gravity/jump, fly along the camera direction (pitch included). */
	public SetNoclip(enabled: boolean): void {
		if (this._noclip === enabled) return;
		this._noclip = enabled;

		if (enabled) {
			this._savedLayer = this.Layer;
			this.Layer = CollisionLayer.None;
			// Kill vertical momentum so the player doesn't float away.
			this.Velocity.Y = 0;
		} else {
			this.Layer = this._savedLayer;
			// Zero velocity so the player doesn't shoot off after landing.
			this.Velocity.Set(0, 0, 0);
			this._motor.Velocity.Set(0, 0, 0);
		}

		Logger.LogInfo(`Got noclip: ${enabled ? "ON" : "OFF"}`);
	}

	private SimulateNoclip(): void {
		// Direct velocity from input; no gravity, no jump, no traits.
		if (this._inputDirection.IsNearlyZero()) this.Velocity.Set(0, 0, 0);
		else this.Velocity.CopyFrom(this._inputDirection.Normalized().Mul(this.NoclipSpeed));
	}

	//#endregion

	//#region Input -> wish direction

	private HandleInput(): void {
		const input = this.Engine.Input;
		const [ix, iy] = input.GetInputVector();
		this._jumpInput = input.JustPressedPhysics("Space");

		const camera = this._camera;

		if (this._noclip) {
			if (camera) {
				// Both are unit vectors already: the camera only has yaw and pitch (no roll, no scale).
				const forward = camera.GetForwardDirection();
				const right = camera.GetRightDirection();
				this._inputDirection.CopyFrom(right.Mul(ix).Add(forward.Mul(-iy)));
			} else {
				this._inputDirection.Set(ix, 0, iy); // no camera: fly in world XZ only (forward is -Z, and W gives a negative y)
			}
			return;
		}

		if (!camera) {
			this._inputDirection.Set(ix, 0, iy); // no camera: world axes, forward = -Z
			return;
		}

		// Normal: project the camera axes onto the horizontal plane.
		// Looking straight up or down leaves nothing of "forward" on the ground: then W/S do nothing.
		const cf = camera.GetForwardDirection();
		cf.Y = 0;
		if (!cf.IsNearlyZero()) cf.NormalizeInPlace();

		// The right axis is horizontal and unit length whatever the pitch (yaw and pitch only, no roll).
		const cr = camera.GetRightDirection();
		cr.Y = 0;

		this._inputDirection.CopyFrom(cr.Mul(ix).Add(cf.Mul(-iy)));
		this._inputDirection.Y = 0;
	}

	private SimulateMovement(dt: number): void {
		const ctx = this._context;
		ctx.WishDirection = this._inputDirection;
		ctx.JumpRequested = this._jumpInput;
		ctx.IsOnFloor = this.IsOnFloor;
		ctx.Gravity = this.Gravity;
		ctx.Delta = dt;
		ctx.Profile = this.Profile!;
		ctx.JumpConsumed = false; // reset each tick; the jump trait sets it when a jump fires

		this._motor.Simulate(dt, ctx);

		this.Velocity.CopyFrom(this._motor.Velocity);
	}

	/** Smoothly turns the visual capsule towards the movement direction. */
	private DisplayRotation(dt: number): void {
		if (this._inputDirection.IsNearlyZero()) return;

		// The body itself never rotates (identity basis), so world input == local input.
		const targetAngle = Math.atan2(-this._inputDirection.X, -this._inputDirection.Z);
		const target = Quat.FromAxisAngle(Vec3.Up(), targetAngle);
		const smooth = Quat.Slerp(this._facing, target, Math.min(1, this.RotationSpeed * dt));

		this._facing.CopyFrom(smooth);
		this.Transform.Rotation.CopyFrom(smooth);
	}

	//#endregion

	//#region Presets

	public SetMovementMode(mode: MovementPreset): void {
		if (this._currentMode === mode) return;

		this._currentMode = mode;
		this._motor.SetTraits(this.BuildTraitsForPreset(mode));
		Logger.LogInfo(`Mode -> ${MovementPreset[mode]}`);
	}

	/** The trait list of a movement mode - also handy for a subclass that extends a stock mode (see WindyMover in guide 05). */
	protected BuildTraitsForPreset(mode: MovementPreset): IMovementTrait[] {
		if (mode === MovementPreset.Custom) return this.GetCustomTraits();

		const preset = CreateMovementPreset(mode);
		if (!preset) return [];

		const traits = preset.Build();
		if (mode === MovementPreset.Doom3) {
			for (const trait of traits) {
				if (trait instanceof Doom3JumpTrait) trait.MaxJumpHeightInches = this.Doom3JumpTraitHeight;
			}
		}
		return traits;
	}

	/** Override in a subclass (and set `InitialMode: MovementPreset.Custom`) to assemble your own trait list - see Game/Scripts/Recipes.ts. */
	protected GetCustomTraits(): IMovementTrait[] {
		const jump = new Doom3JumpTrait();
		jump.MaxJumpHeightInches = this.Doom3JumpTraitHeight;
		return [jump, new Doom3FrictionTrait(), new Doom3AccelerateTrait(), new GravityTrait(), new QuakeAirStrafeTrait()];
	}

	//#endregion
}
