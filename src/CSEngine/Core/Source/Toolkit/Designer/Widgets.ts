// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { defineComponent, h, type Component, type PropType } from "vue";
import WinButton from "../Components/WinButton.vue";
import WinCheckBox from "../Components/WinCheckBox.vue";
import WinComboBox from "../Components/WinComboBox.vue";
import WinGroupBox from "../Components/WinGroupBox.vue";
import WinListView from "../Components/WinListView.vue";
import WinProgressBar from "../Components/WinProgressBar.vue";
import WinRadioGroup from "../Components/WinRadioGroup.vue";
import WinSlider from "../Components/WinSlider.vue";
import WinSpinner from "../Components/WinSpinner.vue";
import WinStatusBar from "../Components/WinStatusBar.vue";
import WinTextBox from "../Components/WinTextBox.vue";
import WinWindow from "../Components/WinWindow.vue";
import { ButtonController } from "../Controls/ButtonController";
import { CheckBoxController, CheckState } from "../Controls/CheckBoxController";
import { ComboBoxController } from "../Controls/ComboBoxController";
import { ListViewController, SelectionMode } from "../Controls/ListViewController";
import { ProgressBarController } from "../Controls/ProgressBarController";
import { RadioGroupController } from "../Controls/RadioGroupController";
import { SliderController } from "../Controls/SliderController";
import { SpinnerController } from "../Controls/SpinnerController";
import { StatusBarController } from "../Controls/StatusBarController";
import { TextBoxController } from "../Controls/TextBoxController";
import { WindowController } from "../Controls/WindowController";
import { UseControl } from "../Core/UseControl";
import { DialogResult, DialogResults } from "./DialogResult";
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
	ListBox = "listbox",
	StatusBar = "statusbar",
}

export const enum PropKind {
	Text = "text",
	Number = "number",
	Boolean = "boolean",
	/** A list of strings, edited one per line. */
	Lines = "lines",
	/** One of the definition's Choices. */
	Choice = "choice",
}

export type PropValue = string | number | boolean | string[];

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
	/** The live control for a node (anything with an `Events` EventHub); omit for widgets without behaviour. */
	CreateController?: (node: LayoutNode) => object;
	/** Draws the widget. Props: `node`, `controller` (null if it has none) and `document`; slot: its children. */
	Component: Component;
}

export const KindCheck: Record<PropKind, (value: unknown) => boolean> = {
	[PropKind.Text]: (value) => typeof value === "string",
	[PropKind.Number]: (value) => typeof value === "number" && Number.isFinite(value),
	[PropKind.Boolean]: (value) => typeof value === "boolean",
	[PropKind.Lines]: (value) => Array.isArray(value) && value.every((line) => typeof line === "string"),
	[PropKind.Choice]: (value) => typeof value === "string",
};

/** Whether a value fits a prop: the right kind, and one of its choices if it has any. */
export function IsValidProp(definition: PropDefinition, value: unknown): boolean {
	return KindCheck[definition.Kind](value) && (definition.Choices === undefined || definition.Choices.includes(value as string));
}

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

const CanvasView = defineComponent({ setup: (_props, { slots }) => () => slots["default"]!() });

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
		style: { fontSize: `${props.node.Props["FontSize"]}px`, fontWeight: props.node.Props["Bold"] ? "bold" : "normal" },
	}, props.node.Props["Text"] as string),
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
	.Register({ Type: WidgetType.Canvas, Label: "Canvas", Container: true, Size: [800, 500], Props: [], Events: [], Hidden: true, Component: CanvasView })
	.Register({
		Type: WidgetType.Window, Label: "Window", Container: true, Size: [320, 240], Events: ["close"], Component: WindowView,
		Props: [
			Prop("Title", "Title", PropKind.Text, "Window"), Prop("Closable", "Close box", PropKind.Boolean, true), Prop("Minimizable", "Minimize box", PropKind.Boolean, true),
			Prop("Maximizable", "Maximize box", PropKind.Boolean, true), Prop("Resizable", "Resizable", PropKind.Boolean, true),
			Prop("AcceptButton", "Accept button (Enter)", PropKind.Text, ""), Prop("CancelButton", "Cancel button (Escape)", PropKind.Text, ""),
		],
		CreateController: (node) => {
			const p = P(node);
			// Placed by its layout wrapper, so at 0, 0 inside it.
			return UseControl(new WindowController({ Title: p.text("Title"), X: 0, Y: 0, Width: node.Width, Height: node.Height, Closable: p.flag("Closable"), Minimizable: p.flag("Minimizable"), Maximizable: p.flag("Maximizable"), Resizable: p.flag("Resizable") }));
		},
	})
	.Register({ Type: WidgetType.GroupBox, Label: "Group box", Container: true, Size: [200, 120], Events: [], Props: [Prop("Title", "Title", PropKind.Text, "Group")], Component: GroupBoxView })
	.Register({ Type: WidgetType.Label, Label: "Label", Container: false, Size: [100, 16], Events: [], Props: [Text("Label"), Prop("FontSize", "Font size", PropKind.Number, 11), Prop("Bold", "Bold", PropKind.Boolean, false)], Component: LabelView })
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
		Props: [Prop("Options", "Options", PropKind.Lines, ["Option 1", "Option 2"]), Prop("Selected", "Selected option", PropKind.Text, "Option 1"), Enabled],
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
		Type: WidgetType.ComboBox, Label: "Combo box", Container: false, Size: [140, 21], Events: ["change"], Component: Control(WinComboBox),
		Props: [Prop("Options", "Options", PropKind.Lines, ["Item 1", "Item 2"]), Prop("Selected", "Selected index", PropKind.Number, 0), Enabled],
		CreateController: (node) => {
			const p = P(node);
			return UseControl(new ComboBoxController({ Options: p.lines("Options").map((o) => ({ Value: o, Label: o })), SelectedIndex: p.number("Selected"), Enabled: p.flag("Enabled") }));
		},
	})
	.Register({
		Type: WidgetType.ProgressBar, Label: "Progress bar", Container: false, Size: [160, 17], Events: ["complete"], Component: Control(WinProgressBar),
		Props: [...Range(50), Prop("Marquee", "Marquee", PropKind.Boolean, false)],
		CreateController: (node) => {
			const p = P(node);
			return UseControl(new ProgressBarController({ Min: p.number("Min"), Max: p.number("Max"), Value: p.number("Value"), Marquee: p.flag("Marquee") }));
		},
	})
	.Register({
		Type: WidgetType.Slider, Label: "Slider", Container: false, Size: [160, 30], Events: ["change"], Component: Control(WinSlider),
		Props: [...Range(50), Prop("Step", "Step", PropKind.Number, 1), Enabled],
		CreateController: (node) => {
			const p = P(node);
			return UseControl(new SliderController({ Min: p.number("Min"), Max: p.number("Max"), Step: p.number("Step"), Value: p.number("Value"), Enabled: p.flag("Enabled") }));
		},
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
