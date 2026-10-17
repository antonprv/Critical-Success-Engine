// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { defineComponent, h, type Component, type PropType } from "vue";
import WinButton from "../Components/WinButton.vue";
import WinCheckBox from "../Components/WinCheckBox.vue";
import WinComboBox from "../Components/WinComboBox.vue";
import WinGameButton from "../Components/WinGameButton.vue";
import WinGroupBox from "../Components/WinGroupBox.vue";
import WinJoystick from "../Components/WinJoystick.vue";
import WinListView from "../Components/WinListView.vue";
import WinProgressBar from "../Components/WinProgressBar.vue";
import WinRadioGroup from "../Components/WinRadioGroup.vue";
import WinSlider from "../Components/WinSlider.vue";
import WinSpinner from "../Components/WinSpinner.vue";
import WinStatusBar from "../Components/WinStatusBar.vue";
import WinToast from "../Components/WinToast.vue";
import WinTextBox from "../Components/WinTextBox.vue";
import WinWindow from "../Components/WinWindow.vue";
import { ButtonController } from "../Controls/ButtonController";
import { CheckBoxController, CheckState } from "../Controls/CheckBoxController";
import { ComboBoxController } from "../Controls/ComboBoxController";
import { GameButtonController } from "../Controls/GameButtonController";
import { JoystickController } from "../Controls/JoystickController";
import { LabelController } from "../Controls/LabelController";
import { ListViewController, SelectionMode } from "../Controls/ListViewController";
import { ProgressBarController } from "../Controls/ProgressBarController";
import { RadioGroupController } from "../Controls/RadioGroupController";
import { SliderController } from "../Controls/SliderController";
import { SpinnerController } from "../Controls/SpinnerController";
import { StatusBarController } from "../Controls/StatusBarController";
import { ToastController } from "../Controls/ToastController";
import { TextBoxController } from "../Controls/TextBoxController";
import { WindowController } from "../Controls/WindowController";
import { UseControl } from "../Core/UseControl";
import { DialogResult, DialogResults } from "./DialogResult";
import { IsJson, type JsonValue } from "./Json";
import { QuasarWidgets } from "../Quasar/QuasarWidgets";
import type { ChildTemplate } from "../Quasar/QuasarTypes";
import type { LayoutNode } from "./Layout";
import type { UiDocument } from "./UiDocument";

/** The built-in widget types. Custom types are any other string registered in a WidgetRegistry. */
export const enum WidgetType {
	Canvas = "canvas",
	Window = "window",
	GroupBox = "groupbox",
	Label = "label",
	Image = "image",
	Button = "button",
	CheckBox = "checkbox",
	RadioGroup = "radiogroup",
	TextBox = "textbox",
	Spinner = "spinner",
	ComboBox = "combobox",
	ProgressBar = "progressbar",
	Slider = "slider",
	Joystick = "joystick",
	GameButton = "gamebutton",
	ListBox = "listbox",
	StatusBar = "statusbar",
	Toast = "toast",
}

export const enum PropKind {
	Text = "text",
	Number = "number",
	Boolean = "boolean",
	/** A list of strings, edited one per line. */
	Lines = "lines",
	/** A list of strings the designer edits as a count plus one name per item (the items of a combo box or radio buttons). */
	Items = "items",
	/** One of the definition's Choices. */
	Choice = "choice",
	/** Any JSON: objects and lists of them (a table's columns and rows, a tree's nodes). */
	Json = "json",
	/** Validation rules of a field: Quasar's rule names or rule specs (see QuasarRules). */
	Rules = "rules",
}

/** What a layout file holds in a prop: JSON. */
export type PropValue = JsonValue;

export interface PropDefinition {
	Key: string;
	Label: string;
	Kind: PropKind;
	Default: PropValue;
	/** The allowed values of a Choice prop. */
	Choices?: readonly string[];
}

/**
 * Everything the designer, layout files and the runtime need to know about one widget type. Register one to plug your
 * own Vue component into the whole pipeline.
 */
