// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * Every message that crosses a worker boundary in the engine, grouped by which
 * channel carries it. There is no single "bus" - the orchestrator (main
 * thread) creates one dedicated MessageChannel per pair of workers that
 * actually need to talk, and hands each side its MessagePort at startup. That
 * keeps e.g. physics -> game-logic transform traffic off the main thread
 * entirely, and keeps this file as the one place that defines what can be
 * said on each channel.
 *
 * Wire format: plain postMessage/structured-clone, no SharedArrayBuffer/Atomics.
 * That means every payload below is copied on send, which is the deliberate
 * trade-off (see docs/THREADING_ARCHITECTURE.md) for not requiring COOP/COEP
 * response headers just to run the game.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

/** Flat [posX, posY, posZ, quatX, quatY, quatZ, quatW]. */
export type FlatTransform = [number, number, number, number, number, number, number];

export interface EntityTransform {
	entityId: number;
	transform: FlatTransform;
}

// ---------------------------------------------------------------------------
// Main (orchestrator) -> Render worker
// ---------------------------------------------------------------------------

export type MainToRenderMessage =
	| {
			type: "init";
			canvas: OffscreenCanvas;
			gameLogicPort: MessagePort;
			devMode: boolean;
	  }
	| { type: "resize"; width: number; height: number; devicePixelRatio: number }
	| { type: "set-inspector-visible"; visible: boolean };

// ---------------------------------------------------------------------------
// Main -> Physics worker
// ---------------------------------------------------------------------------

export type MainToPhysicsMessage =
	| {
			type: "init";
			gameLogicPort: MessagePort;
			gravity: [number, number, number];
			fixedTimestepMs: number;
	  }
	| { type: "set-running"; running: boolean };

// ---------------------------------------------------------------------------
// Main -> Game-logic worker
// ---------------------------------------------------------------------------

export type InputEvent =
	| { kind: "keydown"; code: string }
	| { kind: "keyup"; code: string }
	| { kind: "pointermove"; dx: number; dy: number }
	| { kind: "pointerdown"; button: number }
	| { kind: "pointerup"; button: number };

export type MainToGameLogicMessage =
	| {
			type: "init";
			renderPort: MessagePort;
			physicsPort: MessagePort;
			audioPort: MessagePort;
	  }
	| { type: "input"; event: InputEvent };

// ---------------------------------------------------------------------------
// Main -> Audio worker
// ---------------------------------------------------------------------------

export type MainToAudioMessage =
	| { type: "init"; gameLogicPort: MessagePort }
	| { type: "unlock" }; // relays the AudioContext user-gesture unlock

// ---------------------------------------------------------------------------
// Game-logic <-> Physics (direct port, set up by the orchestrator)
// ---------------------------------------------------------------------------

export type GameLogicToPhysicsMessage =
	| {
			type: "spawn-dynamic-body";
			entityId: number;
			shape: PhysicsShapeDescriptor;
			transform: FlatTransform;
			mass: number;
			layer: number;
			mask: number;
	  }
	| {
			type: "spawn-static-body";
			entityId: number;
			shape: PhysicsShapeDescriptor;
			transform: FlatTransform;
			layer: number;
			mask: number;
	  }
	| { type: "remove-body"; entityId: number }
	| { type: "apply-impulse"; entityId: number; impulse: [number, number, number]; offset: [number, number, number] }
	| { type: "set-velocity"; entityId: number; velocity: [number, number, number] };

export type PhysicsShapeDescriptor =
	| { kind: "box"; size: [number, number, number] }
	| { kind: "sphere"; radius: number }
	| { kind: "capsule"; radius: number; cylinderLength: number }
	| { kind: "cylinder"; radius: number; height: number };

export type PhysicsToGameLogicMessage =
	| { type: "ready" }
	| { type: "transforms"; step: number; entities: EntityTransform[] }
	| { type: "overlap-events"; events: { ownerA: number; ownerB: number; entered: boolean }[] };

// ---------------------------------------------------------------------------
// Game-logic <-> Render (direct port)
// ---------------------------------------------------------------------------

export type MeshDescriptor =
	| { kind: "sphere"; diameter: number }
	| { kind: "box"; size: number }
	| { kind: "gltf"; rootUrl: string; sceneFilename: string };

export type GameLogicToRenderMessage =
	| { type: "spawn-entity"; entityId: number; mesh: MeshDescriptor; transform: FlatTransform }
	| { type: "remove-entity"; entityId: number }
	| { type: "transform-batch"; entities: EntityTransform[] }
	| { type: "camera-pose"; transform: FlatTransform };

export type RenderToGameLogicMessage = { type: "ready" } | { type: "asset-loaded"; entityId: number };

// ---------------------------------------------------------------------------
// Game-logic <-> Audio (direct port)
// ---------------------------------------------------------------------------

export type GameLogicToAudioMessage = { type: "play-sound"; soundId: string; position?: [number, number, number] };
