// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DataStream } from "@cse/datastream";
import { PlayerLoop, TaskCompletionSource } from "@cse/task";
import type { Contract, Installer } from "@cse/di";
import { EngineContainers } from "../DI/EngineContainers";
import { PerfSamples } from "../Diagnostics/PerfProbe";
import { FMath } from "@cse/fastmath";
import {
	Hook, ImplementsContract, LogLevel, ScriptRuntime, type InputSnapshot,
	type PhaseInfo, type ScriptBackend, type ScriptHostWorld,
} from "@cse/scripting";
import { InputBindings } from "../Input/InputBindings";
import { DataAssets } from "../Data/DataAsset";
import { MemoryBackend, SettingsStorage } from "../Storage/SettingsStorage";
import { SettingsService } from "../Services/SettingsService";
import type { ProjectInput } from "../Input/InputActions";
import { ChannelHub } from "../Core/Channels";
import { Logger } from "../../Logging/Logger";
import {
	GameLogicMsg,
	PhysObjectKind,
	RenderMsg,
	UiMsg,
} from "../../Workers/Common/CommonEnums";
import { PhysicsFixedTimestepMs } from "../../Workers/Common/EngineConstants";
import type {
	InputEvent,
	MainToGameLogicMessage,
} from "../../Workers/Protocol/GameLogicProtocol";
import type {
	PhysicsToGameLogicMessage,
} from "../../Workers/Protocol/PhysicsGameLogicProtocol";
import type {
	RenderToGameLogicMessage,
} from "../../Workers/Protocol/RenderGameLogicProtocol";
import { TRANSFORM_STRIDE } from "../../Workers/Protocol/TransformProtocol";
import type { UiToGameLogicMessage } from "../../Workers/Protocol/UiProtocol";
import type { EngineContext, TimeInfo } from "../Core/EngineContext";
import { WithTimeout } from "../Core/SyncTracker";
import { EntityWorld } from "../Core/EntityWorld";
import { SceneManager } from "../Scenes/SceneManager";
import type { SceneRegistry } from "../Scenes/SceneRegistry";
import { AudioService } from "../Services/AudioService";
import { InputService } from "../Services/InputService";
import {
	PhysicsService,
	type OverlapEventData,
} from "../Services/PhysicsService";
import { SdfService } from "../Services/SdfService";
import { EmptyFrame, RenderService } from "../Services/RenderService";
import { UiService } from "../Services/UiService";

/** Boots the .NET runtime of the project's C# scripts (when it has some). */
export type ScriptsLoader = () => Promise<ScriptBackend>;

export interface GameLogicPorts {
	render: MessagePort;
	physics: MessagePort;
	audio: MessagePort;
	ui: MessagePort;
	/** The SDF worker; none: scenes have no SDF world. */
	sdf?: MessagePort;
}

/** How far behind the newest physics step frames are drawn (steps). */
const RenderLagSteps = 1.5;

/**
 * Owns the entities and runs their hooks on two clocks: frame requests from the
 * render worker (input, update, UI, answered with interpolated poses) and
 * physics snapshots (sync, overlap callbacks, physics update). Both arrive as
 * messages on one thread, so scripts never run concurrently.
 */
export class GameLogicRuntime {
	public readonly Context: EngineContext;

	private readonly _ports: GameLogicPorts;

	private readonly _time: TimeInfo;

	private readonly _world: EntityWorld;

	private readonly _physics: PhysicsService;

	private readonly _sdf: SdfService;

	private readonly _render: RenderService;

	private readonly _input: InputService;

	/**
	 * The player's input: the project's input manifests, the one in use and its
	 * action map (level 1 and 2).
	 */
	public get Input(): InputService {
		return this._input;
	}

	private readonly _ui: UiService;

	private readonly _scenes: SceneManager;

	private readonly _registry: SceneRegistry;

	private readonly _channels: ChannelHub;

	private _renderReady = false;

	private _renderReadyResolve: ( () => void ) | null = null;

	private _physicsReadyResolve: ( () => void ) | null = null;

	private _lastFrameMs: number | null = null;

	private _bootStarted = false;

	private readonly _loadScripts: ScriptsLoader | null;

	// The DI containers (the context's Container is the current one).
	private _containers!: EngineContainers;

	// The context's Scripts: set once the C# runtime is up.
	private _scripts: ScriptRuntime | null = null;

	/**
	 * The scene to start in (the page's `?scene=` - tests and the perf harness
	 * open a scene directly); null or unknown: the first.
	 */
	public StartScene: string | null = null;

