// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CollisionLayer } from "../Engine/Core/CollisionLayer";
import { Comp, Ent, type EntityManifest } from "../Engine/Core/EntityManifest";
import { MeshForShape, Shapes } from "../Engine/Core/Shapes";
import { MeshRenderer } from "../Engine/Components/MeshRenderer";
import { RigidBody, StaticBody } from "../Engine/Components/Physics/PhysicsBodies";
import { Quat } from "../Engine/Math/Quat";
import { Vec3, type Vec3Tuple } from "../Engine/Math/Vec3";
import type { PhysicsShapeDescriptor } from "../Workers/Protocol/PhysicsGameLogicProtocol";

/** Static box: visual and collider share the same size, so a level never repeats a number. */
export function StaticBox(
	name: string, size: Vec3Tuple, position: Vec3Tuple, color: Vec3Tuple,
	options: { rotationX?: number; rotationY?: number; } = {}
): EntityManifest {
	const shape = Shapes.Box(...size);
	return Ent(name, [
		Comp(MeshRenderer, { Mesh: MeshForShape(shape), Color: color }),
		Comp(StaticBody, { Shape: shape, Layer: CollisionLayer.World }),
	], { position, ...Rotation(options) });
}

export function DynamicBox(name: string, size: Vec3Tuple, position: Vec3Tuple, color: Vec3Tuple, mass = 1): EntityManifest {
	const shape = Shapes.Box(...size);
	return Ent(name, [
		Comp(MeshRenderer, { Mesh: MeshForShape(shape), Color: color }),
		Comp(RigidBody, { Shape: shape, Mass: mass, Layer: CollisionLayer.Prop }),
	], { position });
}

export function DynamicShape(
	name: string, shape: PhysicsShapeDescriptor, position: Vec3Tuple, color: Vec3Tuple, mass = 1
): EntityManifest {
	return Ent(name, [
		Comp(MeshRenderer, { Mesh: MeshForShape(shape), Color: color }),
		Comp(RigidBody, { Shape: shape, Mass: mass, Layer: CollisionLayer.Prop }),
	], { position });
}

function Rotation(options: { rotationX?: number; rotationY?: number; }): { rotation?: [number, number, number, number]; } {
	if (options.rotationX === undefined && options.rotationY === undefined) return {};
	const x = Quat.FromAxisAngle(Vec3.Right(), options.rotationX ?? 0);
	const y = Quat.FromAxisAngle(Vec3.Up(), options.rotationY ?? 0);
	return { rotation: y.Mul(x).ToTuple() };
}

/** Flat triangle soup of a wedge (a ramp-shaped prism): 4 wide (x), 4 deep (z), 1.5 tall at the z=0 edge, 0 at z=4. Faces point outward. */
export function WedgeTriangles(): number[] {
	const A: Vec3Tuple = [0, 0, 0], B: Vec3Tuple = [4, 0, 0], C: Vec3Tuple = [4, 0, 4], D: Vec3Tuple = [0, 0, 4];
	const E: Vec3Tuple = [0, 1.5, 0], F: Vec3Tuple = [4, 1.5, 0];
	const faces: [Vec3Tuple, Vec3Tuple, Vec3Tuple][] = [
		[A, B, C], [A, C, D],     // bottom
		[A, F, B], [A, E, F],     // back wall (z = 0)
		[D, C, F], [D, F, E],     // sloped top
		[A, D, E],                // left side
		[B, F, C],                // right side
	];
	// Every face above is listed counter-clockwise seen from outside (Tests/Game.test.ts checks it), which is what both
	// the renderer's back-face culling and the physics mesh expect.
	return faces.flatMap((face) => face.flat());
}
