// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { RendMesh, RendOpType } from "../Common/CommonEnums";
import type { FlatTransform, TransformBatchPayload } from "./TransformProtocol";

type Tuple3 = [number, number, number];

export type MeshDescriptor =
	| { shape: RendMesh.Sphere; diameter: number; }
	| { shape: RendMesh.Box; size: Tuple3; } // full extents, same convention as PhysicsShapeDescriptor
	| { shape: RendMesh.Capsule; radius: number; height: number; } // total height incl. caps, like Godot's CapsuleMesh
	| { shape: RendMesh.Cylinder; diameter: number; height: number; }
	| { shape: RendMesh.Triangles; vertices: number[]; }
	| { shape: RendMesh.Gltf; rootUrl: string; sceneFilename: string; };

export interface CameraPose {
	transform: FlatTransform;
	/** Vertical field of view in radians. */
	fov: number;
}

export type GameLogicToRenderMessage =
	| { operation: RendOpType.SpawnEntity; entityId: number; mesh: MeshDescriptor; transform: FlatTransform; color?: Tuple3; }
	| { operation: RendOpType.RemoveEntity; entityId: number; }
	| ({ operation: RendOpType.Frame; frameId: number; camera: CameraPose | null; } & TransformBatchPayload)
	| { operation: RendOpType.ClearScene; }
	| { operation: RendOpType.SetVisible; entityId: number; visible: boolean; }
	| { operation: RendOpType.SetColor; entityId: number; color: Tuple3; }
	| { operation: RendOpType.SetEnvironment; clearColor: Tuple3; }
	| { operation: RendOpType.Sync; token: number; };

export type RenderToGameLogicMessage =
	| { type: "ready"; }
	| { type: "asset-loaded"; entityId: number; }
	/** Posted once per rAF while fewer than two frames are outstanding - the frame clock for GameLogic's Update. */
	| { type: "frame-request"; frameId: number; time: number; }
	| { type: "sync-ack"; token: number; };
