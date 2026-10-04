// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../../Logging/Logger";
import { Quat } from "../../Engine/Math/Quat";
import { Vec3, type Vec3Tuple } from "../../Engine/Math/Vec3";
import { PhysBodyType, PhysOpType, PhysQueryType, PhysShape, PhysState } from "../Common/CommonEnums";
import type {
	CharacterMoveOptionsDescriptor,
	PhysicsCommand,
	PhysicsQuery,
	PhysicsQueryResult,
	PhysicsShapeDescriptor,
	PhysicsToGameLogicMessage,
	PhysicsWorldSettingsDescriptor,
} from "../Protocol/PhysicsGameLogicProtocol";
import { BODY_STRIDE, CHARACTER_STRIDE, type FlatTransform } from "../Protocol/TransformProtocol";
import type { PhysicsBridgeExports } from "./PhysicsBridgeContract";

type Tuple3 = [number, number, number];

/** Defaults identical to Framework.Physics.CharacterMoveOptions / PhysicsWorldSettings in C#. */
const DefaultCharacterOptions: Required<CharacterMoveOptionsDescriptor> = {
	maxSlideIterations: 4,
	skinWidth: 0.015,
	maxFloorAngleDegrees: 46,
	floorProbeDistance: 0.08,
};

interface ShapeEntry {
	id: number;
	/** Convex hulls only: Bepu re-centres the hull; this is that offset in the source points' local space. */
	centroidOffset: Tuple3;
	capsule?: { radius: number; cylinderLength: number; };
}

type SpawnCommand = Extract<PhysicsCommand, { operation: PhysOpType.SpawnBody; }>;

interface BodyEntry {
	entityId: number;
	/** Bridge body id (dynamic/kinematic) or static id (static) - see `bodyType`. */
	handle: number;
	bodyType: PhysBodyType;
	centroidOffset: Tuple3;
	/** Kinematic bodies only: last pose we were told about, for deriving velocity from the pose delta. */
	lastPose?: FlatTransform | undefined;
	pendingKinematicPose?: FlatTransform | undefined;
}

interface CharacterEntry {
	entity: BodyEntry;
	/**
	 * The character's authoritative position. Deliberately NOT read back from the Bepu body: after Step() the kinematic
	 * body has been integrated by its own velocity (pose + v*dt), so reading it would move the character twice per tick.
	 * (The Godot original keeps the position on the node and only ever *writes* the body pose, for the same reason.)
	 */
	position: Tuple3;
	radius: number;
	cylinderLength: number;
	pending: { velocity: Tuple3; layer: number; mask: number; options: Required<CharacterMoveOptionsDescriptor>; } | null;

	// Results of the most recent MoveCharacter, reported every step until the next one replaces them.
	isOnFloor: boolean;
	floorNormal: Tuple3;
	groundEntityId: number;
	velocity: Tuple3;
}

export interface PhysicsStepOutput {
	step: number;
	bodyCount: number;
	bodies: ArrayBuffer;
	characterCount: number;
	characters: ArrayBuffer;
	overlaps: Int32Array<ArrayBuffer> | null;
}

/**
 * Everything that talks to a loaded PhysicsBridge: shapes, bodies, commands, the engine side of the character controller
 * (platform carry + MoveCharacter), kinematic pose -> velocity, queries and stepping. No ports, no timing (PhysicsWorker).
 */
export class PhysicsWorld {
	private readonly _bridge: PhysicsBridgeExports;

	private readonly _entities = new Map<number, BodyEntry>();
	private readonly _bodyIdToEntity = new Map<number, BodyEntry>();
	private readonly _characters = new Map<number, CharacterEntry>();
	private readonly _shapeCache = new Map<string, ShapeEntry>();

	private _stepIndex = 0;

	public constructor(bridge: PhysicsBridgeExports) {
		this._bridge = bridge;
	}

	public get StepIndex(): number {
		return this._stepIndex;
	}

	//#region World lifecycle

