// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Code of guide 05 (docs/guides/05-player-and-camera.md).

// <<imports
import { Comp, Ent, type EntityManifest } from "../Engine/Core/EntityManifest";
import { MeshForShape, Shapes } from "../Engine/Core/Shapes";
import { CameraComponent } from "../Engine/Components/Camera/CameraComponent";
import { MeshRenderer } from "../Engine/Components/MeshRenderer";
import { MovementPreset, MovementTrait, MProfile, type IMovementTrait, type MovementContext } from "../Engine/Components/Mover/MovementTypes";
import { MoverComponent } from "../Engine/Components/Mover/MoverComponent";
import { Vec3 } from "../Engine/Math/Vec3";
// >>

// <<tuned-player
const PlayerShape = Shapes.Capsule(0.5, 2);

/** A faster, floatier player: profile values override the defaults for every movement mode. */
export const TunedPlayer: EntityManifest = Ent("Player", [
	Comp(MeshRenderer, { Mesh: MeshForShape(PlayerShape), Color: [0.9, 0.9, 0.95] }),
	Comp(MoverComponent, {
		InitialMode: MovementPreset.Hybrid,
		Profile: Object.assign(new MProfile(), { MaxSpeed: 9, JumpHeight: 2.4, AirMaxSpeed: 10, CoyoteTime: 0.2 }),
	}),
], { position: [0, 1.2, 8], tags: ["player"] });

export const TunedCamera: EntityManifest = Ent("Camera", [
	Comp(CameraComponent, { TargetName: "Player", EyeHeight: 0.6, ThirdPerson: true, ArmLength: 6, FovDegrees: 80, MouseSensitivity: 0.08 }),
]);
// >>

// <<wind-trait
/** A steady sideways push while airborne. A trait is one small piece of movement: it gets the velocity and changes it. */
export class WindTrait extends MovementTrait {
	public Push = new Vec3(3, 0, 0); // m/s^2

	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (ctx.IsOnFloor) return;
		velocity.AddInPlace(this.Push.Mul(delta));
	}
}

/** The default Quake-style movement plus wind. Use with `Comp(WindyMover, { InitialMode: MovementPreset.Custom })`. */
export class WindyMover extends MoverComponent {
	protected override GetCustomTraits(): IMovementTrait[] {
		// The default mode's traits (built by the base class), plus wind on top.
		return [...this.BuildTraitsForPreset(MovementPreset.QuakeStrafeDoom2016), new WindTrait()];
	}
}
// >>
