// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { PhysOpType, PhysShape, RendMesh, RendOpType } from "../Common/CommonEnums";
import type { GameLogicToPhysicsMessage } from "../Protocol/PhysicsGameLogicProtocol";
import type { GameLogicToRenderMessage } from "../Protocol/RenderGameLogicProtocol";
import type { FlatTransform } from "../Protocol/TransformProtocol";

/**
 * Demo content: one falling sphere over a static ground slab. Visuals and physics bodies are spawned
 * independently - visuals as soon as RenderWorker is ready, bodies as soon as PhysicsWorker is - so a
 * slow or failed physics-wasm load never leaves the screen empty.
 */
export class DemoScene {
	private static readonly GroundSize: [number, number, number] = [10, 1, 10];
	private static readonly GroundTransform: FlatTransform = [0, -0.5, 0, 0, 0, 0, 1];
	private static readonly BallTransform: FlatTransform = [0, 5, 0, 0, 0, 0, 1];

	public readonly GroundEntityId: number;
	public readonly BallEntityId: number;

	private _visualsSpawned = false;
	private _bodiesSpawned = false;

	public constructor(groundEntityId: number, ballEntityId: number) {
		this.GroundEntityId = groundEntityId;
		this.BallEntityId = ballEntityId;
	}

	public SpawnVisuals(renderPort: MessagePort): void {
		if (this._visualsSpawned) return;
		this._visualsSpawned = true;

		const ground: GameLogicToRenderMessage = {
			type: RendOpType.SpawnEntity,
			entityId: this.GroundEntityId,
			mesh: { kind: RendMesh.Box, size: DemoScene.GroundSize },
			transform: DemoScene.GroundTransform,
		};
		renderPort.postMessage(ground);

		const ball: GameLogicToRenderMessage = {
			type: RendOpType.SpawnEntity,
			entityId: this.BallEntityId,
			mesh: { kind: RendMesh.Sphere, diameter: 1 },
			transform: DemoScene.BallTransform,
		};
		renderPort.postMessage(ball);
	}

	public SpawnBodies(physicsPort: MessagePort): void {
		if (this._bodiesSpawned) return;
		this._bodiesSpawned = true;

		const ground: GameLogicToPhysicsMessage = {
			type: PhysOpType.SpawnStaticBody,
			entityId: this.GroundEntityId,
			shape: { kind: PhysShape.Box, size: DemoScene.GroundSize },
			transform: DemoScene.GroundTransform,
			layer: 1,
			mask: -1, // all bits (int32)
		};
		physicsPort.postMessage(ground);

		const ball: GameLogicToPhysicsMessage = {
			type: PhysOpType.SpawnDynamicBody,
			entityId: this.BallEntityId,
			shape: { kind: PhysShape.Sphere, radius: 0.5 },
			transform: DemoScene.BallTransform,
			mass: 1,
			layer: 1,
			mask: -1,
		};
		physicsPort.postMessage(ball);
	}

	public ApplyJumpImpulse(physicsPort: MessagePort): void {
		const impulse: GameLogicToPhysicsMessage = {
			type: PhysOpType.ApplyImpulse,
			entityId: this.BallEntityId,
			impulse: [0, 6, 0],
			offset: [0, 0, 0],
		};
		physicsPort.postMessage(impulse);
	}
}
