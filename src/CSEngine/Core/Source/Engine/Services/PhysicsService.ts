// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { PhysBodyType, PhysObjectKind, PhysOpType, PhysQueryType, PhysState } from "../../Workers/Common/CommonEnums";
import type {
	CharacterMoveOptionsDescriptor,
	GameLogicToPhysicsMessage,
	PhysicsCommand,
	PhysicsQuery,
	PhysicsQueryResult,
	PhysicsShapeDescriptor,
	PhysicsToGameLogicMessage,
	PhysicsWorldSettingsDescriptor,
	ProjectileSweepResult,
	ShapeCastResult,
} from "../../Workers/Protocol/PhysicsGameLogicProtocol";
import { BODY_STRIDE, CHARACTER_STRIDE, type FlatTransform } from "../../Workers/Protocol/TransformProtocol";
import { SyncTracker } from "../Core/SyncTracker";
import { Quat } from "../Math/Quat";
import { Vec3, type Vec3Tuple } from "../Math/Vec3";
import { DefaultGravity } from "../../Workers/Common/EngineConstants";

/** Latest simulation state of a dynamic/kinematic body, refreshed every physics step. Objects are reused - copy what you keep. */
export interface BodyState {
	readonly Position: Vec3;
	readonly Rotation: Quat;
	readonly LinearVelocity: Vec3;
	readonly AngularVelocity: Vec3;
}

/** Result of the most recent MoveCharacter for a character body. */
export interface CharacterState {
	IsOnFloor: boolean;
	readonly FloorNormal: Vec3;
	/** Entity id of whatever the character stood on (0 = nothing). */
	GroundEntityId: number;
	/** Plane-clipped velocity after sliding. */
	readonly Velocity: Vec3;
}

export interface SpawnBodyArgs {
	entityId: number;
	bodyType: PhysBodyType;
	shape: PhysicsShapeDescriptor;
	transform: FlatTransform;
	layer: number;
	mask: number;
	objectKind?: PhysObjectKind;
	mass?: number;
	continuousDetection?: boolean;
}

export interface OverlapEventData {
	entityA: number;
	entityB: number;
	entered: boolean;
}

/**
 * GameLogic's side of physics: method calls become one batched command message per tick, and the latest snapshot is kept
 * for synchronous reads. Everything is addressed by entity id; queries return promises.
 */
export class PhysicsService {
	private readonly _port: MessagePort;
	private readonly _queue: PhysicsCommand[] = [];
	private readonly _kinds = new Map<number, PhysObjectKind>();
	private readonly _bodies = new Map<number, BodyState>();
	private readonly _characters = new Map<number, CharacterState>();
	private readonly _queries = new Map<number, (result: PhysicsQueryResult) => void>();
	private readonly _sync = new SyncTracker();

	private _nextQueryId = 1;
	private _awaitingReset = false;

	/** Gravity of the currently loaded world (what the character motor needs - the Godot IPhysicsWorld.Gravity). */
	public readonly Gravity = new Vec3(...DefaultGravity);

	/** True once PhysicsWorker reported its wasm module is up. */
	public Ready = false;

	/** True if the wasm module failed to load: nothing will simulate, and queries/syncs resolve immediately. */
	public Failed = false;
	public FailureMessage = "";

	/** Seconds between physics steps - also what OnPhysicsUpdate receives as dt. */
	public FixedDelta = 1 / 60;

	/** performance.now() of the most recently applied step - the interpolation clock. */
	public LastStepTimeMs = 0;

	/** Fired once per physics step, after the snapshot has been copied into this service, with that step's overlap transitions. */
	public OnStep: ((step: number, overlaps: OverlapEventData[]) => void) | null = null;
	public OnReady: (() => void) | null = null;

	public constructor(port: MessagePort) {
		this._port = port;
	}

	//#region Commands

	private Enqueue(command: PhysicsCommand): void {
		this._queue.push(command);
	}

	/** Sends everything queued since the last flush as one message. The runtime calls this at the end of each tick/frame. */
	public Flush(): void {
		if (this.Failed) {
			this._queue.length = 0;
			return;
		}
		if (this._queue.length === 0) return;
		const message: GameLogicToPhysicsMessage = { commands: this._queue.splice(0, this._queue.length) };
		this._port.postMessage(message);
	}

