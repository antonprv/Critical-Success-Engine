// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { RendMesh, RendOpType } from "../Common/CommonEnums";
import type { FlatTransform, TransformBatchPayload } from "./TransformProtocol";

export type MeshDescriptor =
	| { kind: RendMesh.Sphere; diameter: number; }
	| { kind: RendMesh.Box; size: [number, number, number]; } // full extents, same convention as PhysicsShapeDescriptor (see PhysicsGameLogicProtocol)
	| { kind: RendMesh.Gltf; rootUrl: string; sceneFilename: string; };

export type GameLogicToRenderMessage =
	| { type: RendOpType.SpawnEntity; entityId: number; mesh: MeshDescriptor; transform: FlatTransform; }
	| { type: RendOpType.RemoveEntity; entityId: number; }
	| ({ type: RendOpType.TransformBatch; } & TransformBatchPayload)
	| { type: RendOpType.PoseCamera; transform: FlatTransform; };

export type RenderToGameLogicMessage = { type: "ready"; } | { type: "asset-loaded"; entityId: number; };
