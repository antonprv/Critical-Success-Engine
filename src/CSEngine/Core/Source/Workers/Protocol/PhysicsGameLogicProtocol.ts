// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { PhysOpType, PhysShape } from "../Common/CommonEnums";
import type { FlatTransform, TransformBatchPayload } from "./TransformProtocol";

export enum PhysToGameMsg {
	Ready = 0,
	Transforms,
	OverlapEvents
}

export type GameLogicToPhysicsMessage =
	| {
		type: PhysOpType.SpawnDynamicBody;
		entityId: number;
		shape: PhysicsShapeDescriptor;
		transform: FlatTransform;
		mass: number;
		layer: number;
		mask: number;
	}
	| {
		type: PhysOpType.SpawnStaticBody;
		entityId: number;
		shape: PhysicsShapeDescriptor;
		transform: FlatTransform;
		layer: number;
		mask: number;
	}
	| { type: PhysOpType.RemoveBody; entityId: number; }
	| { type: PhysOpType.ApplyImpulse; entityId: number; impulse: [number, number, number]; offset: [number, number, number]; }
	| { type: PhysOpType.SetVelocity; entityId: number; velocity: [number, number, number]; };


export type PhysicsShapeDescriptor =
	| { kind: PhysShape.Box; size: [number, number, number]; }
	| { kind: PhysShape.Sphere; radius: number; }
	| { kind: PhysShape.Capsule; radius: number; cylinderLength: number; }
	| { kind: PhysShape.Cylinder; radius: number; height: number; };

export type PhysicsToGameLogicMessage =
	| { type: PhysToGameMsg.Ready; }
	| ({ type: PhysToGameMsg.Transforms; } & TransformBatchPayload)
	| { type: PhysToGameMsg.OverlapEvents; events: { ownerA: number; ownerB: number; entered: boolean; }[]; };
