// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** States a part can be styled in. The value is what skin files store. */
export const enum SkinState {
	Normal = "normal",
	Hover = "hover",
	Pressed = "pressed",
	Focused = "focused",
	Disabled = "disabled",
	Checked = "checked",
	Mixed = "mixed",
	Selected = "selected",
	Default = "default",
	Inactive = "inactive",
}

/** Every skinnable piece of the toolkit. */
export const enum SkinPart {
	Desktop = "desktop",
	Window = "window",
	TitleBar = "titlebar",
	TitleButton = "title-button",
	CloseButton = "close-button",
	Panel = "panel",
	Label = "label",
	Button = "button",
	CheckBox = "checkbox",
	Radio = "radio",
	TextBox = "textbox",
	SpinnerButton = "spinner-button",
	ComboBox = "combobox",
	ComboList = "combo-list",
	ProgressTrack = "progress-track",
	ProgressFill = "progress-fill",
	SliderTrack = "slider-track",
	SliderThumb = "slider-thumb",
	Tab = "tab",
	TabPage = "tab-page",
	MenuBar = "menubar",
	Menu = "menu",
	MenuItem = "menu-item",
	ListView = "listview",
	ListRow = "list-row",
	Tree = "tree",
	ScrollTrack = "scroll-track",
	ScrollThumb = "scroll-thumb",
	ToolbarButton = "toolbar-button",
	StatusBar = "statusbar",
	Taskbar = "taskbar",
	TaskButton = "task-button",
	Tooltip = "tooltip",
	GroupBox = "groupbox",
	MessageBox = "messagebox",
}

export type Box4 = [top: number, right: number, bottom: number, left: number];

/** A 9-slice sprite: corners keep their size, edges and the centre stretch (or tile) to fit. */
export interface SkinSprite {
	/** Any image URL; uploaded images are stored as data URLs. */
	Image: string;
	/** Where to cut the image, in image pixels. */
	Slice: Box4;
	/** How thick the drawn border is, in screen pixels; defaults to Slice. */
	Border?: Box4;
	/** Draw the centre of the image too (default true). */
	Fill?: boolean;
	Repeat?: "stretch" | "round" | "repeat";
}

export interface PartStyle {
	Sprite?: SkinSprite;
	Background?: string;
	TextColor?: string;
	Font?: string;
	FontSize?: number;
	Padding?: Box4;
	Radius?: number;
	MinHeight?: number;
	Shadow?: string;
}

export type SkinParts = Partial<Record<SkinPart, Partial<Record<SkinState, PartStyle>>>>;

/** A look applied on top of a theme: per part and state, any of sprite, colours, font, spacing. */
export interface Skin {
	Id: string;
	Name: string;
	Font?: string;
	TextColor?: string;
	/** Background of the skinned area (and of a desktop inside it). */
	Desktop?: string;
	Parts: SkinParts;
}

interface PartDefinition {
	Label: string;
	/** Selector per state; Normal is the part itself. */
	States: Partial<Record<SkinState, string>>;
	/** The theme draws symbols with ::before/::after (check marks, title bar glyphs): a sprite replaces them. */
	Glyphs?: boolean;
}

const Part = (Label: string, States: Partial<Record<SkinState, string>>, Glyphs = false): PartDefinition => ({ Label, States, Glyphs });