	public SpawnBody(args: SpawnBodyArgs): void {
		const kind = args.objectKind ?? PhysObjectKind.Solid;
		this._kinds.set(args.entityId, kind);

		if (args.bodyType !== PhysBodyType.Static) {
			this._bodies.set(args.entityId, {
				Position: Vec3.FromTuple([args.transform[0], args.transform[1], args.transform[2]]),
				Rotation: Quat.FromTuple([args.transform[3], args.transform[4], args.transform[5], args.transform[6]]),
				LinearVelocity: new Vec3(),
				AngularVelocity: new Vec3(),
			});
		}

		const command: PhysicsCommand = {
			operation: PhysOpType.SpawnBody,
			entityId: args.entityId,
			bodyType: args.bodyType,
			shape: args.shape,
			transform: args.transform,
			layer: args.layer,
			mask: args.mask,
			objectKind: kind,
			...(args.mass !== undefined ? { mass: args.mass } : {}),
			...(args.continuousDetection !== undefined ? { continuousDetection: args.continuousDetection } : {}),
		};
		this.Enqueue(command);
	}

	public RemoveBody(entityId: number): void {
		this._kinds.delete(entityId);
		this._bodies.delete(entityId);
		this._characters.delete(entityId);
		this.Enqueue({ operation: PhysOpType.RemoveBody, entityId });
	}

	/** Teleport (dynamic/kinematic). */
	public SetPose(entityId: number, transform: FlatTransform): void {
		this.Enqueue({ operation: PhysOpType.SetPose, entityId, transform });
	}

	/** For script-driven kinematic bodies: derives velocity from the movement since last tick so riders get carried. */
	public SetKinematicPose(entityId: number, transform: FlatTransform): void {
		this.Enqueue({ operation: PhysOpType.SetKinematicPose, entityId, transform });
	}

	public SetLinearVelocity(entityId: number, velocity: Vec3): void {
		this.Enqueue({ operation: PhysOpType.SetLinearVelocity, entityId, velocity: velocity.ToTuple() });
	}

	public SetAngularVelocity(entityId: number, velocity: Vec3): void {
		this.Enqueue({ operation: PhysOpType.SetAngularVelocity, entityId, velocity: velocity.ToTuple() });
	}

	/** `worldOffsetFromCenterOfMass` is where the impulse is applied, relative to the body's centre. */
	public ApplyImpulse(entityId: number, impulse: Vec3, worldOffsetFromCenterOfMass: Vec3 = new Vec3()): void {
		this.Enqueue({
			operation: PhysOpType.ApplyImpulse,
			entityId,
			impulse: impulse.ToTuple(),
			offset: worldOffsetFromCenterOfMass.ToTuple(),
		});
	}

	public SetAwake(entityId: number, awake: boolean): void {
		this.Enqueue({ operation: PhysOpType.SetAwake, entityId, awake });
	}

	/** Queues one collide-and-slide move for the next physics step (the latest call per character wins). */
	public MoveCharacter(entityId: number, velocity: Vec3, layer: number, mask: number, options?: CharacterMoveOptionsDescriptor): void {
		this.Enqueue({
			operation: PhysOpType.MoveCharacter,
			entityId,
			velocity: velocity.ToTuple(),
			layer,
			mask,
			...(options ? { options } : {}),
		});
	}

	//#endregion

	//#region Queries

	private Query<T extends PhysicsQueryResult>(query: PhysicsQuery): Promise<T> {
		const queryId = this._nextQueryId++;
		return new Promise<T>((resolve) => {
			this._queries.set(queryId, resolve as (result: PhysicsQueryResult) => void);
			this.Enqueue({ operation: PhysOpType.Query, queryId, query });
		});
	}

	/** Sweeps a sphere from `origin` along `direction` (need not be normalised) - camera booms, ground probes... */
	public SweepSphere(
		origin: Vec3, direction: Vec3, maxDistance: number, radius: number,
		layer: number, mask: number, excludeEntityId?: number
	): Promise<ShapeCastResult> {
		return this.Query<ShapeCastResult>({
			type: PhysQueryType.SweepSphere,
			origin: origin.ToTuple(),
			direction: direction.ToTuple(),
			maxDistance,
			radius,
			layer,
			mask,
			...(excludeEntityId !== undefined ? { excludeEntityId } : {}),
		});
	}

	/** Moves a sphere by velocity * dt as a sweep: reports the first thing it touches, never tunnels. Moves nothing itself. */
	public SweepProjectile(
		entityId: number, position: Vec3, velocity: Vec3, dt: number, radius: number, layer: number, mask: number
	): Promise<ProjectileSweepResult> {
		return this.Query<ProjectileSweepResult>({
			type: PhysQueryType.SweepProjectile,
			entityId,
			position: position.ToTuple(),
			velocity: velocity.ToTuple(),
			dt,
			radius,
			layer,
			mask,
		});
	}

	public async IsAwake(entityId: number): Promise<boolean> {
		const result = await this.Query<{ awake: boolean; }>({ type: PhysQueryType.AwakeState, entityId });
		return result.awake;
	}

	//#endregion

