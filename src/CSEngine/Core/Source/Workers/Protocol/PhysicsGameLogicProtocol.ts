// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { PhysOpType as PhysOp, PhysShape, PhysState } from "../Common/CommonEnums";
import type { FlatTransform, TransformBatchPayload } from "./TransformProtocol";

export type GameLogicToPhysicsMessage =
	| {
		operation: PhysOp.SpawnDynamicBody;
		entityId: number;
		shape: PhysicsShapeDescriptor;
		transform: FlatTransform;
		mass: number;
		layer: number;
		mask: number;
	}
	| {
		operation: PhysOp.SpawnStaticBody;
		entityId: number;
		shape: PhysicsShapeDescriptor;
		transform: FlatTransform;
		layer: number;
		mask: number;
	}
	| { operation: PhysOp.RemoveBody; entityId: number; }
	| { operation: PhysOp.ApplyImpulse; entityId: number; impulse: [number, number, number]; offset: [number, number, number]; }
	| { operation: PhysOp.SetVelocity; entityId: number; velocity: [number, number, number]; };


export type PhysicsShapeDescriptor =
	| { shape: PhysShape.Box; size: [number, number, number]; }
	| { shape: PhysShape.Sphere; radius: number; }
	| { shape: PhysShape.Capsule; radius: number; cylinderLength: number; }
	| { shape: PhysShape.Cylinder; radius: number; height: number; };

export type PhysicsToGameLogicMessage =
	| { state: PhysState.Ready; }
	| ({ state: PhysState.Transforms; } & TransformBatchPayload)
	| { state: PhysState.OverlapEvents; events: { ownerA: number; ownerB: number; entered: boolean; }[]; };