export const PartInfo: Record<SkinPart, PartDefinition> = {
	[SkinPart.Desktop]: Part("Desktop", { [SkinState.Normal]: ".win-desktop" }),
	[SkinPart.Window]: Part("Window frame", { [SkinState.Normal]: ".win-window", [SkinState.Inactive]: ".win-window.win-window--inactive" }),
	[SkinPart.TitleBar]: Part("Title bar", { [SkinState.Normal]: ".win-window__titlebar", [SkinState.Inactive]: ".win-window--inactive .win-window__titlebar" }),
	[SkinPart.TitleButton]: Part("Title bar button", { [SkinState.Normal]: ".win-window__button", [SkinState.Hover]: ".win-window__button:hover", [SkinState.Pressed]: ".win-window__button:active", [SkinState.Disabled]: ".win-window__button:disabled" }, true),
	[SkinPart.CloseButton]: Part("Close button", { [SkinState.Normal]: ".win-window__button.win-window__button--close", [SkinState.Hover]: ".win-window__button.win-window__button--close:hover", [SkinState.Pressed]: ".win-window__button.win-window__button--close:active" }, true),
	[SkinPart.Panel]: Part("Window body", { [SkinState.Normal]: ".win-window__body" }),
	[SkinPart.Label]: Part("Label", { [SkinState.Normal]: ".win-layout__label" }),
	[SkinPart.Button]: Part("Button", {
		[SkinState.Normal]: ".win-button", [SkinState.Hover]: ".win-button.win-button--hovered", [SkinState.Pressed]: ".win-button.win-button--pressed",
		[SkinState.Focused]: ".win-button.win-button--focused", [SkinState.Disabled]: ".win-button:disabled", [SkinState.Default]: ".win-button.win-button--default",
	}),
	[SkinPart.CheckBox]: Part("Check box", {
		[SkinState.Normal]: ".win-checkbox__box", [SkinState.Checked]: '.win-checkbox__box[aria-checked="true"]', [SkinState.Mixed]: '.win-checkbox__box[aria-checked="mixed"]',
		[SkinState.Focused]: ".win-checkbox__box:focus-visible", [SkinState.Disabled]: ".win-checkbox--disabled .win-checkbox__box",
	}, true),
	[SkinPart.Radio]: Part("Radio button", { [SkinState.Normal]: ".win-radio__dot", [SkinState.Checked]: '.win-radio__dot[aria-checked="true"]', [SkinState.Disabled]: ".win-radio--disabled .win-radio__dot" }, true),
	[SkinPart.TextBox]: Part("Text box", { [SkinState.Normal]: ".win-textbox", [SkinState.Focused]: ".win-textbox:focus", [SkinState.Disabled]: ".win-textbox:disabled" }),
	[SkinPart.SpinnerButton]: Part("Spinner button", { [SkinState.Normal]: ".win-spinner__button", [SkinState.Pressed]: ".win-spinner__button:active" }, true),
	[SkinPart.ComboBox]: Part("Combo box", { [SkinState.Normal]: ".win-combobox", [SkinState.Focused]: ".win-combobox:focus", [SkinState.Disabled]: '.win-combobox[aria-disabled="true"]' }),
	[SkinPart.ComboList]: Part("Combo box list", { [SkinState.Normal]: ".win-combobox__list", [SkinState.Selected]: '.win-combobox__option[aria-selected="true"]' }),
	[SkinPart.ProgressTrack]: Part("Progress bar", { [SkinState.Normal]: ".win-progress" }),
	[SkinPart.ProgressFill]: Part("Progress fill", { [SkinState.Normal]: ".win-progress__fill" }),
	[SkinPart.SliderTrack]: Part("Slider track", { [SkinState.Normal]: ".win-slider__track" }),
	[SkinPart.SliderThumb]: Part("Slider thumb", { [SkinState.Normal]: ".win-slider__thumb", [SkinState.Focused]: ".win-slider:focus .win-slider__thumb" }),
	[SkinPart.Tab]: Part("Tab", { [SkinState.Normal]: ".win-tab", [SkinState.Hover]: ".win-tab:hover", [SkinState.Selected]: ".win-tab.win-tab--selected", [SkinState.Disabled]: '.win-tab[aria-disabled="true"]' }),
	[SkinPart.TabPage]: Part("Tab page", { [SkinState.Normal]: ".win-tabs__page" }),
	[SkinPart.MenuBar]: Part("Menu bar", { [SkinState.Normal]: ".win-menubar" }),
	[SkinPart.Menu]: Part("Menu", { [SkinState.Normal]: ".win-menu" }),
	[SkinPart.MenuItem]: Part("Menu item", { [SkinState.Normal]: ".win-menu__item", [SkinState.Hover]: ".win-menu__item.win-menu__item--highlighted", [SkinState.Disabled]: ".win-menu__item.win-menu__item--disabled" }),
	[SkinPart.ListView]: Part("List", { [SkinState.Normal]: ".win-listview" }),
	[SkinPart.ListRow]: Part("List row", { [SkinState.Normal]: ".win-listview__row", [SkinState.Selected]: ".win-listview__row.win-listview__row--selected" }),
	[SkinPart.Tree]: Part("Tree", { [SkinState.Normal]: ".win-tree" }),
	[SkinPart.ScrollTrack]: Part("Scroll bar", { [SkinState.Normal]: ".win-scrollbar" }),
	[SkinPart.ScrollThumb]: Part("Scroll thumb", { [SkinState.Normal]: ".win-scrollbar__thumb" }),
	[SkinPart.ToolbarButton]: Part("Toolbar button", { [SkinState.Normal]: ".win-toolbar__button", [SkinState.Hover]: ".win-toolbar__button:hover:not(:disabled)", [SkinState.Pressed]: ".win-toolbar__button.win-toolbar__button--pressed", [SkinState.Disabled]: ".win-toolbar__button:disabled" }),
	[SkinPart.StatusBar]: Part("Status bar", { [SkinState.Normal]: ".win-statusbar" }),
	[SkinPart.Taskbar]: Part("Taskbar", { [SkinState.Normal]: ".win-taskbar" }),
	[SkinPart.TaskButton]: Part("Taskbar button", { [SkinState.Normal]: ".win-taskbar__button", [SkinState.Selected]: ".win-taskbar__button.win-taskbar__button--active" }),
	[SkinPart.Tooltip]: Part("Tooltip", { [SkinState.Normal]: ".win-tooltip" }),
	[SkinPart.GroupBox]: Part("Group box", { [SkinState.Normal]: ".win-groupbox" }),
	[SkinPart.MessageBox]: Part("Message box", { [SkinState.Normal]: ".win-messagebox__dialog" }),
};

