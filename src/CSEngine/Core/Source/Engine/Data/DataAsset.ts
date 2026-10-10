// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * Data assets, as Unity's ScriptableObjects but in JSON files with the .csedata extension: a class in code says the
 * type, its fields and their defaults; a file gives the values. The files are not bundled into the code - they sit
 * next to the game (data/<Id>.csedata), so they can be changed without rebuilding.
 *
 *   class CoinHuntRules extends DataAsset { static readonly AssetType = "CoinHuntRules"; TimeLimit = 60; }
 *   { "FileVersion": 1, "Type": "CoinHuntRules", "Values": { "TimeLimit": 45 } }
 *   const rules = this.Engine.Data.Get(CoinHuntRules, "CoinHuntRules");
 */

export const DataAssetFileVersion = 1;

/** The base of a project's data types: public fields with their defaults, and a static AssetType. */
export abstract class DataAsset {}

export interface DataAssetClass<T extends DataAsset> {
	new(): T;
	readonly AssetType: string;
}

const IsObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** What a field's default says its values must be. */
function KindOf(value: unknown): string {
	if (Array.isArray(value)) return "a list";
	if (typeof value === "boolean") return "true or false";
	if (typeof value === "object") return "an object";
	return `a ${typeof value}`;
}

/** Reads a .csedata file into an instance of the class; throws "<file>: <what is wrong>". */
export function ParseDataAsset<T extends DataAsset>(Type: DataAssetClass<T>, text: string, file = "data asset"): T {
	const fail = (reason: string): never => { throw new Error(`${file}: ${reason}`); };
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return fail("not JSON");
	}
	if (!IsObject(raw) || typeof raw["Type"] !== "string" || !IsObject(raw["Values"])) return fail("not a data asset (it needs Type and Values)");
	const version = typeof raw["FileVersion"] === "number" ? raw["FileVersion"] : DataAssetFileVersion;
	if (version > DataAssetFileVersion) fail(`FileVersion ${version} is newer than this engine understands (${DataAssetFileVersion})`);
	if (raw["Type"] !== Type.AssetType) fail(`it is a "${raw["Type"]}", not a "${Type.AssetType}"`);

	const asset = new Type();
	const fields = asset as unknown as Record<string, unknown>;
	for (const [name, value] of Object.entries(raw["Values"])) {
		if (!Object.hasOwn(fields, name)) fail(`${Type.AssetType} has no field "${name}"`);
		const kind = KindOf(fields[name]);
		if (KindOf(value) !== kind || value === null) fail(`"${name}" must be ${kind}`);
		fields[name] = value;
	}
	return asset;
}

/** The asset as a file: every field, readable. */
export function SerializeDataAsset(asset: DataAsset): string {
	const type = (asset.constructor as DataAssetClass<DataAsset>).AssetType;
	return `${JSON.stringify({ FileVersion: DataAssetFileVersion, Type: type, Values: { ...asset } }, null, 2)}\n`;
}

/** A project's data assets by Id: fetched once at start (Preload), then given typed and at once. */
export class DataAssets {
	private readonly _texts = new Map<string, string>();
	private readonly _assets = new Map<string, DataAsset>();

	/** urls: each asset's file by Id; fetchText reads one (fetch in the browser). */
	public constructor(private readonly _urls: Record<string, string>, private readonly _fetchText: (url: string) => Promise<string>) {}

	/** Assets whose texts are at hand (a host that has them, tests): no fetching. */
	public static Loaded(files: Record<string, { Url: string; Text: string; }>): DataAssets {
		const texts = new Map(Object.values(files).map((file) => [file.Url, file.Text]));
		const data = new DataAssets(Object.fromEntries(Object.entries(files).map(([id, file]) => [id, file.Url])), async (url) => texts.get(url)!);
		for (const [id, file] of Object.entries(files)) data._texts.set(id, file.Text);
		return data;
	}

	public get Ids(): string[] { return Object.keys(this._urls); }
	public Has(id: string): boolean { return id in this._urls; }

	/** Fetches every file of the project; one that can't be read fails, naming it. */
	public async Preload(): Promise<void> {
		await Promise.all(Object.entries(this._urls).map(async ([id, url]) => {
			try {
				this._texts.set(id, await this._fetchText(url));
			} catch (error) {
				throw new Error(`Data asset "${id}" (${url}): ${(error as Error).message}`);
			}
		}));
	}

	/** The asset by Id, or the class's defaults when the project has no such asset (a component that works without it). */
	public GetOrDefault<T extends DataAsset>(Type: DataAssetClass<T>, id: string): T {
		return this.Has(id) ? this.Get(Type, id) : new Type();
	}

	/** The asset by Id as an instance of its class (read and checked once, then shared). */
	public Get<T extends DataAsset>(Type: DataAssetClass<T>, id: string): T {
		const made = this._assets.get(id);
		if (made) return made as T;
		if (!this.Has(id)) throw new Error(`The project has no data asset "${id}"`);
		const text = this._texts.get(id);
		if (text === undefined) throw new Error(`Data asset "${id}" is not loaded yet (Preload first)`);
		const asset = ParseDataAsset(Type, text, this._urls[id]);
		this._assets.set(id, asset);
		return asset;
	}
}
