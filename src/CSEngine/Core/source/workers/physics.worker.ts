// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type {
	EntityTransform,
	GameLogicToPhysicsMessage,
	MainToPhysicsMessage,
	PhysicsShapeDescriptor,
	PhysicsToGameLogicMessage,
} from "./protocol";

/**
 * The JS shape of Framework.Physics.Wasm.PhysicsBridge's [JSExport] surface
 * (see physics-wasm/Bridge/PhysicsBridge.cs). Kept as a hand-written interface
 * here rather than generated, since the wasm build step doesn't run as part
 * of this repo's own TypeScript build - see physics-wasm/BUILD.md.
 */
interface PhysicsBridgeExports {
	CreateWorld(
		gravityX: number,
		gravityY: number,
		gravityZ: number,
		velocityIterations: number,
		substeps: number,
		useMultithreading: boolean
	): void;
	AddBoxShape(sizeX: number, sizeY: number, sizeZ: number): number;
	AddSphereShape(radius: number): number;
	AddCapsuleShape(radius: number, cylinderLength: number): number;
	AddCylinderShape(radius: number, height: number): number;
	AddDynamicBody(
		shapeId: number,
		posX: number, posY: number, posZ: number,
		quatX: number, quatY: number, quatZ: number, quatW: number,
		mass: number,
		layer: number, mask: number, ownerId: number,
		continuousDetection: boolean
	): number;
	AddStaticBody(
		shapeId: number,
		posX: number, posY: number, posZ: number,
		quatX: number, quatY: number, quatZ: number, quatW: number,
		layer: number, mask: number, ownerId: number
	): number;
	RemoveBody(bodyId: number): void;
	SetAwakeState(bodyId: number, awake: boolean): void;
	GetAwakeState(bodyId: number): boolean;
	SetLinearVelocity(bodyId: number, x: number, y: number, z: number): void;
	ApplyImpulse(
		bodyId: number,
		impulseX: number, impulseY: number, impulseZ: number,
		offsetX: number, offsetY: number, offsetZ: number
	): void;
	Step(dt: number): Float64Array | number[];
	GetLastOverlapEvents(): Int32Array | number[];
}

/** Minimal slice of the generated `dotnet.js` boot API (net8.0 wasm-tools) that we actually use. */
interface DotnetRuntimeApi {
	getConfig(): { mainAssemblyName: string };
	getAssemblyExports(assemblyName: string): Promise<{
		Framework: { Physics: { Wasm: { PhysicsBridge: PhysicsBridgeExports } } };
	}>;
}

let bridge: PhysicsBridgeExports | null = null;
let gameLogicPort: MessagePort | null = null;
let running = false;
let fixedTimestepMs = 1000 / 60;
let stepIndex = 0;

/** entityId (gamelogic's id) <-> the int handle PhysicsBridge minted for that body. */
const entityToBodyId = new Map<number, number>();
const bodyIdToEntity = new Map<number, number>();

/** Shapes are cheap and immutable, so cache one per distinct descriptor rather than per body. */
const shapeCache = new Map<string, number>();

async function loadBridge(): Promise<PhysicsBridgeExports> {
	// Adjust this path if you serve the AppBundle's _framework/ directory
	// somewhere else - see physics-wasm/BUILD.md "Wire it into LanternFestival".
	// A non-literal specifier is used on purpose: it's not one of this repo's own
	// TS modules, so neither tsc nor the bundler should try to statically
	// resolve/type it - both webpack and Vite still leave a genuinely dynamic
	// `import(someVariable)` as a runtime browser import.
	const dotnetJsUrl = "/physics-wasm/_framework/dotnet.js";
	// webpackIgnore/@vite-ignore: this is a genuinely dynamic, server-relative
	// URL that neither bundler can (or should) resolve at build time - the
	// file only exists after you've run the separate physics-wasm build (see
	// physics-wasm/BUILD.md) and is served as a static asset, not a module in
	// this repo's own source graph.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const { dotnet } = (await import(/* webpackIgnore: true */ /* @vite-ignore */ dotnetJsUrl)) as {
		dotnet: { create(): Promise<DotnetRuntimeApi> };
	};
	const { getAssemblyExports, getConfig } = await dotnet.create();
	const config = getConfig();
	const exports = await getAssemblyExports(config.mainAssemblyName);
	return exports.Framework.Physics.Wasm.PhysicsBridge as PhysicsBridgeExports;
}