	//#region State

	public GetBodyState(entityId: number): BodyState | undefined { return this._bodies.get(entityId); }
	public GetCharacterState(entityId: number): CharacterState | undefined { return this._characters.get(entityId); }
	public GetKind(entityId: number): PhysObjectKind | undefined { return this._kinds.get(entityId); }

	/** Registers a character so its per-step results get tracked. Called by CharacterBody. */
	public RegisterCharacter(entityId: number): CharacterState {
		const state: CharacterState = { IsOnFloor: false, FloorNormal: Vec3.Up(), GroundEntityId: 0, Velocity: new Vec3() };
		this._characters.set(entityId, state);
		return state;
	}

	//#endregion

	//#region World lifecycle

	/**
	 * Throws away the simulation and builds a fresh one. Resolves once PhysicsWorker has done so; snapshots that were
	 * already in flight from the old world are ignored until then.
	 */
	public async ResetWorld(settings: PhysicsWorldSettingsDescriptor): Promise<void> {
		this._queue.length = 0;
		this._kinds.clear();
		this._bodies.clear();
		this._characters.clear();
		this._queries.clear();
		this.Gravity.Set(...settings.gravity);
		if (this.Failed) return; // nobody to reset (and nobody to acknowledge)
		this._awaitingReset = true;

		this.Enqueue({ operation: PhysOpType.ResetWorld, settings });
		const acknowledged = this._sync.Begin((token) => this.Enqueue({ operation: PhysOpType.Sync, token }));
		this.Flush();
		await acknowledged;
		this._awaitingReset = false;
	}

	/** Resolves once every command queued so far has been applied by PhysicsWorker. */
	public Sync(): Promise<void> {
		if (this.Failed) return Promise.resolve();
		const acknowledged = this._sync.Begin((token) => this.Enqueue({ operation: PhysOpType.Sync, token }));
		this.Flush();
		return acknowledged;
	}

	//#endregion

	//#region Incoming

	public HandleMessage(message: PhysicsToGameLogicMessage): void {
		switch (message.state) {
			case PhysState.Ready:
				this.Ready = true;
				this.OnReady?.();
				break;

			case PhysState.Failed:
				this.Failed = true;
				this.FailureMessage = message.message;
				this.OnReady?.(); // boot must not wait for a "ready" that will never come
				break;

			case PhysState.SyncAck:
				this._sync.Acknowledge(message.token);
				break;

			case PhysState.QueryResult: {
				const resolve = this._queries.get(message.queryId);
				this._queries.delete(message.queryId);
				resolve?.(message.result);
				break;
			}

			case PhysState.Step:
				// Snapshots racing past a world reset belong to the old world.
				if (this._awaitingReset) break;
				this.ApplySnapshot(message);
				break;
		}
	}

	private ApplySnapshot(message: Extract<PhysicsToGameLogicMessage, { state: PhysState.Step; }>): void {
		const bodies = new Float64Array(message.bodies);
		for (let i = 0; i < message.bodyCount; i++) {
			const b = i * BODY_STRIDE;
			const state = this._bodies.get(bodies[b]!);
			if (!state) continue; // removed on our side while this snapshot was in flight

			state.Position.Set(bodies[b + 1]!, bodies[b + 2]!, bodies[b + 3]!);
			state.Rotation.Set(bodies[b + 4]!, bodies[b + 5]!, bodies[b + 6]!, bodies[b + 7]!);
			state.LinearVelocity.Set(bodies[b + 8]!, bodies[b + 9]!, bodies[b + 10]!);
			state.AngularVelocity.Set(bodies[b + 11]!, bodies[b + 12]!, bodies[b + 13]!);
		}

		const characters = new Float64Array(message.characters);
		for (let i = 0; i < message.characterCount; i++) {
			const c = i * CHARACTER_STRIDE;
			const state = this._characters.get(characters[c]!);
			if (!state) continue;

			state.IsOnFloor = characters[c + 1] === 1;
			state.FloorNormal.Set(characters[c + 2]!, characters[c + 3]!, characters[c + 4]!);
			state.GroundEntityId = characters[c + 5]!;
			state.Velocity.Set(characters[c + 6]!, characters[c + 7]!, characters[c + 8]!);
		}

		const events: OverlapEventData[] = [];
		const overlaps = message.overlaps;
		if (overlaps) {
			for (let i = 0; i + 2 < overlaps.length; i += 3) {
				events.push({ entityA: overlaps[i]!, entityB: overlaps[i + 1]!, entered: overlaps[i + 2] === 1 });
			}
		}

		this.LastStepTimeMs = performance.now();
		this.OnStep?.(message.step, events);
	}

	//#endregion
}

export type { Vec3Tuple };