	/**
	 * For the perf harness: "logic" (ms of a frame's work here), "step" (of a
	 * physics step's), "csharp" (of each call into the C# scripts).
	 */
	public readonly Perf = new PerfSamples();

	public constructor(
		ports: GameLogicPorts,
		registry: SceneRegistry,
		channels: ChannelHub = new ChannelHub(),
		input: ProjectInput = { Manifests: {}, Default: "" },
		storage: SettingsStorage = new SettingsStorage( new MemoryBackend() ),
		data: DataAssets = DataAssets.Loaded( {} ),
		scripts: ScriptsLoader | null = null,
		installers: readonly Installer<EngineContext>[] = [],
	) {
		this._ports = ports;
		this._loadScripts = scripts;
		this._registry = registry;
		this._channels = channels;

		this._time = {
			Delta: 0,
			FixedDelta: PhysicsFixedTimestepMs / 1000,
			Elapsed: 0,
			FrameCount: 0,
			PhysicsStepCount: 0,
			RenderStep: 0,
		};
		this._physics = new PhysicsService( ports.physics );
		this._sdf = new SdfService( ports.sdf ?? null );
		this._render = new RenderService( ports.render );
		this._input = new InputService();
		// the project's actions and bindings (the engine has none of its own)
		this._input.System.Install( input );
		// and the player's rebinding, kept between sessions
		this._input.System.Load( storage.Get( "Input", {} ) as never );
		// the controls screen rebinds them over the "input" channel
		new InputBindings( this._input, storage, this._channels );
		this._ui = new UiService( ports.ui );
		this._scenes = new SceneManager( registry );

		// EngineContext <-> EntityWorld reference each other; build the context
		// first with a late-bound world.
		const context = {
			Physics: this._physics,
			Sdf: this._sdf,
			Render: this._render,
			Input: this._input,
			Ui: this._ui,
			Settings: new SettingsService( this._channels, storage ),
			Storage: storage,
			Data: data,
			Audio: new AudioService( ports.audio ),
			Scenes: this._scenes,
			Time: this._time,
			Stream: new DataStream( {
				OnError: ( error ) => Logger.LogException(
					error,
					"[DataStream] a subscriber failed:",
				),
			} ),
		} as Omit<EngineContext, "World" | "Scripts" | "Container"> & {
			World?: EntityWorld;
		};
		Object.defineProperty( context, "Scripts", {
			enumerable: true,
			get: () => this._scripts,
		} );
		// The DI containers: the root once the context is whole (below), a
		// scene's child as each scene loads.
		Object.defineProperty( context, "Container", {
			enumerable: true,
			get: () => this._containers.Current,
		} );

		this._world = new EntityWorld( context as EngineContext );
		context.World = this._world;
		this.Context = context as EngineContext;
		this._scenes.Attach( this.Context );
		this._containers = new EngineContainers( this.Context, installers );
		this._scenes.OnBeginScene = ( manifest ) => this._containers.BeginScene(
			manifest.installer,
		);

		this._physics.FixedDelta = this._time.FixedDelta;
		this._physics.OnStep = ( step, overlaps ) => this.OnPhysicsStep(
			step,
			overlaps,
		);
		this._physics.OnReady = () => this._physicsReadyResolve?.();

		this.WirePorts();
	}

	/**
	 * Physics step length in seconds (what the PhysicsWorker was told to use).
	 */
	public SetFixedDelta( seconds: number ): void {
		this._time.FixedDelta = seconds;
		this._physics.FixedDelta = seconds;
	}

	//#region Wiring

	private WirePorts(): void {
		this._ports.render.onmessage = (
			e: MessageEvent<RenderToGameLogicMessage>,
		) => this.OnRenderMessage( e.data );
		this._ports.physics.onmessage = (
			e: MessageEvent<PhysicsToGameLogicMessage>,
		) => this._physics.HandleMessage( e.data );
		this._ports.ui.onmessage = (
			e: MessageEvent<UiToGameLogicMessage>,
		) => this.OnUiMessage( e.data );
		this._channels.ConnectBatched(
			( batch ) => this._ports.ui.postMessage(
				{ type: UiMsg.Channel, batch },
				[batch.buffer],
			),
		);
	}

	/** Entry for messages from the main thread (input events). */
	public HandleMainMessage( message: MainToGameLogicMessage ): void {
		if ( message.type === GameLogicMsg.Input ) {
			this.HandleInput( message.event );
		}
	}

	public HandleInput( event: InputEvent ): void {
		this._input.Handle( event );
	}

