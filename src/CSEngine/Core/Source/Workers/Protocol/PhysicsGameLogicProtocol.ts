// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { PhysBodyType, PhysObjectKind, PhysOpType as PhysOp, PhysQueryType, PhysShape, PhysState } from "../Common/CommonEnums";
import type { FlatTransform } from "./TransformProtocol";

type Tuple3 = [number, number, number];

export type PhysicsShapeDescriptor =
	| { shape: PhysShape.Box; size: Tuple3; } // full extents
	| { shape: PhysShape.Sphere; radius: number; }
	| { shape: PhysShape.Capsule; radius: number; cylinderLength: number; } // straight segment only, not total height
	| { shape: PhysShape.Cylinder; radius: number; height: number; }
	/** Convex hull of a point cloud, flat [x0,y0,z0,x1,...]. Bepu re-centres it; PhysicsWorld compensates (see ShapeEntry.CentroidOffset). */
	| { shape: PhysShape.ConvexHull; points: number[]; }
	/** Static-only BVH triangle mesh, flat triangle soup [x0,y0,z0,...] (length % 9 == 0). */
	| { shape: PhysShape.TriangleMesh; vertices: number[]; scale: Tuple3; };

/** Mirrors Framework.Physics.CharacterMoveOptions; omitted fields use the same defaults as the C# struct. */
export interface CharacterMoveOptionsDescriptor {
	maxSlideIterations?: number;
	skinWidth?: number;
	maxFloorAngleDegrees?: number;
	floorProbeDistance?: number;
}

/** Mirrors Framework.Physics.PhysicsWorldSettings. */
export interface PhysicsWorldSettingsDescriptor {
	gravity: Tuple3;
	velocityIterations?: number;
	substeps?: number;
	frictionCoefficient?: number;
	maximumRecoveryVelocity?: number;
}

export type PhysicsQuery =
	| {
		type: PhysQueryType.SweepSphere;
		origin: Tuple3;
		direction: Tuple3;
		maxDistance: number;
		radius: number;
		layer: number;
		mask: number;
		excludeEntityId?: number;
	}
	| {
		type: PhysQueryType.SweepProjectile;
		entityId: number; // the projectile's own kinematic body (excluded from the sweep)
		position: Tuple3;
		velocity: Tuple3;
		dt: number;
		radius: number;
		layer: number;
		mask: number;
	}
	| { type: PhysQueryType.AwakeState; entityId: number; };

export interface ShapeCastResult {
	hit: boolean;
	position: Tuple3;
	point: Tuple3;
	normal: Tuple3;
	distance: number;
	hitEntityId: number;
}

export interface ProjectileSweepResult {
	hit: boolean;
	position: Tuple3;
	point: Tuple3;
	normal: Tuple3;
	hitEntityId: number;
}

export type PhysicsQueryResult = ShapeCastResult | ProjectileSweepResult | { awake: boolean; };

export type PhysicsCommand =
	| {
		operation: PhysOp.SpawnBody;
		entityId: number;
		bodyType: PhysBodyType;
		shape: PhysicsShapeDescriptor;
		transform: FlatTransform;
		layer: number;
		mask: number;
		objectKind: PhysObjectKind;
		mass?: number; // dynamic only
		continuousDetection?: boolean;
	}
	| { operation: PhysOp.RemoveBody; entityId: number; }
	| { operation: PhysOp.SetPose; entityId: number; transform: FlatTransform; }
	| { operation: PhysOp.SetKinematicPose; entityId: number; transform: FlatTransform; }
	| { operation: PhysOp.SetLinearVelocity; entityId: number; velocity: Tuple3; }
	| { operation: PhysOp.SetAngularVelocity; entityId: number; velocity: Tuple3; }
	| { operation: PhysOp.ApplyImpulse; entityId: number; impulse: Tuple3; offset: Tuple3; }
	| { operation: PhysOp.SetAwake; entityId: number; awake: boolean; }
	| {
		operation: PhysOp.MoveCharacter;
		entityId: number;
		velocity: Tuple3;
		layer: number;
		mask: number;
		options?: CharacterMoveOptionsDescriptor;
	}
	| { operation: PhysOp.Query; queryId: number; query: PhysicsQuery; }
	| { operation: PhysOp.ResetWorld; settings: PhysicsWorldSettingsDescriptor; }
	| { operation: PhysOp.Sync; token: number; };

/** GameLogic -> Physics. Commands are batched: one postMessage per tick instead of one per command. */
export interface GameLogicToPhysicsMessage {
	commands: PhysicsCommand[];
}

export type PhysicsToGameLogicMessage =
	| { state: PhysState.Ready; }
	| {
		state: PhysState.Step;
		step: number;
		bodyCount: number;
		/** BODY_STRIDE-wide float64 groups, see TransformProtocol. */
		bodies: ArrayBuffer;
		characterCount: number;
		/** CHARACTER_STRIDE-wide float64 groups, see TransformProtocol. */
		characters: ArrayBuffer;
		/** Flat [ownerA, ownerB, entered(0/1)] triples (owner ids are entity ids); null when nothing changed this step. */
		overlaps: Int32Array<ArrayBuffer> | null;
	}
	| { state: PhysState.QueryResult; queryId: number; result: PhysicsQueryResult; }
	| { state: PhysState.SyncAck; token: number; }
	| { state: PhysState.Failed; message: string; };
