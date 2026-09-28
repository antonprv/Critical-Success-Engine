// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../../Logging/Logger";
import { PhysOpType, PhysShape } from "../Common/CommonEnums";
import {
	PhysToGameMsg,
	type GameLogicToPhysicsMessage,
	type PhysicsShapeDescriptor,
	type PhysicsToGameLogicMessage,
} from "../Protocol/PhysicsGameLogicProtocol";
import { TRANSFORM_STRIDE } from "../Protocol/TransformProtocol";
import type { PhysicsBridgeExports } from "./PhysicsBridgeContract";

/** Result of a single fixed-timestep tick, ready for the caller to post over the game-logic port. */
export interface PhysicsStepResult {
	transforms: (PhysicsToGameLogicMessage & { type: PhysToGameMsg.Transforms; }) | null;
	overlapEvents: (PhysicsToGameLogicMessage & { type: PhysToGameMsg.OverlapEvents; }) | null;
}

/**
 * Everything that talks to an already-loaded PhysicsBridge directly: shape
 * caching, body bookkeeping, spawning/despawning, impulses and stepping.
 * Knows nothing about how the bridge was booted (see PhysicsWasmLoader) and
 * nothing about MessagePorts or the fixed-timestep loop (see
 * PhysicsWorker.ts) - it only ever hands its caller plain data to forward.
 */
export class PhysicsWorld {
	private readonly _bridge: PhysicsBridgeExports;

	/** entityId (gamelogic's id) <-> the int handle PhysicsBridge minted for that body. */
	private readonly _entityToBodyId = new Map<number, number>();
	private readonly _bodyIdToEntity = new Map<number, number>();

	/** Shapes are cheap and immutable, so cache one per distinct descriptor rather than per body. */
	private readonly _shapeCache = new Map<string, number>();

	private _stepIndex = 0;

	public constructor(bridge: PhysicsBridgeExports) {
		this._bridge = bridge;
	}

	/** Ticks that have run so far, for tagging outgoing transform batches. */
	public get StepIndex(): number {
		return this._stepIndex;
	}

	public CreateWorld(gravity: [number, number, number], velocityIterations: number, substeps: number, useMultithreading: boolean): void {
		this._bridge.CreateWorld(gravity[0], gravity[1], gravity[2], velocityIterations, substeps, useMultithreading);
	}

	public HandleGameLogicMessage(message: GameLogicToPhysicsMessage): void {
		try {
			this.HandleGameLogicMessageUnsafe(message);
		} catch (error) {
			Logger.LogException(error, `[PhysicsWorld] "${message.type}" failed:`);
		}
	}

	private HandleGameLogicMessageUnsafe(message: GameLogicToPhysicsMessage): void {
		switch (message.type) {
			case PhysOpType.SpawnDynamicBody: {
				const shapeId = this.ResolveShapeId(message.shape);
				const [px, py, pz, qx, qy, qz, qw] = message.transform;
				// layer/mask are C# `int`: the JS<->.NET marshaller asserts on anything outside int32,
				// so 0xffffffff (4294967295) must be passed as -1 (`| 0`).
				const bodyId = this._bridge.AddDynamicBody(
					shapeId, px, py, pz, qx, qy, qz, qw,
					message.mass, message.layer | 0, message.mask | 0, message.entityId,
					false
				);
				this._entityToBodyId.set(message.entityId, bodyId);
				this._bodyIdToEntity.set(bodyId, message.entityId);
				break;
			}
			case PhysOpType.SpawnStaticBody: {
				const shapeId = this.ResolveShapeId(message.shape);
				const [px, py, pz, qx, qy, qz, qw] = message.transform;
				// Statics don't get stepped transforms back, so they don't need an
				// entityId<->bodyId mapping the way dynamic bodies do.
				this._bridge.AddStaticBody(shapeId, px, py, pz, qx, qy, qz, qw, message.layer | 0, message.mask | 0, message.entityId);
				break;
			}
			case PhysOpType.RemoveBody: {
				const bodyId = this._entityToBodyId.get(message.entityId);
				if (bodyId !== undefined) {
					this._bridge.RemoveBody(bodyId);
					this._entityToBodyId.delete(message.entityId);
					this._bodyIdToEntity.delete(bodyId);
				}
				break;
			}
			case PhysOpType.ApplyImpulse: {
				const bodyId = this._entityToBodyId.get(message.entityId);
				if (bodyId !== undefined) {
					// Bepu puts resting bodies to sleep and impulses/velocity writes are silently ignored while asleep.
					this._bridge.SetAwakeState(bodyId, true);
					this._bridge.ApplyImpulse(bodyId, ...message.impulse, ...message.offset);
				}
				break;
			}
			case PhysOpType.SetVelocity: {
				const bodyId = this._entityToBodyId.get(message.entityId);
				if (bodyId !== undefined) {
					this._bridge.SetAwakeState(bodyId, true);
					this._bridge.SetLinearVelocity(bodyId, ...message.velocity);
				}
				break;
			}
		}
	}

