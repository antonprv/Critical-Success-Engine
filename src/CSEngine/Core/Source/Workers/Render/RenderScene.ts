// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Deep imports on purpose: the "@babylonjs/core" barrel and the
// "@babylonjs/loaders" index (OBJ, STL, SPLAT, BVH, glTF 1 and 2, ...) would
// each drag their whole feature set into the render worker bundle. This engine
// renders primitives and glTF 2.0 models, so that is all that is registered.
import { FMath } from "@cse/fastmath";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0";

import { AssetLoader } from "../../Engine/Assets/AssetLoader";
import { PerfSamples } from "../../Engine/Diagnostics/PerfProbe";
import type { CameraPose } from "../Protocol/RenderGameLogicProtocol";

/**
 * The Babylon engine, scene, camera and lights. Right-handed, Y-up, forward =
 * -Z like Godot and CSPhysics, so simulation poses apply without axis flips.
 * The Inspector is unavailable: it needs `document`, which workers don't have.
 */
/** Uncapped: frames the GPU may still be running when the next one is drawn. */
const MaxFramesInFlight = 4;

/** Uncapped: how long the loop asks the GPU again at once before it sleeps. */
const GpuSpinMs = 0.3;

export class RenderScene {
	private readonly _engine: Engine;

	private readonly _scene: Scene;

	private readonly _camera: FreeCamera;

	public readonly AssetLoader: AssetLoader;

	/**
	 * Per frame: "frame" (ms since the last one), "render" (ms of CPU work),
	 * "draws" and "triangles" - for the perf harness.
	 */
	public readonly Perf = new PerfSamples();

	private _uncapped = false;

	/** Uncapped: since when the loop waits on the GPU (0: it doesn't). */
	private _busySince = 0;

	/** Uncapped: something new waits to be drawn. */
	private _dirty = true;

	/** Uncapped: Babylon's next frame, held while there is nothing to draw. */
	private _next: ( ( time: number ) => void ) | null = null;

	private _kick: ( () => void ) | null = null;

	private readonly _fences: WebGLSync[] = [];

	/**
	 * @param createEngine Builds the Babylon engine for the canvas. The default
	 * is the real WebGL engine; tests pass a NullEngine-based one (Node has no
	 * WebGL, and NullEngine is a subclass of Engine, so the module can't be
	 * mocked).
	 */
	public constructor(
		canvas: OffscreenCanvas,
		width: number,
		height: number,
		devicePixelRatio: number,
		createEngine: ( canvas: OffscreenCanvas ) => Engine = RenderScene.WebGl(
			true,
		),
	) {
		// Must happen before the Engine reads the canvas size: OffscreenCanvas
		// keeps its 300x150 default otherwise.
		canvas.width = FMath.Max( 1, FMath.Round( width * devicePixelRatio ) );
		canvas.height = FMath.Max(
			1,
			FMath.Round( height * devicePixelRatio ),
		);

		this._engine = createEngine( canvas );
		// Babylon's own frame time average: unused, and it costs memory every
		// frame
		this._engine.performanceMonitor.disable();
		this._scene = new Scene( this._engine );
		this._scene.useRightHandedSystem = true;
		this._scene.clearColor = new Color4( 0.08, 0.1, 0.14, 1 );
		this.AssetLoader = new AssetLoader( this._scene );

		// No attachControl(): pointer input is captured on the main thread
		// (DomInputBridge) and forwarded through GameLogicWorker, so two things
		// aren't fighting over the same pointer events.
		this._camera = new FreeCamera(
			"MainCamera",
			new Vector3( 0, 8, 13 ),
			this._scene,
		);
		this._camera.rotationQuaternion = Quaternion.Identity();
		this._camera.minZ = 0.05;
		this._camera.maxZ = 500;
		this._camera.setTarget( new Vector3( 0, 1, 0 ) );
		this._camera.rotationQuaternion = Quaternion.FromEulerAngles(
			this._camera.rotation.x,
			this._camera.rotation.y,
			0,
		);

		const sky = new HemisphericLight(
			"Sky",
			new Vector3( 0.2, 1, 0.1 ),
			this._scene,
		);
		sky.intensity = 0.65;
		sky.groundColor = new Color3( 0.25, 0.25, 0.3 );

		const sun = new DirectionalLight(
			"Sun",
			new Vector3( -0.4, -1, -0.5 ),
			this._scene,
		);
		sun.intensity = 0.7;
	}

	/**
	 * Smooths edges with FXAA: one pass over the finished frame, far cheaper
	 * than multisampling on a weak GPU (the engine is made without it then).
	 */
	public UseFxaa(): void {
		new FxaaPostProcess( "fxaa", 1, this._camera );
	}

	/** The real WebGL engine for a canvas, with or without multisampling. */
	public static WebGl( antialias: boolean ): (
		canvas: OffscreenCanvas,
	) => Engine {
		return ( target ) => new Engine(
			target as unknown as HTMLCanvasElement,
			antialias,
			undefined,
			true,
		);
	}

	public get Scene(): Scene {
		return this._scene;
	}

	public SetClearColor( r: number, g: number, b: number ): void {
		this._scene.clearColor = new Color4( r, g, b, 1 );
	}

	public PoseCamera( pose: CameraPose ): void {
		const [px, py, pz, qx, qy, qz, qw] = pose.transform;
		this._camera.position.set( px, py, pz );
		this._camera.rotationQuaternion?.set( qx, qy, qz, qw );
		this._camera.fov = pose.fov;
	}

