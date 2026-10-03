// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Quat } from "../Math/Quat";
import { Vec3 } from "../Math/Vec3";

/**
 * World-space transform of an entity (there is no hierarchy yet - every entity is a root, which is also how the
 * physics side sees them).
 *
 * Physics-driven entities (rigid bodies, characters) get a new pose once per physics step; the renderer asks for frames
 * at display rate, so those entities keep the previous step's pose too and `Interpolate` blends between the two.
 * Script-driven entities (moved from Update) just use the current pose.
 */
export class Transform {
	public Position = new Vec3();
	public Rotation = Quat.Identity();

	public PreviousPosition = new Vec3();
	public PreviousRotation = Quat.Identity();

	/** True once something (a physics body component) feeds this transform with PushPhysicsPose. */
	public IsPhysicsDriven = false;

	public PushPhysicsPose(position: Vec3, rotation: Quat): void {
		this.PreviousPosition.CopyFrom(this.Position);
		this.PreviousRotation.CopyFrom(this.Rotation);
		this.Position.CopyFrom(position);
		this.Rotation.CopyFrom(rotation);
		this.IsPhysicsDriven = true;
	}

	/** Snap both poses to the same value (spawn / teleport) so no interpolation streak is drawn. */
	public Teleport(position: Vec3, rotation?: Quat): void {
		this.Position.CopyFrom(position);
		this.PreviousPosition.CopyFrom(position);
		if (rotation) {
			this.Rotation.CopyFrom(rotation);
			this.PreviousRotation.CopyFrom(rotation);
		}
	}

	/** Pose to draw this frame. `alpha` = fraction of the current physics step elapsed (0..1). */
	public WriteInterpolated(alpha: number, out: Float64Array, offset: number): void {
		if (!this.IsPhysicsDriven) {
			out[offset] = this.Position.X;
			out[offset + 1] = this.Position.Y;
			out[offset + 2] = this.Position.Z;
			out[offset + 3] = this.Rotation.X;
			out[offset + 4] = this.Rotation.Y;
			out[offset + 5] = this.Rotation.Z;
			out[offset + 6] = this.Rotation.W;
			return;
		}

		const p0 = this.PreviousPosition, p1 = this.Position;
		out[offset] = p0.X + (p1.X - p0.X) * alpha;
		out[offset + 1] = p0.Y + (p1.Y - p0.Y) * alpha;
		out[offset + 2] = p0.Z + (p1.Z - p0.Z) * alpha;

		const q = Quat.Slerp(this.PreviousRotation, this.Rotation, alpha);
		out[offset + 3] = q.X;
		out[offset + 4] = q.Y;
		out[offset + 5] = q.Z;
		out[offset + 6] = q.W;
	}

	public ToFlat(): [number, number, number, number, number, number, number] {
		return [
			this.Position.X, this.Position.Y, this.Position.Z,
			this.Rotation.X, this.Rotation.Y, this.Rotation.Z, this.Rotation.W,
		];
	}
}
