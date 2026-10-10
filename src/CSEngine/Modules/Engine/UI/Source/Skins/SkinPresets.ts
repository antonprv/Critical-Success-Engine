// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Two example skins showing how far a skin can take the toolkit. Every sprite is drawn here as SVG.

import { SkinPart, SkinState, type Box4, type PartStyle, type Skin, type SkinSprite } from "./Skin";

const Svg = (size: number, body: string): string =>
	`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`)}`;

interface PanelLook {
	Top: string;
	Bottom: string;
	Stroke: string;
	Radius: number;
	/** A second, inner border line (ornate frames). */
	Inner?: string;
	/** Small diamonds in the corners. */
	Corners?: string;
}

/** A 48 px rounded panel with a vertical gradient and a border: cut at 16 px it stretches to any size. */
function Panel(look: PanelLook): string {
	const id = `g${Math.abs([...look.Top + look.Bottom + look.Stroke].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}`;
	const inner = look.Inner ? `<rect x="5" y="5" width="38" height="38" rx="${Math.max(0, look.Radius - 4)}" fill="none" stroke="${look.Inner}" stroke-width="1"/>` : "";
	const corners = look.Corners ? [[4, 4], [44, 4], [4, 44], [44, 44]].map(([x, y]) => `<path d="M${x} ${y! - 3}L${x! + 3} ${y}L${x} ${y! + 3}L${x! - 3} ${y}Z" fill="${look.Corners}"/>`).join("") : "";
	return Svg(48, `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${look.Top}"/><stop offset="1" stop-color="${look.Bottom}"/></linearGradient></defs>`
		+ `<rect x="1" y="1" width="46" height="46" rx="${look.Radius}" fill="url(#${id})" stroke="${look.Stroke}" stroke-width="2"/>${inner}${corners}`);
}

/** A 24 px box with an optional mark drawn in it (check boxes). */
function Box(fill: string, stroke: string, radius: number, mark = ""): string {
	return Svg(24, `<rect x="1" y="1" width="22" height="22" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${mark}`);
}

const Sprite = (image: string, slice: number, border: number): SkinSprite => ({ Image: image, Slice: [slice, slice, slice, slice], Border: [border, border, border, border] });
const Pad = (vertical: number, horizontal: number): Box4 => [vertical, horizontal, vertical, horizontal];

//#region Celestial: bright adventure

const CelestialButton = (top: string, bottom: string, stroke: string, extra: PartStyle = {}): PartStyle => ({
	Sprite: Sprite(Panel({ Top: top, Bottom: bottom, Stroke: stroke, Radius: 16 }), 16, 10),
	TextColor: "#3b4256", MinHeight: 30, Padding: Pad(0, 12), ...extra,
});

const Celestial: Skin = {
	Id: "celestial",
	Name: "Celestial (bright adventure)",
	Font: "\"Trebuchet MS\", Tahoma, sans-serif",
	TextColor: "#3b4256",
	Desktop: "radial-gradient(circle at 50% 25%, #e6f2ff, #8fb6e6)",
	Parts: {
		[SkinPart.Window]: { [SkinState.Normal]: { Sprite: Sprite(Panel({ Top: "#fbf7ec", Bottom: "#efe3c8", Stroke: "#c9a86a", Radius: 14, Inner: "#e8d5a8" }), 16, 12), Shadow: "0 10px 28px rgba(40, 60, 110, 0.35)" } },
		[SkinPart.TitleBar]: {
			[SkinState.Normal]: { Background: "linear-gradient(90deg, #3a4a6b, #56688f)", TextColor: "#f6e7c1", FontSize: 13, Radius: 8 },
			[SkinState.Inactive]: { Background: "linear-gradient(90deg, #7d8aa6, #98a4be)", TextColor: "#eef0f5" },
		},
		[SkinPart.TitleButton]: { [SkinState.Normal]: { Sprite: Sprite(Box("#f6e7c1", "#c9a86a", 11), 8, 6) } },
		[SkinPart.CloseButton]: { [SkinState.Normal]: { Sprite: Sprite(Box("#f3c9a8", "#c9785a", 11, '<path d="M8 8l8 8M16 8l-8 8" stroke="#8a3f2a" stroke-width="2.5" stroke-linecap="round"/>'), 8, 6) } },
		[SkinPart.Panel]: { [SkinState.Normal]: { Background: "transparent" } },
		[SkinPart.Button]: {
			[SkinState.Normal]: CelestialButton("#fffaf0", "#eadbb8", "#b8955a"),
			[SkinState.Hover]: CelestialButton("#fffdf6", "#f3e6c4", "#e2b768", { Shadow: "0 0 10px rgba(255, 214, 120, 0.85)" }),
			[SkinState.Pressed]: CelestialButton("#e8d7b0", "#d9c49a", "#a8854a"),
			[SkinState.Disabled]: CelestialButton("#e6e1d6", "#d9d3c6", "#b9b2a3", { TextColor: "#a19b8f" }),
			[SkinState.Focused]: { Shadow: "0 0 0 2px #f2c66d" },
		},
		[SkinPart.CheckBox]: {
			[SkinState.Normal]: { Sprite: Sprite(Box("#fffaf0", "#b8955a", 7), 8, 4), Radius: 4 },
			[SkinState.Checked]: { Sprite: Sprite(Box("#fffaf0", "#b8955a", 7, '<path d="M6 12l4 4 8-9" fill="none" stroke="#d4a43a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'), 8, 4) },
		},
		[SkinPart.TextBox]: { [SkinState.Normal]: { Sprite: Sprite(Panel({ Top: "#ffffff", Bottom: "#fbf6ea", Stroke: "#d8c49a", Radius: 8 }), 12, 5), TextColor: "#3b4256" } },
		[SkinPart.ProgressTrack]: { [SkinState.Normal]: { Background: "#e9e2d0", Radius: 8, Shadow: "inset 0 1px 3px rgba(0, 0, 0, 0.2)" } },
		[SkinPart.ProgressFill]: { [SkinState.Normal]: { Background: "linear-gradient(90deg, #f6d27a, #e9a93b)", Radius: 6 } },
		[SkinPart.StatusBar]: { [SkinState.Normal]: { Background: "rgba(255, 255, 255, 0.5)", Radius: 6 } },
		[SkinPart.Label]: { [SkinState.Normal]: { TextColor: "#4a5470" } },
	},
};

