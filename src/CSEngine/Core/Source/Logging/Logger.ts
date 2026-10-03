// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { LogType } from "./LogType";
import { WorkerScope } from "../Workers/Common/WorkerScope";

export class Logger {
	private static readonly _sidecarUrl = "http://127.0.0.1:4790/log";
	private static readonly _buffer: string[] = [];

	// Hosts that may talk to the local log sidecar (dev server, `vite preview`).
	private static readonly _localHostnames = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

	private static get IsLocalHost(): boolean {
		return Logger._localHostnames.has(self.location.hostname);
	}

	public static LogDebug(message: string): void {
		if (!__DEV__) return;
		Logger.Write(LogType.Debug, message);
	}

	public static LogInfo(message: string): void {
		Logger.Write(LogType.Info, message);
	}

	public static LogWarning(message: string): void {
		if (!__DEV__) return;
		Logger.Write(LogType.Warning, message);
	}

	public static LogError(message: string): void {
		Logger.Write(LogType.Error, message);
	}

	/** `context` is prepended on its own line - use it for the "what failed" part that used to be console.error's first argument. */
	public static LogException(error: unknown, context?: string): void {
		const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
		Logger.Write(LogType.Error, context ? `${context}\n${detail}` : detail);
	}

	/** Unlike the C# GameLogger this is ported from, logs at Debug level, not Info - a property-set trace is debug noise, not something to ship. */
	public static LogValue<TValue>(propertyName: string, value: TValue): void {
		if (!__DEV__) return;
		Logger.Write(LogType.Debug, `Set ${propertyName} to ${String(value)}`);
	}

	/** Posts the lines buffered since the last flush to the local sidecar. No-op off localhost or when nothing is new. */
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

	/** Flushes on a timer, and on tab close on the main thread. Call once per realm that logs (each has its own buffer). */
	public static SetupAutoFlush(intervalMs = 5000): void {
		setInterval(() => Logger.FlushToDisk(), intervalMs);
		WorkerScope().addEventListener?.("beforeunload", () => Logger.FlushToDisk()); // the main thread only
	}

	// #region Private API

	private static Write(logType: LogType, message: string): void {
		const formatted = `[${Logger.GetCallSite()}] ${message}`;
		const line = `[${new Date().toISOString()}] [${LogType[logType]}] ${formatted}`;

		if (Logger.IsLocalHost) Logger._buffer.push(line);

		switch (logType) {
			case LogType.Debug:
				console.debug(formatted);
				break;
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
