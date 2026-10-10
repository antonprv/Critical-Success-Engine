// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { CameraPose } from "../../../Workers/Protocol/RenderGameLogicProtocol";
import { Clamp, DegToRad } from "../../Math/MathUtils";
import { Quat } from "../../Math/Quat";
import { Vec3 } from "../../Math/Vec3";
import type { InputService } from "../../Services/InputService";
import { CameraComponent } from "./CameraComponent";

/**
 * A top-down view as in Baldur's Gate 3, Divinity: Original Sin 2 or Solasta (use it in a scene with cursor: "free"):
 * it looks down at a point on the ground (Focus) that follows the player; dragging with the middle button moves that
 * point, the wheel zooms (nearer looks flatter, farther steeper), and with EdgeScroll on, the cursor at the edge of the
 * view scrolls it. Recenter (Home) - or walking - brings it back to the player. A gamepad's right stick moves the view,
 * its d-pad zooms. The mover walks relative to it, like any camera.
 */
export class StrategyCamera extends CameraComponent {
	/** Distance from the focus along the view; the wheel changes it between ZoomMin and ZoomMax. */
	public Zoom = 16;
	public ZoomMin = 6;
	public ZoomMax = 30;
	/** How much one wheel notch (100 units) changes the zoom, as a share of it. */
	public ZoomStep = 0.12;
	/** Pitch at the nearest and at the farthest zoom (degrees, negative: looking down). */
	public PitchNear = -35;
	public PitchFar = -68;
	/** How far a pixel of drag (the PanView action: the middle button) moves the view, per unit of zoom. */
	public PanPerPixel = 0.0025;
	/** How fast a gamepad's right stick moves the view and the d-pad zooms (per second, per unit of zoom / share). */
	public PadPanSpeed = 1.2;
	public PadZoomSpeed = 1.5;
	/** Scrolling when the cursor is at the edge of the view: the player's setting (EdgeScrollSetting) decides. */
	public EdgeScroll = false;
	/** The setting this camera declares for it. */
	public EdgeScrollSetting = "EdgeScroll";
	/** How near the edge counts (a share of the view), and how fast it scrolls (per second, per unit of zoom). */
	public EdgeSize = 0.02;
	public EdgeSpeed = 1.2;

	/** The point on the ground the camera looks at. */
	public readonly Focus = new Vec3();
	/** Whether the focus follows the player (until the player moves the view). */
	public Following = true;

	public override Awake(): void {
		super.Awake();
		this.LookEnabled = false; // the mouse doesn't turn this view
		this.Engine.Settings.Declare({ Key: this.EdgeScrollSetting, Label: "Scroll at the screen edges", Category: "Camera", Kind: "Toggle", Default: this.EdgeScroll });
		this.Focus.CopyFrom(this.Transform.Position);
		this.UpdatePitch();
	}

	public override OnInputUpdate(input: InputService, dt: number): void {
		const [dx, dy] = input.ConsumeLookDelta();
		const wheel = input.ConsumeWheel();
		const padZoom = input.ActionValue("ZoomOut") - input.ActionValue("ZoomIn");
		if (wheel !== 0 || padZoom !== 0) {
			this.Zoom = Clamp(this.Zoom * (1 + this.ZoomStep * wheel / 100) * (1 + padZoom * this.PadZoomSpeed * dt), this.ZoomMin, this.ZoomMax);
			this.UpdatePitch();
		}

		const [right, forward] = this.GroundAxes();
		const stickX = input.ActionValue("LookRight") - input.ActionValue("LookLeft");
		const stickY = input.ActionValue("LookUp") - input.ActionValue("LookDown");
		if (stickX !== 0 || stickY !== 0) this.MoveFocus(right.Mul(stickX).Add(forward.Mul(stickY)).Mul(this.PadPanSpeed * this.Zoom * dt));
		if (input.IsActionDown("PanView") && (dx !== 0 || dy !== 0)) {
			// The world follows the hand: dragging right moves the view left, dragging down moves it forward.
			const step = this.PanPerPixel * this.Zoom;
			this.MoveFocus(right.Mul(-dx * step).Add(forward.Mul(dy * step)));
		}

		this.EdgeScroll = this.Engine.Settings.Toggle(this.EdgeScrollSetting);
		const cursor = input.Cursor;
		if (this.EdgeScroll && cursor) {
			const [x, y] = cursor;
			const across = x < this.EdgeSize ? -1 : x > 1 - this.EdgeSize ? 1 : 0;
			const along = y < this.EdgeSize ? 1 : y > 1 - this.EdgeSize ? -1 : 0;
			if (across !== 0 || along !== 0) this.MoveFocus(right.Mul(across).Add(forward.Mul(along)).Mul(this.EdgeSpeed * this.Zoom * dt));
		}

		const [ix, iy] = input.GetInputVector();
		if (input.ActionJustPressed("Recenter") || ix !== 0 || iy !== 0) this.Following = true;
	}

	public override Update(_dt: number): void {
		if (!this.Following) return;
		const target = this.Engine.World.FindByName(this.TargetName);
		if (target) this.Focus.CopyFrom(target.Transform.Position);
	}

	public override GetPose(_alpha: number): CameraPose {
		const rotation = Quat.FromYawPitch(this.Yaw * DegToRad, this.Pitch * DegToRad);
		const pivot = this.Focus.Add(new Vec3(0, this.EyeHeight, 0));
		const position = pivot.Add(rotation.Rotate(new Vec3(0, 0, this.Zoom)));
		this.Transform.Position.CopyFrom(position);
		this.Transform.Rotation.CopyFrom(rotation);
		return { transform: [position.X, position.Y, position.Z, rotation.X, rotation.Y, rotation.Z, rotation.W], fov: this.FovDegrees * DegToRad };
	}

	private UpdatePitch(): void {
		const t = (this.Zoom - this.ZoomMin) / (this.ZoomMax - this.ZoomMin);
		this.Pitch = this.PitchNear + (this.PitchFar - this.PitchNear) * t;
	}

	/** The view's right and forward along the ground (yaw only). */
	private GroundAxes(): [Vec3, Vec3] {
		const yaw = Quat.FromYawPitch(this.Yaw * DegToRad, 0);
		return [yaw.Rotate(new Vec3(1, 0, 0)), yaw.Rotate(new Vec3(0, 0, -1))];
	}

	private MoveFocus(by: Vec3): void {
		this.Focus.CopyFrom(this.Focus.Add(by));
		this.Following = false;
	}
}
