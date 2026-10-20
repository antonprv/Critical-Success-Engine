// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { SdfEditInit } from "../Edits/SdfEdit";
import type { SdfBaseDescriptor } from "../Field/BaseDescriptor";
import type { StandingOptions, StandingPlace } from "../Field/Standing";
import type { SdfHit } from "../Field/SdfField";
import type { SdfChunk } from "../Mesh/MeshChunks";
import type { SdfVolumeData } from "../Render/SdfVolumeTexture";
import type { SdfGrassOptions } from "../Splats/GrassField";

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
	 * The editor's build (an SdfBakedLayer saved file, by URL), edits to
	 * bake as the scene loads, or an analytic base without bounds (a
	 * fractal): old edits fold into a sparse layer over it, cells of
	 * `Spacing` (default 0.1).
	 */
	Base:
		| { Url: string; }
		| { Bake: SdfBakeSource; }
		| { Analytic: SdfBaseDescriptor; Spacing?: number; };
	/**
	 * The box the renderer's volume covers with an analytic base (it has
	 * no box of its own): min x, y, z, max x, y, z. Default 64 m around
	 * Start.
	 */
	VolumeBounds?: [ number, number, number, number, number, number ];
	/** Edits the game keeps before the oldest fold in. Default 32. */
	MaxEdits?: number;
	/**
	 * The world is meshed around a point this far ahead of the camera
	 * (default 0: the camera itself) - for a camera high above the ground.
	 */
	FocusAhead?: number;
	/**
	 * Where the world is meshed first, while the scene loads (default the
	 * origin): the scene's entities spawn once the chunks there are built,
	 * so nothing falls through ground that isn't in the physics yet.
	 */
	Start?: [ number, number, number ];
	/**
	 * Start on the surface (a fractal: nobody knows where its floor is): a
	 * place to stand near Start is found as the scene loads, meshed first,
	 * and told to the game (SdfClient.Start).
	 */
	StartOnSurface?: StandingOptions | true;
	/** Mesh tier: cell size (default 0.25), cells per chunk (16), radius. */
	CellSize?: number;
	ChunkCells?: number;
	Radius?: number;
	/**
	 * Levels of detail (MeshChunksOptions.Levels): past Radius chunks the
	 * cells double, up to this many levels. Default 1.
	 */
	Levels?: number;
	/**
	 * The physics takes the chunks of the levels below this (default 2):
	 * near enough to stand on; the far ones only cost it shapes.
	 */
	PhysicsLevels?: number;
	/** The chunks' collision layer and mask. Default 1 and all. */
	Layer?: number;
	Mask?: number;
	/**
	 * The sun's shadow map: the scene's meshes and the SDF world shadow each
	 * other. Default true.
	 */
	Shadows?: boolean;
	/**
	 * Texels along the longest side of the volume the renderer samples the
	 * base into (the dynamic edits' proxies and the meshes' occlusion read
	 * it); 0: none. Default 128.
	 */
	VolumeTexels?: number;
	/** Splat grass over the world's surface (needs the volume). */
	Grass?: SdfGrassOptions;
}

/** How the renderer shows a scene's SDF world (null: there is none). */
export interface SdfRenderSettings {
	Shadows: boolean;
	Grass?: SdfGrassOptions;
}

export type SdfQuery =
	| {
		Kind: "raycast";
		Origin: [ number, number, number ];
		Dir: [ number, number, number ];
		TMax: number;
	}
	| { Kind: "distance"; Point: [ number, number, number ]; }
	| {
		Kind: "standing";
		Near: [ number, number, number ];
		Options: StandingOptions;
	};

export interface SdfDistanceResult {
	Distance: number;
	MaterialId: number;
}

export type SdfQueryResult =
	| SdfHit
	| SdfDistanceResult
	| StandingPlace
	| null;

/** GameLogic -> SDF worker. */
export type ToSdfWorker =
	/** A new scene (null: none); the edits start empty. */
	| { Type: "load"; Epoch: number; Scene: SdfSceneDescriptor | null; }
	/** Once per game frame: the edits since the last one, and the focus. */
	| {
		Type: "tick";
		Delta: ArrayBuffer;
		Focus: [ number, number, number ];
		/**
		 * The dynamic edits the physics feels (SdfDynamicEdits.PackedPhysics)
		 * when they changed since the last tick; else null.
		 */
		Dynamic: Float32Array | null;
	}
	| { Type: "query"; Id: number; Query: SdfQuery; };

/** SDF worker -> GameLogic. */
export type FromSdfWorker =
	| {
		Type: "loaded";
		Epoch: number;
		Error: string | null;
		/** Where the scene starts after all (StartOnSurface's find). */
		Start?: [ number, number, number ] | null;
	}
	/** The first time every chunk around the focus has been meshed. */
	| { Type: "meshed"; Epoch: number; }
	| { Type: "result"; Id: number; Result: SdfQueryResult; };

/** SDF worker -> render worker. */
export type SdfToRender =
	/** A new scene: drop every chunk of the old one. */
	| { Type: "begin"; Epoch: number; Settings: SdfRenderSettings | null; }
	| {
		Type: "chunks";
		Epoch: number;
		Built: SdfChunk[];
		Removed: string[];
	}
	/** The world sampled into a volume (again after edits changed it). */
	| { Type: "volume"; Epoch: number; Volume: SdfVolumeData; };

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
	| { Type: "reset"; }
	/**
	 * A "chunks" message is in its world (what paces the chunks of moving
	 * edits).
	 */
	| { Type: "taken"; Epoch: number; };