	public CreateWorld(settings: PhysicsWorldSettingsDescriptor): void {
		const [gx, gy, gz] = settings.gravity;
		this._bridge.CreateWorld(
			gx, gy, gz,
			settings.velocityIterations ?? 8,
			settings.substeps ?? 1,
			false, // single-threaded wasm build - see PhysicsBridge.CreateWorld
			settings.frictionCoefficient ?? 0.8,
			settings.maximumRecoveryVelocity ?? 2
		);

		this._entities.clear();
		this._bodyIdToEntity.clear();
		this._characters.clear();
		this._shapeCache.clear();
	}

	//#endregion

	//#region Commands

	/** `reply` receives anything that has to travel back immediately (query results, sync acks). */
	public ApplyCommands(commands: PhysicsCommand[], reply: (message: PhysicsToGameLogicMessage) => void): void {
		for (const command of commands) {
			try {
				this.ApplyCommand(command, reply);
			} catch (error) {
				Logger.LogException(error, `[PhysicsWorld] command ${String(command.operation)} failed:`);
			}
		}
	}

	private ApplyCommand(command: PhysicsCommand, reply: (message: PhysicsToGameLogicMessage) => void): void {
		switch (command.operation) {
			case PhysOpType.SpawnBody:
				this.SpawnBody(command);
				break;
			case PhysOpType.RemoveBody:
				this.RemoveBody(command.entityId);
				break;
			case PhysOpType.SetPose:
				this.Teleport(command.entityId, command.transform);
				break;
			case PhysOpType.SetKinematicPose: {
				const body = this.GetMovable(command.entityId);
				if (body) body.pendingKinematicPose = command.transform; // consumed by the next Step, latest wins
				break;
			}
			case PhysOpType.SetLinearVelocity:
				this.WithAwakeBody(command.entityId, (handle) => this._bridge.SetLinearVelocity(handle, ...command.velocity));
				break;
			case PhysOpType.SetAngularVelocity:
				this.WithAwakeBody(command.entityId, (handle) => this._bridge.SetAngularVelocity(handle, ...command.velocity));
				break;
			case PhysOpType.ApplyImpulse:
				this.WithAwakeBody(command.entityId, (handle) => this._bridge.ApplyImpulse(handle, ...command.impulse, ...command.offset));
				break;
			case PhysOpType.SetAwake: {
				const body = this.GetMovable(command.entityId);
				if (body) this._bridge.SetAwakeState(body.handle, command.awake);
				break;
			}
			case PhysOpType.MoveCharacter:
				this.QueueCharacterMove(command);
				break;
			case PhysOpType.Query:
				reply({ state: PhysState.QueryResult, queryId: command.queryId, result: this.RunQuery(command.query) });
				break;
			case PhysOpType.ResetWorld:
				this.CreateWorld(command.settings);
				break;
			case PhysOpType.Sync:
				reply({ state: PhysState.SyncAck, token: command.token });
				break;
		}
	}

	private Teleport(entityId: number, transform: FlatTransform): void {
		const body = this.GetMovable(entityId);
		if (!body) return;
		this.WritePose(body, transform);
		body.lastPose = transform; // a teleport must not turn into a huge derived velocity next step
		body.pendingKinematicPose = undefined;

		const character = this._characters.get(entityId);
		if (character) character.position = [transform[0], transform[1], transform[2]];
	}

	/** Bepu puts resting bodies to sleep and ignores velocity writes while they sleep, so wake the body first. */
	private WithAwakeBody(entityId: number, write: (handle: number) => void): void {
		const body = this.GetMovable(entityId);
		if (!body) return;
		this._bridge.SetAwakeState(body.handle, true);
		write(body.handle);
	}

	private QueueCharacterMove(command: Extract<PhysicsCommand, { operation: PhysOpType.MoveCharacter; }>): void {
		const character = this._characters.get(command.entityId);
		if (!character) return;
		character.pending = {
			velocity: command.velocity,
			layer: command.layer,
			mask: command.mask,
			options: { ...DefaultCharacterOptions, ...command.options },
		};
	}