export const SkinParts = Object.keys(PartInfo) as SkinPart[];

export function EmptySkin(): Skin {
	return { Id: "custom", Name: "Custom", Parts: {} };
}

export function SkinClass(skin: Skin): string {
	return `win-skin--${skin.Id.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
}

//#region CSS

/** A value can't end its declaration or rule, or open markup. */
const Css = (value: string): string => value.replace(/[;{}<>\\\r\n]/g, "");
/** An image URL can't leave its url("...") either (";" stays: data URLs need it, and it is harmless inside quotes). */
const Url = (value: string): string => value.replace(/["\\{}<>\r\n]/g, "");
const Px = (box: Box4): string => box.map((v) => `${v}px`).join(" ");

function Declarations(style: PartStyle): string[] {
	const out: string[] = [];
	if (style.Sprite) {
		const sprite = style.Sprite;
		const border = sprite.Border ?? sprite.Slice;
		const fill = sprite.Fill === false ? "" : " fill";
		out.push("border-style: solid", `border-width: ${Px(border)}`, `border-image: url("${Url(sprite.Image)}") ${sprite.Slice.join(" ")}${fill} / ${Px(border)} / 0 ${sprite.Repeat ?? "stretch"}`);
		out.push("box-shadow: none", "clip-path: none");
		if (style.Background === undefined) out.push("background: transparent");
	}
	if (style.Background !== undefined) out.push(`background: ${Css(style.Background)}`);
	if (style.TextColor !== undefined) out.push(`color: ${Css(style.TextColor)}`);
	if (style.Font !== undefined) out.push(`font-family: ${Css(style.Font)}`);
	if (style.FontSize !== undefined) out.push(`font-size: ${style.FontSize}px`);
	if (style.Padding !== undefined) out.push(`padding: ${Px(style.Padding)}`);
	if (style.Radius !== undefined) out.push(`border-radius: ${style.Radius}px`);
	if (style.MinHeight !== undefined) out.push(`min-height: ${style.MinHeight}px`);
	if (style.Shadow !== undefined) out.push(`box-shadow: ${Css(style.Shadow)}`);
	return out;
}

const Rule = (selector: string, declarations: string[]): string => `${selector} { ${declarations.map((d) => `${d};`).join(" ")} }\n`;

/**
 * The CSS for a skin, scoped to elements with the classes `win-skin` and SkinClass(skin). The skin class is repeated so
 * every rule is one class more specific than any kit or theme rule: a skin always wins.
 */
export function GenerateSkinCss(skin: Skin): string {
	const scope = `.win-skin.${SkinClass(skin)}.${SkinClass(skin)}`;
	let css = "";
	const root: string[] = [];
	if (skin.Font !== undefined) root.push(`font-family: ${Css(skin.Font)}`);
	if (skin.TextColor !== undefined) root.push(`color: ${Css(skin.TextColor)}`);
	if (root.length > 0) css += Rule(scope, root);
	if (skin.Desktop !== undefined) css += Rule(`${scope}, ${scope} .win-desktop`, [`background: ${Css(skin.Desktop)}`]);

	for (const part of SkinParts) {
		const states = skin.Parts[part];
		const definition = PartInfo[part];
		for (const [state, selector] of Object.entries(definition.States) as [SkinState, string][]) {
			const style = states?.[state];
			if (!style) continue;
			const declarations = Declarations(style);
			if (declarations.length > 0) css += Rule(`${scope} ${selector}`, declarations);
			if (style.Sprite && definition.Glyphs) css += Rule(`${scope} ${selector}::before, ${scope} ${selector}::after`, ["display: none"]);
		}
	}
	return css;
}

//#endregion

//#region files

class SkinError extends Error {
	public constructor(reason: string) {
		super(`Not a skin file: ${reason}`);
	}
}

const IsObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const IsBox = (value: unknown): value is Box4 => Array.isArray(value) && value.length === 4 && value.every((v) => typeof v === "number");
const Repeats = ["stretch", "round", "repeat"];

function ReadSprite(raw: unknown): SkinSprite | undefined {
	if (!IsObject(raw) || typeof raw["Image"] !== "string" || !IsBox(raw["Slice"])) return undefined;
	const sprite: SkinSprite = { Image: raw["Image"], Slice: raw["Slice"] };
	if (IsBox(raw["Border"])) sprite.Border = raw["Border"];
	if (typeof raw["Fill"] === "boolean") sprite.Fill = raw["Fill"];
	if (Repeats.includes(raw["Repeat"] as string)) sprite.Repeat = raw["Repeat"] as NonNullable<SkinSprite["Repeat"]>;
	return sprite;
}

function ReadStyle(raw: Record<string, unknown>): PartStyle {
	const style: PartStyle = {};
	const sprite = ReadSprite(raw["Sprite"]);
	if (sprite) style.Sprite = sprite;
	for (const key of ["Background", "TextColor", "Font", "Shadow"] as const) if (typeof raw[key] === "string") style[key] = raw[key];
	for (const key of ["FontSize", "Radius", "MinHeight"] as const) if (typeof raw[key] === "number") style[key] = raw[key];
	if (IsBox(raw["Padding"])) style.Padding = raw["Padding"];
	return style;
}

/** Checks a parsed skin object, keeping only known parts, states and correctly typed fields. Throws when it isn't a skin. */
export function ValidateSkin(raw: unknown): Skin {
	if (!IsObject(raw) || typeof raw["Id"] !== "string" || typeof raw["Name"] !== "string" || !IsObject(raw["Parts"])) throw new SkinError("missing Id, Name or Parts");
	const skin: Skin = { Id: raw["Id"], Name: raw["Name"], Parts: {} };
	for (const key of ["Font", "TextColor", "Desktop"] as const) if (typeof raw[key] === "string") skin[key] = raw[key];

	for (const [part, rawStates] of Object.entries(raw["Parts"])) {
		const definition = PartInfo[part as SkinPart] as PartDefinition | undefined;
		if (!definition) continue;
		const states: Partial<Record<SkinState, PartStyle>> = {};
		for (const [state, rawStyle] of Object.entries(IsObject(rawStates) ? rawStates : {})) {
			if (definition.States[state as SkinState] && IsObject(rawStyle)) states[state as SkinState] = ReadStyle(rawStyle);
		}
		skin.Parts[part as SkinPart] = states;
	}
	return skin;
}

export function ParseSkin(text: string): Skin {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new SkinError("not JSON");
	}
	return ValidateSkin(raw);
}

//#endregion
