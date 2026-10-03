// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Plugin } from "vite";

import { StartLogServerSidecar, StopLogServerSidecar } from "./LogServerSidecar.mjs";

/** Starts Tools/LogServer.mjs with `vite dev` and stops it with the server (a page can't write files itself). */
export function LogServerPlugin(): Plugin {
	return {
		name: "log-server-sidecar",

		configureServer(server) {
			void StartLogServerSidecar();

			server.httpServer?.once("close", StopLogServerSidecar);
		},
	};
}