	/** Dynamic or kinematic body for an entity, or undefined (statics have no body id to poke). */
	private GetMovable(entityId: number): BodyEntry | undefined {
		const body = this._entities.get(entityId);
		return body && body.bodyType !== PhysBodyType.Static ? body : undefined;
	}

	private SpawnBody(command: SpawnCommand): void {
		if (this._entities.has(command.entityId)) this.RemoveBody(command.entityId);

		const shape = this.ResolveShape(command.shape, command.mass ?? 1);
		const handle = this.AddBridgeBody(command, shape.id, PhysicsWorld.CentroidPosition(command.transform, shape.centroidOffset));

		const entry: BodyEntry = {
			entityId: command.entityId,
			handle,
			bodyType: command.bodyType,
			centroidOffset: shape.centroidOffset,
			lastPose: command.bodyType === PhysBodyType.Kinematic ? command.transform : undefined,
		};
		this._entities.set(command.entityId, entry);
		if (command.bodyType !== PhysBodyType.Static) this._bodyIdToEntity.set(handle, entry);
		if (command.bodyType === PhysBodyType.Kinematic && shape.capsule) this.RegisterCharacter(entry, command.transform, shape.capsule);
	}

	/** A hull's pose is that of its centroid: the source origin shifted by the (rotated) centroid offset. */
	private static CentroidPosition(transform: FlatTransform, offset: Vec3Tuple): Vec3Tuple {
		const [px, py, pz, qx, qy, qz, qw] = transform;
		const shift = Quat.FromTuple([qx, qy, qz, qw]).Rotate(Vec3.FromTuple(offset));
		return [px + shift.X, py + shift.Y, pz + shift.Z];
	}

	private AddBridgeBody(command: SpawnCommand, shapeId: number, [x, y, z]: Vec3Tuple): number {
		const [, , , qx, qy, qz, qw] = command.transform;
		// layer/mask are C# `int`: the JS<->.NET marshaller asserts on anything outside int32,
		// so 0xffffffff (4294967295) must be passed as -1 (`| 0`).
		const layer = command.layer | 0;
		const mask = command.mask | 0;
		switch (command.bodyType) {
			case PhysBodyType.Dynamic:
				return this._bridge.AddDynamicBody(
					shapeId, x, y, z, qx, qy, qz, qw, command.mass ?? 1,
					layer, mask, command.entityId, command.objectKind, command.continuousDetection ?? false
				);
			case PhysBodyType.Kinematic:
				return this._bridge.AddKinematicBody(shapeId, x, y, z, qx, qy, qz, qw, layer, mask, command.entityId, command.objectKind);
			case PhysBodyType.Static:
				return this._bridge.AddStaticBody(shapeId, x, y, z, qx, qy, qz, qw, layer, mask, command.entityId, command.objectKind);
		}
	}

	private RegisterCharacter(entry: BodyEntry, transform: FlatTransform, capsule: { radius: number; cylinderLength: number; }): void {
		this._characters.set(entry.entityId, {
			entity: entry,
			position: [transform[0], transform[1], transform[2]],
			radius: capsule.radius,
			cylinderLength: capsule.cylinderLength,
			pending: null,
			isOnFloor: false,
			floorNormal: [0, 1, 0],
			groundEntityId: 0,
			velocity: [0, 0, 0],
		});
	}

	private RemoveBody(entityId: number): void {
		const body = this._entities.get(entityId);
		if (!body) return;

		if (body.bodyType === PhysBodyType.Static) {
			this._bridge.RemoveStatic(body.handle);
		} else {
			this._bridge.RemoveBody(body.handle);
			this._bodyIdToEntity.delete(body.handle);
		}
		this._entities.delete(entityId);
		this._characters.delete(entityId);
	}

	private WritePose(body: BodyEntry, transform: FlatTransform): void {
		const [px, py, pz, qx, qy, qz, qw] = transform;
		const worldOffset = Quat.FromTuple([qx, qy, qz, qw]).Rotate(Vec3.FromTuple(body.centroidOffset));
		this.SetPoseAwake(body, px + worldOffset.X, py + worldOffset.Y, pz + worldOffset.Z, qx, qy, qz, qw);
	}

