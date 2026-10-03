// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../Source/Logging/Logger";
import { LogType } from "../Source/Logging/LogType";
import { SilenceConsole } from "./helpers";

type Buffer = { _buffer: string[]; };
const buffer = (): string[] => (Logger as unknown as Buffer)._buffer;
const location = (self as unknown as { location: { hostname: string; }; }).location;
const originalHostname = location.hostname;

beforeEach(() => { buffer().length = 0; });
afterEach(() => { location.hostname = originalHostname; vi.useRealTimers(); });

describe("Logger", () => {
	it("writes to the matching console method, tagged with the caller", () => {
		const log = SilenceConsole();
		Logger.LogDebug("d");
		Logger.LogInfo("i");
		Logger.LogWarning("w");
		Logger.LogError("e");
		Logger.LogValue("Speed", 7);

		expect(log.debug.mock.calls.map((c) => String(c[0]).replace(/^\[.*?\] /, ""))).toEqual(["d", "Set Speed to 7"]);
		expect(String(log.log.mock.calls[0]![0])).toMatch(/^\[.*\] i$/);
		expect(String(log.warn.mock.calls[0]![0])).toMatch(/\] w$/);
		expect(String(log.error.mock.calls[0]![0])).toMatch(/\] e$/);
	});

	it("debug, warning and value logs are skipped in production builds; info and errors are not", () => {
		const log = SilenceConsole();
		vi.stubGlobal("__DEV__", false);
		Logger.LogDebug("d");
		Logger.LogWarning("w");
		Logger.LogValue("x", 1);
		Logger.LogInfo("i");
		Logger.LogError("e");

		expect(log.debug).not.toHaveBeenCalled();
		expect(log.warn).not.toHaveBeenCalled();
		expect(log.log).toHaveBeenCalledTimes(1);
		expect(log.error).toHaveBeenCalledTimes(1);
	});

	it("LogException keeps the stack, with or without context, and copes with non-errors", () => {
		const log = SilenceConsole();
		Logger.LogException(new Error("boom"), "while testing:");
		Logger.LogException(new Error("bare"));
		Logger.LogException("just a string");
		const noStack = new Error("no stack");
		delete noStack.stack;
		Logger.LogException(noStack);

		const lines = log.error.mock.calls.map((c) => String(c[0]));
		expect(lines[0]).toContain("while testing:\nError: boom");
		expect(lines[1]).toContain("Error: bare");
		expect(lines[2]).toMatch(/just a string$/);
		expect(lines[3]).toMatch(/no stack$/);
	});

	it("only buffers lines for the log sidecar on localhost", () => {
		SilenceConsole();
		Logger.LogInfo("remote");
		expect(buffer()).toEqual([]);

		for (const host of ["127.0.0.1", "localhost", "[::1]", "::1"]) {
			location.hostname = host;
			Logger.LogInfo(`on ${host}`);
		}
		expect(buffer()).toHaveLength(4);
		expect(buffer()[0]).toMatch(/^\[\d{4}-.*Z\] \[Info\] \[.*\] on 127\.0\.0\.1$/);
		expect(LogType[LogType.Warning]).toBe("Warning");
	});

	describe("FlushToDisk", () => {
		it("posts everything buffered to the sidecar in one request, then forgets it", async () => {
			SilenceConsole();
			const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
			vi.stubGlobal("fetch", fetchMock);
			location.hostname = "localhost";
			Logger.LogInfo("one");
			Logger.LogInfo("two");

			Logger.FlushToDisk();
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
			expect(url).toBe("http://127.0.0.1:4790/log");
			expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "text/plain" } });
			expect(String(init.body).split("\n")).toHaveLength(2);
			expect(buffer()).toEqual([]);

			Logger.FlushToDisk(); // nothing left: no second request
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("does nothing off localhost", () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			buffer().push("stale");
			Logger.FlushToDisk();
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("puts the lines back when the sidecar cannot be reached", async () => {
			const log = SilenceConsole();
			vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("refused"))));
			location.hostname = "localhost";
			Logger.LogInfo("keep me");
			const line = buffer()[0]!;

			Logger.FlushToDisk();
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(buffer()).toEqual([line]);
			expect(log.warn).toHaveBeenCalled();
		});
	});

	describe("SetupAutoFlush", () => {
		it("flushes on a timer and when the page closes (main thread only)", () => {
			vi.useFakeTimers();
			SilenceConsole();
			const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
			vi.stubGlobal("fetch", fetchMock);
			location.hostname = "localhost";

			const listeners: Record<string, () => void> = {};
			(self as unknown as { addEventListener: (type: string, callback: () => void) => void; }).addEventListener = (type, callback) => { listeners[type] = callback; };

			Logger.SetupAutoFlush(1000);
			Logger.LogInfo("a");
			vi.advanceTimersByTime(1000);
			expect(fetchMock).toHaveBeenCalledTimes(1);

			Logger.LogInfo("b");
			listeners["beforeunload"]!();
			expect(fetchMock).toHaveBeenCalledTimes(2);

			delete (self as unknown as { addEventListener?: unknown; }).addEventListener;
		});

		it("works in a worker realm that has no addEventListener, and uses a 5 s default interval", () => {
			vi.useFakeTimers();
			const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
			vi.stubGlobal("fetch", fetchMock);
			SilenceConsole();
			location.hostname = "localhost";

			expect(() => Logger.SetupAutoFlush()).not.toThrow();
			Logger.LogInfo("x");
			vi.advanceTimersByTime(4999);
			expect(fetchMock).not.toHaveBeenCalled();
			vi.advanceTimersByTime(1);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	});
});
