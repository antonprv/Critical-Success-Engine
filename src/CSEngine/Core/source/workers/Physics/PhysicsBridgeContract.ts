// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * The JS shape of Framework.Physics.Wasm.PhysicsBridge's [JSExport] surface
 * (see physics-wasm/Bridge/PhysicsBridge.cs). Kept as a hand-written interface
 * here rather than generated, since the wasm build step doesn't run as part
 * of this repo's own TypeScript build - see physics-wasm/BUILD.md.
 */
export interface PhysicsBridgeExports {
	CreateWorld(
		gravityX: number,
		gravityY: number,
		gravityZ: number,
		velocityIterations: number,
		substeps: number,
		useMultithreading: boolean
	): void;

	AddBoxShape(sizeX: number, sizeY: number, sizeZ: number): number;
	AddSphereShape(radius: number): number;
	AddCapsuleShape(radius: number, cylinderLength: number): number;
	AddCylinderShape(radius: number, height: number): number;

	AddDynamicBody(
		shapeId: number,
		posX: number, posY: number, posZ: number,
		quatX: number, quatY: number, quatZ: number, quatW: number,
		mass: number,
		layer: number, mask: number, ownerId: number,
		continuousDetection: boolean
	): number;
	AddStaticBody(
		shapeId: number,
		posX: number, posY: number, posZ: number,
		quatX: number, quatY: number, quatZ: number, quatW: number,
		layer: number, mask: number, ownerId: number
	): number;

	RemoveBody(bodyId: number): void;

	SetAwakeState(bodyId: number, awake: boolean): void;
	GetAwakeState(bodyId: number): boolean;

	SetLinearVelocity(bodyId: number, x: number, y: number, z: number): void;

	ApplyImpulse(
		bodyId: number,
		impulseX: number, impulseY: number, impulseZ: number,
		offsetX: number, offsetY: number, offsetZ: number
	): void;

	Step(dt: number): Float64Array | number[];

	GetLastOverlapEvents(): Int32Array | number[];
}

/** Minimal slice of the generated `dotnet.js` boot API (net8.0 wasm-tools) that we actually use. */
export interface DotnetRuntimeApi {
	getConfig(): { mainAssemblyName: string; };
	getAssemblyExports(assemblyName: string): Promise<{
		Physics: { Wasm: { PhysicsBridge: PhysicsBridgeExports; }; };
	}>;
}
