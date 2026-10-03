// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { Clamp, Clamp01, DegToRad, Lerp, RadToDeg } from "../Source/Engine/Math/MathUtils";
import { Quat } from "../Source/Engine/Math/Quat";
import { KindaSmallNumber, Vec3 } from "../Source/Engine/Math/Vec3";

const close = (a: Vec3, b: Vec3, digits = 6): void => {
	expect(a.X).toBeCloseTo(b.X, digits);
	expect(a.Y).toBeCloseTo(b.Y, digits);
	expect(a.Z).toBeCloseTo(b.Z, digits);
};

describe("MathUtils", () => {
	it("converts between degrees and radians", () => {
		expect(180 * DegToRad).toBeCloseTo(Math.PI);
		expect(Math.PI * RadToDeg).toBeCloseTo(180);
	});

	it("clamps and lerps", () => {
		expect(Clamp(5, 0, 3)).toBe(3);
		expect(Clamp(-5, 0, 3)).toBe(0);
		expect(Clamp(2, 0, 3)).toBe(2);
		expect(Clamp01(1.5)).toBe(1);
		expect(Clamp01(-0.5)).toBe(0);
		expect(Lerp(10, 20, 0.25)).toBe(12.5);
	});
});

describe("Vec3", () => {
	it("has the usual constants (right-handed, Y up, forward = -Z)", () => {
		expect(Vec3.Zero().ToTuple()).toEqual([0, 0, 0]);
		expect(Vec3.One().ToTuple()).toEqual([1, 1, 1]);
		expect(Vec3.Up().ToTuple()).toEqual([0, 1, 0]);
		expect(Vec3.Forward().ToTuple()).toEqual([0, 0, -1]);
		expect(Vec3.Right().ToTuple()).toEqual([1, 0, 0]);
	});

	it("converts to and from tuples, clones, sets and copies", () => {
		const v = Vec3.FromTuple([1, 2, 3]);
		expect(v.ToTuple()).toEqual([1, 2, 3]);

		const clone = v.Clone();
		clone.X = 9;
		expect(v.X).toBe(1);

		expect(v.Set(4, 5, 6)).toBe(v);
		expect(v.ToTuple()).toEqual([4, 5, 6]);
		expect(new Vec3().CopyFrom(v).ToTuple()).toEqual([4, 5, 6]);
		expect(new Vec3().ToTuple()).toEqual([0, 0, 0]);
	});

	it("does arithmetic without mutating (Add, Sub, Mul, Negated)", () => {
		const a = new Vec3(1, 2, 3), b = new Vec3(4, 5, 6);
		expect(a.Add(b).ToTuple()).toEqual([5, 7, 9]);
		expect(a.Sub(b).ToTuple()).toEqual([-3, -3, -3]);
		expect(a.Mul(2).ToTuple()).toEqual([2, 4, 6]);
		expect(a.Negated().ToTuple()).toEqual([-1, -2, -3]);
		expect(a.ToTuple()).toEqual([1, 2, 3]);
	});

	it("mutates in place (AddInPlace, MulInPlace, NormalizeInPlace)", () => {
		const a = new Vec3(1, 2, 3);
		expect(a.AddInPlace(new Vec3(1, 1, 1))).toBe(a);
		expect(a.ToTuple()).toEqual([2, 3, 4]);
		expect(a.MulInPlace(2)).toBe(a);
		expect(a.ToTuple()).toEqual([4, 6, 8]);

		const n = new Vec3(0, 3, 4).NormalizeInPlace();
		expect(n.ToTuple()).toEqual([0, 0.6, 0.8]);

		const zero = new Vec3().NormalizeInPlace();
		expect(zero.ToTuple()).toEqual([0, 0, 0]);
	});

	it("dot, cross, length", () => {
		expect(new Vec3(1, 2, 3).Dot(new Vec3(4, 5, 6))).toBe(32);
		expect(Vec3.Right().Cross(Vec3.Up()).ToTuple()).toEqual([0, 0, 1]);
		expect(new Vec3(3, 4, 0).Length()).toBe(5);
		expect(new Vec3(3, 4, 0).LengthSq()).toBe(25);
	});

	it("Normalized returns a unit vector, and zero for zero", () => {
		close(new Vec3(0, 0, 5).Normalized(), new Vec3(0, 0, 1));
		expect(new Vec3().Normalized().ToTuple()).toEqual([0, 0, 0]);
	});

	it("Lerp, IsNearlyZero, DistanceTo, ToString", () => {
		expect(new Vec3(0, 0, 0).Lerp(new Vec3(10, 20, 30), 0.5).ToTuple()).toEqual([5, 10, 15]);

		expect(new Vec3(0.0005, -0.0005, 0).IsNearlyZero()).toBe(true);
		expect(new Vec3(0.002, 0, 0).IsNearlyZero()).toBe(false);
		expect(new Vec3(0.05, 0, 0).IsNearlyZero(0.1)).toBe(true);
		expect(KindaSmallNumber).toBe(0.001);

		expect(new Vec3(1, 1, 1).DistanceTo(new Vec3(1, 4, 5))).toBe(5);
		expect(new Vec3(1, 2.345, 3).ToString()).toBe("(1.00, 2.35, 3.00)");
	});
});