export interface WidgetDefinition {
	/** The id stored in layout files. */
	Type: string;
	Label: string;
	/** Can hold child widgets; its Component receives them in its default slot. */
	Container: boolean;
	/** Width and height when dropped from the palette. */
	Size: [number, number];
	Props: PropDefinition[];
	/** Controller events scripts can subscribe to (and that the designer's preview logs). */
	Events: string[];
	/** Not offered in the palette (the root canvas). */
	Hidden?: boolean;
	/** The palette's group ("Quasar: Forms"); the toolkit's own widgets when absent. */
	Group?: string;
	/**
	 * Props aren't limited to `Props` (only what the widget starts with): a layout may hold any other prop, as JSON
	 * (Quasar's widgets: the designer knows their props from Quasar's catalog).
	 */
	OpenProps?: boolean;
	/** Widgets a node of this type starts with (CreateNode): a tab bar's tabs, a list's items. */
	Children?: ChildTemplate[];
	/**
	 * The named slots child widgets can go into (LayoutNode.Slot). Such a widget lays its children out itself, in the
	 * flow of its slots, not at their X and Y.
	 */
	Slots?: string[];
	/** The live control for a node (anything with an `Events` EventHub); omit for widgets without behaviour. */
	CreateController?: (node: LayoutNode) => object;
	/** Draws the widget. Props: `node`, `controller` (null if it has none) and `document`; slot: its children. */
	Component: Component;
}

/** Whether a widget's pop-ups stay inside its window (the default) or may float above everything (see LayoutNode.EmbedInWindow). */
export function IsEmbeddedInWindow(node: LayoutNode): boolean {
	return node.EmbedInWindow !== false;
}

export const KindCheck: Record<PropKind, (value: unknown) => boolean> = {
	[PropKind.Text]: (value) => typeof value === "string",
	[PropKind.Number]: (value) => typeof value === "number" && Number.isFinite(value),
	[PropKind.Boolean]: (value) => typeof value === "boolean",
	[PropKind.Lines]: (value) => Array.isArray(value) && value.every((line) => typeof line === "string"),
	[PropKind.Items]: (value) => Array.isArray(value) && value.every((line) => typeof line === "string"),
	[PropKind.Choice]: (value) => typeof value === "string",
	[PropKind.Json]: (value) => IsJson(value),
	[PropKind.Rules]: (value) => Array.isArray(value) && IsJson(value),
};

/** Whether a value fits a prop: the right kind, and one of its choices if it has any. */
export function IsValidProp(definition: PropDefinition, value: unknown): boolean {
	return KindCheck[definition.Kind](value) && (definition.Choices === undefined || definition.Choices.includes(value as string));
}

/** The palette group of a widget type. */
export function GroupOf(definition: WidgetDefinition): string {
	return definition.Group ?? ToolkitGroup;
}

/** The palette group of the toolkit's own widgets. */
export const ToolkitGroup = "Controls";

/** Widget types by id. Use `BuiltInWidgets.Extend()` to get a registry of your own with the built-ins in it. */
export class WidgetRegistry {
	private readonly _definitions = new Map<string, WidgetDefinition>();

	public get Types(): string[] { return [...this._definitions.keys()]; }
	/** What the designer's palette offers, in registration order. */
	public get Palette(): string[] { return this.Types.filter((type) => !this._definitions.get(type)!.Hidden); }

	public Get(type: string): WidgetDefinition | undefined {
		return this._definitions.get(type);
	}

	public Has(type: string): boolean {
		return this._definitions.has(type);
	}

	public Register(definition: WidgetDefinition): this {
		if (this._definitions.has(definition.Type)) throw new Error(`A widget type "${definition.Type}" is already registered.`);
		this._definitions.set(definition.Type, definition);
		return this;
	}

	public Extend(): WidgetRegistry {
		const copy = new WidgetRegistry();
		for (const definition of this._definitions.values()) copy.Register(definition);
		return copy;
	}
}

//#region built-in widgets

const ViewProps = {
	node: { type: Object as PropType<LayoutNode>, required: true },
	controller: { type: Object as PropType<object | null>, default: null },
	document: { type: Object as PropType<UiDocument>, required: true },
} as const;

