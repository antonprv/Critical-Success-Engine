// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

export type Vec3Tuple = [number, number, number];

/** Same value as FMath.KINDA_SMALL_NUMBER in the Godot project (Framework/Math/Core/Constants.cs). */
export const KindaSmallNumber = 0.001;

/**
 * Mutable 3D vector. Field names (X/Y/Z) deliberately match System.Numerics / Godot so code ported from the
 * Start project (movement traits, character controller) reads almost line-for-line the same.
 *
 * Right-handed, Y-up, forward = -Z (Godot / Bepu convention - the render worker switches Babylon to a
 * right-handed system to match, see RenderScene).
 */
export class Vec3 {
	public X: number;
	public Y: number;
	public Z: number;

	public constructor(x: number = 0, y: number = 0, z: number = 0) {
		this.X = x;
		this.Y = y;
		this.Z = z;
	}

	public static Zero(): Vec3 { return new Vec3(0, 0, 0); }
	public static One(): Vec3 { return new Vec3(1, 1, 1); }
	public static Up(): Vec3 { return new Vec3(0, 1, 0); }
	public static Forward(): Vec3 { return new Vec3(0, 0, -1); }
	public static Right(): Vec3 { return new Vec3(1, 0, 0); }

	public static FromTuple(tuple: Readonly<Vec3Tuple>): Vec3 { return new Vec3(tuple[0], tuple[1], tuple[2]); }

	public ToTuple(): Vec3Tuple { return [this.X, this.Y, this.Z]; }

	public Clone(): Vec3 { return new Vec3(this.X, this.Y, this.Z); }

	public Set(x: number, y: number, z: number): this {
		this.X = x;
		this.Y = y;
		this.Z = z;
		return this;
	}

	public CopyFrom(other: Vec3): this {
		this.X = other.X;
		this.Y = other.Y;
		this.Z = other.Z;
		return this;
	}

	public Add(other: Vec3): Vec3 { return new Vec3(this.X + other.X, this.Y + other.Y, this.Z + other.Z); }
	public Sub(other: Vec3): Vec3 { return new Vec3(this.X - other.X, this.Y - other.Y, this.Z - other.Z); }
	public Mul(scalar: number): Vec3 { return new Vec3(this.X * scalar, this.Y * scalar, this.Z * scalar); }
	public Negated(): Vec3 { return new Vec3(-this.X, -this.Y, -this.Z); }

	public AddInPlace(other: Vec3): this {
		this.X += other.X;
		this.Y += other.Y;
		this.Z += other.Z;
		return this;
	}

	public MulInPlace(scalar: number): this {
		this.X *= scalar;
		this.Y *= scalar;
		this.Z *= scalar;
		return this;
	}

	public Dot(other: Vec3): number { return this.X * other.X + this.Y * other.Y + this.Z * other.Z; }

	public Cross(other: Vec3): Vec3 {
		return new Vec3(
			this.Y * other.Z - this.Z * other.Y,
			this.Z * other.X - this.X * other.Z,
			this.X * other.Y - this.Y * other.X
		);
	}

	public LengthSq(): number { return this.X * this.X + this.Y * this.Y + this.Z * this.Z; }
	public Length(): number { return Math.sqrt(this.LengthSq()); }

	/** Zero vector in -> zero vector out (matches FMath.Normalized's behaviour closely enough for movement code). */
	public Normalized(): Vec3 {
		const length = this.Length();
		return length > 1e-12 ? new Vec3(this.X / length, this.Y / length, this.Z / length) : new Vec3();
	}

	public NormalizeInPlace(): this {
		const length = this.Length();
		if (length > 1e-12) {
			this.X /= length;
			this.Y /= length;
			this.Z /= length;
		}
		return this;
	}

	public Lerp(to: Vec3, t: number): Vec3 {
		return new Vec3(
			this.X + (to.X - this.X) * t,
			this.Y + (to.Y - this.Y) * t,
			this.Z + (to.Z - this.Z) * t
		);
	}

	public IsNearlyZero(epsilon: number = KindaSmallNumber): boolean {
		return Math.abs(this.X) < epsilon && Math.abs(this.Y) < epsilon && Math.abs(this.Z) < epsilon;
	}

	public DistanceTo(other: Vec3): number { return this.Sub(other).Length(); }

	public ToString(): string { return `(${this.X.toFixed(2)}, ${this.Y.toFixed(2)}, ${this.Z.toFixed(2)})`; }
}