describe("Quat", () => {
	const forwardOf = (q: Quat): Vec3 => q.Rotate(Vec3.Forward());

	it("converts to and from tuples, clones, sets, copies; identity does nothing", () => {
		const q = Quat.FromTuple([0.1, 0.2, 0.3, 0.9]);
		expect(q.ToTuple()).toEqual([0.1, 0.2, 0.3, 0.9]);
		expect(q.Clone().ToTuple()).toEqual([0.1, 0.2, 0.3, 0.9]);
		expect(new Quat().CopyFrom(q).ToTuple()).toEqual([0.1, 0.2, 0.3, 0.9]);
		expect(new Quat().Set(1, 2, 3, 4).ToTuple()).toEqual([1, 2, 3, 4]);
		close(Quat.Identity().Rotate(new Vec3(1, 2, 3)), new Vec3(1, 2, 3));
	});

	it("FromAxisAngle: +90 degrees about Y turns forward (-Z) to the left (-X)", () => {
		close(forwardOf(Quat.FromAxisAngle(Vec3.Up(), Math.PI / 2)), new Vec3(-1, 0, 0));
	});

	it("FromYawPitch: pitch looks up, yaw turns left", () => {
		close(forwardOf(Quat.FromYawPitch(0, Math.PI / 2)), new Vec3(0, 1, 0));
		close(forwardOf(Quat.FromYawPitch(Math.PI / 2, 0)), new Vec3(-1, 0, 0));
	});

	it("Mul applies the right-hand rotation first; Inverse undoes a rotation", () => {
		const yaw = Quat.FromAxisAngle(Vec3.Up(), Math.PI / 2);
		const pitch = Quat.FromAxisAngle(Vec3.Right(), Math.PI / 2);
		close(yaw.Mul(pitch).Rotate(Vec3.Forward()), yaw.Rotate(pitch.Rotate(Vec3.Forward())));
		close(yaw.Inverse().Rotate(yaw.Rotate(new Vec3(1, 2, 3))), new Vec3(1, 2, 3));
		expect(new Quat(0, 0, 0, 0).Inverse().ToTuple()).toEqual([0, 0, 0, 1]);
	});

	it("Normalized returns a unit quaternion, identity for zero", () => {
		const n = new Quat(0, 0, 0, 2).Normalized();
		expect(n.ToTuple()).toEqual([0, 0, 0, 1]);
		expect(new Quat(0, 0, 0, 0).Normalized().ToTuple()).toEqual([0, 0, 0, 1]);
	});

	describe("LookAt (one case per branch of the matrix -> quaternion conversion)", () => {
		const cases: [string, [number, number, number], [number, number, number], [number, number, number]][] = [
			["looking down -Z (trace > 0)", [0, 0, 0], [0, 0, -1], [0, 1, 0]],
			["looking sideways", [0, 0, 0], [3, 0, 0], [0, 1, 0]],
			["looking up and left", [1, 1, 1], [-4, 5, -2], [0, 1, 0]],
			["upside-down looking +Z (x largest)", [0, 0, 0], [0, 0, 1], [0, -1, 0]],
			["turned around (y largest)", [0, 0, 0], [0, 0, 1], [0, 1, 0]],
			["upside-down looking -Z (z largest)", [0, 0, 0], [0, 0, -1], [0, -1, 0]],
		];

		for (const [name, from, to, up] of cases) {
			it(`${name}: forward points at the target`, () => {
				const q = Quat.LookAt(Vec3.FromTuple(from), Vec3.FromTuple(to), Vec3.FromTuple(up));
				const expected = Vec3.FromTuple(to).Sub(Vec3.FromTuple(from)).Normalized();
				close(forwardOf(q), expected, 5);
				expect(Math.hypot(...q.ToTuple())).toBeCloseTo(1, 6);
			});
		}

		it("defaults the up hint to +Y", () => {
			close(forwardOf(Quat.LookAt(new Vec3(0, 0, 0), new Vec3(0, 0, -5))), new Vec3(0, 0, -1));
		});

		it("returns identity when from == to", () => {
			expect(Quat.LookAt(new Vec3(1, 1, 1), new Vec3(1, 1, 1)).ToTuple()).toEqual([0, 0, 0, 1]);
		});

		it("copes with looking straight up (up hint parallel to the view direction)", () => {
			const q = Quat.LookAt(new Vec3(0, 0, 0), new Vec3(0, 5, 0));
			close(forwardOf(q), new Vec3(0, 1, 0), 5);
		});
	});

	describe("Slerp", () => {
		const a = Quat.FromAxisAngle(Vec3.Up(), 0);
		const b = Quat.FromAxisAngle(Vec3.Up(), Math.PI / 2);

		it("interpolates halfway on the short arc", () => {
			close(forwardOf(Quat.Slerp(a, b, 0.5)), forwardOf(Quat.FromAxisAngle(Vec3.Up(), Math.PI / 4)));
		});

		it("hits the endpoints", () => {
			close(forwardOf(Quat.Slerp(a, b, 0)), forwardOf(a));
			close(forwardOf(Quat.Slerp(a, b, 1)), forwardOf(b));
		});

		it("takes the short way round when the quaternions are on opposite hemispheres", () => {
			const negated = new Quat(-b.X, -b.Y, -b.Z, -b.W);
			close(forwardOf(Quat.Slerp(a, negated, 0.5)), forwardOf(Quat.FromAxisAngle(Vec3.Up(), Math.PI / 4)));
		});

		it("falls back to a normalised lerp for nearly identical quaternions", () => {
			const c = Quat.FromAxisAngle(Vec3.Up(), 0.0001);
			const r = Quat.Slerp(a, c, 0.5);
			expect(Math.hypot(...r.ToTuple())).toBeCloseTo(1, 9);
			close(forwardOf(r), forwardOf(Quat.FromAxisAngle(Vec3.Up(), 0.00005)), 7);
		});
	});
});
