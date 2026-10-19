// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.
//
// Physics workload shared by the AOT profile recorder and the smoke test / benchmark (see README.md).
// The AOT profile only contains methods this scenario executes, and everything outside the profile runs
// interpreted in the release build - so every PhysicsBridge feature and every shape pair has to be hit here.

import path from "node:path";
import { pathToFileURL } from "node:url";

const ALL = -1;
const Q = [0, 0, 0, 1];
const DT = 1 / 60;

/** A step as the engine runs it: the bodies that moved and the events come as views, copied out and disposed. */
function Step(P) {
	const view = P.Step(DT);
	const bodies = view.slice();
	view.dispose();
	const eventsView = P.GetLastOverlapEvents();
	const events = eventsView.slice();
	eventsView.dispose();
	return { bodies, events };
}

/** Boots the runtime from an AppBundle whose _framework/*.wasm are already decompressed. */
export async function loadBridge(appBundleDir, config = {}) {
	const url = pathToFileURL(path.join(path.resolve(appBundleDir), "_framework/dotnet.js")).href;
	const { dotnet } = await import(url);
	const runtime = await dotnet.withConfig(config).create();
	const exports = await runtime.getAssemblyExports("PhysicsBridge.dll");
	return exports.Physics.Wasm.PhysicsBridge;
}

function createShapes(P) {
	const hull = P.AddConvexHullShape([
		-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
		-0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
	], 1);
	// [shapeId, resting height of the center above a flat surface]
	return {
		box: [P.AddBoxShape(1, 1, 1), 0.5],
		sphere: [P.AddSphereShape(0.5), 0.5],
		capsule: [P.AddCapsuleShape(0.5, 1), 1.0],
		cylinder: [P.AddCylinderShape(0.5, 1), 0.5],
		hull: [hull[0], 0.5],
	};
}

/** Flat two-sided quad at y = 5 over x in [20, 40], z in [-10, 10]: a static triangle mesh. */
function meshQuad() {
	const up = [20, 5, -10, 40, 5, -10, 40, 5, 10, 20, 5, -10, 40, 5, 10, 20, 5, 10];
	const down = [20, 5, -10, 40, 5, 10, 40, 5, -10, 20, 5, -10, 20, 5, 10, 40, 5, 10];
	return up.concat(down);
}

/**
 * An SDF mesh chunk as the engine sends it (PhysicsWorld.SetSdfChunk): a quad at height `y` over x in [-40, -20],
 * z in [-40, -20], float positions then 16-bit indices, counter-clockwise seen from above, through ChunkBuffer.
 * Returns the shape id.
 */
function addChunkShape(P, y) {
	const positions = new Float32Array([-40, y, -40, -20, y, -40, -20, y, -20, -40, y, -20]);
	const indices = new Uint16Array([0, 2, 1, 0, 3, 2]);
	const view = P.ChunkBuffer(positions.byteLength + indices.byteLength);
	view.set(new Uint8Array(positions.buffer));
	view.set(new Uint8Array(indices.buffer), positions.byteLength);
	view.dispose();
	return P.AddIndexedMeshShape(positions.byteLength, indices.byteLength);
}

function createWorld(P, groundSize) {
	P.CreateWorld(0, -10, 0, 8, 1, false, 1, 2);
	P.AddStaticBody(P.AddBoxShape(groundSize, 2, groundSize), 0, -1, 0, ...Q, ALL, ALL, 1, 0);
	P.AddStaticBody(P.AddTriangleMeshShape(meshQuad(), 1, 1, 1), 0, 0, 0, ...Q, ALL, ALL, 2, 0);
}

/**
 * Every shape on the ground, on the mesh, on itself and on every other shape; sweeps, character moves,
 * triggers, sleeping and waking, CCD, kinematics, removal. Returns { checks: [{ name, ok, info }] }.
 */
