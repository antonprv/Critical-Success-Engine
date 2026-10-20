// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { DefaultHiddenPatterns, DefaultSolution, MainProjectId, ParseSolution, SerializeSolution, ViewMode } from "../Source/SolutionFile";

describe(".uisolution", () => {
	it("starts as one project over the whole folder, in the solution view", () => {
		const data = DefaultSolution("Game");
		expect(data.Projects).toEqual([{ Id: MainProjectId, Name: "Game", Folder: "", Parent: "s" }]);
		expect(data.Mode).toBe(ViewMode.Solution);
		expect(data.HiddenPatterns).toEqual(DefaultHiddenPatterns);
		expect(data.Expanded[ViewMode.Solution]).toEqual(["p:main"]);
	});

	it("reads back what it writes, byte for byte", () => {
		const data = DefaultSolution("Game");
		data.Mode = ViewMode.Files;
		data.Projects.push({ Id: "project1", Name: "Tools", Folder: "Tools", Parent: "p:main" }, { Id: "project2", Name: "Docs", Folder: null, Parent: "s" });
		data.VirtualFolders.push({ Id: "folder1", Name: "Menus", Parent: "p:main" });
		data.Placements = { "z.txt": "v:folder1", "Content/UI/Menu.ui.json": "v:folder1", "a.txt": "d:Content" };
		data.Hidden = ["b.txt", "a.txt"];
		data.ShowHidden = true;
		data.Expanded = { [ViewMode.Files]: ["d:Content", "d:"], [ViewMode.Solution]: ["v:folder1"] };
		const text = SerializeSolution(data);
		const back = ParseSolution(text, "Game");
		expect(back.Projects).toEqual(data.Projects);
		expect(back.Placements).toEqual(data.Placements);
		expect(back.Mode).toBe(ViewMode.Files);
		expect(back.ShowHidden).toBe(true);
		expect(SerializeSolution(back)).toBe(text);
		expect(Object.keys(JSON.parse(text).Placements)).toEqual(["Content/UI/Menu.ui.json", "a.txt", "z.txt"]);
		expect(text.endsWith("\n")).toBe(true);
	});

	it("fills in what an older or hand-made file leaves out", () => {
		const data = ParseSolution("{}", "Game");
		expect(data).toEqual(DefaultSolution("Game"));
		const partial = ParseSolution(JSON.stringify({
			Projects: [{ Id: "extra", Parent: null }],
			Placements: { "Content\\a.txt": "d:Content\\UI" },
			Hidden: ["Content\\b.txt"],
			Expanded: { Files: ["d:"] },
			Unknown: 1,
		}), "Game");
		expect(partial.Projects.map((p) => p.Id)).toEqual([MainProjectId, "extra"]);
		expect(partial.Projects[1]).toEqual({ Id: "extra", Name: "extra", Folder: null, Parent: "s" });
		expect(partial.Placements).toEqual({ "Content/a.txt": "d:Content/UI" });
		expect(partial.Hidden).toEqual(["Content/b.txt"]);
		expect(partial.Expanded).toEqual({ Files: ["d:"], Solution: ["p:main"] });
		expect(ParseSolution(JSON.stringify({ Projects: [{ Id: "main", Name: "Renamed" }], VirtualFolders: [{ Id: "v", Parent: "s" }] }), "Game").VirtualFolders).toEqual([{ Id: "v", Name: "v", Parent: "s" }]);
	});

	it("refuses what can't be meant", () => {
		expect(() => ParseSolution("{", "Game")).toThrow(/not JSON/);
		expect(() => ParseSolution("[]", "Game")).toThrow(/not an object/);
		expect(() => ParseSolution(JSON.stringify({ Projects: [1] }), "Game")).toThrow(/project 0 is not an object/);
		expect(() => ParseSolution(JSON.stringify({ Projects: [{ Name: "x" }] }), "Game")).toThrow(/project 0 has no Id/);
		expect(() => ParseSolution(JSON.stringify({ VirtualFolders: [1] }), "Game")).toThrow(/virtual folder 0 is not an object/);
		expect(() => ParseSolution(JSON.stringify({ VirtualFolders: [{ Id: "v", Parent: "x" }] }), "Game")).toThrow(/must be a place/);
		expect(() => ParseSolution(JSON.stringify({ VirtualFolders: [{ Id: "v", Parent: 3 }] }), "Game")).toThrow(/must be a place/);
		expect(() => ParseSolution(JSON.stringify({ Projects: [{ Id: "a" }, { Id: "a" }] }), "Game")).toThrow(/two places/);
		expect(() => ParseSolution(JSON.stringify({ Placements: [] }), "Game")).toThrow(/Placements must be an object/);
		expect(() => ParseSolution(JSON.stringify({ Hidden: [1] }), "Game")).toThrow(/Hidden must be a list/);
		expect(() => ParseSolution(JSON.stringify({ HiddenPatterns: "x" }), "Game")).toThrow(/HiddenPatterns must be a list/);
	});
});
