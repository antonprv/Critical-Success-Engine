// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { CameraPose } from "../../../Workers/Protocol/RenderGameLogicProtocol";
import { Component } from "../../Core/Component";
import { CollisionLayer } from "../../Core/CollisionLayer";
import type { Entity } from "../../Core/Entity";
import { Clamp, DegToRad } from "../../Math/MathUtils";
import { Quat } from "../../Math/Quat";
import { Vec3 } from "../../Math/Vec3";
import type { InputService } from "../../Services/InputService";
import type { ICameraSource } from "../../Services/RenderService";

/**
 * Mouse-look camera following a target: first person, or third person on a spring arm that a sphere sweep pulls in
 * front of walls. Yaw/pitch in degrees; the mover steers by `GetForwardDirection` / `GetRightDirection`.
 */
export class CameraComponent extends Component implements ICameraSource {
	public TargetName = "Player";
	public MouseSensitivity = 0.1;
	public FovDegrees = 70;
	public EyeHeight = 1.6;
	public MinPitch = -85;
	public MaxPitch = 85;

	public ThirdPerson = false;
	/** Off: the mouse doesn't turn the view (a top-down or fixed camera keeps its Yaw and Pitch). */
	public LookEnabled = true;
	/** The input action that switches first / third person. */
	public ToggleAction = "ToggleView";
	/** How fast a gamepad's right stick turns the view, degrees per second at full tilt. */
	public PadLookSpeed = 150;
	public ArmLength = 4;
	public ArmRadius = 0.2;
	public ArmMargin = 0.05;

	public Yaw = 0;
	public Pitch = 0;

	private _target: Entity | undefined;
	private _armLength = 0;
	private _armQueryInFlight = false;
	private readonly _scratch = new Float64Array(7);

	public override Awake(): void {
		this.Engine.Render.MainCamera = this;
		this._armLength = this.ArmLength;
	}

	public override Start(): void {
		this.FindTarget();
	}

	private FindTarget(): void {
		this._target = this.Engine.World.FindByName(this.TargetName);
	}

	public override OnInputUpdate(input: InputService, dt: number): void {
		const [dx, dy] = input.ConsumeLookDelta(); // consumed either way: nothing saved up for when look comes back
		if (this.LookEnabled) {
			// The mouse in pixels, a gamepad stick (the Look actions) in degrees per second.
			// The player's settings: sensitivity multipliers and inverted up/down.
			const settings = this.Engine.Settings;
			const mouse = this.MouseSensitivity * settings.Number("MouseSensitivity");
			const pad = this.PadLookSpeed * settings.Number("PadLookSpeed") * dt;
			const vertical = settings.Toggle("InvertLook") ? -1 : 1;
			const stickX = (input.ActionValue("LookLeft") - input.ActionValue("LookRight")) * pad;
			const stickY = (input.ActionValue("LookUp") - input.ActionValue("LookDown")) * pad;
			this.Yaw += -dx * mouse + stickX;
			this.Pitch = Clamp(this.Pitch + vertical * (-dy * mouse + stickY), this.MinPitch, this.MaxPitch);
		}

		if (input.ActionJustPressed(this.ToggleAction)) this.ThirdPerson = !this.ThirdPerson;
	}

	public override Update(_dt: number): void {
		if (!this.ThirdPerson) {
			this._armLength = 0;
			return;
		}

		if (!this._target) this.FindTarget();
		if (!this._target) return;

		// One sweep in flight at a time; the camera uses the latest answer (a tick or two old - invisible in practice).
		if (this._armQueryInFlight) return;
		this._armQueryInFlight = true;

		const pivot = this.ComputePivot(this.Engine.Time.RenderAlpha);
		const back = this.Rotation().Rotate(new Vec3(0, 0, 1));

		void this.Engine.Physics
			.SweepSphere(pivot, back, this.ArmLength, this.ArmRadius, CollisionLayer.Character, CollisionLayer.World, this._target.Id)
			.then((result) => {
				this._armQueryInFlight = false;
				this._armLength = result.hit ? Math.max(0, result.distance - this.ArmMargin) : this.ArmLength;
			});
	}

	private Rotation(): Quat {
		return Quat.FromYawPitch(this.Yaw * DegToRad, this.Pitch * DegToRad);
	}

	private ComputePivot(alpha: number): Vec3 {
		if (!this._target) return this.Transform.Position.Clone();
		this._target.Transform.WriteInterpolated(alpha, this._scratch, 0);
		return new Vec3(this._scratch[0]!, this._scratch[1]! + this.EyeHeight, this._scratch[2]!);
	}

	public GetPose(alpha: number): CameraPose {
		const rotation = this.Rotation();
		const pivot = this.ComputePivot(alpha);
		const position = this.ThirdPerson ? pivot.Add(rotation.Rotate(new Vec3(0, 0, this._armLength))) : pivot;

		this.Transform.Position.CopyFrom(position);
		this.Transform.Rotation.CopyFrom(rotation);

		return {
			transform: [position.X, position.Y, position.Z, rotation.X, rotation.Y, rotation.Z, rotation.W],
			fov: this.FovDegrees * DegToRad,
		};
	}

	/** Where the camera looks (world space, unit length, includes pitch). */
	public GetForwardDirection(): Vec3 { return this.Rotation().Rotate(new Vec3(0, 0, -1)); }
	public GetRightDirection(): Vec3 { return this.Rotation().Rotate(new Vec3(1, 0, 0)); }
}

/** A camera that never moves: put it at `Transform.Position`, looking at `LookAt`. */
export class FixedCamera extends Component implements ICameraSource {
	public LookAt: [number, number, number] = [0, 0, 0];
	public FovDegrees = 60;

	public override Awake(): void {
		this.Engine.Render.MainCamera = this;
	}

	public GetPose(_alpha: number): CameraPose {
		const rotation = Quat.LookAt(this.Transform.Position, Vec3.FromTuple(this.LookAt));
		const p = this.Transform.Position;
		return { transform: [p.X, p.Y, p.Z, rotation.X, rotation.Y, rotation.Z, rotation.W], fov: this.FovDegrees * DegToRad };
	}
}
