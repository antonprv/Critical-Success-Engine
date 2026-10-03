// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { PhysShape, RendMesh } from "../../Workers/Common/CommonEnums";
import type { PhysicsShapeDescriptor } from "../../Workers/Protocol/PhysicsGameLogicProtocol";
import type { MeshDescriptor } from "../../Workers/Protocol/RenderGameLogicProtocol";

type Tuple3 = [number, number, number];

/** Collision shape builders - dimension conventions match the Godot shapes the Start project was built around. */
export const Shapes = {
	/** Full extents (like Godot's BoxShape3D.Size). */
	Box: (width: number, height: number, depth: number): PhysicsShapeDescriptor =>
		({ shape: PhysShape.Box, size: [width, height, depth] }),

	Sphere: (radius: number): PhysicsShapeDescriptor => ({ shape: PhysShape.Sphere, radius }),

	/** `height` is the total height including both caps (Godot's CapsuleShape3D.Height); converted like GodotShapeConverter does. */
	Capsule: (radius: number, height: number): PhysicsShapeDescriptor =>
		({ shape: PhysShape.Capsule, radius, cylinderLength: Math.max(0.01, height - 2 * radius) }),

	Cylinder: (radius: number, height: number): PhysicsShapeDescriptor => ({ shape: PhysShape.Cylinder, radius, height }),

	/** Convex hull of a flat [x0,y0,z0,...] point cloud. */
	ConvexHull: (points: number[]): PhysicsShapeDescriptor => ({ shape: PhysShape.ConvexHull, points }),

	/** Static-only BVH triangle mesh from a flat triangle soup. */
	TriangleMesh: (vertices: number[], scale: Tuple3 = [1, 1, 1]): PhysicsShapeDescriptor =>
		({ shape: PhysShape.TriangleMesh, vertices, scale }),
};

/** Visual mesh builders. */
export const Meshes = {
	Box: (width: number, height: number, depth: number): MeshDescriptor => ({ shape: RendMesh.Box, size: [width, height, depth] }),
	Sphere: (radius: number): MeshDescriptor => ({ shape: RendMesh.Sphere, diameter: radius * 2 }),
	Capsule: (radius: number, height: number): MeshDescriptor => ({ shape: RendMesh.Capsule, radius, height }),
	Cylinder: (radius: number, height: number): MeshDescriptor => ({ shape: RendMesh.Cylinder, diameter: radius * 2, height }),
	Triangles: (vertices: number[]): MeshDescriptor => ({ shape: RendMesh.Triangles, vertices }),
};

/** Visual counterpart of a physics shape (same dimensions), so a scene never has to repeat numbers twice. */
export function MeshForShape(shape: PhysicsShapeDescriptor): MeshDescriptor | null {
	switch (shape.shape) {
		case PhysShape.Box: return Meshes.Box(...shape.size);
		case PhysShape.Sphere: return Meshes.Sphere(shape.radius);
		case PhysShape.Capsule: return Meshes.Capsule(shape.radius, shape.cylinderLength + 2 * shape.radius);
		case PhysShape.Cylinder: return Meshes.Cylinder(shape.radius, shape.height);
		case PhysShape.ConvexHull: return Meshes.Triangles(ConvexHullTriangles(shape.points));
		case PhysShape.TriangleMesh: return Meshes.Triangles(shape.vertices.map((v, i) => v * shape.scale[i % 3]!));
	}
}

/**
 * Triangles for drawing a convex hull of a point cloud (brute force: O(n^4), fine for the handful of points a test
 * shape has). Faces are oriented outward; coplanar points are fanned into extra triangles.
 */
function ConvexHullTriangles(points: number[]): number[] {
	const count = Math.floor(points.length / 3);
	const p = (i: number): Tuple3 => [points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!];

	let cx = 0, cy = 0, cz = 0;
	for (let i = 0; i < count; i++) {
		const [x, y, z] = p(i);
		cx += x; cy += y; cz += z;
	}
	cx /= count; cy /= count; cz /= count;

	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		for (let j = i + 1; j < count; j++) {
			for (let k = j + 1; k < count; k++) {
				const a = p(i), b = p(j), c = p(k);
				const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
				const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
				let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
				const length = Math.hypot(nx, ny, nz);
				if (length < 1e-9) continue;
				nx /= length; ny /= length; nz /= length;
				const d = nx * a[0] + ny * a[1] + nz * a[2];

				let positive = 0, negative = 0;
				for (let m = 0; m < count; m++) {
					const side = nx * points[m * 3]! + ny * points[m * 3 + 1]! + nz * points[m * 3 + 2]! - d;
					if (side > 1e-6) positive++;
					else if (side < -1e-6) negative++;
				}
				if (positive > 0 && negative > 0) continue; // not a supporting plane

				// Outward-facing winding (counter-clockwise seen from outside, right-handed).
				const outward = nx * (a[0] - cx) + ny * (a[1] - cy) + nz * (a[2] - cz) >= 0;
				const [first, second] = outward ? [b, c] : [c, b];
				out.push(...a, ...first, ...second);
			}
		}
	}
	return out;
}
