// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { EmptySkin, GenerateSkinCss, ParseSkin, PartInfo, SkinClass, SkinPart, SkinParts, SkinState, type Skin } from "../../Source/Toolkit/Skins/Skin";

const sprite = { Image: "data:image/png;base64,AAAA", Slice: [8, 10, 8, 10] as [number, number, number, number] };

describe("skin parts", () => {
	it("every part has a label and a Normal selector, and states only where the controls have them", () => {
		expect(SkinParts.length).toBeGreaterThanOrEqual(30);
		for (const part of SkinParts) {
			expect(PartInfo[part].Label.length, part).toBeGreaterThan(0);
			expect(PartInfo[part].States[SkinState.Normal], part).toMatch(/^\./);
		}
		expect(Object.keys(PartInfo[SkinPart.Button].States)).toEqual([SkinState.Normal, SkinState.Hover, SkinState.Pressed, SkinState.Focused, SkinState.Disabled, SkinState.Default]);
		expect(Object.keys(PartInfo[SkinPart.CheckBox].States)).toEqual(expect.arrayContaining([SkinState.Checked, SkinState.Mixed]));
		expect(Object.keys(PartInfo[SkinPart.Window].States)).toEqual([SkinState.Normal, SkinState.Inactive]);
	});
});

describe("SkinClass", () => {
	it("turns the skin id into a safe CSS class", () => {
		expect(SkinClass({ ...EmptySkin(), Id: "My Skin!" })).toBe("win-skin--my-skin-");
	});
});

