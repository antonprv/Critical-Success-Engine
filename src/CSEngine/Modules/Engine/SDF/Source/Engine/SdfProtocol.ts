// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { SdfEditInit } from "../Edits/SdfEdit";
import type { SdfHit } from "../Field/SdfField";
import type { SdfChunk } from "../Mesh/MeshChunks";

/**
 * The messages of the SDF worker: GameLogic sends it the game's edits and
 * questions, and it sends chunks straight to the render and physics workers
 * (no bulk data through GameLogic). A scene's chunks carry its epoch: a
 * worker drops what belongs to an older scene.
 */

/** Edits an SDF scene starts from, baked when the scene loads. */
export interface SdfBakeSource {
	Edits: SdfEditInit[];
	/** Height of a ground plane under them; none: no ground. */
	Ground?: number | null;
	/** The box to bake: min x, y, z, max x, y, z. */
	Bounds: [ number, number, number, number, number, number ];
	/** Sample spacing, world units. */
	Spacing: number;
}

/** What a scene says about its SDF world. */
export interface SdfSceneDescriptor {
	/**
	 * The editor's build (an SdfBakedLayer saved file, by URL) or edits to
	 * bake as the scene loads.
	 */
	Base: { Url: string; } | { Bake: SdfBakeSource; };
	/** Edits the game keeps before the oldest fold in. Default 32. */
	MaxEdits?: number;
	/** Mesh tier: cell size (default 0.25), cells per chunk (16), radius. */
	CellSize?: number;
	ChunkCells?: number;
	Radius?: number;
	/** The chunks' collision layer and mask. Default 1 and all. */
	Layer?: number;
	Mask?: number;
}

export type SdfQuery =
	| {
		Kind: "raycast";
		Origin: [ number, number, number ];
		Dir: [ number, number, number ];
		TMax: number;
	}
	| { Kind: "distance"; Point: [ number, number, number ]; };

export interface SdfDistanceResult {
	Distance: number;
	MaterialId: number;
}

export type SdfQueryResult = SdfHit | SdfDistanceResult | null;

/** GameLogic -> SDF worker. */
export type ToSdfWorker =
	/** A new scene (null: none); the edits start empty. */
	| { Type: "load"; Epoch: number; Scene: SdfSceneDescriptor | null; }
	/** Once per game frame: the edits since the last one, and the focus. */
	| {
		Type: "tick";
		Delta: ArrayBuffer;
		Focus: [ number, number, number ];
	}
	| { Type: "query"; Id: number; Query: SdfQuery; };

/** SDF worker -> GameLogic. */
export type FromSdfWorker =
	| { Type: "loaded"; Epoch: number; Error: string | null; }
	| { Type: "result"; Id: number; Result: SdfQueryResult; };

/** SDF worker -> render worker. */
export type SdfToRender =
	/** A new scene: drop every chunk of the old one. */
	| { Type: "begin"; Epoch: number; }
	| {
		Type: "chunks";
		Epoch: number;
		Built: SdfChunk[];
		Removed: string[];
	};

/** A chunk as the physics needs it: its triangles. */
export interface SdfPhysicsChunk {
	Key: string;
	Positions: Float32Array;
	Indices: Uint16Array;
}

/** SDF worker -> physics worker. */
export type SdfToPhysics =
	/** A new scene: drop every chunk of the old one. */
	| { Type: "begin"; Epoch: number; Layer: number; Mask: number; }
	| {
		Type: "chunks";
		Epoch: number;
		Built: SdfPhysicsChunk[];
		Removed: string[];
	};

/** Physics worker -> SDF worker. */
export type PhysicsToSdf =
	/** Its world was recreated (a scene load): send every chunk again. */
	{ Type: "reset"; };