	/**
	 * BEPU recomputes broad-phase bounds only for awake bodies: a pose written into a sleeping one moves it without
	 * finding new overlaps (a character that stood still and then walked through a coin never touched it).
	 */
	private SetPoseAwake(body: BodyEntry, px: number, py: number, pz: number, qx: number, qy: number, qz: number, qw: number): void {
		this._bridge.SetAwakeState(body.handle, true);
		this._bridge.SetBodyPose(body.handle, px, py, pz, qx, qy, qz, qw);
	}

	//#endregion

	//#region Shapes

	private ResolveShape(shape: PhysicsShapeDescriptor, mass: number): ShapeEntry {
		// Primitive shapes are cheap and immutable: one cached entry per distinct descriptor. Hulls/meshes are
		// effectively unique per call, so caching them would only cost memory.
		const key = PhysicsWorld.ShapeKey(shape);
		if (key !== null) {
			const cached = this._shapeCache.get(key);
			if (cached) return cached;
		}

		let entry: ShapeEntry;
		switch (shape.shape) {
			case PhysShape.Box:
				entry = { id: this._bridge.AddBoxShape(...shape.size), centroidOffset: [0, 0, 0] };
				break;
			case PhysShape.Sphere:
				entry = { id: this._bridge.AddSphereShape(shape.radius), centroidOffset: [0, 0, 0] };
				break;
			case PhysShape.Capsule:
				entry = {
					id: this._bridge.AddCapsuleShape(shape.radius, shape.cylinderLength),
					centroidOffset: [0, 0, 0],
					capsule: { radius: shape.radius, cylinderLength: shape.cylinderLength },
				};
				break;
			case PhysShape.Cylinder:
				entry = { id: this._bridge.AddCylinderShape(shape.radius, shape.height), centroidOffset: [0, 0, 0] };
				break;
			case PhysShape.ConvexHull: {
				const result = this._bridge.AddConvexHullShape(shape.points, mass);
				entry = { id: result[0]!, centroidOffset: [result[1]!, result[2]!, result[3]!] };
				break;
			}
			case PhysShape.TriangleMesh:
				entry = { id: this._bridge.AddTriangleMeshShape(shape.vertices, ...shape.scale), centroidOffset: [0, 0, 0] };
				break;
		}

		if (key !== null) this._shapeCache.set(key, entry);
		return entry;
	}

	private static ShapeKey(shape: PhysicsShapeDescriptor): string | null {
		switch (shape.shape) {
			case PhysShape.Box: return `box:${shape.size.join(",")}`;
			case PhysShape.Sphere: return `sphere:${shape.radius}`;
			case PhysShape.Capsule: return `capsule:${shape.radius}:${shape.cylinderLength}`;
			case PhysShape.Cylinder: return `cylinder:${shape.radius}:${shape.height}`;
			case PhysShape.ConvexHull:
			case PhysShape.TriangleMesh:
				return null;
		}
	}

	//#endregion

	//#region Queries

	private RunQuery(query: PhysicsQuery): PhysicsQueryResult {
		switch (query.type) {
			case PhysQueryType.SweepSphere: {
				const exclude = query.excludeEntityId !== undefined ? this.GetMovable(query.excludeEntityId)?.handle ?? 0 : 0;
				const r = this._bridge.SweepSphereCast(
					...query.origin, ...query.direction, query.maxDistance, query.radius,
					query.layer | 0, query.mask | 0, exclude
				);
				return { ...PhysicsWorld.ReadSweepHit(r), distance: r[10]!, hitEntityId: r[11]! };
			}
			case PhysQueryType.SweepProjectile: {
				const self = this.GetMovable(query.entityId);
				if (!self) return { hit: false, position: query.position, point: [0, 0, 0], normal: [0, 1, 0], hitEntityId: 0 };
				const r = this._bridge.SweepProjectile(
					self.handle, ...query.position, ...query.velocity, query.dt, query.radius, query.layer | 0, query.mask | 0
				);
				return { ...PhysicsWorld.ReadSweepHit(r), hitEntityId: r[10]! };
			}
			case PhysQueryType.AwakeState: {
				const body = this.GetMovable(query.entityId);
				return { awake: body ? this._bridge.GetAwakeState(body.handle) : false };
			}
		}
	}

