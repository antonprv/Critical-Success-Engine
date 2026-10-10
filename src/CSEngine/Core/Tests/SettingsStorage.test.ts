// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDbBackend, MemoryBackend, SettingsStorage, type StorageBackend } from "../Source/Engine/Storage/SettingsStorage";

let databases = 0;
const Fresh = () => `test-${++databases}`;

describe("SettingsStorage (as Unity's PlayerPrefs): JSON values per key over the platform's storage", () => {
	it("after Open, reads and writes at once from its cache; a missing key gives the fallback", async () => {
		const storage = new SettingsStorage(new MemoryBackend());
		await storage.Open();
		expect(storage.Get("Settings", { MouseSensitivity: 1 })).toEqual({ MouseSensitivity: 1 });
		storage.Set("Settings", { MouseSensitivity: 2 });
		expect(storage.Get("Settings", {})).toEqual({ MouseSensitivity: 2 });
		expect([storage.Has("Settings"), storage.Keys]).toEqual([true, ["Settings"]]);
		storage.Delete("Settings");
		expect([storage.Has("Settings"), storage.Get("Settings", null)]).toEqual([false, null]);
	});

	it("keeps copies: changing a value after Set or Get doesn't change what is stored", async () => {
		const storage = new SettingsStorage(new MemoryBackend());
		await storage.Open();
		const value = { List: [1, 2] };
		storage.Set("Thing", value);
		value.List.push(3);
		(storage.Get("Thing", { List: [] as number[] })).List.push(4);
		expect(storage.Get("Thing", null)).toEqual({ List: [1, 2] });
	});

	it("IndexedDB: what is written survives a restart (a new storage on the same database); projects don't share", async () => {
		const name = Fresh();
		const first = new SettingsStorage(new IndexedDbBackend(name));
		await first.Open();
		expect(first.Backend).toBe("IndexedDB");
		first.Set("Input", { CoinHunt: { OnFoot: { Jump: { Keyboard: ["KeyJ", ""], Gamepad: "Pad:A" } } } });
		first.Set("Settings", { FieldOfView: 90 });
		first.Set("Gone", 1);
		first.Delete("Gone");
		await first.Flush();
		const again = new SettingsStorage(new IndexedDbBackend(name));
		await again.Open();
		expect(again.Get("Settings", {})).toEqual({ FieldOfView: 90 });
		expect(again.Get("Input", {})).toEqual({ CoinHunt: { OnFoot: { Jump: { Keyboard: ["KeyJ", ""], Gamepad: "Pad:A" } } } });
		expect(again.Has("Gone")).toBe(false);
		const other = new SettingsStorage(new IndexedDbBackend(Fresh()));
		await other.Open();
		expect(other.Keys).toEqual([]);
	});

	it("when the platform's storage can't be opened, it works in memory and says why", async () => {
		const broken: StorageBackend = { Name: "Broken", Load: () => Promise.reject(new Error("blocked by the browser")), Write: () => Promise.resolve(), Remove: () => Promise.resolve() };
		const storage = new SettingsStorage(broken);
		await storage.Open();
		expect([storage.Backend, storage.Problem]).toEqual(["Memory", "Broken: blocked by the browser"]);
		storage.Set("A", 1);
		await storage.Flush();
		expect(storage.Get("A", 0)).toBe(1);
		const failingWrites: StorageBackend = { Name: "Flaky", Load: async () => ({}), Write: () => Promise.reject(new Error("quota")), Remove: () => Promise.reject(new Error("quota")) };
		const flaky = new SettingsStorage(failingWrites);
		await flaky.Open();
		flaky.Set("A", 1);
		flaky.Delete("A");
		await flaky.Flush(); // a failed write doesn't stop the next ones or break the cache
		expect(flaky.Problem).toBe("Flaky: quota");
		expect(new IndexedDbBackend("x", undefined).Name).toBe("IndexedDB");
		const missing = new SettingsStorage(new IndexedDbBackend("x", null)); // a platform without IndexedDB
		await missing.Open();
		expect([missing.Backend, missing.Problem]).toEqual(["Memory", "IndexedDB: not available here"]);
	});

	it("exports everything as one readable JSON and imports it back (a player's own backup); a bad file changes nothing", async () => {
		const storage = new SettingsStorage(new MemoryBackend());
		await storage.Open();
		storage.Set("Settings", { InvertLook: true });
		const text = storage.Export();
		expect(JSON.parse(text)).toEqual({ Settings: { InvertLook: true } });
		expect(text).toContain("\n  "); // indented: a person can read it
		const other = new SettingsStorage(new MemoryBackend());
		await other.Open();
		other.Set("Old", 1);
		other.Import(text);
		expect([other.Get("Settings", {}), other.Has("Old")]).toEqual([{ InvertLook: true }, false]);
		expect(() => other.Import("{")).toThrow("Not a settings file: not JSON");
		expect(() => other.Import("[1]")).toThrow("Not a settings file: it must be an object of keys");
		expect(other.Get("Settings", {})).toEqual({ InvertLook: true });
	});
});

describe("SettingsStorage when IndexedDB fails", () => {
	/** A request that fails a moment later, as IndexedDB's do. */
	function Failing<T>(message: string): IDBRequest<T> {
		const request = { error: new Error(message) } as unknown as IDBRequest<T> & { onerror: () => void; };
		queueMicrotask(() => request.onerror());
		return request;
	}

	/** An IndexedDB whose database opens, but whose reads fail and whose write transactions fail. */
	function Flaky(failOpen: boolean): IDBFactory {
		const store = { getAllKeys: () => Failing("read failed"), getAll: () => Failing("read failed"), put: () => ({}), delete: () => ({}) };
		const database = {
			transaction: (_name: string, mode: string) => {
				const transaction = { error: new Error("write failed"), objectStore: () => store } as unknown as IDBTransaction & { onerror: () => void; };
				if (mode === "readwrite") queueMicrotask(() => transaction.onerror());
				return transaction;
			},
		};
		return {
			open: () => {
				const request = { result: database, error: new Error("opening was refused") } as unknown as IDBOpenDBRequest & { onsuccess: () => void; onerror: () => void; };
				queueMicrotask(() => (failOpen ? request.onerror() : request.onsuccess()));
				return request;
			},
		} as unknown as IDBFactory;
	}

	it("a database that won't open: memory, and why", async () => {
		const storage = new SettingsStorage(new IndexedDbBackend("x", Flaky(true)));
		await storage.Open();
		expect([storage.Backend, storage.Problem]).toEqual(["Memory", "IndexedDB: opening was refused"]);
	});

	it("reads that fail: memory, and why", async () => {
		const storage = new SettingsStorage(new IndexedDbBackend("x", Flaky(false)));
		await storage.Open();
		expect(storage.Problem).toBe("IndexedDB: read failed");
	});

	it("writes that fail: the cache keeps the value, and the problem is told", async () => {
		const backend = new IndexedDbBackend("x", Flaky(false));
		await expect(backend.Write("A", 1)).rejects.toThrow("write failed");
		await expect(backend.Remove("A")).rejects.toThrow("write failed");
	});
});