/** A toolkit component bound to the widget's controller. */
const Control = (component: Component): Component => defineComponent({
	props: ViewProps,
	setup: (props) => () => h(component, { controller: props.controller }),
});

/** The canvas: its Fill (none, a solid colour, a gradient, or the skin's desktop), opacity and backdrop blur are drawn behind its children. */
const CanvasView = defineComponent({
	inheritAttrs: false,
	props: ViewProps,
	setup: (props, { slots }) => () => {
		const p = props.node.Props;
		const fill = (p["Fill"] as string | undefined) ?? "none", a = (p["Color"] as string | undefined) ?? "#000000", b = (p["Color2"] as string | undefined) ?? "#004e98";
		const blur = (p["Blur"] as number | undefined) ?? 0, opacity = (p["Opacity"] as number | undefined) ?? 1;
		const skin = fill === "skin";
		const background = skin ? "var(--skin-desktop, none)" : fill === "solid" ? a : fill === "gradient" ? `linear-gradient(${(p["Angle"] as number | undefined) ?? 180}deg, ${a}, ${b})` : "none";
		const filter = skin ? "blur(var(--skin-desktop-blur, 0px))" : blur > 0 ? `blur(${blur}px)` : "none";
		const bg = fill === "none" ? null : h("div", {
			class: skin ? "win-fill win-fill--skin" : "win-fill",
			style: { position: "absolute", inset: "0", pointerEvents: "none", background, opacity: skin ? "var(--skin-desktop-opacity, 1)" : String(opacity), backdropFilter: filter, WebkitBackdropFilter: filter },
		});
		return [bg, slots["default"]!()];
	},
});

/** A window, with the dialog keys: Enter presses its AcceptButton, Escape its CancelButton (WinForms). */
const WindowView = defineComponent({
	props: ViewProps,
	setup: (props, { slots }) => {
		const OnKeyDown = (event: KeyboardEvent): void => {
			// A focused button presses itself on Enter, and Enter in a multiline box is a new line.
			if (event.code === "Enter" && (event.target as Element).matches("button, textarea")) return;
			if (props.document.DialogKey(props.node.Name, event.code)) event.preventDefault();
		};
		return () => h(WinWindow, { controller: props.controller as WindowController, onKeydown: OnKeyDown }, { default: () => slots["default"]!() });
	},
});

const GroupBoxView = defineComponent({
	props: ViewProps,
	setup: (props, { slots }) => () => h(WinGroupBox, { title: props.node.Props["Title"] as string }, { default: () => slots["default"]!() }),
});

const LabelView = defineComponent({
	props: ViewProps,
	setup: (props) => () => h("span", {
		class: "win-layout__label",
		style: {
			fontSize: `${props.node.Props["FontSize"]}px`,
			fontWeight: props.node.Props["Bold"] ? "bold" : "normal",
			fontStyle: props.node.Props["Italic"] ? "italic" : "normal",
			fontFamily: (props.node.Props["FontFamily"] as string | undefined) || undefined,
			// One line unless the label wraps; the theme's colour unless it names one; left unless aligned otherwise.
			whiteSpace: props.node.Props["Wrap"] ? "normal" : "nowrap",
			color: (props.node.Props["Color"] as string | undefined) || undefined,
			textAlign: (props.node.Props["Align"] as string | undefined) ?? "left",
		},
	}, (props.controller as LabelController).Label),
});

const ImageView = defineComponent({
	props: ViewProps,
	setup: (props) => () => (props.node.Props["Source"]
		? h("img", { class: "win-layout__image", src: props.node.Props["Source"], alt: "", draggable: false, style: { objectFit: props.node.Props["Fit"] } })
		: h("div", { class: "win-layout__image-placeholder" }, "Image")),
});

const ListBoxView = defineComponent({
	props: ViewProps,
	setup: (props) => () => h(WinListView, { controller: props.controller as ListViewController<unknown>, columns: [{ Key: "text", Label: props.node.Props["Header"] as string }] }),
});

