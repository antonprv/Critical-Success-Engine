// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { RendOpType } from "../../Workers/Common/CommonEnums";
import type { CameraPose, GameLogicToRenderMessage, MeshDescriptor } from "../../Workers/Protocol/RenderGameLogicProtocol";
import type { FlatTransform } from "../../Workers/Protocol/TransformProtocol";
import { SyncTracker } from "../Core/SyncTracker";
import type { Vec3Tuple } from "../Math/Vec3";

/** Something that can say where the main camera is for a given interpolation alpha (implemented by CameraComponent). */
export interface ICameraSource {
	GetPose(alpha: number): CameraPose;
}

export class RenderService {
	private readonly _port: MessagePort;
	private readonly _sync = new SyncTracker();

	public Ready = false;

	/** Whichever camera component registered itself last wins; null = render worker keeps its default pose. */
	public MainCamera: ICameraSource | null = null;

	public constructor(port: MessagePort) {
		this._port = port;
	}

	private Post(message: GameLogicToRenderMessage, transfer: Transferable[] = []): void {
		this._port.postMessage(message, transfer);
	}

	public Spawn(entityId: number, mesh: MeshDescriptor, transform: FlatTransform, color?: Vec3Tuple): void {
		this.Post({
			operation: RendOpType.SpawnEntity,
			entityId,
			mesh,
			transform,
			...(color ? { color } : {}),
		});
	}

	public Remove(entityId: number): void { this.Post({ operation: RendOpType.RemoveEntity, entityId }); }
	public SetVisible(entityId: number, visible: boolean): void { this.Post({ operation: RendOpType.SetVisible, entityId, visible }); }
	public SetColor(entityId: number, color: Vec3Tuple): void { this.Post({ operation: RendOpType.SetColor, entityId, color }); }
	public SetEnvironment(clearColor: Vec3Tuple): void { this.Post({ operation: RendOpType.SetEnvironment, clearColor }); }
	public ClearScene(): void { this.Post({ operation: RendOpType.ClearScene }); }

	public Sync(): Promise<void> {
		return this._sync.Begin((token) => this.Post({ operation: RendOpType.Sync, token }));
	}

	public AcknowledgeSync(token: number): void { this._sync.Acknowledge(token); }

	/** Answers a frame request: every renderable's pose plus the camera, with the buffer transferred (zero copy). */
	public PostFrame(frameId: number, entityCount: number, buffer: ArrayBuffer, camera: CameraPose | null): void {
		this.Post({ operation: RendOpType.Frame, frameId, camera, entityCount, buffer }, [buffer]);
	}
}
