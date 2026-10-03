// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../../Logging/Logger";
import { PhysObjectKind } from "../../Workers/Common/CommonEnums";
import { PhysicsFixedTimestepMs } from "../../Workers/Common/EngineConstants";
import type { InputEvent, MainToGameLogicMessage } from "../../Workers/Protocol/GameLogicProtocol";
import type { PhysicsToGameLogicMessage } from "../../Workers/Protocol/PhysicsGameLogicProtocol";
import type { RenderToGameLogicMessage } from "../../Workers/Protocol/RenderGameLogicProtocol";
import { TRANSFORM_STRIDE } from "../../Workers/Protocol/TransformProtocol";
import type { UiToGameLogicMessage } from "../../Workers/Protocol/UiProtocol";
import type { EngineContext, TimeInfo } from "../Core/EngineContext";
import { WithTimeout } from "../Core/SyncTracker";
import { EntityWorld } from "../Core/EntityWorld";
import { SceneManager } from "../Scenes/SceneManager";
import type { SceneRegistry } from "../Scenes/SceneRegistry";
import { AudioService } from "../Services/AudioService";
import { InputService } from "../Services/InputService";
import { PhysicsService, type OverlapEventData } from "../Services/PhysicsService";
import { RenderService } from "../Services/RenderService";
import { UiService } from "../Services/UiService";

export interface GameLogicPorts {
	render: MessagePort;
	physics: MessagePort;
	audio: MessagePort;
	ui: MessagePort;
}

/**
 * The simulation-side owner of "what entities exist and what they are". Nothing in here touches a DOM API or a
 * Babylon/wasm handle: it only ever sends descriptors across four ports and reacts to what comes back. Two clocks drive
 * the scripts:
 *
 *  - the RENDER clock: the render worker asks for a frame (`frame-request`) once per display refresh; each request runs
 *    OnInputUpdate -> Update -> OnUIUpdate for all entities and answers with the interpolated poses + camera.
 *  - the PHYSICS clock: PhysicsWorker steps at a fixed rate and posts a snapshot; each snapshot runs OnPhysicsSync (copy
 *    simulation state into transforms), overlap callbacks, then OnPhysicsUpdate for all entities.
 *
 * Both clocks arrive as messages on the same thread, so scripts never run concurrently - no locking, no races.
 */
export class GameLogicRuntime {
	public readonly Context: EngineContext;

	private readonly _ports: GameLogicPorts;
	private readonly _time: TimeInfo;
	private readonly _world: EntityWorld;
	private readonly _physics: PhysicsService;
	private readonly _render: RenderService;
	private readonly _input: InputService;
	private readonly _ui: UiService;
	private readonly _scenes: SceneManager;
	private readonly _registry: SceneRegistry;

	private _renderReady = false;
	private _renderReadyResolve: (() => void) | null = null;
	private _physicsReadyResolve: (() => void) | null = null;
	private _lastFrameMs: number | null = null;
	private _bootStarted = false;

	public constructor(ports: GameLogicPorts, registry: SceneRegistry) {
		this._ports = ports;
		this._registry = registry;

		this._time = { Delta: 0, FixedDelta: PhysicsFixedTimestepMs / 1000, Elapsed: 0, FrameCount: 0, PhysicsStepCount: 0, RenderAlpha: 0 };
		this._physics = new PhysicsService(ports.physics);
		this._render = new RenderService(ports.render);
		this._input = new InputService();
		this._ui = new UiService(ports.ui);
		this._scenes = new SceneManager(registry);

		// EngineContext <-> EntityWorld reference each other; build the context first with a late-bound world.
		const context = {
			Physics: this._physics,
			Render: this._render,
			Input: this._input,
			Ui: this._ui,
			Audio: new AudioService(ports.audio),
			Scenes: this._scenes,
			Time: this._time,
		} as Omit<EngineContext, "World"> & { World?: EntityWorld; };

		this._world = new EntityWorld(context as EngineContext);
		context.World = this._world;
		this.Context = context as EngineContext;
		this._scenes.Attach(this.Context);

		this._physics.FixedDelta = this._time.FixedDelta;
		this._physics.OnStep = (step, overlaps) => this.OnPhysicsStep(step, overlaps);
		this._physics.OnReady = () => this._physicsReadyResolve?.();

		this.WirePorts();
	}

	/** Physics step length in seconds (what the PhysicsWorker was told to use). */
	public SetFixedDelta(seconds: number): void {
		this._time.FixedDelta = seconds;
		this._physics.FixedDelta = seconds;
	}

	//#region Wiring

	private WirePorts(): void {
		this._ports.render.onmessage = (e: MessageEvent<RenderToGameLogicMessage>) => this.OnRenderMessage(e.data);
		this._ports.physics.onmessage = (e: MessageEvent<PhysicsToGameLogicMessage>) => this._physics.HandleMessage(e.data);
		this._ports.ui.onmessage = (e: MessageEvent<UiToGameLogicMessage>) => this.OnUiMessage(e.data);
	}

	/** Entry for messages from the main thread (input events). */
	public HandleMainMessage(message: MainToGameLogicMessage): void {
		if (message.type === "input") this.HandleInput(message.event);
	}

	public HandleInput(event: InputEvent): void {
		this._input.Handle(event);
	}

