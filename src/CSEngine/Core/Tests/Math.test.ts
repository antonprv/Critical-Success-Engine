// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";

import { Clamp, Clamp01, DegToRad, Lerp, RadToDeg } from "../Source/Engine/Math/MathUtils";
import { Quat } from "../Source/Engine/Math/Quat";
import { KindaSmallNumber, Vec3 } from "../Source/Engine/Math/Vec3";

const expectVec = (actual: Vec3, expected: [number, number, number], digits = 6): void => {
	expect(actual.X).toBeCloseTo(expected[0], digits);
	expect(actual.Y).toBeCloseTo(expected[1], digits);
	expect(actual.Z).toBeCloseTo(expected[2], digits);
};

describe("MathUtils", () => {
	it("converts between degrees and radians", () => {
		expect(180 * DegToRad).toBeCloseTo(Math.PI);
		expect(Math.PI * RadToDeg).toBeCloseTo(180);
	});

	it("clamps, lerps", () => {
		expect(Clamp(5, 0, 3)).toBe(3);
		expect(Clamp(-1, 0, 3)).toBe(0);
		expect(Clamp(2, 0, 3)).toBe(2);
		expect(Clamp01(1.5)).toBe(1);
		expect(Clamp01(-0.5)).toBe(0);
		expect(Clamp01(0.25)).toBe(0.25);
		expect(Lerp(10, 20, 0.25)).toBe(12.5);
	});
});

describe("Vec3", () => {
	it("has the usual constants (right-handed, Y up, forward -Z)", () => {
		expectVec(Vec3.Zero(), [0, 0, 0]);
		expectVec(Vec3.One(), [1, 1, 1]);
		expectVec(Vec3.Up(), [0, 1, 0]);
		expectVec(Vec3.Forward(), [0, 0, -1]);
		expectVec(Vec3.Right(), [1, 0, 0]);
	});

	it("converts to and from tuples and clones", () => {
		const v = Vec3.FromTuple([1, 2, 3]);
		expect(v.ToTuple()).toEqual([1, 2, 3]);
		const copy = v.Clone();
		copy.X = 9;
		expect(v.X).toBe(1);
		expect(new Vec3().Set(4, 5, 6).ToTuple()).toEqual([4, 5, 6]);
		expect(new Vec3().CopyFrom(v).ToTuple()).toEqual([1, 2, 3]);
	});

	it("does arithmetic without mutating (and in place when asked)", () => {
		const a = new Vec3(1, 2, 3), b = new Vec3(4, 5, 6);
		expectVec(a.Add(b), [5, 7, 9]);
		expectVec(b.Sub(a), [3, 3, 3]);
		expectVec(a.Mul(2), [2, 4, 6]);
		expectVec(a.Negated(), [-1, -2, -3]);
		expect(a.ToTuple()).toEqual([1, 2, 3]);

		expect(a.AddInPlace(b)).toBe(a);
		expectVec(a, [5, 7, 9]);
		expect(a.MulInPlace(2)).toBe(a);
		expectVec(a, [10, 14, 18]);
	});

	it("dot, cross, lengths, distance", () => {
		expect(new Vec3(1, 2, 3).Dot(new Vec3(4, -5, 6))).toBe(12);
		expectVec(Vec3.Right().Cross(Vec3.Up()), [0, 0, 1]);
		expect(new Vec3(3, 4, 0).Length()).toBe(5);
		expect(new Vec3(3, 4, 0).LengthSq()).toBe(25);
		expect(new Vec3(1, 1, 1).DistanceTo(new Vec3(1, 1, 4))).toBe(3);
	});

	it("normalises, and maps the zero vector to zero", () => {
		expectVec(new Vec3(0, 3, 4).Normalized(), [0, 0.6, 0.8]);
		expectVec(new Vec3().Normalized(), [0, 0, 0]);

		const v = new Vec3(0, 0, 2);
		expect(v.NormalizeInPlace()).toBe(v);
		expectVec(v, [0, 0, 1]);
		expectVec(new Vec3().NormalizeInPlace(), [0, 0, 0]);
	});

	it("lerps and detects 'nearly zero'", () => {
		expectVec(new Vec3(0, 0, 0).Lerp(new Vec3(10, 20, 30), 0.5), [5, 10, 15]);
		expect(new Vec3(0, 0, 0).IsNearlyZero()).toBe(true);
		expect(new Vec3(KindaSmallNumber / 2, 0, 0).IsNearlyZero()).toBe(true);
		expect(new Vec3(0, KindaSmallNumber * 2, 0).IsNearlyZero()).toBe(false);
		expect(new Vec3(0, 0, 0.5).IsNearlyZero(1)).toBe(true);
		expect(new Vec3(0.1, 0, 0).IsNearlyZero(0.01)).toBe(false);
	});

	it("prints compactly", () => {
		expect(new Vec3(1, 2.345, -3).ToString()).toBe("(1.00, 2.35, -3.00)");
	});
});

