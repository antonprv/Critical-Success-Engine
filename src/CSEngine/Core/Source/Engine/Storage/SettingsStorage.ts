// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * Where a project keeps what the player chose (settings, rebound controls), as Unity's PlayerPrefs: JSON values by key,
 * over the platform's storage. After Open, reads and writes are immediate (a cache); writes reach the platform in the
 * background, in order. In the browser that is IndexedDB (big, works in workers, no host headers needed); when it
 * can't be opened the storage works in memory and says why. Export/Import move everything as one readable JSON.
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue; };

/** A platform's storage: every entry at start, then single writes. */
export interface StorageBackend {
	readonly Name: string;
	Load(): Promise<Record<string, JsonValue>>;
	Write(key: string, value: JsonValue): Promise<void>;
	Remove(key: string): Promise<void>;
}

/** Nothing outside this process: tests, and the fallback. */
export class MemoryBackend implements StorageBackend {
	public readonly Name = "Memory";
	public async Load(): Promise<Record<string, JsonValue>> { return {}; }
	public async Write(): Promise<void> { /* kept in the cache */ }
	public async Remove(): Promise<void> { /* kept in the cache */ }
}

const Store = "entries";

/** The browser's IndexedDB: one database per project, an entry per key holding its JSON. */
export class IndexedDbBackend implements StorageBackend {
	public readonly Name = "IndexedDB";
	private _database: Promise<IDBDatabase> | null = null;

	/** factory: the platform's indexedDB (null where there is none). */
	public constructor(private readonly _databaseName: string, private readonly _factory: IDBFactory | null = globalThis.indexedDB ?? null) {}

	public async Load(): Promise<Record<string, JsonValue>> {
		const database = await this.Database();
		const transaction = database.transaction(Store, "readonly");
		const [keys, values] = await Promise.all([Request(transaction.objectStore(Store).getAllKeys()), Request(transaction.objectStore(Store).getAll())]);
		return Object.fromEntries(keys.map((key, i) => [String(key), values[i] as JsonValue]));
	}

	public async Write(key: string, value: JsonValue): Promise<void> {
		await this.Change((store) => store.put(value, key));
	}

	public async Remove(key: string): Promise<void> {
		await this.Change((store) => store.delete(key));
	}

	private async Change(change: (store: IDBObjectStore) => IDBRequest): Promise<void> {
		const transaction = (await this.Database()).transaction(Store, "readwrite");
		change(transaction.objectStore(Store));
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
	}

	private Database(): Promise<IDBDatabase> {
		return this._database ??= new Promise((resolve, reject) => {
			if (!this._factory) {
				reject(new Error("not available here"));
				return;
			}
			const open = this._factory.open(this._databaseName, 1);
			open.onupgradeneeded = () => open.result.createObjectStore(Store);
			open.onsuccess = () => resolve(open.result);
			open.onerror = () => reject(open.error);
		});
	}
}

function Request<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

const Copy = <T extends JsonValue>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class SettingsStorage {
	private readonly _cache = new Map<string, JsonValue>();
	private _backend: StorageBackend;
	private _writes: Promise<void> = Promise.resolve();
	private _problem: string | null = null;

	public constructor(backend: StorageBackend) {
		this._backend = backend;
	}

	/** The storage in use ("IndexedDB", or "Memory" when the platform's couldn't be used). */
	public get Backend(): string { return this._backend.Name; }
	/** Why the platform's storage isn't used or a write failed (null when all is well). */
	public get Problem(): string | null { return this._problem; }
	public get Keys(): string[] { return [...this._cache.keys()]; }

	/** Loads everything kept; when the platform's storage can't be opened, carries on in memory. */
	public async Open(): Promise<void> {
		try {
			for (const [key, value] of Object.entries(await this._backend.Load())) this._cache.set(key, value);
		} catch (error) {
			this._problem = `${this._backend.Name}: ${(error as Error).message}`;
			this._backend = new MemoryBackend();
		}
	}

	public Has(key: string): boolean { return this._cache.has(key); }

	public Get<T extends JsonValue>(key: string, fallback: T): T {
		return this._cache.has(key) ? Copy(this._cache.get(key) as T) : fallback;
	}

	public Set(key: string, value: JsonValue): void {
		const copy = Copy(value);
		this._cache.set(key, copy);
		this.Queue((backend) => backend.Write(key, copy));
	}

	public Delete(key: string): void {
		this._cache.delete(key);
		this.Queue((backend) => backend.Remove(key));
	}

	/** Waits until every write so far has reached the platform's storage. */
	public Flush(): Promise<void> { return this._writes; }

	/** Everything, as one readable JSON (a player's own backup). */
	public Export(): string {
		return JSON.stringify(Object.fromEntries(this._cache), null, 2);
	}

	/** Replaces everything with an exported file's contents; a file that isn't one changes nothing. */
	public Import(text: string): void {
		let raw: unknown;
		try {
			raw = JSON.parse(text);
		} catch {
			throw new Error("Not a settings file: not JSON");
		}
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Not a settings file: it must be an object of keys");
		for (const key of this.Keys) this.Delete(key);
		for (const [key, value] of Object.entries(raw)) this.Set(key, value as JsonValue);
	}

	private Queue(write: (backend: StorageBackend) => Promise<void>): void {
		const backend = this._backend;
		this._writes = this._writes.then(() => write(backend)).catch((error: Error) => {
			this._problem = `${backend.Name}: ${error.message}`;
		});
	}
}