describe("GenerateSkinCss", () => {
	// The skin class twice: one class more specific than any theme rule, so a skin always wins.
	const scope = ".win-skin.win-skin--test.win-skin--test";

	it("an empty skin produces no CSS", () => {
		expect(GenerateSkinCss({ ...EmptySkin(), Id: "test" })).toBe("");
	});

	it("scopes every rule to the skin and puts states after Normal, so they win", () => {
		const skin: Skin = { Id: "test", Name: "Test", Parts: {
			[SkinPart.Button]: {
				[SkinState.Pressed]: { Background: "#400" },
				[SkinState.Normal]: { Background: "#800", TextColor: "#fff", Font: "Georgia", FontSize: 14, Padding: [2, 8, 2, 8], Radius: 6, MinHeight: 30, Shadow: "0 0 4px gold" },
			},
		} };
		const css = GenerateSkinCss(skin);
		const normal = css.indexOf(`${scope} .win-button {`);
		const pressed = css.indexOf(`${scope} .win-button.win-button--pressed {`);
		expect(normal).toBeGreaterThanOrEqual(0);
		expect(pressed).toBeGreaterThan(normal);
		expect(css).toContain("background: #800;");
		expect(css).toContain("color: #fff;");
		expect(css).toContain("font-family: Georgia;");
		expect(css).toContain("font-size: 14px;");
		expect(css).toContain("padding: 2px 8px 2px 8px;");
		expect(css).toContain("border-radius: 6px;");
		expect(css).toContain("min-height: 30px;");
		expect(css).toContain("box-shadow: 0 0 4px gold;");
	});

	it("a sprite becomes a 9-slice border image that replaces the theme's bevels; the drawn border defaults to the slice", () => {
		const css = GenerateSkinCss({ Id: "test", Name: "", Parts: { [SkinPart.Button]: { [SkinState.Hover]: { Sprite: sprite } } } });
		expect(css).toContain(`${scope} .win-button.win-button--hovered {`);
		expect(css).toContain('border-image: url("data:image/png;base64,AAAA") 8 10 8 10 fill / 8px 10px 8px 10px / 0 stretch;');
		expect(css).toContain("border-style: solid;");
		expect(css).toContain("border-width: 8px 10px 8px 10px;");
		expect(css).toContain("background: transparent;");
		expect(css).toContain("box-shadow: none;");
	});

	it("sprite options: a different drawn border, no fill, round/repeat; an explicit background keeps its colour", () => {
		const css = GenerateSkinCss({ Id: "test", Name: "", Parts: { [SkinPart.Window]: { [SkinState.Normal]: {
			Background: "#222",
			Sprite: { ...sprite, Border: [4, 4, 4, 4], Fill: false, Repeat: "round" },
		} } } });
		expect(css).toContain('border-image: url("data:image/png;base64,AAAA") 8 10 8 10 / 4px 4px 4px 4px / 0 round;');
		expect(css).toContain("background: #222;");
		expect(css).not.toContain("background: transparent;");
	});

	it("parts whose theme draws glyphs (check marks, title bar symbols) hide them when a sprite takes over", () => {
		const css = GenerateSkinCss({ Id: "test", Name: "", Parts: {
			[SkinPart.CheckBox]: { [SkinState.Checked]: { Sprite: sprite } },
			[SkinPart.Button]: { [SkinState.Normal]: { Sprite: sprite } },
		} });
		expect(css).toContain(`${scope} .win-checkbox__box[aria-checked="true"]::before, ${scope} .win-checkbox__box[aria-checked="true"]::after { display: none; }`);
		expect(css).not.toContain(".win-button::after");
	});

	it("global font, text colour and desktop background apply to the whole skinned area", () => {
		const css = GenerateSkinCss({ Id: "test", Name: "", Font: "Palatino", TextColor: "#eee", Parts: {} });
		expect(css).toBe(`${scope} { font-family: Palatino; color: #eee; }\n`);
		expect(GenerateSkinCss({ Id: "test", Name: "", TextColor: "#eee", Parts: {} })).toBe(`${scope} { color: #eee; }\n`);
		expect(GenerateSkinCss({ Id: "test", Name: "", Desktop: "#123", Parts: {} })).toBe(`${scope}, ${scope} .win-desktop { background: #123; }\n`);
	});

	it("values can't break out of their declaration or rule; image URLs can't break out of url()", () => {
		const css = GenerateSkinCss({ Id: "test", Name: "", Parts: { [SkinPart.Button]: { [SkinState.Normal]: {
			Background: "red; } body { display: none",
			Sprite: { Image: 'x") } body { display:none } .a { b: url("', Slice: [1, 1, 1, 1] },
		} } } });
		expect(css).not.toMatch(/body \{/);
		expect(css.split("{").length).toBe(css.split("}").length);
		expect(css).toContain("background: red  body  display: none;");
	});

	it("states a part doesn't have are ignored", () => {
		const css = GenerateSkinCss({ Id: "test", Name: "", Parts: { [SkinPart.Panel]: { [SkinState.Pressed]: { Background: "#123" } } } });
		expect(css).toBe("");
	});
});

describe("ParseSkin", () => {
	it("reads what Export writes, keeping only known parts, states and correctly typed fields", () => {
		const text = JSON.stringify({
			Id: "fantasy", Name: "Fantasy", Font: "Georgia", TextColor: 7, Desktop: "#000",
			Parts: {
				button: { normal: { Background: "#800", FontSize: 12, Padding: [1, 2, 3, 4], Bogus: true, Radius: "6" }, hover: { Sprite: { Image: "a.png", Slice: [1, 2, 3, 4], Border: [1, 1, 1, 1], Fill: false, Repeat: "round" } }, flying: {} },
				spaceship: { normal: {} },
				window: { inactive: { Sprite: { Image: "b.png", Slice: [1, 2] } } },
			},
		});
		const skin = ParseSkin(text);
		expect(skin).toEqual({
			Id: "fantasy", Name: "Fantasy", Font: "Georgia", Desktop: "#000",
			Parts: {
				button: { normal: { Background: "#800", FontSize: 12, Padding: [1, 2, 3, 4] }, hover: { Sprite: { Image: "a.png", Slice: [1, 2, 3, 4], Border: [1, 1, 1, 1], Fill: false, Repeat: "round" } } },
				window: { inactive: {} },
			},
		});
	});

	it("rejects anything that is not a skin", () => {
		expect(() => ParseSkin("not json")).toThrow(/Not a skin file/);
		expect(() => ParseSkin("[]")).toThrow(/Not a skin file/);
		expect(() => ParseSkin('{"Id": 1, "Name": "x", "Parts": {}}')).toThrow(/Not a skin file/);
		expect(() => ParseSkin('{"Id": "x", "Name": "x"}')).toThrow(/Not a skin file/);
		expect(ParseSkin('{"Id": "x", "Name": "x", "Parts": {"button": 5, "tab": {"hover": 3}}}').Parts).toEqual({ button: {}, tab: {} });
	});

	it("an unknown repeat mode falls back to stretch", () => {
		const skin = ParseSkin(JSON.stringify({ Id: "x", Name: "x", Parts: { button: { normal: { Sprite: { Image: "a", Slice: [1, 1, 1, 1], Repeat: "spiral" } } } } }));
		expect(skin.Parts.button!.normal!.Sprite!.Repeat).toBeUndefined();
	});
});

describe("skin presets", () => {
	it("two genre-styled examples, each a valid skin file that styles buttons in every state with drawn sprites", async () => {
		const { SkinPresets } = await import("../../Source/Toolkit/Skins/SkinPresets");
		expect(SkinPresets.map((p) => p.Name)).toEqual(["Celestial (bright adventure)", "Grimoire (dark fantasy RPG)"]);
		for (const preset of SkinPresets) {
			expect(ParseSkin(JSON.stringify(preset)), preset.Name).toEqual(preset);
			const button = preset.Parts[SkinPart.Button]!;
			for (const state of [SkinState.Normal, SkinState.Hover, SkinState.Pressed, SkinState.Disabled]) {
				expect(button[state]?.Sprite?.Image, `${preset.Name} ${state}`).toMatch(/^data:image\/svg\+xml,/);
			}
			expect(GenerateSkinCss(preset)).toContain(`.win-skin.${SkinClass(preset)}.${SkinClass(preset)} .win-window`);
		}
	});
});

describe("UseSkinStyle", () => {
	it("keeps one <style> in the document head in sync with the skin, and removes it on unmount", async () => {
		const { mount } = await import("@vue/test-utils");
		const { defineComponent, h, nextTick, ref } = await import("vue");
		const { UseSkinStyle } = await import("../../Source/Toolkit/Skins/UseSkinStyle");
		const skin = ref<Skin | null>({ Id: "live", Name: "", TextColor: "#abc", Parts: {} });
		const Probe = defineComponent({ setup() { UseSkinStyle(() => skin.value); return () => h("div"); } });
		const wrapper = mount(Probe);
		const style = () => document.head.querySelector("style[data-win-skin]");
		expect(style()?.textContent).toBe(".win-skin.win-skin--live.win-skin--live { color: #abc; }\n");
		skin.value = null;
		await nextTick();
		expect(style()?.textContent).toBe("");
		wrapper.unmount();
		expect(style()).toBeNull();
	});
});

describe("skins in layouts and the designer", () => {
	it("an empty style produces no rule", () => {
		expect(GenerateSkinCss({ Id: "test", Name: "", Parts: { [SkinPart.Window]: { [SkinState.Inactive]: {} } } })).toBe("");
	});

	it("a layout file can carry its skin; a broken skin makes the file invalid", async () => {
		const { NewLayout, ParseLayout, SerializeLayout } = await import("../../Source/Toolkit/Designer/Layout");
		const layout = NewLayout("Skinned");
		layout.Skin = { Id: "mine", Name: "Mine", TextColor: "#fff", Parts: { [SkinPart.Button]: { [SkinState.Hover]: { Background: "#f00" } } } };
		expect(ParseLayout(SerializeLayout(layout))).toEqual(layout);
		expect(() => ParseLayout(JSON.stringify({ ...layout, Skin: { Id: 1 } }))).toThrow(/Not a UI layout: Not a skin file/);
		expect(ParseLayout(SerializeLayout(NewLayout("Plain"))).Skin).toBeUndefined();
	});

	it("the designer sets, edits and clears skin styles per part and state, with undo", async () => {
		const { DesignerController } = await import("../../Source/Toolkit/Designer/DesignerController");
		const { SkinPresets } = await import("../../Source/Toolkit/Skins/SkinPresets");
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

	it("a layout's skin is applied to its view only; a theme provider can carry a skin too", async () => {
		const { mount } = await import("@vue/test-utils");
		const { nextTick } = await import("vue");
		const { NewLayout } = await import("../../Source/Toolkit/Designer/Layout");
		const { UiDocument } = await import("../../Source/Toolkit/Designer/UiDocument");
		const WinLayoutView = (await import("../../Source/Toolkit/Designer/WinLayoutView.vue")).default;
		const WinThemeProvider = (await import("../../Source/Toolkit/Components/WinThemeProvider.vue")).default;
		const { WinTheme } = await import("../../Source/Toolkit/Core/Themes");

		const layout = NewLayout("Skinned");
		layout.Skin = { Id: "mine", Name: "Mine", TextColor: "#fff", Parts: {} };
		const view = mount(WinLayoutView, { props: { document: new UiDocument(layout) } });
		expect(view.get(".win-layout").classes()).toEqual(expect.arrayContaining(["win-skin", "win-skin--mine"]));
		expect([...document.head.querySelectorAll("style[data-win-skin]")].some((s) => s.textContent!.includes(".win-skin.win-skin--mine.win-skin--mine"))).toBe(true);
		const plain = mount(WinLayoutView, { props: { document: new UiDocument(NewLayout("Plain")) } });
		expect(plain.get(".win-layout").classes()).not.toContain("win-skin");

		const provider = mount(WinThemeProvider, { props: { theme: WinTheme.XpBlue, skin: layout.Skin } });
		expect(provider.classes()).toEqual(expect.arrayContaining(["win-skin", "win-skin--mine"]));
		await provider.setProps({ skin: null } as never);
		await nextTick();
		expect(provider.classes()).not.toContain("win-skin");
		view.unmount();
		plain.unmount();
		provider.unmount();
	});
});