function shapeKey(shape: PhysicsShapeDescriptor): string {
	switch (shape.kind) {
		case "box":
			return `box:${shape.size.join(",")}`;
		case "sphere":
			return `sphere:${shape.radius}`;
		case "capsule":
			return `capsule:${shape.radius}:${shape.cylinderLength}`;
		case "cylinder":
			return `cylinder:${shape.radius}:${shape.height}`;
	}
}

function resolveShapeId(bridge: PhysicsBridgeExports, shape: PhysicsShapeDescriptor): number {
	const key = shapeKey(shape);
	const cached = shapeCache.get(key);
	if (cached !== undefined) return cached;

	let id: number;
	switch (shape.kind) {
		case "box":
			id = bridge.AddBoxShape(shape.size[0], shape.size[1], shape.size[2]);
			break;
		case "sphere":
			id = bridge.AddSphereShape(shape.radius);
			break;
		case "capsule":
			id = bridge.AddCapsuleShape(shape.radius, shape.cylinderLength);
			break;
		case "cylinder":
			id = bridge.AddCylinderShape(shape.radius, shape.height);
			break;
	}
	shapeCache.set(key, id);
	return id;
}

function handleGameLogicMessage(message: GameLogicToPhysicsMessage): void {
	try {
		handleGameLogicMessageUnsafe(message);
	} catch (error) {
		console.error(`[physics.worker] "${message.type}" failed:`, error);
	}
}

function handleGameLogicMessageUnsafe(message: GameLogicToPhysicsMessage): void {
	if (!bridge) {
		console.warn("[physics.worker] dropped message, wasm bridge not loaded yet:", message.type);
		return;
	}

	switch (message.type) {
		case "spawn-dynamic-body": {
			const shapeId = resolveShapeId(bridge, message.shape);
			const [px, py, pz, qx, qy, qz, qw] = message.transform;
			// layer/mask are C# `int`: the JS<->.NET marshaller asserts on anything outside int32,
			// so 0xffffffff (4294967295) must be passed as -1 (`| 0`).
			const bodyId = bridge.AddDynamicBody(
				shapeId, px, py, pz, qx, qy, qz, qw,
				message.mass, message.layer | 0, message.mask | 0, message.entityId,
				false
			);
			entityToBodyId.set(message.entityId, bodyId);
			bodyIdToEntity.set(bodyId, message.entityId);
			break;
		}
		case "spawn-static-body": {
			const shapeId = resolveShapeId(bridge, message.shape);
			const [px, py, pz, qx, qy, qz, qw] = message.transform;
			// Statics don't get stepped transforms back, so they don't need an
			// entityId<->bodyId mapping the way dynamic bodies do.
			bridge.AddStaticBody(shapeId, px, py, pz, qx, qy, qz, qw, message.layer | 0, message.mask | 0, message.entityId);
			break;
		}
		case "remove-body": {
			const bodyId = entityToBodyId.get(message.entityId);
			if (bodyId !== undefined) {
				bridge.RemoveBody(bodyId);
				entityToBodyId.delete(message.entityId);
				bodyIdToEntity.delete(bodyId);
			}
			break;
		}
		case "apply-impulse": {
			const bodyId = entityToBodyId.get(message.entityId);
			if (bodyId !== undefined) {
				// Bepu puts resting bodies to sleep and impulses/velocity writes are silently ignored while asleep.
				bridge.SetAwakeState(bodyId, true);
				bridge.ApplyImpulse(bodyId, ...message.impulse, ...message.offset);
			}
			break;
		}
		case "set-velocity": {
			const bodyId = entityToBodyId.get(message.entityId);
			if (bodyId !== undefined) {
				bridge.SetAwakeState(bodyId, true);
				bridge.SetLinearVelocity(bodyId, ...message.velocity);
			}
			break;
		}
	}
}

