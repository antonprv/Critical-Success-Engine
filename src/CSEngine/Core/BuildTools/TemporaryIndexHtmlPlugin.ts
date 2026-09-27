// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	existsSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Vite hardcodes `index.html` as its dev-server/build entry point, but the
 * repo's actual template lives at Public/index.html (see webpack.config.js's
 * HtmlWebpackPlugin for the production-build equivalent of this). This
 * plugin generates a throwaway `index.html` at the project root for Vite to
 * pick up, with the entry script tag injected, and removes it again on
 * server shutdown / bundle close so it never gets committed by accident.
 */
export function TemporaryIndexHtmlPlugin(): Plugin {
	const RootDirectory = process.cwd();

	const TemplatePath = resolve(
		RootDirectory,
		"Assets",
		"index.html"
	);

	const GeneratedPath = resolve(
		RootDirectory,
		"index.html"
	);

	const ScriptBlock =
		`<script type="module" src="/Source/App.ts"></script>`;

	let Generated = false;
	let CleanupRegistered = false;

	function CreateIndexHtml(): void {
		if (Generated) {
			return;
		}

		if (!existsSync(TemplatePath)) {
			throw new Error(
				`Index template not found: ${TemplatePath}`
			);
		}

		const Template = readFileSync(
			TemplatePath,
			"utf8"
		);

		writeFileSync(
			GeneratedPath,
			Template.replace(
				"</body>",
				`${ScriptBlock}</body>`
			),
			"utf8"
		);

		Generated = true;
	}

	function RemoveIndexHtml(): void {
		if (!Generated) {
			return;
		}

		if (existsSync(GeneratedPath)) {
			unlinkSync(GeneratedPath);
		}

		Generated = false;
	}

	function RegisterCleanup(): void {
		if (CleanupRegistered) {
			return;
		}

		CleanupRegistered = true;

		process.once("exit", RemoveIndexHtml);

		process.once("SIGINT", () => {
			RemoveIndexHtml();
			process.exit(130);
		});

		process.once("SIGTERM", () => {
			RemoveIndexHtml();
			process.exit(143);
		});
	}

	return {
		name: "temporary-index-html",

		configureServer(Server) {
			CreateIndexHtml();
			RegisterCleanup();

			Server.httpServer?.once(
				"close",
				RemoveIndexHtml
			);
		},

		closeBundle() {
			RemoveIndexHtml();
		},
	};
}
