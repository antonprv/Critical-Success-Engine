// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { PhysBodyType, PhysObjectKind, PhysShape } from "../../../Workers/Common/CommonEnums";
import type { PhysicsShapeDescriptor } from "../../../Workers/Protocol/PhysicsGameLogicProtocol";
import { Logger } from "../../../Logging/Logger";
import { Component } from "../../Core/Component";
import { CollisionLayer } from "../../Core/CollisionLayer";
import type { Entity } from "../../Core/Entity";
import { Shapes } from "../../Core/Shapes";
import { Clamp } from "../../Math/MathUtils";
import { Vec3 } from "../../Math/Vec3";
import { PhysicsBody } from "./PhysicsBodies";

/**
 * Non-solid sensor volume - the BEPU equivalent of Godot's Area3D (BepuTriggerArea3D). The narrow phase still
 * generates contacts so overlaps are detected, but no solver constraint exists, so nothing collides with it.
 *
 * Subclass and override `OnBodyEntered` / `OnBodyExited`, or put a component next to it that implements OnTriggerEnter.
 * Set `BuildAsStatic = false` for a trigger that moves (it then follows the entity's Transform).
 */
export class TriggerArea extends PhysicsBody {
	public BuildAsStatic = true;

	protected override readonly ObjectKind = PhysObjectKind.Trigger;
	protected get BodyType(): PhysBodyType { return this.BuildAsStatic ? PhysBodyType.Static : PhysBodyType.Kinematic; }

	private readonly _inside = new Set<number>();

	public constructor() {
		super();
		this.Layer = CollisionLayer.Trigger;
		this.Mask = CollisionLayer.All;
	}

	/** Entities currently inside. */
	public get BodiesInside(): ReadonlySet<number> { return this._inside; }

	public override OnPhysicsUpdate(): void {
		if (this.BuildAsStatic) return;
		this.Engine.Physics.SetPose(this.Entity.Id, this.Transform.ToFlat());
	}

	public override OnTriggerEnter(other: Entity): void {
		if (this._inside.has(other.Id)) return;
		this._inside.add(other.Id);
		this.OnBodyEntered(other);
	}

	public override OnTriggerExit(other: Entity): void {
		if (!this._inside.delete(other.Id)) return;
		this.OnBodyExited(other);
	}

	protected OnBodyEntered(_body: Entity): void { /* override */ }
	protected OnBodyExited(_body: Entity): void { /* override */ }
}

/**
 * Lightweight trigger that never touches the physics engine (BepuTriggerAreaSimple): each physics step it checks
 * whether ONE tracked target entity (typically the player) is inside its shape. Two stages: a cheap point-in-shape test
 * every step decides enter/exit, and a swept segment test from the last sampled position to the current one catches a fast
 * target that crossed the whole volume between two samples (it then gets an enter immediately followed by an exit).
 *
 * Supports Box / Sphere / Capsule shapes. The target is treated as a point - inflate the shape for its radius.
 */
export class SimpleTriggerArea extends Component {
	public Shape: PhysicsShapeDescriptor = Shapes.Box(2, 2, 2);
	public TargetName = "Player";

	public IsInside = false;

	private _target: Entity | undefined;
	private readonly _lastSampled = new Vec3();
	private _hasSample = false;

	public override Start(): void {
		this._target = this.Engine.World.FindByName(this.TargetName);
	}

	public override OnPhysicsUpdate(): void {
		this._target ??= this.Engine.World.FindByName(this.TargetName);
		if (!this._target) return;

		const inverse = this.Transform.Rotation.Inverse();
		const toLocal = (world: Vec3): Vec3 => inverse.Rotate(world.Sub(this.Transform.Position));

		const current = this._target.Transform.Position;
		const currentLocal = toLocal(current);

		// First tick: nothing to sweep from yet, just take the initial sample.
		if (!this._hasSample) {
			this._hasSample = true;
			this._lastSampled.CopyFrom(current);
			this.IsInside = this.Contains(currentLocal);
			return;
		}

		const coarseInside = this.Contains(currentLocal);

		if (!this.IsInside && coarseInside) {
			this.IsInside = true;
			this.OnBodyEnter(this._target);
		} else if (this.IsInside && !coarseInside) {
			this.IsInside = false;
			this.OnBodyExit(this._target);
		} else if (!this.IsInside && !coarseInside && this.Intersects(toLocal(this._lastSampled), currentLocal)) {
			// Outside before, outside now, yet the path between the two samples went through the volume.
			this.OnBodyEnter(this._target);
			this.OnBodyExit(this._target);
		}

		this._lastSampled.CopyFrom(current);
	}

	protected OnBodyEnter(_target: Entity): void { /* override */ }
	protected OnBodyExit(_target: Entity): void { /* override */ }