	private OnRenderMessage( message: RenderToGameLogicMessage ): void {
		switch ( message.type ) {
			case RenderMsg.Ready:
				this._renderReady = true;
				this._renderReadyResolve?.();
				break;
			case RenderMsg.FrameRequest:
				this.OnFrameRequest( message.frameId );
				break;
			case RenderMsg.SyncAck:
				this._render.AcknowledgeSync( message.token );
				break;
			case RenderMsg.AssetLoaded:
				break;
		}
	}

	private OnUiMessage( message: UiToGameLogicMessage ): void {
		switch ( message.type ) {
			case UiMsg.Channel:
				this._channels.Receive( message.batch );
				break;
			case UiMsg.LoadScene:
				void this._scenes.Load( message.sceneId );
				break;
			case UiMsg.SetCapture:
				this._input.CapturePlayerInput = message.enabled;
				break;
		}
	}

	//#endregion

	//#region Boot

	/**
	 * Publishes the scene list, waits for the renderer and physics, then loads
	 * the first scene.
	 */
	public async Boot(): Promise<void> {
		if ( this._bootStarted ) {
			return;
		}
		this._bootStarted = true;

		const first = ( this.StartScene
			? this._registry.Get( this.StartScene )
			: undefined ) ?? this._registry.First;
		this._ui.PublishScenes(
			this._registry.All.map(
				( s ) => ( {
					id: s.id,
					name: s.name,
					description: s.description,
				} ),
			),
		);
		if ( !first ) {
			this._ui.LoadFailed( "", "No scenes are registered." );
			return;
		}

		this._ui.LoadProgress( first.id, "Starting renderer…", 0.1 );
		if ( !this._renderReady ) {
			const ready = new TaskCompletionSource();
			this._renderReadyResolve = () => ready.TrySetResult();
			await ready.Task;
		}

		this._ui.LoadProgress(
			first.id,
			"Starting physics (loading .NET runtime)…",
			0.25,
		);
		if ( !this._physics.Ready && !this._physics.Failed ) {
			const ready = new TaskCompletionSource();
			this._physicsReadyResolve = () => ready.TrySetResult();

			if ( !( await WithTimeout( ready.Task, 30_000 ) ) ) {
				// Non-fatal on purpose: the scene still loads (without a
				// simulation) so rendering/UI can be iterated on.
				Logger.LogError(
					"[GameLogicRuntime] physics did not come up within 30 s - "
						+ "continuing without it.",
				);
			}
		}

		if ( this._loadScripts ) {
			this._ui.LoadProgress(
				first.id,
				"Starting C# scripts (loading .NET runtime)…",
				0.4,
			);
			await this.StartScripts( this._loadScripts );
		}

		await this._scenes.Load( first.id );

		if ( this._physics.Failed ) {
			this._ui.Toast(
				"Physics failed to load - the scene runs without a simulation "
					+ "(see the log).",
			);
		}
	}

	/**
	 * Boots the project's C# scripts. Non-fatal: without them the C#
	 * components report themselves and the rest of the game runs.
	 */
	private async StartScripts( load: ScriptsLoader ): Promise<void> {
		try {
			this._scripts = new ScriptRuntime(
				await load(),
				this.Context.Stream,
				this.ScriptWorld(),
			);
			this._scripts.Bridge.Resolver = ( contract, entity ) => this
				.ImplementationFor( contract, entity );
			Logger.LogInfo(
				`[GameLogicRuntime] C# components: ${
					this._scripts.Names.filter( ( n ) => !n.includes( "." ) )
						.join( ", " ) || "none"
				}`,
			);
		} catch ( error ) {
			Logger.LogException(
				error,
				"[GameLogicRuntime] the C# scripts failed to load:",
			);
			this._ui.Toast(
				"C# scripts failed to load - their components don't run "
					+ "(see the log).",
			);
		}
	}

	/**
	 * What answers C#'s call of a contract: a component of the entity marked
	 * @Implements( contract ), else the current container's binding.
	 */
	private ImplementationFor(
		contract: Contract<unknown>,
		entity: number,
	): object | null {
		for ( const component of this._world.Get( entity )?.Components ?? [] ) {
			if ( ImplementsContract( component, contract ) ) {
				return component;
			}
		}
		return this._containers.Current.TryResolve( contract ) as object | null;
	}