describe("Quat", () => {
	const forward = Vec3.Forward();

	it("identity and tuples", () => {
		expect(Quat.Identity().ToTuple()).toEqual([0, 0, 0, 1]);
		expect(Quat.FromTuple([1, 2, 3, 4]).ToTuple()).toEqual([1, 2, 3, 4]);
		const q = new Quat().Set(1, 2, 3, 4);
		expect(q.ToTuple()).toEqual([1, 2, 3, 4]);
		expect(new Quat().CopyFrom(q).ToTuple()).toEqual([1, 2, 3, 4]);
		const clone = q.Clone();
		clone.X = 99;
		expect(q.X).toBe(1);
	});

	it("rotates about an axis; +90 degrees about Y turns forward (-Z) to the left (-X)", () => {
		expectVec(Quat.FromAxisAngle(Vec3.Up(), Math.PI / 2).Rotate(forward), [-1, 0, 0]);
		expectVec(Quat.FromAxisAngle(new Vec3(0, 5, 0), Math.PI).Rotate(Vec3.Right()), [-1, 0, 0]); // axis is normalised
	});

	it("builds yaw/pitch like an FPS camera: positive pitch looks up", () => {
		expectVec(Quat.FromYawPitch(0, Math.PI / 2).Rotate(forward), [0, 1, 0]);
		expectVec(Quat.FromYawPitch(Math.PI / 2, 0).Rotate(forward), [-1, 0, 0]);
	});

	it("multiplies (the right operand is applied first) and inverts", () => {
		const yaw = Quat.FromAxisAngle(Vec3.Up(), Math.PI / 2);
		const pitch = Quat.FromAxisAngle(Vec3.Right(), Math.PI / 2);
		expectVec(yaw.Mul(pitch).Rotate(forward), [0, 1, 0].map((v, i) => (i === 1 ? 1 : v)) as [number, number, number]);

		expectVec(yaw.Inverse().Rotate(yaw.Rotate(Vec3.One())), [1, 1, 1]);
		expect(new Quat(0, 0, 0, 0).Inverse().ToTuple()).toEqual([0, 0, 0, 1]); // degenerate -> identity
	});

	it("normalises, and maps a zero quaternion to identity", () => {
		const q = new Quat(0, 0, 0, 2).Normalized();
		expect(q.ToTuple()).toEqual([0, 0, 0, 1]);
		expect(new Quat(0, 0, 0, 0).Normalized().ToTuple()).toEqual([0, 0, 0, 1]);
	});

	it("looks at every direction: forward ends up pointing at the target", () => {
		const directions: [number, number, number][] = [
			[0, 0, -1], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 1, 0.01], [0, -1, 0.01],
			[1, 1, 1], [-1, 1, -1], [1, -1, 1], [-3, -2, 5], [2, 5, -1], [0.2, -4, -0.1],
		];
		for (const d of directions) {
			const target = new Vec3(...d);
			const q = Quat.LookAt(new Vec3(1, 2, 3), new Vec3(1, 2, 3).Add(target));
			const dir = q.Rotate(forward);
			const unit = target.Normalized();
			expectVec(dir, [unit.X, unit.Y, unit.Z], 4);
		}
	});

	it("handles degenerate look-at requests", () => {
		expect(Quat.LookAt(Vec3.One(), Vec3.One()).ToTuple()).toEqual([0, 0, 0, 1]);                      // same point
		const straightUp = Quat.LookAt(Vec3.Zero(), new Vec3(0, 5, 0));                                   // parallel to the up hint
		expectVec(straightUp.Rotate(forward), [0, 1, 0], 4);
		const custom = Quat.LookAt(Vec3.Zero(), new Vec3(0, 0, -5), new Vec3(1, 0, 0));                   // custom up hint
		expectVec(custom.Rotate(forward), [0, 0, -1], 4);
	});

	it("slerps along the short way", () => {
		const a = Quat.Identity();
		const b = Quat.FromAxisAngle(Vec3.Up(), Math.PI / 2);

		expectVec(Quat.Slerp(a, b, 0.5).Rotate(forward), [-Math.SQRT1_2, 0, -Math.SQRT1_2], 5);
		expectVec(Quat.Slerp(a, b, 0).Rotate(forward), [0, 0, -1]);
		expectVec(Quat.Slerp(a, b, 1).Rotate(forward), [-1, 0, 0]);

		// -b is the same rotation as b: slerp must flip it instead of going the long way round.
		const negated = new Quat(-b.X, -b.Y, -b.Z, -b.W);
		expectVec(Quat.Slerp(a, negated, 0.5).Rotate(forward), [-Math.SQRT1_2, 0, -Math.SQRT1_2], 5);

		// Nearly identical orientations take the lerp path (no division by sin(~0)).
		const almost = Quat.FromAxisAngle(Vec3.Up(), 0.001);
		const mid = Quat.Slerp(a, almost, 0.5);
		expect(mid.W).toBeCloseTo(1, 6);
		expect(Number.isFinite(mid.Y)).toBe(true);
	});
});
