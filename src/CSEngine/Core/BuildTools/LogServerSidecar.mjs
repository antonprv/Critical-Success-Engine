// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Shared by vite.config.ts (via LogServerPlugin.ts) and webpack.config.js's
// devServer.onListening - both need the exact same "spawn Tools/LogServer.mjs
// unless something's already listening on its port, kill it again on
// shutdown" logic. Plain .mjs on purpose (see LogServerSidecar.d.mts for why
// it still typechecks) - webpack.config.js is executed by Node directly with
// no TypeScript loader registered, so it can only ever import plain JS.

import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SidecarPort = 4790;
const SidecarScript = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../Tools/LogServer.mjs"
);

let childProcess = null;
let shutdownHooksRegistered = false;

function IsPortTaken(port) {
	return new Promise((resolvePromise) => {
		const socket = createConnection({ port, host: "127.0.0.1" });
		socket.once("connect", () => {
			socket.destroy();
			resolvePromise(true);
		});
		socket.once("error", () => resolvePromise(false));
	});
}

function RegisterShutdownHooks() {
	if (shutdownHooksRegistered) return;
	shutdownHooksRegistered = true;

	process.once("exit", StopLogServerSidecar);
	process.once("SIGINT", () => {
		StopLogServerSidecar();
		process.exit(130);
	});
	process.once("SIGTERM", () => {
		StopLogServerSidecar();
		process.exit(143);
	});
}

/**
 * Spawns Tools/LogServer.mjs as a child process, unless something is already
 * listening on its port (another dev server instance already started one,
 * or someone ran it manually) - safe to call from both bundlers without
 * ever double-spawning it.
 */
export async function StartLogServerSidecar() {
	if (childProcess || (await IsPortTaken(SidecarPort))) return;

	childProcess = spawn(process.execPath, [SidecarScript], { stdio: "inherit" });
	childProcess.once("exit", () => {
		childProcess = null;
	});

	RegisterShutdownHooks();
}

/** Kills the child process started by StartLogServerSidecar(), if any. Safe to call even if it was never started. */
export function StopLogServerSidecar() {
	childProcess?.kill();
	childProcess = null;
}