	/** What the C# components reach of this world. */
	private ScriptWorld(): ScriptHostWorld {
		const world = this._world;
		const ui = this._ui;

		return {
			ReadTransform: ( id, out, offset ) => {
				const entity = world.Get( id );

				if ( !entity || entity.IsDestroyed ) {
					return false;
				}
				const { Position: p, Rotation: q } = entity.Transform;
				out[offset] = p.X;
				out[offset + 1] = p.Y;
				out[offset + 2] = p.Z;
				out[offset + 3] = q.X;
				out[offset + 4] = q.Y;
				out[offset + 5] = q.Z;
				out[offset + 6] = q.W;
				return true;
			},
			WriteTransform: ( id, pose, offset ) => {
				const transform = world.Get( id )?.Transform;

				if ( !transform ) {
					return;
				}
				transform.Position.X = pose[offset]!;
				transform.Position.Y = pose[offset + 1]!;
				transform.Position.Z = pose[offset + 2]!;
				transform.Rotation.X = pose[offset + 3]!;
				transform.Rotation.Y = pose[offset + 4]!;
				transform.Rotation.Z = pose[offset + 5]!;
				transform.Rotation.W = pose[offset + 6]!;
			},
			DestroyEntity: ( id ) => world.Get( id )?.Destroy(),
			Toast: ( text ) => ui.Toast( text ),
			SetHud: ( key, text ) => ui.SetHud( key, text ),
			Log: ( level, text ) => {
				const message = `[C#] ${ text }`;

				if ( level === LogLevel.Error ) {
					Logger.LogError( message );
				}
				else if ( level === LogLevel.Warning ) {
					Logger.LogWarning( message );
				}
				else {
					Logger.LogInfo( message );
				}
			},
			ComponentFailed: ( component, message ) => Logger.LogError(
				`[C#] ${ component }: ${ message }`,
			),
		};
	}

	/** Runs a hook on the C# components, after the TypeScript ones. */
	private RunScripts( hook: Hook, dt: number ): void {
		if ( !this._scripts ) {
			return;
		}
		const begin = this.Perf.Begin();
		// one object for every phase of every frame; the input is taken only
		// if there are C# components to give it to
		const phase = this._phase;

		phase.Elapsed = this._time.Elapsed;
		phase.FrameCount = this._time.FrameCount;
		phase.PhysicsStepCount = this._time.PhysicsStepCount;
		phase.Input = hook === Hook.InputUpdate ? this._takeInput : undefined;
		this._scripts.RunHook( hook, dt, phase );
		this.Perf.End( "csharp", begin );
	}

	/** RunScripts' phase, reused. */
	private readonly _phase: PhaseInfo = {
		Elapsed: 0, FrameCount: 0, PhysicsStepCount: 0,
	};

	private readonly _takeInput = (): InputSnapshot => this._input.Snapshot();

	//#endregion

	//#region Physics clock

	private OnPhysicsStep( step: number, overlaps: OverlapEventData[] ): void {
		const begin = this.Perf.Begin();

		this.RunPhysicsStep( step, overlaps );
		this.Perf.End( "step", begin );
	}

	private RunPhysicsStep(
		_step: number,
		overlaps: OverlapEventData[],
	): void {
		if ( this._scenes.IsLoading ) {
			return;
		}

		this._time.PhysicsStepCount++;
		const dt = this._time.FixedDelta;

		this._world.FlushLifecycle();
		this._world.RunPhysicsSync();

		for ( const event of overlaps ) {
			this.DispatchOverlap( event );
		}

		this._world.FlushLifecycle();
		this._world.RunPhysicsUpdate( dt );
		this.RunScripts( Hook.PhysicsUpdate, dt );
		this._input.EndPhysicsStep();

		this._world.FlushDestroyed();
		this._physics.Flush();
	}

	private DispatchOverlap( event: OverlapEventData ): void {
		const a = this._world.Get( event.entityA );
		const b = this._world.Get( event.entityB );

		if ( !a || !b || a === b ) {
			return;
		}

		const isTrigger = this._physics.GetKind(
			a.Id,
		) === PhysObjectKind.Trigger
			|| this._physics.GetKind( b.Id ) === PhysObjectKind.Trigger;
		this._world.DispatchOverlap( a, b, event.entered, isTrigger );
	}

	//#endregion

	//#region Render clock

	private OnFrameRequest( frameId: number ): void {
		const begin = this.Perf.Begin();

		try {
			this.RunFrame( frameId );
		} catch ( error ) {
			// Every request MUST be answered: the render worker stops asking
			// once two are outstanding, so a single exception here would
			// otherwise freeze the picture for good. Scripts are already
			// guarded individually (EntityWorld.Run); this catches engine-level
			// failures (e.g. a camera that throws in GetPose).
			Logger.LogException( error, "[GameLogicRuntime] frame failed:" );
			this._render.PostFrame( frameId, 0, new ArrayBuffer( 0 ), null );
		}
		this.Perf.End( "logic", begin );
	}

