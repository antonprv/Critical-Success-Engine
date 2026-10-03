// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// TEST DOUBLE - not physics. A tiny stand-in for Physics.Wasm.PhysicsBridge (see Source/Workers/Physics/PhysicsBridgeContract.ts)
// so the end-to-end tests can drive the whole site (workers, protocol, UI, rendering) in a real browser without a .NET build:
// gravity, resting on axis-aligned boxes, an AABB character controller with the same result layout as the real MoveCharacter,
// trigger/contact events, and sweeps. Nothing here says anything about how BEPU behaves.

const Epsilon = 1e-3;

export function CreateBridge() {
	let world = null;
	const World = () => {
		if (!world) throw new Error("mock PhysicsBridge: CreateWorld must be called first");
		return world;
	};

	//#region shapes & bounds

	const addShape = (shape) => {
		const id = World().nextShape++;
		World().shapes.set(id, shape);
		return id;
	};

	/** Local-space half extents and centre of a shape. */
	const localBounds = (shape) => {
		switch (shape.type) {
			case "box": return { center: [0, 0, 0], half: shape.size.map((v) => v / 2) };
			case "sphere": return { center: [0, 0, 0], half: [shape.radius, shape.radius, shape.radius] };
			case "capsule": return { center: [0, 0, 0], half: [shape.radius, shape.length / 2 + shape.radius, shape.radius] };
			case "cylinder": return { center: [0, 0, 0], half: [shape.radius, shape.height / 2, shape.radius] };
			case "points": return shape.bounds;
		}
		throw new Error(`unknown shape ${shape.type}`);
	};

	const pointsBounds = (points, scale, recentre) => {
		const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
		for (let i = 0; i < points.length; i += 3) {
			for (let k = 0; k < 3; k++) {
				const v = points[i + k] * scale[k];
				min[k] = Math.min(min[k], v);
				max[k] = Math.max(max[k], v);
			}
		}
		const mid = min.map((v, k) => (v + max[k]) / 2);
		return { center: recentre ? [0, 0, 0] : mid, half: max.map((v, k) => (v - min[k]) / 2) };
	};

	const rotate = (q, v) => {
		const [x, y, z, w] = q;
		const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
		return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
	};

	/** World-space AABB of a body/static (oriented boxes are bounded by their rotated corners). */
	const aabb = (entry) => {
		const { center, half } = localBounds(World().shapes.get(entry.shape));
		const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
		for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
			const corner = rotate(entry.quat, [center[0] + sx * half[0], center[1] + sy * half[1], center[2] + sz * half[2]]);
			for (let k = 0; k < 3; k++) {
				min[k] = Math.min(min[k], entry.pos[k] + corner[k]);
				max[k] = Math.max(max[k], entry.pos[k] + corner[k]);
			}
		}
		return { min, max };
	};

	const overlap = (a, b, margin = 0) =>
		a.min[0] < b.max[0] - margin && a.max[0] > b.min[0] + margin &&
		a.min[1] < b.max[1] - margin && a.max[1] > b.min[1] + margin &&
		a.min[2] < b.max[2] - margin && a.max[2] > b.min[2] + margin;

	const canInteract = (a, b) => (a.layer & b.mask) !== 0 && (b.layer & a.mask) !== 0;

	//#endregion

	//#region entries

	const allBodies = () => [...World().bodies.values()];
	const allEntries = () => [...World().bodies.values(), ...World().statics.values()];
	/** Things that block movement: solid (kind 0) statics, kinematic and dynamic bodies. */
	const solids = (excludeId, layer, mask) =>
		allEntries().filter((e) => e.id !== excludeId && e.kind === 0 && canInteract({ layer, mask }, e));

	const addBody = (type, shape, pos, quat, extra) => {
		const id = World().nextBody++;
		World().bodies.set(id, {
			id, type, shape, pos: [...pos], quat: [...quat], vel: [0, 0, 0], angVel: [0, 0, 0], awake: true, mass: 1, ...extra,
		});
		return id;
	};

	//#endregion

	//#region sweeps

	/** Earliest hit of a sphere (radius) travelling `delta` from `from` against the given entries. */
	const sweep = (from, delta, radius, entries) => {
		let best = null;
		for (const entry of entries) {
			const box = aabb(entry);
			const min = box.min.map((v) => v - radius), max = box.max.map((v) => v + radius);
			let tEnter = 0, tExit = 1, normal = [0, 1, 0], ok = true;
			for (let k = 0; k < 3 && ok; k++) {
				if (Math.abs(delta[k]) < 1e-12) {
					if (from[k] < min[k] || from[k] > max[k]) ok = false;
					continue;
				}
				let t1 = (min[k] - from[k]) / delta[k], t2 = (max[k] - from[k]) / delta[k];
				let sign = -1;
				if (t1 > t2) { [t1, t2] = [t2, t1]; sign = 1; }
				if (t1 > tEnter) { tEnter = t1; normal = [0, 0, 0]; normal[k] = sign; }
				tExit = Math.min(tExit, t2);
				if (tEnter > tExit) ok = false;
			}
			if (ok && (best === null || tEnter < best.t)) best = { t: tEnter, normal, owner: entry.owner };
		}
		return best;
	};

	//#endregion

	const flat = (...values) => values;

	return {
		//#region world
		CreateWorld(gx, gy, gz) {
			world = {
				gravity: [gx, gy, gz], shapes: new Map(), bodies: new Map(), statics: new Map(),
				nextShape: 1, nextBody: 1, nextStatic: 1, contacts: new Set(), events: [],
			};
		},
		DestroyWorld() { world = null; },
		//#endregion

		//#region shapes
		AddBoxShape: (x, y, z) => addShape({ type: "box", size: [x, y, z] }),
		AddSphereShape: (radius) => addShape({ type: "sphere", radius }),
		AddCapsuleShape: (radius, length) => addShape({ type: "capsule", radius, length }),
		AddCylinderShape: (radius, height) => addShape({ type: "cylinder", radius, height }),
		AddConvexHullShape(points) {
			const n = points.length / 3;
			const centroid = [0, 1, 2].map((k) => points.filter((_, i) => i % 3 === k).reduce((s, v) => s + v, 0) / n);
			const bounds = pointsBounds(points, [1, 1, 1], false);
			bounds.center = bounds.center.map((v, k) => v - centroid[k]);
			return flat(addShape({ type: "points", bounds }), ...centroid);
		},
		AddTriangleMeshShape: (vertices, sx, sy, sz) => addShape({ type: "points", bounds: pointsBounds(vertices, [sx, sy, sz], false) }),
		//#endregion

		//#region bodies
		AddDynamicBody(shape, px, py, pz, qx, qy, qz, qw, mass, layer, mask, owner, kind) {
			return addBody("dynamic", shape, [px, py, pz], [qx, qy, qz, qw], { mass, layer, mask, owner, kind });
		},
		AddKinematicBody(shape, px, py, pz, qx, qy, qz, qw, layer, mask, owner, kind) {
			return addBody("kinematic", shape, [px, py, pz], [qx, qy, qz, qw], { layer, mask, owner, kind });
		},
		AddStaticBody(shape, px, py, pz, qx, qy, qz, qw, layer, mask, owner, kind) {
			const id = World().nextStatic++;
			World().statics.set(id, { id: -id, type: "static", shape, pos: [px, py, pz], quat: [qx, qy, qz, qw], layer, mask, owner, kind });
			return id;
		},
		RemoveBody(id) { World().bodies.delete(id); },
		RemoveStatic(id) { World().statics.delete(id); },
		BodyExists: (id) => World().bodies.has(id),
		GetBodyPose(id) { const b = World().bodies.get(id); return flat(...b.pos, ...b.quat); },
		SetBodyPose(id, px, py, pz, qx, qy, qz, qw) { const b = World().bodies.get(id); b.pos = [px, py, pz]; b.quat = [qx, qy, qz, qw]; },
		SetAwakeState(id, awake) { World().bodies.get(id).awake = awake; },
		GetAwakeState: (id) => World().bodies.get(id).awake,
		GetLinearVelocity: (id) => [...World().bodies.get(id).vel],
		SetLinearVelocity(id, x, y, z) { World().bodies.get(id).vel = [x, y, z]; },
		GetAngularVelocity: (id) => [...World().bodies.get(id).angVel],
		SetAngularVelocity(id, x, y, z) { World().bodies.get(id).angVel = [x, y, z]; },
		ApplyImpulse(id, ix, iy, iz) {
			const b = World().bodies.get(id);
			b.vel = [b.vel[0] + ix / b.mass, b.vel[1] + iy / b.mass, b.vel[2] + iz / b.mass];
		},
		//#endregion

		//#region queries
		MoveCharacter(selfId, px, py, pz, vx, vy, vz, dt, radius, cylinderLength, layer, mask, _iterations, _skin, _maxFloorAngle, probe) {
			const self = World().bodies.get(selfId);
			const half = [radius, cylinderLength / 2 + radius, radius];
			const obstacles = solids(selfId, layer, mask).map((e) => ({ box: aabb(e), owner: e.owner }));
			const at = (p) => ({ min: p.map((v, k) => v - half[k]), max: p.map((v, k) => v + half[k]) });
			const hit = (p) => obstacles.find((o) => overlap(at(p), o.box, Epsilon));

			const pos = [px, py, pz], vel = [vx, vy, vz];
			for (const k of [0, 2]) {            // horizontal axes one at a time: sliding along walls falls out of that
				pos[k] += vel[k] * dt;
				if (hit(pos)) { pos[k] -= vel[k] * dt; vel[k] = 0; }
			}

			pos[1] += vel[1] * dt;
			let onFloor = false, ground = 0;
			const blocker = hit(pos);
			if (blocker) {
				if (vel[1] <= 0) { pos[1] = blocker.box.max[1] + half[1] + Epsilon * 2; onFloor = true; ground = blocker.owner; }
				else pos[1] = blocker.box.min[1] - half[1] - Epsilon * 2;
				vel[1] = 0;
			} else if (vel[1] <= 0) {
				const below = hit([pos[0], pos[1] - probe, pos[2]]);
				if (below) { onFloor = true; ground = below.owner; }
			}
			void self;
			return flat(...pos, onFloor ? 1 : 0, 0, 1, 0, ground, ...vel);
		},

		SweepProjectile(selfId, px, py, pz, vx, vy, vz, dt, radius, layer, mask) {
			const delta = [vx * dt, vy * dt, vz * dt];
			const from = [px, py, pz];
			const best = sweep(from, delta, radius, solids(selfId, layer, mask));
			const t = best ? best.t : 1;
			const position = from.map((v, k) => v + delta[k] * t);
			return flat(best ? 1 : 0, ...position, ...position, ...(best ? best.normal : [0, 1, 0]), best ? best.owner : 0);
		},

		SweepSphereCast(ox, oy, oz, dx, dy, dz, maxDistance, radius, layer, mask, excludeBodyId) {
			const length = Math.hypot(dx, dy, dz) || 1;
			const delta = [(dx / length) * maxDistance, (dy / length) * maxDistance, (dz / length) * maxDistance];
			const best = sweep([ox, oy, oz], delta, radius, solids(excludeBodyId, layer, mask));
			const t = best ? best.t : 1;
			const position = [ox + delta[0] * t, oy + delta[1] * t, oz + delta[2] * t];
			return flat(best ? 1 : 0, ...position, ...position, ...(best ? best.normal : [0, 1, 0]), best ? t * maxDistance : maxDistance, best ? best.owner : 0);
		},
		//#endregion

		//#region stepping
		Step(dt) {
			const w = World();
			for (const body of allBodies()) {
				if (body.type === "kinematic") {            // like BEPU: kinematic bodies are integrated by their velocity
					for (let k = 0; k < 3; k++) body.pos[k] += body.vel[k] * dt;
					continue;
				}
				if (!body.awake && body.vel.every((v) => v === 0)) continue;
				body.awake = true;
				for (let k = 0; k < 3; k++) body.vel[k] += w.gravity[k] * dt;
				for (let k = 0; k < 3; k++) body.pos[k] += body.vel[k] * dt;

				for (const support of allEntries().filter((e) => e !== body && e.kind === 0 && canInteract(body, e) && (e.type !== "dynamic"))) {
					const a = aabb(body), b = aabb(support);
					if (!overlap(a, b)) continue;
					const push = [0, 1, 2].map((k) => {
						const up = b.max[k] - a.min[k], down = a.max[k] - b.min[k];
						return up < down ? { k, d: up } : { k, d: -down };
					}).sort((p, q) => Math.abs(p.d) - Math.abs(q.d))[0];
					body.pos[push.k] += push.d;
					body.vel[push.k] = 0;
					for (const k of [0, 2]) body.vel[k] *= 0.98;   // crude ground friction
				}
			}

			// contacts and trigger overlaps -> Entered/Exited events, keyed by owner ids
			const current = new Set();
			const entries = allEntries();
			const movers = allBodies();
			for (const a of movers) {
				const boxA = aabb(a);
				for (const b of entries) {
					if (a === b || (b.type !== "static" && b.id < a.id)) continue;
					const eitherDynamic = a.type === "dynamic" || b.type === "dynamic";
					const eitherTrigger = a.kind === 2 || b.kind === 2;
					if (!canInteract(a, b) || !(eitherDynamic || eitherTrigger)) continue;
					if (a.kind === 2 && b.kind === 2) continue;
					if (!overlap(boxA, aabb(b), -0.02)) continue;
					const [o1, o2] = a.owner < b.owner ? [a.owner, b.owner] : [b.owner, a.owner];
					current.add(`${o1}:${o2}`);
				}
			}
			w.events = [];
			for (const key of current) if (!w.contacts.has(key)) w.events.push(...key.split(":").map(Number), 1);
			for (const key of w.contacts) if (!current.has(key)) w.events.push(...key.split(":").map(Number), 0);
			w.contacts = current;

			const out = [];
			for (const b of movers) out.push(b.id, ...b.pos, ...b.quat, ...b.vel, ...b.angVel);
			return out;
		},
		GetLastOverlapEvents: () => World().events.slice(),
		//#endregion
	};
}
