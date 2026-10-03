// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Example gameplay scripts. Each one is a plain Component: a few public fields (settable from a manifest with Comp(...))
// and the hooks it cares about. This is what "scripting like in Godot" looks like in this engine.

import { CollisionLayer } from "../../Engine/Core/CollisionLayer";
import { Component } from "../../Engine/Core/Component";
import { Comp, Ent } from "../../Engine/Core/EntityManifest";
import type { Entity } from "../../Engine/Core/Entity";
import { MeshForShape, Shapes } from "../../Engine/Core/Shapes";
import { CameraComponent } from "../../Engine/Components/Camera/CameraComponent";
import { MeshRenderer } from "../../Engine/Components/MeshRenderer";
import { Projectile, type IProjectileHitListener } from "../../Engine/Components/Physics/Projectile";
import { RigidBody } from "../../Engine/Components/Physics/PhysicsBodies";
import { TriggerArea } from "../../Engine/Components/Physics/TriggerAreas";
import { Quat } from "../../Engine/Math/Quat";
import { Vec3, type Vec3Tuple } from "../../Engine/Math/Vec3";
import type { InputService } from "../../Engine/Services/InputService";
import type { UiService } from "../../Engine/Services/UiService";

/** Space = kick this rigid body upwards (the original demo's jumping ball). */
export class JumpOnSpace extends Component {
	public Impulse = 6;

	public override OnInputUpdate(input: InputService): void {
		if (input.JustPressed("Space")) this.Entity.RequireComponent(RigidBody).ApplyImpulse(new Vec3(0, this.Impulse, 0));
	}
}

/** Static text lines on the HUD. */
export class HudText extends Component {
	public Lines: string[] = [];

	public override OnUIUpdate(ui: UiService): void {
		this.Lines.forEach((line, index) => ui.SetHud(`hint.${this.Entity.Id}.${index}`, line));
	}
}

/** Prints a toast + recolours the entity's mesh while something stands inside the trigger volume. */
export class TriggerZone extends TriggerArea {
	public IdleColor: Vec3Tuple = [0.2, 0.6, 0.9];
	public ActiveColor: Vec3Tuple = [0.2, 0.9, 0.35];

	protected override OnBodyEntered(body: Entity): void {
		this.Entity.GetComponent(MeshRenderer)?.SetColor(this.ActiveColor);
		this.Engine.Ui.Toast(`${body.Name} entered ${this.Entity.Name}`);
	}

	protected override OnBodyExited(body: Entity): void {
		if (this.BodiesInside.size === 0) this.Entity.GetComponent(MeshRenderer)?.SetColor(this.IdleColor);
		this.Engine.Ui.Toast(`${body.Name} left ${this.Entity.Name}`);
	}
}

/**
 * Moves a kinematic body back and forth along an axis. Must be listed BEFORE KinematicBody in the manifest: components
 * run top to bottom, and KinematicBody pushes whatever pose is on the Transform at that moment to the simulation.
 */
export class PlatformMover extends Component {
	public Axis: Vec3Tuple = [0, 1, 0];
	public Distance = 2;
	public PeriodSeconds = 4;

	private _origin = new Vec3();
	private _time = 0;

	public override Start(): void {
		this._origin = this.Transform.Position.Clone();
	}

	public override OnPhysicsUpdate(dt: number): void {
		this._time += dt;
		const offset = Math.sin((this._time / this.PeriodSeconds) * Math.PI * 2) * this.Distance;
		const position = this._origin.Add(Vec3.FromTuple(this.Axis).Normalized().Mul(offset));
		this.Transform.PushPhysicsPose(position, this.Transform.Rotation);
	}
}

/** Left mouse button fires a projectile from the camera along its view direction. */
export class Shooter extends Component {
	public CameraName = "Camera";
	public Speed = 40;

	public override OnInputUpdate(input: InputService): void {
		if (!input.JustPressed("Mouse0")) return;

		const camera = this.Engine.World.FindByName(this.CameraName)?.GetComponent(CameraComponent);
		if (!camera) return;

		const forward = camera.GetForwardDirection();
		const origin = camera.Transform.Position.Add(forward.Mul(1.2));
		const shape = Shapes.Sphere(0.1);

		const bullet = this.Engine.World.Spawn(Ent("Bullet", [
			Comp(MeshRenderer, { Mesh: MeshForShape(shape), Color: [1, 0.8, 0.2] }),
			Comp(Projectile, { Radius: 0.1, ApplyGravity: true, Gravity: -4, MaxLifetimeSeconds: 4, Mask: CollisionLayer.World | CollisionLayer.Prop }),
			Comp(BulletHit),
		], { position: origin.ToTuple() }));

		bullet.RequireComponent(Projectile).Velocity.CopyFrom(forward.Mul(this.Speed));
	}
}

/** Pushes rigid bodies a projectile hits (IProjectileHitListener: called once on the first hit). */
export class BulletHit extends Component implements IProjectileHitListener {
	public PushStrength = 4;

	public OnProjectileHit(point: Vec3, _normal: Vec3, hit: Entity | undefined): void {
		const body = hit?.GetComponent(RigidBody);
		if (!body) return;

		const direction = this.Entity.RequireComponent(Projectile).Velocity.Normalized();
		body.ApplyImpulse(direction.Mul(this.PushStrength), point);
	}
}

/** Spins an entity around Y (script-driven transform, no physics) - the simplest possible Update example. */
export class Spinner extends Component {
	public RadiansPerSecond = 1;

	public override Update(dt: number): void {
		this.Transform.Rotation = Quat.FromAxisAngle(Vec3.Up(), this.RadiansPerSecond * dt).Mul(this.Transform.Rotation);
	}
}