	private Contains(local: Vec3): boolean {
		const shape = this.Shape;
		switch (shape.shape) {
			case PhysShape.Box: {
				const half = [shape.size[0] * 0.5, shape.size[1] * 0.5, shape.size[2] * 0.5];
				return Math.abs(local.X) <= half[0]! && Math.abs(local.Y) <= half[1]! && Math.abs(local.Z) <= half[2]!;
			}
			case PhysShape.Sphere:
				return local.LengthSq() <= shape.radius * shape.radius;
			case PhysShape.Capsule: {
				const halfSegment = shape.cylinderLength * 0.5;
				const closest = new Vec3(0, Clamp(local.Y, -halfSegment, halfSegment), 0);
				return local.Sub(closest).LengthSq() <= shape.radius * shape.radius;
			}
			default:
				Logger.LogError(`${this.Entity.Name}: SimpleTriggerArea doesn't support this shape. Use Box/Sphere/Capsule.`);
				return false;
		}
	}

	private Intersects(from: Vec3, to: Vec3): boolean {
		const shape = this.Shape;
		switch (shape.shape) {
			case PhysShape.Box:
				return SimpleTriggerArea.SegmentIntersectsBox(from, to, new Vec3(shape.size[0] * 0.5, shape.size[1] * 0.5, shape.size[2] * 0.5));
			case PhysShape.Sphere:
				return SimpleTriggerArea.SegmentIntersectsSphere(from, to, shape.radius);
			case PhysShape.Capsule:
				return SimpleTriggerArea.SegmentSegmentDistanceSquared(
					from, to, new Vec3(0, -shape.cylinderLength * 0.5, 0), new Vec3(0, shape.cylinderLength * 0.5, 0)
				) <= shape.radius * shape.radius;
			default:
				return false;
		}
	}

	//#region Geometry

	private static SegmentIntersectsBox(from: Vec3, to: Vec3, halfExtents: Vec3): boolean {
		const direction = to.Sub(from);
		const range = { enter: 0, exit: 1 };
		return SimpleTriggerArea.ClipAxis(from.X, direction.X, halfExtents.X, range)
			&& SimpleTriggerArea.ClipAxis(from.Y, direction.Y, halfExtents.Y, range)
			&& SimpleTriggerArea.ClipAxis(from.Z, direction.Z, halfExtents.Z, range);
	}

	private static ClipAxis(origin: number, direction: number, halfExtent: number, range: { enter: number; exit: number; }): boolean {
		if (Math.abs(direction) < 1e-8) return origin >= -halfExtent && origin <= halfExtent;

		const inverse = 1 / direction;
		let t1 = (-halfExtent - origin) * inverse;
		let t2 = (halfExtent - origin) * inverse;
		if (t1 > t2) [t1, t2] = [t2, t1];

		range.enter = Math.max(range.enter, t1);
		range.exit = Math.min(range.exit, t2);
		return range.enter <= range.exit;
	}

	/**
	 * NOTE for the Godot original: SegmentIntersectsSphere there uses `a = |d|` (instead of d.d) and `c = |from| - r^2`
	 * (instead of |from|^2 - r^2), so the quadratic is wrong whenever the segment is not unit length. Done properly here.
	 */
	private static SegmentIntersectsSphere(from: Vec3, to: Vec3, radius: number): boolean {
		const direction = to.Sub(from);
		const a = direction.Dot(direction);

		if (a < 1e-12) return from.LengthSq() <= radius * radius;

		const b = 2 * from.Dot(direction);
		const c = from.LengthSq() - radius * radius;
		const discriminant = b * b - 4 * a * c;
		if (discriminant < 0) return false;

		const root = Math.sqrt(discriminant);
		const t0 = (-b - root) / (2 * a);
		const t1 = (-b + root) / (2 * a);
		return t1 >= 0 && t0 <= 1; // segment [0,1] overlaps the root interval [t0,t1]
	}

	/**
	 * Closest distance SQUARED between segment p1-q1 and segment p2-q2 (Ericson, Real-Time Collision Detection 5.1.9).
	 * NOTE for the Godot original: it returns `.FastLength()` (not squared) and then compares against radius^2.
	 */
	private static SegmentSegmentDistanceSquared(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
		const epsilon = 1e-8;
		const d1 = q1.Sub(p1);
		const d2 = q2.Sub(p2);
		const r = p1.Sub(p2);
		const a = d1.Dot(d1);
		const e = d2.Dot(d2);
		const f = d2.Dot(r);

		let s: number, t: number;

		if (a <= epsilon && e <= epsilon) {
			s = 0;
			t = 0;
		} else if (a <= epsilon) {
			s = 0;
			t = Clamp(f / e, 0, 1);
		} else {
			const c = d1.Dot(r);
			if (e <= epsilon) {
				t = 0;
				s = Clamp(-c / a, 0, 1);
			} else {
				const b = d1.Dot(d2);
				const denominator = a * e - b * b;

				s = denominator > epsilon ? Clamp((b * f - c * e) / denominator, 0, 1) : 0;
				t = (b * s + f) / e;

				if (t < 0) {
					t = 0;
					s = Clamp(-c / a, 0, 1);
				} else if (t > 1) {
					t = 1;
					s = Clamp((b - c) / a, 0, 1);
				}
			}
		}

		return p1.Add(d1.Mul(s)).Sub(p2.Add(d2.Mul(t))).LengthSq();
	}

	//#endregion
}
