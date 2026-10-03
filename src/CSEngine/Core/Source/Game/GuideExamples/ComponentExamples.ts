// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Code of guide 03 (docs/guides/03-components.md).

// <<imports
import { Component } from "../../Engine/Core/Component";
import { CollisionLayer } from "../../Engine/Core/CollisionLayer";
import { Comp, Ent } from "../../Engine/Core/EntityManifest";
import { MeshForShape, Shapes } from "../../Engine/Core/Shapes";
import { CameraComponent } from "../../Engine/Components/Camera/CameraComponent";
import { MeshRenderer } from "../../Engine/Components/MeshRenderer";
import { RigidBody } from "../../Engine/Components/Physics/PhysicsBodies";
import { Vec3, type Vec3Tuple } from "../../Engine/Math/Vec3";
import type { InputService } from "../../Engine/Services/InputService";
import type { UiService } from "../../Engine/Services/UiService";
// >>

// <<hover
/** Bobs up and down forever. A purely script-driven entity: no physics, just a Transform written every frame. */
export class Hover extends Component {
	public Amplitude = 0.5;
	public Speed = 2;

	private _baseY = 0;

	public override Start(): void {
		this._baseY = this.Transform.Position.Y;
	}

	public override Update(_dt: number): void {
		this.Transform.Position.Y = this._baseY + Math.sin(this.Engine.Time.Elapsed * this.Speed) * this.Amplitude;
	}
}
// >>

// <<lifetime
/** Destroys its entity after a few seconds. */
export class Lifetime extends Component {
	public Seconds = 3;

	private _age = 0;

	public override Update(dt: number): void {
		this._age += dt;
		if (this._age >= this.Seconds) this.Entity.Destroy();
	}
}
// >>

// <<initial-velocity
/**
 * Gives a RigidBody a starting velocity.
 * Why Start and not Awake: the body is created in RigidBody.Awake, and a command for a body that does not exist yet
 * is ignored. Start runs after EVERY Awake, so the body's spawn command is already queued ahead of this one.
 */
export class InitialVelocity extends Component {
	public Velocity: Vec3Tuple = [0, 0, 0];

	public override Start(): void {
		this.Entity.RequireComponent(RigidBody).SetLinearVelocity(Vec3.FromTuple(this.Velocity));
	}
}
// >>

// <<ball-gun
/** Left click: throw a ball from the camera. Shows spawning entities from a script. */
export class BallGun extends Component {
	public Speed = 15;

	public override OnInputUpdate(input: InputService): void {
		if (!input.JustPressed("Mouse0")) return;

		const camera = this.Engine.World.FindByName("Camera")?.GetComponent(CameraComponent);
		if (!camera) return;

		const direction = camera.GetForwardDirection();
		const shape = Shapes.Sphere(0.3);

		this.Engine.World.Spawn(Ent("Thrown Ball", [
			Comp(MeshRenderer, { Mesh: MeshForShape(shape), Color: [1, 0.5, 0.2] }),
			Comp(RigidBody, { Shape: shape, Mass: 1, Layer: CollisionLayer.Prop }),
			Comp(InitialVelocity, { Velocity: direction.Mul(this.Speed).ToTuple() }),
			Comp(Lifetime, { Seconds: 10 }),
		], { position: camera.Transform.Position.Add(direction.Mul(1.5)).ToTuple() }));
	}
}
// >>

// <<fps-counter
/** HUD line with the frame rate. */
export class FpsCounter extends Component {
	public override OnUIUpdate(ui: UiService, dt: number): void {
		if (dt > 0) ui.SetHud("fps", `FPS: ${(1 / dt).toFixed(0)}`);
	}
}
// >>

// <<follow-name
/** Finding other entities: by name, and talking to their components. */
export class Greeter extends Component {
	public TargetName = "Player";

	public override Start(): void {
		const target = this.Engine.World.FindByName(this.TargetName);
		if (!target) {
			this.Engine.Ui.Toast(`${this.Entity.Name}: nobody called "${this.TargetName}" here`);
			return;
		}
		this.Engine.Ui.Toast(`${this.Entity.Name} sees ${target.Name} at ${target.Transform.Position.ToString()}`);
	}
}
// >>
