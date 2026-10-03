// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Plugin } from "vite";

import { StartLogServerSidecar, StopLogServerSidecar } from "./LogServerSidecar.mjs";

/**
 * Spins up Tools/LogServer.mjs (see Logger.ts for what it's for and why it
 * has to be a separate process at all - a browser page can't write files to
 * disk itself) the moment `vite dev` starts listening, and tears it down
 * again on shutdown. Nothing to run manually, nothing left running once the
 * dev server exits. Only wired into configureServer, so a plain `vite build`
 * never touches it.
 */
export function LogServerPlugin(): Plugin {
	return {
		name: "log-server-sidecar",

		configureServer(server) {
			void StartLogServerSidecar();

			server.httpServer?.once("close", StopLogServerSidecar);
		},
	};
}
