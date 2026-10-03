// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Vec3 } from "./Vec3";

export type QuatTuple = [number, number, number, number];

/** Unit quaternion (x, y, z, w), same layout as System.Numerics.Quaternion and Babylon's Quaternion. */
export class Quat {
	public X: number;
	public Y: number;
	public Z: number;
	public W: number;

	public constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
		this.X = x;
		this.Y = y;
		this.Z = z;
		this.W = w;
	}

	public static Identity(): Quat { return new Quat(0, 0, 0, 1); }

	public static FromTuple(tuple: Readonly<QuatTuple>): Quat { return new Quat(tuple[0], tuple[1], tuple[2], tuple[3]); }

	public ToTuple(): QuatTuple { return [this.X, this.Y, this.Z, this.W]; }

	public static FromAxisAngle(axis: Vec3, angleRadians: number): Quat {
		const unit = axis.Normalized();
		const half = angleRadians * 0.5;
		const s = Math.sin(half);
		return new Quat(unit.X * s, unit.Y * s, unit.Z * s, Math.cos(half));
	}

	/** Yaw about +Y first, then pitch about the (yawed) X axis - the usual FPS camera order. Angles in radians. */
	public static FromYawPitch(yaw: number, pitch: number): Quat {
		const yawQuat = Quat.FromAxisAngle(new Vec3(0, 1, 0), yaw);
		const pitchQuat = Quat.FromAxisAngle(new Vec3(1, 0, 0), pitch);
		return yawQuat.Mul(pitchQuat);
	}

	/**
	 * Orientation whose forward (-Z) axis points from `from` towards `to`, with +Y as the up hint.
	 * Used by scenes to aim a camera without hand-computing quaternions.
	 */
	public static LookAt(from: Vec3, to: Vec3, up: Vec3 = new Vec3(0, 1, 0)): Quat {
		const back = from.Sub(to).Normalized();
		if (back.LengthSq() < 1e-12) return Quat.Identity();

		let right = up.Cross(back);
		if (right.LengthSq() < 1e-12) right = new Vec3(1, 0, 0);
		right = right.Normalized();
		const trueUp = back.Cross(right);

		// Rotation matrix with columns (right, trueUp, back) -> quaternion.
		const m00 = right.X, m01 = trueUp.X, m02 = back.X;
		const m10 = right.Y, m11 = trueUp.Y, m12 = back.Y;
		const m20 = right.Z, m21 = trueUp.Z, m22 = back.Z;
		const trace = m00 + m11 + m22;

		let result: Quat;
		if (trace > 0) {
			const s = Math.sqrt(trace + 1) * 2;
			result = new Quat((m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s);
		} else if (m00 > m11 && m00 > m22) {
			const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
			result = new Quat(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
		} else if (m11 > m22) {
			const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
			result = new Quat((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
		} else {
			const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
			result = new Quat((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
		}
		return result.Normalized();
	}

	public Clone(): Quat { return new Quat(this.X, this.Y, this.Z, this.W); }

	public CopyFrom(other: Quat): this {
		this.X = other.X;
		this.Y = other.Y;
		this.Z = other.Z;
		this.W = other.W;
		return this;
	}

	public Set(x: number, y: number, z: number, w: number): this {
		this.X = x;
		this.Y = y;
		this.Z = z;
		this.W = w;
		return this;
	}

	/** Hamilton product: the result applies `other` first, then `this`. */
	public Mul(other: Quat): Quat {
		return new Quat(
			this.W * other.X + this.X * other.W + this.Y * other.Z - this.Z * other.Y,
			this.W * other.Y - this.X * other.Z + this.Y * other.W + this.Z * other.X,
			this.W * other.Z + this.X * other.Y - this.Y * other.X + this.Z * other.W,
			this.W * other.W - this.X * other.X - this.Y * other.Y - this.Z * other.Z
		);
	}

	public Inverse(): Quat {
		const lengthSq = this.X * this.X + this.Y * this.Y + this.Z * this.Z + this.W * this.W;
		if (lengthSq < 1e-12) return Quat.Identity();
		return new Quat(-this.X / lengthSq, -this.Y / lengthSq, -this.Z / lengthSq, this.W / lengthSq);
	}

	public Normalized(): Quat {
		const length = Math.sqrt(this.X * this.X + this.Y * this.Y + this.Z * this.Z + this.W * this.W);
		return length > 1e-12 ? new Quat(this.X / length, this.Y / length, this.Z / length, this.W / length) : Quat.Identity();
	}

	public Rotate(v: Vec3): Vec3 {
		// v' = v + 2w(q x v) + 2 q x (q x v)
		const qx = this.X, qy = this.Y, qz = this.Z, qw = this.W;
		const tx = 2 * (qy * v.Z - qz * v.Y);
		const ty = 2 * (qz * v.X - qx * v.Z);
		const tz = 2 * (qx * v.Y - qy * v.X);
		return new Vec3(
			v.X + qw * tx + (qy * tz - qz * ty),
			v.Y + qw * ty + (qz * tx - qx * tz),
			v.Z + qw * tz + (qx * ty - qy * tx)
		);
	}

	public static Slerp(from: Quat, to: Quat, t: number): Quat {
		let cosHalfTheta = from.X * to.X + from.Y * to.Y + from.Z * to.Z + from.W * to.W;
		let target = to;
		if (cosHalfTheta < 0) {
			// Take the short way round.
			target = new Quat(-to.X, -to.Y, -to.Z, -to.W);
			cosHalfTheta = -cosHalfTheta;
		}

		if (cosHalfTheta > 0.9995) {
			// Nearly identical: lerp + renormalise avoids dividing by sin(~0).
			return new Quat(
				from.X + (target.X - from.X) * t,
				from.Y + (target.Y - from.Y) * t,
				from.Z + (target.Z - from.Z) * t,
				from.W + (target.W - from.W) * t
			).Normalized();
		}

		const halfTheta = Math.acos(cosHalfTheta);
		const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta);
		const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
		const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
		return new Quat(
			from.X * ratioA + target.X * ratioB,
			from.Y * ratioA + target.Y * ratioB,
			from.Z * ratioA + target.Z * ratioB,
			from.W * ratioA + target.W * ratioB
		);
	}
}