function stepOnce(): void {
	if (!bridge || !gameLogicPort) return;

	const flat = bridge.Step(fixedTimestepMs / 1000);
	const entities: EntityTransform[] = [];
	for (let i = 0; i + 7 < flat.length; i += 8) {
		const bodyId = flat[i]!;
		const entityId = bodyIdToEntity.get(bodyId);
		if (entityId === undefined) continue; // shouldn't happen, but never forward a dangling id
		entities.push({
			entityId,
			transform: [flat[i + 1]!, flat[i + 2]!, flat[i + 3]!, flat[i + 4]!, flat[i + 5]!, flat[i + 6]!, flat[i + 7]!],
		});
	}

	const transformsMessage: PhysicsToGameLogicMessage = { type: "transforms", step: stepIndex++, entities };
	gameLogicPort.postMessage(transformsMessage);

	const rawEvents = bridge.GetLastOverlapEvents();
	if (rawEvents.length > 0) {
		const events: { ownerA: number; ownerB: number; entered: boolean }[] = [];
		for (let i = 0; i + 2 < rawEvents.length; i += 3) {
			events.push({ ownerA: rawEvents[i]!, ownerB: rawEvents[i + 1]!, entered: rawEvents[i + 2] === 1 });
		}
		const eventsMessage: PhysicsToGameLogicMessage = { type: "overlap-events", events };
		gameLogicPort.postMessage(eventsMessage);
	}
}

// Fixed-timestep loop. setInterval drifts under load, which is fine here -
// gameplay networking/replay determinism isn't a goal for LanternFestival
// yet; if it becomes one, replace this with an accumulator driven by
// performance.now() so dt fed to Step() is always exactly fixedTimestepMs
// regardless of when the callback actually fires.
let loopHandle: ReturnType<typeof setInterval> | null = null;

function setRunning(next: boolean): void {
	running = next;
	if (loopHandle !== null) {
		clearInterval(loopHandle);
		loopHandle = null;
	}
	if (running) {
		loopHandle = setInterval(stepOnce, fixedTimestepMs);
	}
}

// IMPORTANT: use addEventListener, NOT `self.onmessage = ...`.
// .NET 10's dotnet.js loader checks `globalThis.onmessage` at import time: if the worker already has an
// onmessage handler it is classified as a plain web worker, the runtime skips resolving its core-asset
// promise, and `dotnet.create()` then never resolves *or* rejects (a silent hang).
self.addEventListener("message", (event: MessageEvent<MainToPhysicsMessage>) => {
	const message = event.data;
	if (message.type === "init") {
		gameLogicPort = message.gameLogicPort;
		fixedTimestepMs = message.fixedTimestepMs;
		gameLogicPort.onmessage = (e: MessageEvent<GameLogicToPhysicsMessage>) => handleGameLogicMessage(e.data);

		const watchdog = setTimeout(
			() => console.error("[physics.worker] PhysicsBridge still not loaded after 15 s - dotnet.create() is hanging."),
			15_000
		);
		loadBridge()
			.then((loaded) => {
				clearTimeout(watchdog);
				bridge = loaded;
				bridge.CreateWorld(message.gravity[0], message.gravity[1], message.gravity[2], 8, 1, false);
				const readyMessage: PhysicsToGameLogicMessage = { type: "ready" };
				gameLogicPort?.postMessage(readyMessage);
				setRunning(true);
			})
			.catch((error) => {
				clearTimeout(watchdog);
				// Deliberately non-fatal: lets render/game-logic/audio keep working
				// (e.g. for pure-visual iteration) before physics-wasm has been built
				// even once. See physics-wasm/BUILD.md.
				console.error(
					"[physics.worker] failed to load PhysicsBridge wasm module - physics is disabled this session.",
					error
				);
			});
	} else if (message.type === "set-running") {
		setRunning(message.running);
	}
});