	private RunFrame( frameId: number ): void {
		const now = performance.now();

		if ( this._scenes.IsLoading ) {
			// The world is being rebuilt: keep the render worker's request
			// accounting balanced with an empty frame. The SDF worker meshes
			// the new scene's start meanwhile (the scene waits for it).
			this._sdf.TickLoading();
			this._render.PostFrame( frameId, 0, new ArrayBuffer( 0 ), null );
			this._lastFrameMs = now;
			return;
		}

		const dt = this._lastFrameMs === null
			? 0
			: FMath.Min( 0.1, ( now - this._lastFrameMs ) / 1000 );
		this._lastFrameMs = now;

		this._time.Delta = dt;
		this._time.Elapsed += dt;
		this._time.FrameCount++;
		// frame waits (Task.NextFrame, Task.Delay in game time) complete here
		PlayerLoop.Default.Tick( dt );
		this._time.RenderStep = this.RenderStepAt( dt );

		this._world.FlushLifecycle();
		this._world.RunInputUpdate( this._input, dt );
		this.RunScripts( Hook.InputUpdate, dt );
		this._world.RunUpdate( dt );
		this.RunScripts( Hook.Update, dt );
		this._world.RunUiUpdate( this._ui, dt );
		this.RunScripts( Hook.UIUpdate, dt );
		this.Context.Stream.Flush();
		this._world.FlushDestroyed();

		this._ui.Flush( now );
		this._physics.Flush();

		this.PostFrame( frameId );
		this._input.EndFrame();
	}

	/**
	 * The step time to draw at: a step and a half behind the newest step
	 * (frames between two steps have both; a step late or two at once - the
	 * physics worker catches up in bursts - don't show). It only goes
	 * forward: faster while behind that lag, slower while ahead (a physics
	 * that can't keep up), at once only when far behind (a stall, the first
	 * frames).
	 */
	private RenderStepAt( dt: number ): number {
		const latest = this._time.PhysicsStepCount;
		const at = this._time.RenderStep;
		const behind = latest - RenderLagSteps - at;

		if ( behind > 8 ) {
			return latest - RenderLagSteps;
		}

		const rate = FMath.Clamp( 1 + behind * 0.5, 0.1, 3 );

		return FMath.Min( at + dt / this._time.FixedDelta * rate, latest );
	}

	/**
	 * The frame for the renderer: the poses that changed since the last one
	 * (an entity standing still costs nothing here or there) and the camera.
	 */
	private PostFrame( frameId: number ): void {
		const renderables = this._world.Renderables;
		const at = this._time.RenderStep;
		const pose = this._pose;
		let count = 0;

		for ( const [id, entity] of renderables ) {
			const transform = entity.Transform;
			transform.WriteInterpolated( at, pose, 0 );

			const sent = transform.SentPose;

			if ( sent && sent[0] === pose[0] && sent[1] === pose[1]
				&& sent[2] === pose[2] && sent[3] === pose[3]
				&& sent[4] === pose[4] && sent[5] === pose[5]
				&& sent[6] === pose[6] ) {
				continue;
			}
			( transform.SentPose ??= new Float64Array( 7 ) ).set( pose );
			if ( ( count + 1 ) * TRANSFORM_STRIDE > this._frame.length ) {
				const grown = new Float64Array(
					FMath.Max( 64, this._frame.length * 2 ),
				);
				grown.set( this._frame );
				this._frame = grown;
			}
			const base = count * TRANSFORM_STRIDE;
			this._frame[base] = id;
			this._frame.set( pose, base + 1 );
			count++;
		}

		const camera = this._render.MainCamera?.GetPose( at ) ?? null;

		// the SDF worker meshes around the camera
		const [ px, py, pz, qx, qy, qz, qw ] = camera?.transform
			?? [ 0, 0, 0, 0, 0, 0, 1 ];

		this._sdf.Tick( [ px, py, pz ], [ qx, qy, qz, qw ] );
		// a copy of just the changed part: the buffer itself is kept for the
		// next frame (what is posted is transferred away)
		const buffer = count === 0
			? EmptyFrame
			: this._frame.slice( 0, count * TRANSFORM_STRIDE ).buffer;
		this._render.PostFrame(
			frameId,
			count,
			buffer,
			camera,
			this._sdf.TakeDynamic(),
		);
	}


	/** PostFrame's scratch: one pose, and the frame being built. */
	private readonly _pose = new Float64Array( 7 );

	private _frame = new Float64Array( 64 );

	//#endregion
}