const ComboBoxView = defineComponent({
	props: ViewProps,
	setup: (props) => () => h(WinComboBox, { controller: props.controller as ComboBoxController<string>, embedded: IsEmbeddedInWindow(props.node) }),
});

const Prop = (Key: string, Label: string, Kind: PropKind, Default: PropValue): PropDefinition => ({ Key, Label, Kind, Default });
const Enabled = Prop("Enabled", "Enabled", PropKind.Boolean, true);
const Text = (value: string): PropDefinition => Prop("Text", "Text", PropKind.Text, value);
const Range = (value: number): PropDefinition[] => [Prop("Min", "Minimum", PropKind.Number, 0), Prop("Max", "Maximum", PropKind.Number, 100), Prop("Value", "Value", PropKind.Number, value)];

const P = (node: LayoutNode) => ({
	text: (key: string): string => node.Props[key] as string,
	number: (key: string): number => node.Props[key] as number,
	flag: (key: string): boolean => node.Props[key] as boolean,
	lines: (key: string): string[] => node.Props[key] as string[],
});

export const BuiltInWidgets = new WidgetRegistry()
	.Register({
		Type: WidgetType.Canvas,
		Label: "Canvas",
		Container: true,
		Size: [800, 500],
		Props: [
			{ ...Prop("Fill", "Fill", PropKind.Choice, "none"), Choices: ["none", "solid", "gradient", "skin"] },
			Prop("Color", "Color (CSS)", PropKind.Text, "#000000"),
			Prop("Color2", "Gradient end (CSS)", PropKind.Text, "#004e98"),
			Prop("Angle", "Gradient angle", PropKind.Number, 180),
			Prop("Opacity", "Opacity (0..1)", PropKind.Number, 1),
			Prop("Blur", "Backdrop blur, px", PropKind.Number, 0),
		],
		Events: ["close", "dialog-result"],
		Hidden: true,
		Component: CanvasView
	})
	.Register({
		Type: WidgetType.Window,
		Label: "Window",
		Container: true,
		Size: [320, 240],
		Events: ["close", "dialog-result"],
		Component: WindowView,
		Props: [
			Prop("Title", "Title", PropKind.Text, "Window"), Prop("Closable", "Close box", PropKind.Boolean, true), Prop("Minimizable", "Minimize box", PropKind.Boolean, true),
			Prop("Maximizable", "Maximize box", PropKind.Boolean, true), Prop("Resizable", "Resizable", PropKind.Boolean, true),
			Prop("Frameless", "Frameless (no title bar or border)", PropKind.Boolean, false),
			Prop("AcceptButton", "Accept button (Enter)", PropKind.Text, ""), Prop("CancelButton", "Cancel button (Escape)", PropKind.Text, ""),
			Prop("Visible", "Shown at start", PropKind.Boolean, true),
		],
		CreateController: (node) => {
			const p = P(node);
			// Placed by its layout wrapper, so at 0, 0 inside it.
			return UseControl(new WindowController({ Title: p.text("Title"), X: 0, Y: 0, Width: node.Width, Height: node.Height, Closable: p.flag("Closable"), Minimizable: p.flag("Minimizable"), Maximizable: p.flag("Maximizable"), Resizable: p.flag("Resizable"), Frameless: p.flag("Frameless"), Visible: p.flag("Visible") }));
		},
	})
	.Register({ Type: WidgetType.GroupBox, Label: "Group box", Container: true, Size: [200, 120], Events: [], Props: [Prop("Title", "Title", PropKind.Text, "Group")], Component: GroupBoxView })
	.Register({
		Type: WidgetType.Label, Label: "Label", Container: false, Size: [100, 16], Events: [], Props: [
			Text("Label"), Prop("FontSize", "Font size", PropKind.Number, 11), Prop("Bold", "Bold", PropKind.Boolean, false),
			Prop("Wrap", "Wrap text", PropKind.Boolean, false), Prop("Color", "Text color (CSS, empty: the theme's)", PropKind.Text, ""),
			{ ...Prop("Align", "Align", PropKind.Choice, "left"), Choices: ["left", "center", "right"] },
			Prop("Italic", "Italic", PropKind.Boolean, false), Prop("FontFamily", "Font family (CSS, empty: the theme's)", PropKind.Text, ""),
		], Component: LabelView,
		// A live widget: scripts (and node graphs) change its text and visibility.
		CreateController: (node) => UseControl(new LabelController({ Label: P(node).text("Text") }))
	})
	.Register({ Type: WidgetType.Image, Label: "Image", Container: false, Size: [64, 64], Events: [], Props: [Prop("Source", "Image URL", PropKind.Text, ""), Prop("Fit", "Fit (contain, cover, fill)", PropKind.Text, "contain")], Component: ImageView })
	.Register({
		Type: WidgetType.Button, Label: "Button", Container: false, Size: [75, 23], Events: ["click"], Component: Control(WinButton),
		Props: [
			Text("Button"), Prop("Default", "Default button", PropKind.Boolean, false), Enabled,
			Prop("CausesValidation", "Validates its container", PropKind.Boolean, false),
			{ ...Prop("DialogResult", "Dialog result", PropKind.Choice, DialogResult.None), Choices: DialogResults },
		],
		CreateController: (node) => UseControl(new ButtonController({ Label: P(node).text("Text"), IsDefault: P(node).flag("Default"), Enabled: P(node).flag("Enabled") })),
	})
	.Register({
		Type: WidgetType.CheckBox, Label: "Check box", Container: false, Size: [120, 17], Events: ["change"], Component: Control(WinCheckBox),
		Props: [Text("Check box"), Prop("Checked", "Checked", PropKind.Boolean, false), Prop("ThreeState", "Three states", PropKind.Boolean, false), Enabled],
		CreateController: (node) => {
			const p = P(node);
			return UseControl(new CheckBoxController({ Label: p.text("Text"), State: p.flag("Checked") ? CheckState.Checked : CheckState.Unchecked, ThreeState: p.flag("ThreeState"), Enabled: p.flag("Enabled") }));
		},
	})
	.Register({
		Type: WidgetType.RadioGroup, Label: "Radio buttons", Container: false, Size: [120, 44], Events: ["change"], Component: Control(WinRadioGroup),
		Props: [Prop("Options", "Options", PropKind.Items, ["Option 1", "Option 2"]), Prop("Selected", "Selected option", PropKind.Text, "Option 1"), Enabled],
		CreateController: (node) => {
			const p = P(node);
			const options = p.lines("Options");
			return UseControl(new RadioGroupController({ Options: options.map((o) => ({ Value: o, Label: o })), Value: options.includes(p.text("Selected")) ? p.text("Selected") : null, Enabled: p.flag("Enabled") }));
		},
	})
	.Register({
		Type: WidgetType.TextBox, Label: "Text box", Container: false, Size: [150, 21], Events: ["change"], Component: Control(WinTextBox),
		Props: [Text(""), Prop("Placeholder", "Placeholder", PropKind.Text, ""), Prop("MaxLength", "Max length (0 = none)", PropKind.Number, 0), Prop("ReadOnly", "Read only", PropKind.Boolean, false), Prop("Password", "Password", PropKind.Boolean, false), Prop("Multiline", "Multiline", PropKind.Boolean, false), Enabled],
		CreateController: (node) => {
			const p = P(node);
			return UseControl(new TextBoxController({
				Value: p.text("Text"), Placeholder: p.text("Placeholder"), MaxLength: p.number("MaxLength") > 0 ? p.number("MaxLength") : Infinity,
				ReadOnly: p.flag("ReadOnly"), Password: p.flag("Password"), Multiline: p.flag("Multiline"), Enabled: p.flag("Enabled"),
			}));
		},
	})
	.Register({
		Type: WidgetType.Spinner, Label: "Spinner", Container: false, Size: [70, 21], Events: ["change"], Component: Control(WinSpinner),
		Props: [...Range(0), Prop("Step", "Step", PropKind.Number, 1), Enabled],
		CreateController: (node) => {
			const p = P(node);
			return UseControl(new SpinnerController({ Min: p.number("Min"), Max: p.number("Max"), Step: p.number("Step"), Value: p.number("Value"), Enabled: p.flag("Enabled") }));
		},
	})
	.Register({
		Type: WidgetType.ComboBox, Label: "Combo box", Container: false, Size: [140, 21], Events: ["change"], Component: ComboBoxView,
		Props: [Prop("Options", "Options", PropKind.Items, ["Item 1", "Item 2"]), Prop("Selected", "Selected index", PropKind.Number, 0), Enabled],
		CreateController: (node) => {
			const p = P(node);
			return UseControl(new ComboBoxController({ Options: p.lines("Options").map((o) => ({ Value: o, Label: o })), SelectedIndex: p.number("Selected"), Enabled: p.flag("Enabled") }));
		},
	})
	.Register({
		Type: WidgetType.ProgressBar, Label: "Progress bar", Container: false, Size: [160, 17], Events: ["complete"], Component: Control(WinProgressBar),
		Props: [...Range(50), Prop("Marquee", "Marquee", PropKind.Boolean, false), { ...Prop("Variant", "Variant (boot: the XP start-up capsule)", PropKind.Choice, "default"), Choices: ["default", "boot"] }],
		CreateController: (node) => {
			const p = P(node);
			return UseControl(new ProgressBarController({ Min: p.number("Min"), Max: p.number("Max"), Value: p.number("Value"), Marquee: p.flag("Marquee"), Variant: p.text("Variant") }));
		},
	})
	.Register({ Type: WidgetType.Toast, Label: "Toast", Container: false, Size: [320, 200], Events: [], Props: [], Component: Control(WinToast), CreateController: () => UseControl(new ToastController()) })
	.Register({
		Type: WidgetType.Slider, Label: "Slider", Container: false, Size: [160, 30], Events: ["change"], Component: Control(WinSlider),
		Props: [...Range(50), Prop("Step", "Step", PropKind.Number, 1), Enabled],
		CreateController: (node) => {
			const p = P(node);
			return UseControl(new SliderController({ Min: p.number("Min"), Max: p.number("Max"), Step: p.number("Step"), Value: p.number("Value"), Enabled: p.flag("Enabled") }));
		},
	})
	.Register({
		Type: WidgetType.Joystick, Label: "Stick (touch)", Container: false, Size: [140, 140], Events: ["move", "release"], Component: Control(WinJoystick),
		Props: [Prop("DeadZone", "Dead zone (0..1)", PropKind.Number, 0.1), Enabled],
		CreateController: (node) => UseControl(new JoystickController({ DeadZone: P(node).number("DeadZone"), Enabled: P(node).flag("Enabled") })),
	})
	.Register({
		Type: WidgetType.GameButton, Label: "Game button (touch)", Container: false, Size: [72, 72], Events: ["press", "release", "click"], Component: Control(WinGameButton),
		Props: [Text("A"), Enabled],
		CreateController: (node) => UseControl(new GameButtonController({ Label: P(node).text("Text"), Enabled: P(node).flag("Enabled") })),
	})
	.Register({
		Type: WidgetType.ListBox, Label: "List box", Container: false, Size: [180, 120], Events: ["selection-change", "activate"], Component: ListBoxView,
		Props: [Prop("Header", "Header", PropKind.Text, "Name"), Prop("Items", "Items", PropKind.Lines, ["Item 1", "Item 2", "Item 3"]), Enabled],
		CreateController: (node) => UseControl(new ListViewController({ Items: P(node).lines("Items").map((item) => ({ text: item })), SelectionMode: SelectionMode.Single, Enabled: P(node).flag("Enabled") })),
	})
	.Register({
		Type: WidgetType.StatusBar, Label: "Status bar", Container: false, Size: [300, 22], Events: [], Component: Control(WinStatusBar),
		Props: [Prop("Panels", "Panels", PropKind.Lines, ["Ready"])],
		CreateController: (node) => UseControl(new StatusBarController({ Panels: P(node).lines("Panels").map((panel) => ({ Text: panel })) })),
	});

//#endregion

// Every Quasar component is a widget type too: available to every document, loaded only when one is shown.
for (const definition of QuasarWidgets()) BuiltInWidgets.Register(definition);
