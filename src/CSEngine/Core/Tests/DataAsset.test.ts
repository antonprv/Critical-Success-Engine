// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { DataAsset, DataAssets, ParseDataAsset, SerializeDataAsset } from "../Source/Engine/Data/DataAsset";

/** A project's own data type (as a ScriptableObject): its fields and their defaults. */
class Rules extends DataAsset {
	public static readonly AssetType = "Rules";
	public TimeLimit = 60;
	public Choices = [30, 60, 90];
	public Title = "Coin Hunt";
	public Hard = false;
	public Colors = { Coin: [1, 0.8, 0] };
}

const File = (values: Record<string, unknown>, type = "Rules") => JSON.stringify({ FileVersion: 1, Type: type, Values: values });

describe(".csedata files (data assets, as Unity's ScriptableObjects, in JSON)", () => {
	it("fill the class's fields; what a file leaves out keeps the class's default", () => {
		const rules = ParseDataAsset(Rules, File({ TimeLimit: 45, Hard: true }), "Rules.csedata");
		expect(rules).toBeInstanceOf(Rules);
		expect([rules.TimeLimit, rules.Hard, rules.Title, rules.Choices]).toEqual([45, true, "Coin Hunt", [30, 60, 90]]);
		expect(ParseDataAsset(Rules, File({ Choices: [10], Colors: { Coin: [0, 0, 1] } })).Colors).toEqual({ Coin: [0, 0, 1] });
	});

	it("say what is wrong, naming the file and the field", () => {
		const reason = (text: string) => { try { ParseDataAsset(Rules, text, "Content/Data/Rules.csedata"); return "parsed"; } catch (e) { return (e as Error).message; } };
		expect(reason("{")).toBe("Content/Data/Rules.csedata: not JSON");
		expect(reason("[]")).toBe("Content/Data/Rules.csedata: not a data asset (it needs Type and Values)");
		expect(reason(JSON.stringify({ Type: "Rules" }))).toBe("Content/Data/Rules.csedata: not a data asset (it needs Type and Values)");
		expect(reason(File({}, "Camera"))).toBe('Content/Data/Rules.csedata: it is a "Camera", not a "Rules"');
		expect(reason(File({ Speed: 3 }))).toBe('Content/Data/Rules.csedata: Rules has no field "Speed"');
		expect(reason(File({ TimeLimit: "60" }))).toBe('Content/Data/Rules.csedata: "TimeLimit" must be a number');
		expect(reason(File({ Choices: { a: 1 } }))).toBe('Content/Data/Rules.csedata: "Choices" must be a list');
		expect(reason(File({ Colors: [1] }))).toBe('Content/Data/Rules.csedata: "Colors" must be an object');
		expect(reason(File({ Hard: 1 }))).toBe('Content/Data/Rules.csedata: "Hard" must be true or false');
		expect(reason(JSON.stringify({ FileVersion: 9, Type: "Rules", Values: {} }))).toBe("Content/Data/Rules.csedata: FileVersion 9 is newer than this engine understands (1)");
		expect(() => ParseDataAsset(Rules, "{")).toThrow("data asset: not JSON"); // no file name known
	});

	it("serialize to the same readable file (every field)", () => {
		const text = SerializeDataAsset(new Rules());
		expect(JSON.parse(text)).toEqual({ FileVersion: 1, Type: "Rules", Values: { TimeLimit: 60, Choices: [30, 60, 90], Title: "Coin Hunt", Hard: false, Colors: { Coin: [1, 0.8, 0] } } });
		expect(ParseDataAsset(Rules, text)).toEqual(new Rules());
	});
});

describe("DataAssets: a project's data, loaded at start and read at once", () => {
	it("preloads every listed file, then gives typed assets by Id (made once, shared)", async () => {
		const fetchText = vi.fn(async (url: string) => (url === "data/CoinHuntRules.csedata" ? File({ TimeLimit: 30 }) : File({}, "Camera")));
		const data = new DataAssets({ CoinHuntRules: "data/CoinHuntRules.csedata", TopDownCamera: "data/TopDownCamera.csedata" }, fetchText);
		await data.Preload();
		expect(fetchText).toHaveBeenCalledTimes(2);
		expect(data.Ids).toEqual(["CoinHuntRules", "TopDownCamera"]);
		const rules = data.Get(Rules, "CoinHuntRules");
		expect(rules.TimeLimit).toBe(30);
		expect(data.Get(Rules, "CoinHuntRules")).toBe(rules);
		expect(() => data.Get(Rules, "TopDownCamera")).toThrow('data/TopDownCamera.csedata: it is a "Camera", not a "Rules"');
		expect(() => data.Get(Rules, "Nope")).toThrow('The project has no data asset "Nope"');
		expect(data.Has("CoinHuntRules")).toBe(true);
	});

	it("a file that can't be fetched fails the preload, naming it; a project without data has nothing to fetch", async () => {
		const data = new DataAssets({ Missing: "data/Missing.csedata" }, async () => { throw new Error("404"); });
		await expect(data.Preload()).rejects.toThrow("Data asset \"Missing\" (data/Missing.csedata): 404");
		const empty = new DataAssets({}, vi.fn());
		await empty.Preload();
		expect(empty.Ids).toEqual([]);
		expect(() => empty.Get(Rules, "X")).toThrow('The project has no data asset "X"');
		const notLoaded = new DataAssets({ A: "a" }, vi.fn());
		expect(() => notLoaded.Get(Rules, "A")).toThrow('Data asset "A" is not loaded yet (Preload first)');
	});
});

describe("DataAssets: given as text, and with the class's defaults when the project has no such file", () => {
	it("Loaded takes texts at hand (no fetching); GetOrDefault falls back to the class's defaults", () => {
		const data = DataAssets.Loaded({ Rules: { Url: "data/Rules.csedata", Text: File({ TimeLimit: 20 }) } });
		expect(data.Get(Rules, "Rules").TimeLimit).toBe(20);
		expect(data.GetOrDefault(Rules, "Rules").TimeLimit).toBe(20);
		expect(data.GetOrDefault(Rules, "Missing")).toEqual(new Rules());
	});

	it("Preload on assets given as text takes the same texts again", async () => {
		const data = DataAssets.Loaded({ Rules: { Url: "data/Rules.csedata", Text: File({ TimeLimit: 25 }) } });
		await data.Preload();
		expect(data.Get(Rules, "Rules").TimeLimit).toBe(25);
	});
});
