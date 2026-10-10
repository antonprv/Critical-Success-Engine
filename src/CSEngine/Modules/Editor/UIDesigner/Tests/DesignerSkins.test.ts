// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { SkinPart, SkinState } from "@cse/ui";

describe("skins in the designer", () => {
	it("the designer sets, edits and clears skin styles per part and state, with undo", async () => {
		const { DesignerController } = await import("../Source/DesignerController");
		const { SkinPresets } = await import("@cse/ui");
		const designer = new DesignerController();
		expect(designer.SetSkinStyle(SkinPart.Button, SkinState.Hover, "Background", "#f00")).toBe(true);
		expect(designer.Layout.Skin).toEqual({ Id: "custom", Name: "Custom", Parts: { button: { hover: { Background: "#f00" } } } });
		expect(designer.SetSkinStyle(SkinPart.Button, SkinState.Hover, "Sprite", { Image: "a.png", Slice: [8, 8, 8, 8] })).toBe(true);
		expect(designer.SetSkinStyle(SkinPart.Button, SkinState.Hover, "Background", undefined)).toBe(true);
		expect(designer.Layout.Skin!.Parts.button!.hover).toEqual({ Sprite: { Image: "a.png", Slice: [8, 8, 8, 8] } });
		expect(designer.SetSkinStyle(SkinPart.Panel, SkinState.Pressed, "Background", "#000")).toBe(false); // no such state
		designer.ClearSkinState(SkinPart.Button, SkinState.Hover);
		expect(designer.Layout.Skin!.Parts).toEqual({});
		designer.ClearSkinState(SkinPart.Tab, SkinState.Hover); // nothing there: fine
		designer.Undo();
		expect(designer.Layout.Skin!.Parts.button!.hover!.Sprite).toBeDefined();

		designer.SetSkin(SkinPresets[1]!);
		expect(designer.Layout.Skin!.Id).toBe("grimoire");
		expect(designer.Layout.Skin).not.toBe(SkinPresets[1]); // a copy: editing never changes the preset
		designer.SetSkinStyle(SkinPart.Button, SkinState.Normal, "TextColor", "#fff");
		expect(SkinPresets[1]!.Parts.button!.normal!.TextColor).toBe("#f0dfb4");
		designer.SetSkin(null);
		expect(designer.Layout.Skin).toBeUndefined();
	});
});