	/** The layout both sweeps start with: [hit, position xyz, point xyz, normal xyz, ...]. */
	private static ReadSweepHit(r: ArrayLike<number>): { hit: boolean; position: Vec3Tuple; point: Vec3Tuple; normal: Vec3Tuple; } {
		return { hit: r[0] === 1, position: [r[1]!, r[2]!, r[3]!], point: [r[4]!, r[5]!, r[6]!], normal: [r[7]!, r[8]!, r[9]!] };
	}

	//#endregion

	//#region Stepping

	/** Advances the simulation by one fixed step and packages the results for the caller to post. */
	public Step(dt: number): PhysicsStepOutput {
		this.ApplyKinematicPoses(dt);
		this.MoveCharacters(dt);

		const flat = this._bridge.Step(dt);
		const step = this._stepIndex++;
		const { bodies, bodyCount } = this.PackBodies(flat);
		const { characters, characterCount } = this.PackCharacters();
		return { step, bodyCount, bodies: bodies.buffer, characterCount, characters: characters.buffer, overlaps: this.PackOverlaps() };
	}

	// Fresh buffers every tick on purpose: once a buffer is in postMessage's transfer list it is permanently detached
	// from this realm, so there is no pool to safely reuse.
	private PackBodies(flat: ArrayLike<number>): { bodies: Float64Array<ArrayBuffer>; bodyCount: number; } {
		const bodies = new Float64Array(Math.floor(flat.length / BODY_STRIDE) * BODY_STRIDE);
		let bodyCount = 0;
		for (let i = 0; i + BODY_STRIDE - 1 < flat.length; i += BODY_STRIDE) {
			const entry = this._bodyIdToEntity.get(flat[i]!);
			if (!entry) continue; // never forward a dangling id

			const base = bodyCount * BODY_STRIDE;
			bodies[base] = entry.entityId;
			for (let k = 1; k < BODY_STRIDE; k++) bodies[base + k] = flat[i + k]!;

			// Characters report their own authoritative position (see CharacterEntry.position), not the integrated pose.
			const character = this._characters.get(entry.entityId);
			const position = character ? character.position : PhysicsWorld.EntityOrigin(entry, flat, i);
			bodies.set(position, base + 1);
			bodyCount++;
		}
		return { bodies, bodyCount };
	}

	/** Undoes the hull centroid shift, so the entity's origin stays where its source shape was. */
	private static EntityOrigin(entry: BodyEntry, flat: ArrayLike<number>, i: number): Vec3Tuple {
		const o = entry.centroidOffset;
		const position: Vec3Tuple = [flat[i + 1]!, flat[i + 2]!, flat[i + 3]!];
		if (o[0] === 0 && o[1] === 0 && o[2] === 0) return position;

		const w = new Quat(flat[i + 4]!, flat[i + 5]!, flat[i + 6]!, flat[i + 7]!).Rotate(new Vec3(o[0], o[1], o[2]));
		return [position[0] - w.X, position[1] - w.Y, position[2] - w.Z];
	}

	private PackCharacters(): { characters: Float64Array<ArrayBuffer>; characterCount: number; } {
		const characters = new Float64Array(this._characters.size * CHARACTER_STRIDE);
		let characterCount = 0;
		for (const [entityId, c] of this._characters) {
			characters.set([entityId, c.isOnFloor ? 1 : 0, ...c.floorNormal, c.groundEntityId, ...c.velocity], characterCount * CHARACTER_STRIDE);
			characterCount++;
		}
		return { characters, characterCount };
	}

	private PackOverlaps(): Int32Array<ArrayBuffer> | null {
		const events = this._bridge.GetLastOverlapEvents();
		return events.length > 0 ? Int32Array.from(events) : null;
	}