	/**
	 * `beforeRender` runs once per frame, right before the scene is drawn; it
	 * says whether it brought a new game state. At the display's rate every
	 * frame is drawn; uncapped (Uncap), only frames with something new.
	 */
	public RunRenderLoop( beforeRender: () => boolean | void ): void {
		const draws = ( this._engine as unknown as {
			_drawCalls: { current: number; };
		} )._drawCalls;
		// when the last frame and the last fresh one were drawn: in an array,
		// as a closure's number variables would make a heap number each time
		// they change, thousands of times a second
		const times = new Float64Array( 2 );
		// Babylon's counter only grows (it is reset when instrumentation is
		// on): a frame's draw calls are its growth
		let drawn = 0;

		// a frame drawn with a new game state: what fps counts (the loop may
		// draw the same state again, or skip one a newer one replaced)
		let fresh = false;

		this._engine.runRenderLoop( () => {
			if ( beforeRender() === true ) {
				this._dirty = true;
				fresh = true;
			}
			if ( this._uncapped && this._dirty && this.GpuBusy() ) {
				// the GPU is still on earlier frames: wait for it (see Uncap)
				this._busySince ||= performance.now();
				return;
			}
			this._busySince = 0;
			if ( this._uncapped && !this._dirty ) {
				return; // nothing new
			}
			this._dirty = false;
			const start = this.Perf.Begin();

			if ( times[0]! > 0 ) {
				this.Perf.Add( "frame", start - times[0]! );
			}
			times[0] = start;
			this._scene.render();
			this.Fence();
			this.Perf.End( "render", start );
			if ( fresh ) {
				if ( times[1]! > 0 ) {
					this.Perf.Add( "fresh", start - times[1]! );
				}
				times[1] = start;
				fresh = false;
			}
			const total = draws.current;
			this.Perf.Add( "draws", total >= drawn ? total - drawn : total );
			drawn = total;
			this.Perf.Add( "triangles", this._scene.getActiveIndices() / 3 );
		} );
	}

	/**
	 * Draws frames as fast as the machine can instead of at the display's
	 * rate (the perf harness's ?uncapped; "no frame limit" in the graphics
	 * settings). The loop then runs when there is something to draw - a new
	 * game state (Wake) - and sleeps otherwise instead of spinning; and at
	 * most two frames are in flight on the GPU, so commands never pile up
	 * faster than it runs them (a pile-up ends in a long stall).
	 */
	public Uncap(): void {
		const channel = new MessageChannel();
		let id = 0;

		channel.port1.onmessage = () => {
			const run = this._next;
			this._next = null;
			run?.( performance.now() );
		};
		this._kick = () => channel.port2.postMessage( null );
		this._uncapped = true;
		this._dirty = true;
		this._engine.customAnimationFrameRequester = {
			requestAnimationFrame: ( callback: ( time: number ) => void ) => {
				this._next = callback;
				// asleep until Wake, unless something waits to be drawn
				if ( !this._dirty ) {
					return ++id;
				}
				// waiting on the GPU: a quick look again at first, then sleeps
				// of a millisecond - asking again and again would keep a core
				// spinning, taken from the game logic and the physics, and
				// power from the GPU itself (they share it on a laptop)
				if ( this._busySince > 0
					&& performance.now() - this._busySince > GpuSpinMs ) {
					setTimeout( () => this._kick?.(), 1 );
				} else {
					this._kick?.();
				}
				return ++id;
			},
		};
	}

	/** Something new to draw (a game state, a scene edit): the loop runs. */
	public Wake(): void {
		this._dirty = true;
		if ( this._next ) {
			this._kick?.();
		}
	}

	/** Uncapped: whether two frames are still running on the GPU. */
	private GpuBusy(): boolean {
		const gl = this.Gl;

		if ( !gl ) {
			return false;
		}
		while ( this._fences.length > 0
			&& gl.getSyncParameter( this._fences[0]!, gl.SYNC_STATUS )
				=== gl.SIGNALED ) {
			gl.deleteSync( this._fences.shift()! );
		}
		return this._fences.length >= MaxFramesInFlight;
	}

	/** Uncapped: marks the end of a frame's GPU work. */
	private Fence(): void {
		const gl = this._uncapped ? this.Gl : null;
		const fence = gl?.fenceSync( gl.SYNC_GPU_COMMANDS_COMPLETE, 0 );

		if ( gl && fence ) {
			this._fences.push( fence );
			gl.flush();
		}
	}

	private get Gl(): WebGL2RenderingContext | null {
		const gl = ( this._engine as unknown as {
			_gl: WebGL2RenderingContext | null;
		} )._gl;

		return gl && typeof gl.fenceSync === "function" ? gl : null;
	}

	/** What draws the frames: the GPU, the canvas size. */
	public get GpuInfo(): Record<string, unknown> {
		const info = this._engine.getGlInfo();
		const canvas = this._engine.getRenderingCanvas();

		return {
			vendor: info.vendor,
			renderer: info.renderer,
			version: info.version,
			width: canvas?.width ?? 0,
			height: canvas?.height ?? 0,
		};
	}

	public Resize(
		width: number,
		height: number,
		devicePixelRatio: number,
	): void {
		const canvas = this._engine.getRenderingCanvas();

		if ( canvas ) {
			canvas.width = FMath.Max(
				1,
				FMath.Round( width * devicePixelRatio ),
			);
			canvas.height = FMath.Max(
				1,
				FMath.Round( height * devicePixelRatio ),
			);
		}
		this._engine.resize();
	}
}
