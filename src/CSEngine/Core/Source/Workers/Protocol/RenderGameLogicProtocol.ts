// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { RendMesh, RendOpType } from "../Common/CommonEnums";
import type { FlatTransform, TransformBatchPayload } from "./TransformProtocol";

export type MeshDescriptor =
	| { shape: RendMesh.Sphere; diameter: number; }
	| { shape: RendMesh.Box; size: [number, number, number]; } // full extents, same convention as PhysicsShapeDescriptor (see PhysicsGameLogicProtocol)
	| { shape: RendMesh.Gltf; rootUrl: string; sceneFilename: string; };

export type GameLogicToRenderMessage =
	| { operation: RendOpType.SpawnEntity; entityId: number; mesh: MeshDescriptor; transform: FlatTransform; }
	| { operation: RendOpType.RemoveEntity; entityId: number; }
	| ({ operation: RendOpType.TransformBatch; } & TransformBatchPayload)
	| { operation: RendOpType.PoseCamera; transform: FlatTransform; };

export type RenderToGameLogicMessage = { type: "ready"; } | { type: "asset-loaded"; entityId: number; };