	/**
	 * Port of BepuAnimatableBody3D._PhysicsProcess: derive linear/angular velocity from the pose delta (the solver builds
	 * friction/push constraints from relative *velocity*, so a body that is only teleported would not carry anything
	 * resting on it), then teleport the pose so the body stays exactly glued to whatever drives it.
	 */
	private ApplyKinematicPoses(dt: number): void {
		if (dt <= 0) return;

		for (const body of this._entities.values()) {
			const target = body.pendingKinematicPose;
			if (!target) continue;
			body.pendingKinematicPose = undefined;

			const last = body.lastPose ?? target;
			this._bridge.SetLinearVelocity(
				body.handle,
				(target[0] - last[0]) / dt,
				(target[1] - last[1]) / dt,
				(target[2] - last[2]) / dt
			);

			// Quaternion-log equivalent of the linear velocity: omega = 2/dt * log(to * inverse(from)).
			const delta = Quat.FromTuple([target[3], target[4], target[5], target[6]])
				.Mul(Quat.FromTuple([last[3], last[4], last[5], last[6]]).Inverse());
			const log = PhysicsWorld.QuatLogVector(delta);
			this._bridge.SetAngularVelocity(body.handle, log.X * (2 / dt), log.Y * (2 / dt), log.Z * (2 / dt));

			this.WritePose(body, target);
			body.lastPose = target;
		}
	}

	/** Vector part of log(q) for a unit quaternion: axis * (angle / 2), taking the short way round. */
	private static QuatLogVector(q: Quat): Vec3 {
		const sign = q.W < 0 ? -1 : 1;
		const w = Math.min(1, sign * q.W);
		const vx = sign * q.X, vy = sign * q.Y, vz = sign * q.Z;
		const vectorLength = Math.sqrt(vx * vx + vy * vy + vz * vz);
		if (vectorLength < 1e-9) return new Vec3();
		const scale = Math.atan2(vectorLength, w) / vectorLength;
		return new Vec3(vx * scale, vy * scale, vz * scale);
	}

	/**
	 * Engine-side half of BepuCharacterBody3D.MoveAndSlide: carry along whatever we stood on last tick, run the
	 * collide-and-slide sweep, write the resulting pose + velocity back to the kinematic body so dynamic bodies still
	 * see and get pushed by the character.
	 */
	private MoveCharacters(dt: number): void {
		for (const character of this._characters.values()) {
			const command = character.pending;
			if (!command) continue;
			character.pending = null;

			const body = character.entity;
			let [px, py, pz] = character.position;

			// Carry: MoveCharacter is a pure sweep query against wherever things are *right now* - it has no notion
			// of "the floor moved since last tick, bring me with it". So if we were standing on something that
			// can move, ride along with its velocity before sweeping this tick's own input velocity.
			if (character.isOnFloor && character.groundEntityId !== 0) {
				const ground = this._entities.get(character.groundEntityId);
				if (ground && ground.bodyType !== PhysBodyType.Static) {
					const v = this._bridge.GetLinearVelocity(ground.handle);
					px += v[0]! * dt;
					py += v[1]! * dt;
					pz += v[2]! * dt;
				}
			}

			const o = command.options;
			const r = this._bridge.MoveCharacter(
				body.handle, px, py, pz, ...command.velocity, dt,
				character.radius, character.cylinderLength,
				command.layer | 0, command.mask | 0,
				o.maxSlideIterations, o.skinWidth, o.maxFloorAngleDegrees, o.floorProbeDistance
			);

			character.isOnFloor = r[3] === 1;
			character.floorNormal = [r[4]!, r[5]!, r[6]!];
			character.groundEntityId = r[7]!;
			character.velocity = [r[8]!, r[9]!, r[10]!];

			character.position = [r[0]!, r[1]!, r[2]!];
			this.SetPoseAwake(body, r[0]!, r[1]!, r[2]!, 0, 0, 0, 1);
			this._bridge.SetLinearVelocity(body.handle, ...(dt > 0 ? character.velocity : ([0, 0, 0] as Tuple3)));
		}
	}

	//#endregion
}