export function runFeatureScenario(P) {
	const checks = [];
	const check = (name, ok, info = "") => checks.push({ name, ok, info });

	createWorld(P, 200);
	const shapes = createShapes(P);
	const names = Object.keys(shapes);
	const resting = [];

	let x = -8;
	for (const name of names) {
		const [shape, rest] = shapes[name];
		resting.push({ name: `${name} on ground`, id: P.AddDynamicBody(shape, x, 4, 0, ...Q, 1, ALL, ALL, 10, 0, false), rest, tolerance: 0.15 });
		resting.push({ name: `${name} on mesh`, id: P.AddDynamicBody(shape, x + 30, 9, 0, ...Q, 1, ALL, ALL, 11, 0, false), rest: rest + 5, tolerance: 0.15 });
		x += 3;
	}

	// Each shape dropped onto each shape (same-type pairs included), centered so even round stacks balance.
	let mx = -40;
	for (const a of names) {
		for (const b of names) {
			const [shapeA, restA] = shapes[a];
			const [shapeB, restB] = shapes[b];
			P.AddDynamicBody(shapeA, mx, restA, 30, ...Q, 1, ALL, ALL, 13, 0, false);
			resting.push({ name: `${b} on ${a}`, id: P.AddDynamicBody(shapeB, mx, 2 * restA + restB + 0.5, 30, ...Q, 1, ALL, ALL, 14, 0, false), rest: 2 * restA + restB, tolerance: 0.15 });
			mx += 3;
		}
	}

	// An SDF chunk: every shape dropped on it; rebuilt in place below.
	const chunkShape = addChunkShape(P, 5);
	const chunk = P.AddStaticBody(chunkShape, 0, 0, 0, ...Q, ALL, ALL, 90, 0);
	const onChunk = [];
	let cx = -38;
	for (const name of names) {
		const [shape, rest] = shapes[name];
		onChunk.push({ name, rest, id: P.AddDynamicBody(shape, cx, 9, -30, ...Q, 1, ALL, ALL, 91, 0, false) });
		cx += 3;
	}

	// Trigger volume on the ground and a ball falling through it: overlap enter events, no collision response.
	P.AddStaticBody(P.AddBoxShape(4, 4, 4), 60, 2, 0, ...Q, ALL, ALL, 77, 2);
	const dropped = P.AddDynamicBody(shapes.sphere[0], 60, 6, 0, ...Q, 1, ALL, ALL, 78, 0, false);

	// Fast body with continuous detection fired at a thin wall.
	P.AddStaticBody(P.AddBoxShape(0.1, 6, 6), 0, 3, -60, ...Q, ALL, ALL, 79, 0);
	const bullet = P.AddDynamicBody(shapes.sphere[0], 0, 3, -40, ...Q, 1, ALL, ALL, 80, 3, true);
	P.SetLinearVelocity(bullet, 0, 0, -300);

	// Kinematic platform moving through a stack.
	const platform = P.AddKinematicBody(shapes.box[0], 80, 0.5, 0, ...Q, ALL, ALL, 81, 0);
	P.SetLinearVelocity(platform, -1, 0, 0);
	P.AddDynamicBody(shapes.box[0], 77, 0.5, 0, ...Q, 1, ALL, ALL, 82, 0, false);

	let entered = false;
	let exited = false;
	for (let i = 0; i < 300; i++) {
		const { events } = Step(P);
		for (let e = 0; e < events.length; e += 3)
			if (events[e] === 77 && events[e + 1] === 78) {
				if (events[e + 2] === 1) entered = true;
				else exited = true;
			}
	}
	check("trigger enter event", entered);
	check("no false trigger exit while the ball sleeps inside", !exited && !P.GetAwakeState(dropped));
	check("trigger doesn't block", Math.abs(P.GetBodyPose(dropped)[1] - 0.5) < 0.05, `y=${P.GetBodyPose(dropped)[1].toFixed(3)}`);
	check("CCD body stopped by thin wall", P.GetBodyPose(bullet)[2] > -60.2, `z=${P.GetBodyPose(bullet)[2].toFixed(3)}`);

	for (const body of resting) {
		const y = P.GetBodyPose(body.id)[1];
		check(`rest: ${body.name}`, Math.abs(y - body.rest) <= body.tolerance, `y=${y.toFixed(3)} expected ${body.rest}`);
	}
	for (const body of onChunk) {
		const y = P.GetBodyPose(body.id)[1];
		check(`rest: ${body.name} on an SDF chunk`, Math.abs(y - body.rest - 5) <= 0.15, `y=${y.toFixed(3)}`);
	}

	// The chunk rebuilt a meter lower (a pit dug), swapped in place: what rests on it wakes and falls onto it.
	const rebuilt = addChunkShape(P, 4);
	P.SetStaticShape(chunk, rebuilt);
	P.RemoveShape(chunkShape);
	for (let i = 0; i < 120; i++) Step(P);
	for (const body of onChunk) {
		const y = P.GetBodyPose(body.id)[1];
		check(`rest: ${body.name} on a rebuilt SDF chunk`, Math.abs(y - body.rest - 4) <= 0.2, `y=${y.toFixed(3)}`);
	}
	P.RemoveStatic(chunk);
	P.RemoveShape(rebuilt);

	// Sleeping and waking.
	const sleeper = resting[0].id;
	check("resting body fell asleep", !P.GetAwakeState(sleeper));
	P.ApplyImpulse(sleeper, 0, 6, 0, 0.1, 0, 0);
	P.SetAwakeState(sleeper, true);
	P.SetAngularVelocity(sleeper, 0, 1, 0);
	Step(P);
	check("woken body moves", P.GetAwakeState(sleeper) && P.GetLinearVelocity(sleeper)[1] > 0, `vy=${P.GetLinearVelocity(sleeper)[1].toFixed(3)} w=${P.GetAngularVelocity(sleeper)[1].toFixed(3)}`);
	P.SetBodyPose(sleeper, -8, 3, 0, ...Q);

	// Sweeps against every surface kind.
	const meshHit = P.SweepSphereCast(30, 20, 0, 0, -1, 0, 50, 0.25, ALL, ALL, 0);
	check("sphere cast hits mesh", meshHit[0] === 1 && Math.abs(meshHit[10] - 14.75) < 0.05, `dist=${meshHit[10].toFixed(3)} owner=${meshHit[11]}`);
	const groundHit = P.SweepSphereCast(-100, 20, -100, 0, -1, 0, 50, 0.25, ALL, ALL, 0);
	check("sphere cast hits ground", groundHit[0] === 1 && Math.abs(groundHit[10] - 19.75) < 0.05, `dist=${groundHit[10].toFixed(3)}`);
	let sweepHits = 0;
	for (const body of resting) {
		const pose = P.GetBodyPose(body.id);
		const hit = P.SweepSphereCast(pose[0], pose[1] + 10, pose[2], 0, -1, 0, 20, 0.1, ALL, ALL, 0);
		if (hit[0] === 1) sweepHits++;
	}
	check("sphere cast hits every body", sweepHits === resting.length, `${sweepHits}/${resting.length}`);

	const projectile = P.AddKinematicBody(shapes.sphere[0], -100, 10, 0, ...Q, ALL, ALL, 90, 3);
	const shot = P.SweepProjectile(projectile, -100, 10, 0, 0, -50, 0, 1, 0.5, ALL, ALL);
	check("projectile sweep hits ground", shot[0] === 1 && Math.abs(shot[2] - 0.5) < 0.05, `y=${shot[2].toFixed(3)}`);

	// Character: walk on the ground into a box, then on the mesh.
	const character = P.AddKinematicBody(shapes.capsule[0], -100, 1, 50, ...Q, ALL, ALL, 91, 1);
	P.AddStaticBody(shapes.box[0], -97, 0.5, 50, ...Q, ALL, ALL, 92, 0);
	let pos = [-100, 3, 50];
	let move;
	for (let i = 0; i < 120; i++) {
		move = P.MoveCharacter(character, ...pos, 2, -5, 0, DT, 0.5, 1, ALL, ALL, 4, 0.02, 45, 0.1);
		pos = move.slice(0, 3);
	}
	check("character stands on ground, blocked by box", move[3] === 1 && Math.abs(pos[1] - 1) < 0.1 && pos[0] < -97.9, `x=${pos[0].toFixed(3)} y=${pos[1].toFixed(3)}`);
	pos = [30, 8, 0];
	for (let i = 0; i < 60; i++) {
		move = P.MoveCharacter(character, ...pos, 1, -5, 0, DT, 0.5, 1, ALL, ALL, 4, 0.02, 45, 0.1);
		pos = move.slice(0, 3);
	}
	check("character stands on mesh", move[3] === 1 && Math.abs(pos[1] - 6) < 0.1, `y=${pos[1].toFixed(3)}`);

	// Removal and teardown.
	P.RemoveBody(resting[1].id);
	P.RemoveStatic(1);
	check("removed body is gone", !P.BodyExists(resting[1].id));
	for (let i = 0; i < 30; i++) Step(P);

	// Many bodies falling at once: every one in the step's snapshot (the ids-by-handle table grows past 256, 512,
	// 1024 meanwhile, and must keep what it held - when it didn't, the first bodies hung where they were spawned).
	const falling = [];
	for (let i = 0; i < 1100; i++) {
		falling.push(P.AddDynamicBody(shapes.sphere[0], 200 + (i % 40) * 1.2, 20 + Math.floor(i / 1600), Math.floor(i / 40) * 1.2, ...Q, 1, ALL, ALL, 2000 + i, 0, false));
	}
	const seen = new Set();
	const { bodies } = Step(P);
	for (let i = 0; i < bodies.length; i += 14) seen.add(bodies[i]);
	const missing = falling.filter(id => !seen.has(id));
	check("every falling body is in the snapshot", missing.length === 0, `${missing.length} of ${falling.length} missing`);
	P.DestroyWorld();

	return { checks };
}

/** Many mixed bodies piling up on the ground and the mesh. Returns milliseconds per Step. */
export function runBenchmark(P, bodyCount, steps = 300) {
	createWorld(P, 400);
	const shapes = Object.values(createShapes(P)).map(s => s[0]);
	const side = Math.ceil(Math.sqrt(bodyCount / 4));
	for (let i = 0; i < bodyCount; i++) {
		const layer = Math.floor(i / (side * side));
		const cell = i % (side * side);
		P.AddDynamicBody(shapes[i % shapes.length], (cell % side) * 1.2 - side * 0.6, 1 + layer * 1.6, Math.floor(cell / side) * 1.2 - side * 0.6, ...Q, 1, ALL, ALL, 100 + i, 0, false);
	}
	for (let i = 0; i < 30; i++) Step(P);
	const start = performance.now();
	for (let i = 0; i < steps; i++) Step(P);
	const msPerStep = (performance.now() - start) / steps;
	P.DestroyWorld();
	return msPerStep;
}