	private OnRenderMessage(message: RenderToGameLogicMessage): void {
		switch (message.type) {
			case "ready":
				this._renderReady = true;
				this._renderReadyResolve?.();
				break;
			case "frame-request":
				this.OnFrameRequest(message.frameId);
				break;
			case "sync-ack":
				this._render.AcknowledgeSync(message.token);
				break;
			case "asset-loaded":
				break;
		}
	}

	private OnUiMessage(message: UiToGameLogicMessage): void {
		switch (message.type) {
			case "load-scene":
				void this._scenes.Load(message.sceneId);
				break;
			case "set-capture":
				this._input.CapturePlayerInput = message.enabled;
				break;
		}
	}

	//#endregion

	//#region Boot

	/** Publishes the scene list, waits for the renderer and physics, then loads the first scene. */
	public async Boot(): Promise<void> {
		if (this._bootStarted) return;
		this._bootStarted = true;

		const first = this._registry.First;
		this._ui.PublishScenes(this._registry.All.map((s) => ({ id: s.id, name: s.name, description: s.description })));
		if (!first) {
			this._ui.LoadFailed("", "No scenes are registered.");
			return;
		}

		this._ui.LoadProgress(first.id, "Starting renderer…", 0.1);
		if (!this._renderReady) await new Promise<void>((resolve) => (this._renderReadyResolve = resolve));

		this._ui.LoadProgress(first.id, "Starting physics (loading .NET runtime)…", 0.25);
		if (!this._physics.Ready && !this._physics.Failed) {
			const ready = new Promise<void>((resolve) => (this._physicsReadyResolve = resolve));
			if (!(await WithTimeout(ready, 30_000))) {
				// Non-fatal on purpose: the scene still loads (without a simulation) so rendering/UI can be iterated on.
				Logger.LogError("[GameLogicRuntime] physics did not come up within 30 s - continuing without it.");
			}
		}

		await this._scenes.Load(first.id);

		if (this._physics.Failed) {
			this._ui.Toast("Physics failed to load - the scene runs without a simulation (see the log).");
		}
	}

	//#endregion

	//#region Physics clock

	private OnPhysicsStep(_step: number, overlaps: OverlapEventData[]): void {
		if (this._scenes.IsLoading) return;

		this._time.PhysicsStepCount++;
		const dt = this._time.FixedDelta;

		this._world.FlushLifecycle();
		this._world.RunPhysicsSync();

		for (const event of overlaps) this.DispatchOverlap(event);

		this._world.FlushLifecycle();
		this._world.RunPhysicsUpdate(dt);
		this._input.EndPhysicsStep();

		this._world.FlushDestroyed();
		this._physics.Flush();
	}

	private DispatchOverlap(event: OverlapEventData): void {
		const a = this._world.Get(event.entityA);
		const b = this._world.Get(event.entityB);
		if (!a || !b || a === b) return;

		const isTrigger = this._physics.GetKind(a.Id) === PhysObjectKind.Trigger || this._physics.GetKind(b.Id) === PhysObjectKind.Trigger;
		this._world.DispatchOverlap(a, b, event.entered, isTrigger);
	}

	//#endregion

	//#region Render clock

	private OnFrameRequest(frameId: number): void {
		try {
			this.RunFrame(frameId);
		} catch (error) {
			// Every request MUST be answered: the render worker stops asking once two are outstanding, so a single
			// exception here would otherwise freeze the picture for good. Scripts are already guarded individually
			// (EntityWorld.Run); this catches engine-level failures (e.g. a camera that throws in GetPose).
			Logger.LogException(error, "[GameLogicRuntime] frame failed:");
			this._render.PostFrame(frameId, 0, new ArrayBuffer(0), null);
		}
	}

	private RunFrame(frameId: number): void {
		const now = performance.now();
		const stepMs = this._time.FixedDelta * 1000;

		if (this._scenes.IsLoading) {
			// The world is being rebuilt: keep the render worker's request accounting balanced with an empty frame.
			this._render.PostFrame(frameId, 0, new ArrayBuffer(0), null);
			this._lastFrameMs = now;
			return;
		}

		const dt = this._lastFrameMs === null ? 0 : Math.min(0.1, (now - this._lastFrameMs) / 1000);
		this._lastFrameMs = now;

		this._time.Delta = dt;
		this._time.Elapsed += dt;
		this._time.FrameCount++;
		this._time.RenderAlpha = Math.min(1, Math.max(0, (now - this._physics.LastStepTimeMs) / stepMs));

		this._world.FlushLifecycle();
		this._world.RunInputUpdate(this._input, dt);
		this._world.RunUpdate(dt);
		this._world.RunUiUpdate(this._ui, dt);
		this._world.FlushDestroyed();

		this._ui.Flush(now);
		this._physics.Flush();

		this.PostFrame(frameId);
		this._input.EndFrame();
	}

	private PostFrame(frameId: number): void {
		const renderables = this._world.Renderables;
		const buffer = new Float64Array(renderables.size * TRANSFORM_STRIDE);
		const alpha = this._time.RenderAlpha;

		let count = 0;
		const pose = new Float64Array(7);
		for (const [id, entity] of renderables) {
			entity.Transform.WriteInterpolated(alpha, pose, 0);

			const base = count * TRANSFORM_STRIDE;
			buffer[base] = id;
			buffer.set(pose, base + 1);
			count++;
		}

		const camera = this._render.MainCamera?.GetPose(alpha) ?? null;
		this._render.PostFrame(frameId, count, buffer.buffer, camera);
	}

	//#endregion
}
