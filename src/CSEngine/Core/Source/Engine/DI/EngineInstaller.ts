// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Installer, type ContainerBuilder } from "@cse/di";
import { IScriptBridge } from "@cse/scripting";
import type { EngineContext } from "../Core/EngineContext";
import {
	IAudioSubsystem, IDataAssets, IDataStream, IInputSubsystem,
	IPhysicsSubsystem, IRenderSubsystem, IScenes, ISettingsSubsystem,
	IStorage, ITime, IUiSubsystem, IWorld,
} from "./Contracts";

/**
 * Binds the engine's subsystems to their contracts: each resolves to what the
 * engine has at that moment. The runtime installs it first, then the game's
 * installers.
 */
export class EngineInstaller extends Installer<EngineContext> {
	public InstallBindings(
		builder: ContainerBuilder,
		engine: EngineContext,
	): void {
		builder.Bind( IInputSubsystem ).FromFactory( () => engine.Input )
			.AsTransient();
		builder.Bind( IPhysicsSubsystem ).FromFactory( () => engine.Physics )
			.AsTransient();
		builder.Bind( IRenderSubsystem ).FromFactory( () => engine.Render )
			.AsTransient();
		builder.Bind( IUiSubsystem ).FromFactory( () => engine.Ui )
			.AsTransient();
		builder.Bind( IAudioSubsystem ).FromFactory( () => engine.Audio )
			.AsTransient();
		builder.Bind( ISettingsSubsystem ).FromFactory( () => engine.Settings )
			.AsTransient();
		builder.Bind( IStorage ).FromFactory( () => engine.Storage )
			.AsTransient();
		builder.Bind( IDataAssets ).FromFactory( () => engine.Data )
			.AsTransient();
		builder.Bind( IScenes ).FromFactory( () => engine.Scenes )
			.AsTransient();
		builder.Bind( IWorld ).FromFactory( () => engine.World )
			.AsTransient();
		builder.Bind( ITime ).FromFactory( () => engine.Time )
			.AsTransient();
		builder.Bind( IDataStream ).FromFactory( () => engine.Stream )
			.AsTransient();
		// calls into C# (contracts of .contract files): @FromCSharp,
		// Bind( C ).FromCSharp()
		builder.Bind( IScriptBridge ).FromFactory( () => {
			if ( !engine.Scripts ) {
				throw new Error(
					"The project's C# scripts are not loaded (no .csproj, or "
						+ "it failed to build or load)",
				);
			}
			return engine.Scripts.Bridge;
		} )
			.AsTransient();
	}
}