//#endregion

//#region Grimoire: dark fantasy RPG

const Gold = "#c8a25a";
const GrimoireButton = (top: string, bottom: string, stroke: string, extra: PartStyle = {}): PartStyle => ({
	Sprite: Sprite(Panel({ Top: top, Bottom: bottom, Stroke: stroke, Radius: 3, Inner: "rgba(240, 210, 140, 0.35)" }), 12, 8),
	TextColor: "#f0dfb4", MinHeight: 30, Padding: Pad(0, 14), ...extra,
});

const Grimoire: Skin = {
	Id: "grimoire",
	Name: "Grimoire (dark fantasy RPG)",
	Font: "Georgia, \"Times New Roman\", serif",
	TextColor: "#e6d6b0",
	Desktop: "radial-gradient(circle at 50% 40%, #3a2c22, #0d0907)",
	Parts: {
		[SkinPart.Window]: { [SkinState.Normal]: { Sprite: Sprite(Panel({ Top: "#2c2119", Bottom: "#16100c", Stroke: "#8a6a3a", Radius: 4, Inner: Gold, Corners: Gold }), 16, 14), Shadow: "0 12px 30px rgba(0, 0, 0, 0.7)" } },
		[SkinPart.TitleBar]: {
			[SkinState.Normal]: { Background: "linear-gradient(180deg, #3b2a1d, #22170f)", TextColor: "#e8d3a0", Font: "Georgia, serif", FontSize: 14 },
			[SkinState.Inactive]: { Background: "#1c140f", TextColor: "#8f7a58" },
		},
		[SkinPart.TitleButton]: { [SkinState.Normal]: { Sprite: Sprite(Box("#2a1d15", Gold, 2), 8, 5) } },
		[SkinPart.CloseButton]: { [SkinState.Normal]: { Sprite: Sprite(Box("#5a1f18", Gold, 2, `<path d="M8 8l8 8M16 8l-8 8" stroke="${Gold}" stroke-width="2"/>`), 8, 5) } },
		[SkinPart.Panel]: { [SkinState.Normal]: { Background: "transparent", TextColor: "#e6d6b0" } },
		[SkinPart.Button]: {
			[SkinState.Normal]: GrimoireButton("#5a1f18", "#33100b", "#a8823f"),
			[SkinState.Hover]: GrimoireButton("#7a2a1f", "#45160f", "#e0b860", { Shadow: "0 0 8px rgba(224, 184, 96, 0.6)" }),
			[SkinState.Pressed]: GrimoireButton("#33100b", "#4a1812", "#8a6a3a"),
			[SkinState.Disabled]: GrimoireButton("#3a302a", "#26201b", "#5c4c38", { TextColor: "#7d6f5c" }),
			[SkinState.Focused]: { Shadow: "0 0 0 1px #e0b860" },
		},
		[SkinPart.CheckBox]: {
			[SkinState.Normal]: { Sprite: Sprite(Box("#140e0a", Gold, 2), 8, 4) },
			[SkinState.Checked]: { Sprite: Sprite(Box("#140e0a", Gold, 2, `<path d="M7 7l10 10M17 7L7 17" stroke="#e0b860" stroke-width="3" stroke-linecap="round"/>`), 8, 4) },
		},
		[SkinPart.TextBox]: { [SkinState.Normal]: { Sprite: Sprite(Panel({ Top: "#120d0a", Bottom: "#1a130e", Stroke: "#6e5530", Radius: 2 }), 8, 4), TextColor: "#e8d3a0" } },
		[SkinPart.ProgressTrack]: { [SkinState.Normal]: { Background: "#120d0a", Shadow: `inset 0 0 0 1px ${Gold}` } },
		[SkinPart.ProgressFill]: { [SkinState.Normal]: { Background: "linear-gradient(180deg, #d14b3b, #7a1d14)" } },
		[SkinPart.StatusBar]: { [SkinState.Normal]: { Background: "rgba(0, 0, 0, 0.35)", TextColor: "#cdb78a" } },
		[SkinPart.Label]: { [SkinState.Normal]: { TextColor: "#d9c49a" } },
	},
};

//#endregion

export const SkinPresets: readonly Skin[] = [Celestial, Grimoire];
