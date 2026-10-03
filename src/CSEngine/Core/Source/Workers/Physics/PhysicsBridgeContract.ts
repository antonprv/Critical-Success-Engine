// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Flat number array as the .NET JS marshaller hands it back (a plain `number[]`; typed arrays are accepted too). */
export type FlatNumbers = ArrayLike<number>;

/**
 * The JS surface of PhysicsBridge.cs's [JSExport] methods, written by hand because the wasm build is not part of the
 * TypeScript build. Ids are minted by the bridge; `ownerId` is echoed back in events and sweeps (the entity id).
 */
export interface PhysicsBridgeExports {
	//#region World

	CreateWorld(
		gravityX: number, gravityY: number, gravityZ: number,
		velocityIterations: number,
		substeps: number,
		useMultithreading: boolean,
		frictionCoefficient: number,
		maximumRecoveryVelocity: number
	): void;
	DestroyWorld(): void;

	//#endregion

	//#region Shapes

	AddBoxShape(sizeX: number, sizeY: number, sizeZ: number): number;
	AddSphereShape(radius: number): number;
	/** `cylinderLength` is the straight segment only, not the total capped length. */
	AddCapsuleShape(radius: number, cylinderLength: number): number;
	AddCylinderShape(radius: number, height: number): number;
	/** Returns [shapeId, centroidOffsetX, centroidOffsetY, centroidOffsetZ]. */
	AddConvexHullShape(points: number[], mass: number): FlatNumbers;
	/** Static-only. `triangleVertices` is a flat triangle soup (length % 9 == 0). */
	AddTriangleMeshShape(triangleVertices: number[], scaleX: number, scaleY: number, scaleZ: number): number;

	//#endregion

	//#region Bodies

	/** `kind` is PhysicsObjectKind: 0 Solid, 1 Character, 2 Trigger, 3 Projectile. */
	AddDynamicBody(
		shapeId: number,
		posX: number, posY: number, posZ: number,
		quatX: number, quatY: number, quatZ: number, quatW: number,
		mass: number,
		layer: number, mask: number, ownerId: number,
		kind: number,
		continuousDetection: boolean
	): number;
	AddKinematicBody(
		shapeId: number,
		posX: number, posY: number, posZ: number,
		quatX: number, quatY: number, quatZ: number, quatW: number,
		layer: number, mask: number, ownerId: number,
		kind: number
	): number;
	AddStaticBody(
		shapeId: number,
		posX: number, posY: number, posZ: number,
		quatX: number, quatY: number, quatZ: number, quatW: number,
		layer: number, mask: number, ownerId: number,
		kind: number
	): number;

	RemoveBody(bodyId: number): void;
	RemoveStatic(staticId: number): void;
	BodyExists(bodyId: number): boolean;

	/** Returns [posX, posY, posZ, quatX, quatY, quatZ, quatW]. */
	GetBodyPose(bodyId: number): FlatNumbers;
	SetBodyPose(
		bodyId: number,
		posX: number, posY: number, posZ: number,
		quatX: number, quatY: number, quatZ: number, quatW: number
	): void;

	SetAwakeState(bodyId: number, awake: boolean): void;
	GetAwakeState(bodyId: number): boolean;

	GetLinearVelocity(bodyId: number): FlatNumbers;
	SetLinearVelocity(bodyId: number, x: number, y: number, z: number): void;
	GetAngularVelocity(bodyId: number): FlatNumbers;
	SetAngularVelocity(bodyId: number, x: number, y: number, z: number): void;

	ApplyImpulse(
		bodyId: number,
		impulseX: number, impulseY: number, impulseZ: number,
		offsetX: number, offsetY: number, offsetZ: number
	): void;

	//#endregion

	//#region Character movement & sweeps

	/**
	 * Returns [posX, posY, posZ, isOnFloor(0/1), floorNormalX, floorNormalY, floorNormalZ, groundOwnerId,
	 * velX, velY, velZ].
	 */
	MoveCharacter(
		selfBodyId: number,
		posX: number, posY: number, posZ: number,
		velX: number, velY: number, velZ: number,
		dt: number,
		radius: number, cylinderLength: number,
		layer: number, mask: number,
		maxSlideIterations: number,
		skinWidth: number,
		maxFloorAngleDegrees: number,
		floorProbeDistance: number
	): FlatNumbers;

	/** Returns [hit(0/1), posX, posY, posZ, pointX, pointY, pointZ, normalX, normalY, normalZ, hitOwnerId]. */
	SweepProjectile(
		selfBodyId: number,
		posX: number, posY: number, posZ: number,
		velX: number, velY: number, velZ: number,
		dt: number,
		radius: number,
		layer: number, mask: number
	): FlatNumbers;

	/**
	 * `excludeBodyId` 0 = exclude nothing. Returns [hit(0/1), posX, posY, posZ, pointX, pointY, pointZ,
	 * normalX, normalY, normalZ, distance, hitOwnerId].
	 */
	SweepSphereCast(
		originX: number, originY: number, originZ: number,
		dirX: number, dirY: number, dirZ: number,
		maxDistance: number,
		radius: number,
		layer: number, mask: number,
		excludeBodyId: number
	): FlatNumbers;

	//#endregion

	//#region Stepping

	/** Flat, BODY_STRIDE (14) doubles per body: [bodyId, pos(3), quat(4), linearVelocity(3), angularVelocity(3)]. */
	Step(dt: number): FlatNumbers;

	/** Flat [ownerA, ownerB, entered(0/1)] triples from the most recent Step. */
	GetLastOverlapEvents(): FlatNumbers;

	//#endregion
}

/** Minimal slice of the generated `dotnet.js` boot API (net10.0 wasm-tools) that we actually use. */
export interface DotnetRuntimeApi {
	getConfig(): { mainAssemblyName: string; };
	getAssemblyExports(assemblyName: string): Promise<{
		Physics: { Wasm: { PhysicsBridge: PhysicsBridgeExports; }; };
	}>;
}
