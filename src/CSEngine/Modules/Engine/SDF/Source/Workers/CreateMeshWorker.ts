// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { MeshWorkerPort } from "./SdfMeshWorkers";

/**
 * A new mesh worker, for SdfMeshWorkers' spawn. The URL is resolved next to
 * this file, so bundlers (Vite) build the worker with the package.
 */
export function CreateMeshWorker(): MeshWorkerPort {
	return new Worker(
		new URL( "./MeshWorker.ts", import.meta.url ),
		{ type: "module" },
	) as unknown as MeshWorkerPort;
}
