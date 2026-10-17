// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	ContainerBuilder, type Container, type Installer,
} from "@cse/di";
import type { EngineContext } from "../Core/EngineContext";
import { EngineInstaller } from "./EngineInstaller";

/**
 * The game's containers: the root (the engine's subsystems and the game's
 * installers, for the whole run) and the current scene's child (the scene's
 * own installer, for as long as the scene). Components are injected from the
 * current one.
 */
export class EngineContainers {
	public readonly Root: Container;

	private _scene: Container | null = null;

	public constructor(
		private readonly _engine: EngineContext,
		installers: readonly Installer<EngineContext>[],
	) {
		const builder = new ContainerBuilder();
		builder.Install( new EngineInstaller(), _engine );
		for ( const installer of installers ) {
			builder.Install( installer, _engine );
		}
		this.Root = builder.Build();
	}

	/** The scene's container, or the root when the scene has no installer. */
	public get Current(): Container {
		return this._scene ?? this.Root;
	}

	/**
	 * A new scene: the last one's container goes, this one's (if any) comes.
	 */
	public BeginScene( installer: Installer<EngineContext> | undefined ): void {
		this._scene?.Dispose();
		this._scene = installer
			? this.Root.CreateChild(
				( builder ) => builder.Install( installer, this._engine ),
			)
			: null;
	}
}
