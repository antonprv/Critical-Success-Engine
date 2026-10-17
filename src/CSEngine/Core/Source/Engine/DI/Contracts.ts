// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Contract } from "@cse/di";
import type { DataStream } from "@cse/datastream";
import type { EntityWorld } from "../Core/EntityWorld";
import type { TimeInfo } from "../Core/EngineContext";
import type { DataAssets } from "../Data/DataAsset";
import type { SceneManager } from "../Scenes/SceneManager";
import type { AudioService } from "../Services/AudioService";
import type { InputService } from "../Services/InputService";
import type { PhysicsService } from "../Services/PhysicsService";
import type { RenderService } from "../Services/RenderService";
import type { SettingsService } from "../Services/SettingsService";
import type { UiService } from "../Services/UiService";
import type { SettingsStorage } from "../Storage/SettingsStorage";

// The engine's subsystems as contracts: a component asks for the interface
// (`@Inject( IInputSubsystem ) private readonly _input!: IInputSubsystem;`),
// the container gives whatever implements it (EngineInstaller binds the
// engine's own). An interface is the public surface of the engine's class.

/** The public members of a class: what an interface of it promises. */
export type PublicOf<T> = { [K in keyof T]: T[K] };

/** The player's input: actions, keys, the pointer (InputService). */
export type IInputSubsystem = PublicOf<InputService>;
export const IInputSubsystem = Contract<IInputSubsystem>( "IInputSubsystem" );

/** The simulation: bodies, queries, overlaps (PhysicsService). */
export type IPhysicsSubsystem = PublicOf<PhysicsService>;
export const IPhysicsSubsystem = Contract<IPhysicsSubsystem>(
	"IPhysicsSubsystem",
);

/** The renderer: meshes, the camera, the environment (RenderService). */
export type IRenderSubsystem = PublicOf<RenderService>;
export const IRenderSubsystem = Contract<IRenderSubsystem>(
	"IRenderSubsystem",
);

/** The page's HUD, toasts, loading screen (UiService). */
export type IUiSubsystem = PublicOf<UiService>;
export const IUiSubsystem = Contract<IUiSubsystem>( "IUiSubsystem" );

/** Sound (AudioService). */
export type IAudioSubsystem = PublicOf<AudioService>;
export const IAudioSubsystem = Contract<IAudioSubsystem>( "IAudioSubsystem" );

/** The game's settings: the engine's and the game's own (SettingsService). */
export type ISettingsSubsystem = PublicOf<SettingsService>;
export const ISettingsSubsystem = Contract<ISettingsSubsystem>(
	"ISettingsSubsystem",
);

/** What the player chose, kept between sessions (SettingsStorage). */
export type IStorage = PublicOf<SettingsStorage>;
export const IStorage = Contract<IStorage>( "IStorage" );

/** The project's data assets (DataAssets). */
export type IDataAssets = PublicOf<DataAssets>;
export const IDataAssets = Contract<IDataAssets>( "IDataAssets" );

/** Scenes: which one is loaded, loading another (SceneManager). */
export type IScenes = PublicOf<SceneManager>;
export const IScenes = Contract<IScenes>( "IScenes" );

/** The entities (EntityWorld). */
export type IWorld = PublicOf<EntityWorld>;
export const IWorld = Contract<IWorld>( "IWorld" );

/** Frame and step times. */
export type ITime = TimeInfo;
export const ITime = Contract<ITime>( "ITime" );

/** The DataStream: tagged messages, TypeScript and C# alike. */
export type IDataStream = PublicOf<DataStream>;
export const IDataStream = Contract<IDataStream>( "IDataStream" );
