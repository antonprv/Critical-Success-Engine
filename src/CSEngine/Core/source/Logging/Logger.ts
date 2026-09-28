// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { LogType } from "./LogType";

/**
 * Browser port of the Godot/C# GameLogger this engine's other project uses -
 * same LogInfo/LogWarning/LogError/LogException/LogValue surface. Importable
 * from anywhere - main thread or any worker - since it never routes through
 * GameWorkers; each realm decides its own behavior independently.
 *
 * KNOWN LIMITATION (call-site info): TypeScript has no
 * [CallerMemberName]/[CallerFilePath]/[CallerLineNumber] compiler magic, so
 * GetCallSite() below is a best-effort parse of `new Error().stack` instead -
 * reliable with dev source maps, less so once a production build is
 * minified. This only affects the `[File.Method:Line]` prefix baked into
 * each line; devtools still points at a real call site for every raw
 * console.* call regardless of what this class does.
 *
 * PRODUCTION STRIPPING: every method except LogInfo starts with
 * `if (!__DEV__) return;` - the same compile-time flag Game.ts and
 * DebugTools.ts already gate the Inspector import behind (see env.d.ts).
 * `pnpm dev` (Vite) always has __DEV__ = true; `webpack --mode production`
 * (build:prod/serve:prod) sets it false, at which point Terser sees an
 * unconditional early return and dead-code-eliminates everything below it
 * in each of those methods - LogWarning/LogError/LogException/LogValue
 * effectively disappear from a prod bundle. Only LogInfo is deliberately
 * excluded from this gate and survives into production. Note this only
 * removes what those methods DO once called - an argument expression at a
 * call site (e.g. a template literal) is still evaluated before the call,
 * same as any other JS function call; wrap a call site itself in
 * `if (__DEV__)` if even that needs to disappear on a hot path.
 *
 * Console output always happens wherever a method isn't stripped, exactly
 * like a normal console.log/warn/error would. Whether logs are ALSO
 * written to disk depends on where this page is being served from - both
 * `pnpm dev` (Vite, always 127.0.0.1) and a webpack dev build (commonly
 * opened as localhost, not the literal IP) count as local:
 *
 * - hostname is 127.0.0.1, localhost, or the IPv6 loopback: buffered lines
 *   get POSTed to a tiny local sidecar process (see Tools/LogServer.mjs,
 *   sibling of Core/ under src/CSEngine) that appends them under
 *   src/CSEngine/Logs. Deliberately bundler-agnostic - works the same
 *   whether the dev server is Vite or webpack, since it's just a plain
 *   HTTP POST to 127.0.0.1.
 * - anything else (a real hostname/IP reachable from the internet): there
 *   is no sidecar to reach and no filesystem to write to from a page served
 *   to someone else's browser, so FlushToDisk() below is a no-op there -
 *   console output is all that happens.
 */
export class Logger {
	private static readonly _sidecarUrl = "http://127.0.0.1:4790/log";
	private static readonly _buffer: string[] = [];

	// "localhost" covers webpack's dev build (serve:dev is commonly opened as
	// http://localhost:8080, not the literal IP, even though devServer.host
	// itself is 0.0.0.0); Vite's server.host is pinned to 127.0.0.1 directly.
	private static readonly _localHostnames = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

	private static get IsLocalHost(): boolean {
		return Logger._localHostnames.has(self.location.hostname);
	}

	public static LogInfo(message: string): void {
		Logger.Write(LogType.Info, message);
	}

	public static LogWarning(message: string): void {
		if (!__DEV__) return;
		Logger.Write(LogType.Warning, message);
	}

	public static LogError(message: string): void {
		if (!__DEV__) return;
		Logger.Write(LogType.Error, message);
	}

	public static LogException(error: unknown): void {
		if (!__DEV__) return;
		Logger.Write(LogType.Error, error instanceof Error ? (error.stack ?? error.message) : String(error));
	}

	public static LogValue<TValue>(propertyName: string, value: TValue): void {
		if (!__DEV__) return;
		Logger.Write(LogType.Info, `Set ${propertyName} to ${String(value)}`);
	}

	/**
	 * POSTs whatever has buffered since the last flush to the local sidecar -
	 * a no-op off localhost, and a no-op if nothing new was logged. Safe to
	 * call as often as you like from anywhere; see SetupAutoFlush for a
	 * main-thread-only helper that calls this on a timer.
	 */
	public static FlushToDisk(): void {
		if (!Logger.IsLocalHost || Logger._buffer.length === 0) return;

		const snapshot = Logger._buffer.splice(0, Logger._buffer.length);
		void fetch(Logger._sidecarUrl, {
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body: snapshot.join("\n"),
		}).catch((error) => {
			// Put the lines back so a sidecar that starts late doesn't lose them.
			Logger._buffer.unshift(...snapshot);
			console.warn("[Logger] failed to reach log sidecar - is it running? (see Tools/LogServer.mjs)", error);
		});
	}

	/**
	 * Call once, from the main thread only (App.ts), to flush periodically
	 * and again right before the tab closes. Entirely optional - without it,
	 * buffered lines just sit there until something else calls FlushToDisk().
	 */
	public static SetupAutoFlush(intervalMs = 5000): void {
		setInterval(() => Logger.FlushToDisk(), intervalMs);
		// Cast rather than reference `window` directly - this file also gets
		// imported by worker code, whose lib.d.ts doesn't know "beforeunload".
		const mainThread = self as unknown as { addEventListener?: (type: string, cb: () => void) => void };
		mainThread.addEventListener?.("beforeunload", () => Logger.FlushToDisk());
	}

	// #region Private API

	private static Write(logType: LogType, message: string): void {
		const formatted = `[${Logger.GetCallSite()}] ${message}`;
		const line = `[${new Date().toISOString()}] [${LogType[logType]}] ${formatted}`;

		if (Logger.IsLocalHost) Logger._buffer.push(line);

		switch (logType) {
			case LogType.Info:
				console.log(formatted);
				break;
			case LogType.Warning:
				console.warn(formatted);
				break;
			case LogType.Error:
				console.error(formatted);
				break;
		}
	}

	private static GetCallSite(): string {
		// Frame 0 is the "Error" header line itself; 1 = GetCallSite, 2 = Write,
		// 3 = LogInfo/LogWarning/LogError/LogException/LogValue, 4 = the actual caller.
		const frame = new Error().stack?.split("\n")[4]?.trim();
		return frame ?? "unknown";
	}

	// #endregion
}
