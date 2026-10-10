// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Deep imports on purpose: the "@babylonjs/core" barrel and the "@babylonjs/loaders" index (OBJ, STL, SPLAT, BVH, glTF 1
// and 2, ...) would each drag their whole feature set into the render worker bundle. This engine renders primitives and
// glTF 2.0 models, so that is all that is registered.
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0";

import { AssetLoader } from "../../Engine/Assets/AssetLoader";
import type { CameraPose } from "../Protocol/RenderGameLogicProtocol";

/**
 * The Babylon engine, scene, camera and lights. Right-handed, Y-up, forward = -Z like Godot and BEPU, so simulation
 * poses apply without axis flips. The Inspector is unavailable: it needs `document`, which workers don't have.
 */
export class RenderScene {
	private readonly _engine: Engine;
	private readonly _scene: Scene;
	private readonly _camera: FreeCamera;

	public readonly AssetLoader: AssetLoader;

	/**
	 * @param createEngine Builds the Babylon engine for the canvas. The default is the real WebGL engine; tests pass a
	 * NullEngine-based one (Node has no WebGL, and NullEngine is a subclass of Engine, so the module can't be mocked).
	 */
	public constructor(
		canvas: OffscreenCanvas,
		width: number,
		height: number,
		devicePixelRatio: number,
		createEngine: (canvas: OffscreenCanvas) => Engine = (target) => new Engine(target as unknown as HTMLCanvasElement, true, undefined, true)
	) {
		// Must happen before the Engine reads the canvas size: OffscreenCanvas keeps its 300x150 default otherwise.
		canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
		canvas.height = Math.max(1, Math.round(height * devicePixelRatio));

		this._engine = createEngine(canvas);
		this._scene = new Scene(this._engine);
		this._scene.useRightHandedSystem = true;
		this._scene.clearColor = new Color4(0.08, 0.1, 0.14, 1);
		this.AssetLoader = new AssetLoader(this._scene);

		// No attachControl(): pointer input is captured on the main thread (DomInputBridge) and forwarded through
		// GameLogicWorker, so two things aren't fighting over the same pointer events.
		this._camera = new FreeCamera("MainCamera", new Vector3(0, 8, 13), this._scene);
		this._camera.rotationQuaternion = Quaternion.Identity();
		this._camera.minZ = 0.05;
		this._camera.maxZ = 500;
		this._camera.setTarget(new Vector3(0, 1, 0));
		this._camera.rotationQuaternion = Quaternion.FromEulerAngles(this._camera.rotation.x, this._camera.rotation.y, 0);

		const sky = new HemisphericLight("Sky", new Vector3(0.2, 1, 0.1), this._scene);
		sky.intensity = 0.65;
		sky.groundColor = new Color3(0.25, 0.25, 0.3);

		const sun = new DirectionalLight("Sun", new Vector3(-0.4, -1, -0.5), this._scene);
		sun.intensity = 0.7;
	}

	public get Scene(): Scene { return this._scene; }

	public SetClearColor(r: number, g: number, b: number): void {
		this._scene.clearColor = new Color4(r, g, b, 1);
	}

	public PoseCamera(pose: CameraPose): void {
		const [px, py, pz, qx, qy, qz, qw] = pose.transform;
		this._camera.position.set(px, py, pz);
		this._camera.rotationQuaternion?.set(qx, qy, qz, qw);
		this._camera.fov = pose.fov;
	}

	/** `beforeRender` runs once per displayed frame, right before the scene is drawn. */
	public RunRenderLoop(beforeRender: () => void): void {
		this._engine.runRenderLoop(() => {
			beforeRender();
			this._scene.render();
		});
	}

	public Resize(width: number, height: number, devicePixelRatio: number): void {
		const canvas = this._engine.getRenderingCanvas();
		if (canvas) {
			canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
			canvas.height = Math.max(1, Math.round(height * devicePixelRatio));
		}
		this._engine.resize();
	}
}