	private ResolveShapeId(shape: PhysicsShapeDescriptor): number {
		const key = PhysicsWorld.ShapeKey(shape);
		const cached = this._shapeCache.get(key);
		if (cached !== undefined) return cached;

		let id: number;
		switch (shape.kind) {
			case PhysShape.Box:
				id = this._bridge.AddBoxShape(shape.size[0], shape.size[1], shape.size[2]);
				break;
			case PhysShape.Sphere:
				id = this._bridge.AddSphereShape(shape.radius);
				break;
			case PhysShape.Capsule:
				id = this._bridge.AddCapsuleShape(shape.radius, shape.cylinderLength);
				break;
			case PhysShape.Cylinder:
				id = this._bridge.AddCylinderShape(shape.radius, shape.height);
				break;
		}
		this._shapeCache.set(key, id);
		return id;
	}

	private static ShapeKey(shape: PhysicsShapeDescriptor): string {
		switch (shape.kind) {
			case PhysShape.Box:
				return `box:${shape.size.join(",")}`;
			case PhysShape.Sphere:
				return `sphere:${shape.radius}`;
			case PhysShape.Capsule:
				return `capsule:${shape.radius}:${shape.cylinderLength}`;
			case PhysShape.Cylinder:
				return `cylinder:${shape.radius}:${shape.height}`;
		}
	}

	/** Advances the simulation by one fixed step and packages the results for the caller to post. */
	public StepOnce(fixedTimestepMs: number): PhysicsStepResult {
		const flat = this._bridge.Step(fixedTimestepMs / 1000);
		const step = this._stepIndex++;

		// bridge.Step()'s own layout is also 8-wide (bodyId + 7 transform floats), so the
		// output buffer needs at most as many TRANSFORM_STRIDE-wide slots as flat has - we
		// may end up writing fewer if some bodyIds don't map to a live entity (see the
		// `continue` below), never more. A fresh buffer every tick is deliberate: once a
		// buffer has been handed to postMessage's transfer list it's permanently detached
		// from this realm, so there's no pool of buffers to safely reuse here - see
		// TransformBatchPayload's doc comment in TransformProtocol.ts.
		const output = new Float64Array(Math.floor(flat.length / 8) * TRANSFORM_STRIDE);
		let entityCount = 0;
		for (let i = 0; i + 7 < flat.length; i += 8) {
			const bodyId = flat[i]!;
			const entityId = this._bodyIdToEntity.get(bodyId);
			if (entityId === undefined) continue; // shouldn't happen, but never forward a dangling id

			const base = entityCount * TRANSFORM_STRIDE;
			output[base] = entityId;
			output[base + 1] = flat[i + 1]!;
			output[base + 2] = flat[i + 2]!;
			output[base + 3] = flat[i + 3]!;
			output[base + 4] = flat[i + 4]!;
			output[base + 5] = flat[i + 5]!;
			output[base + 6] = flat[i + 6]!;
			output[base + 7] = flat[i + 7]!;
			entityCount++;
		}

		const transforms: PhysicsStepResult["transforms"] =
			entityCount > 0 ? { type: PhysToGameMsg.Transforms, step, entityCount, buffer: output.buffer } : null;

		const rawEvents = this._bridge.GetLastOverlapEvents();
		let overlapEvents: PhysicsStepResult["overlapEvents"] = null;
		if (rawEvents.length > 0) {
			const events: { ownerA: number; ownerB: number; entered: boolean; }[] = [];
			for (let i = 0; i + 2 < rawEvents.length; i += 3) {
				events.push({ ownerA: rawEvents[i]!, ownerB: rawEvents[i + 1]!, entered: rawEvents[i + 2] === 1 });
			}
			overlapEvents = { type: PhysToGameMsg.OverlapEvents, events };
		}

		return { transforms, overlapEvents };
	}
}
