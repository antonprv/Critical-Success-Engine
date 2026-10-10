<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { CodeSession } from "./Code/CodeSession";
import WinCodeEditor from "./Code/WinCodeEditor.vue";
import { IsClickThrough } from "@cse/ui";
import { computed, onUnmounted, reactive, ref, shallowRef, watchEffect } from "vue";
import { CheckBoxController } from "@cse/ui";
import { ComboBoxController } from "@cse/ui";
import { MenuController } from "@cse/ui";
import { SplitterController } from "@cse/ui";
import { StatusBarController } from "@cse/ui";
import { ToolbarController } from "@cse/ui";
import { UsePointerTracking } from "@cse/ui";
import { DefaultTailwindTheme, TailwindAccents, TailwindNeutrals, WinKit, type TailwindTheme } from "@cse/ui";
import { AllThemes, WinTheme } from "@cse/ui";
import { UseControl } from "@cse/ui";
import { WinComboBox } from "@cse/ui";
import { WinMenuBar } from "@cse/ui";
import { WinSplitter } from "@cse/ui";
import { WinStatusBar } from "@cse/ui";
import { WinSwitch } from "@cse/ui";
import { WinThemeProvider } from "@cse/ui";
import { WinToolbar } from "@cse/ui";
import { ParseSkin, PartInfo, SkinPart, SkinParts, SkinState, type Box4, type PartStyle, type SkinSprite } from "@cse/ui";
import { SkinPresets } from "@cse/ui";
import { AnchorMode } from "@cse/ui";
import { DesignerController, DesignerMode, type DragHandle } from "./DesignerController";
import type { ProjectSession } from "./Project";
import WinProjectPanel from "./WinProjectPanel.vue";
import { PropKind, SerializeLayout, type LayoutNode, type UiLayout } from "@cse/ui";
import { UiDocument } from "@cse/ui";
import { UiScriptRegistry } from "@cse/ui";
import { DialogService } from "@cse/ui";
import { BuiltInWidgets, type WidgetRegistry } from "@cse/ui";
import { WinDialogHost } from "@cse/ui";
import { GenerateGraphScript, GraphClassName } from "./GraphCodegen";
import { WinLayoutView } from "@cse/ui";
import WinNodeEditor from "./WinNodeEditor.vue";

/** controller: the designer to show (made here when not given); project: the project its documents belong to (the desktop app). */
const props = defineProps<{ layout?: UiLayout; scripts?: UiScriptRegistry; widgets?: WidgetRegistry; controller?: DesignerController; project?: ProjectSession; code?: CodeSession; }>();

const WidgetMime = "application/x-win-widget";
const registry = props.scripts ?? new UiScriptRegistry();
const widgets = props.widgets ?? BuiltInWidgets;
const designer = UseControl(props.controller ?? new DesignerController(props.layout, widgets));
defineExpose({ designer });

const message = ref("Ready");

// The side panels are resizable: palette and hierarchy on the left, details on the right.
const leftPanel = UseControl(new SplitterController({ Size: 180, Min: 140, Max: 420 }));
const rightPanel = UseControl(new SplitterController({ Size: 260, Min: 200, Max: 560, Reverse: true }));

/** Where the code editor sits: a tab of its own, or beside the design (any side), with a splitter between. Kept between runs. */
type CodePlace = "tab" | "right" | "left" | "bottom" | "top";
const CodePlaces: { Id: CodePlace; Label: string; }[] = [
	{ Id: "tab", Label: "Code as a &tab" }, { Id: "right", Label: "Code on the &right" }, { Id: "left", Label: "Code on the &left" },
	{ Id: "bottom", Label: "Code &below" }, { Id: "top", Label: "Code &above" },
];
const CodePlaceKey = "cse.designer.code-place";
function KeptCodePlace(): CodePlace {
	try {
		const kept = localStorage.getItem(CodePlaceKey);
		return CodePlaces.find((place) => place.Id === kept)?.Id ?? "tab";
	} catch {
		return "tab";
	}
}
const codePlace = ref<CodePlace>(KeptCodePlace());
/** The code's side panel: a splitter towards the design (the far side - right, below - shrinks moving towards it). */
const codeNear = UseControl(new SplitterController({ Size: 420, Min: 200, Max: 1400 }));
const codeFar = UseControl(new SplitterController({ Size: 420, Min: 200, Max: 1400, Reverse: true }));
const codeBeside = computed(() => props.code !== undefined && codePlace.value !== "tab");
const codeAcross = computed(() => codePlace.value === "top" || codePlace.value === "bottom");
const codeSplitter = computed(() => (codePlace.value === "right" || codePlace.value === "bottom" ? codeFar : codeNear));
const track = UsePointerTracking();
const openInput = ref<HTMLInputElement>();

//#region commands, menu, toolbar, status bar

function Download(fileName: string, text: string): void {
	const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	URL.revokeObjectURL(url);
	message.value = `Saved ${fileName}`;
}

/** Saves the layout and, when it has node scripting, the UiScript class generated from it: into the project (the desktop app), else as downloads. */
function Save(): void {
	if (props.project) {
		void props.project.Save(designer).then((result) => { message.value = result; });
		return;
	}
	Download(`${designer.Layout.Name || "layout"}.ui.json`, designer.Export());
	if ((designer.Layout.Graph?.Nodes.length ?? 0) > 0) Download(`${GraphClassName(designer.Layout)}.ts`, GenerateGraphScript(designer.Layout));
}

/** The centre shows the canvas or the node graph (with its generated code). */
const centerView = ref<"canvas" | "nodes" | "code">("canvas");
const generatedCode = computed(() => GenerateGraphScript(designer.Layout));

const Commands: Record<string, () => void> = {
	new: () => designer.New(),
	open: () => openInput.value!.click(),
	save: Save,
	undo: () => designer.Undo(),
	redo: () => designer.Redo(),
	duplicate: () => designer.Duplicate(),
	delete: () => designer.Delete(),
	design: () => designer.SetMode(DesignerMode.Design),
	preview: () => designer.SetMode(DesignerMode.Preview),
};

const menu = UseControl(new MenuController({ Items: [
	{ Id: "file", Label: "&File", Items: [{ Id: "new", Label: "&New" }, { Id: "open", Label: "&Open..." }, { Id: "save", Label: "&Save", Shortcut: "Ctrl+S" }] },
	{ Id: "edit", Label: "&Edit", Items: [
		{ Id: "undo", Label: "&Undo", Shortcut: "Ctrl+Z" }, { Id: "redo", Label: "&Redo", Shortcut: "Ctrl+Y" },
		{ Id: "sep", Label: "", Separator: true },
		{ Id: "duplicate", Label: "&Duplicate", Shortcut: "Ctrl+D" }, { Id: "delete", Label: "De&lete", Shortcut: "Del" },
	] },
	{ Id: "view", Label: "&View", Items: [
		{ Id: "design", Label: "&Design" }, { Id: "preview", Label: "&Preview" },
		{ Id: "sep-code", Label: "", Separator: true },
		...CodePlaces.map((place) => ({ Id: `code-${place.Id}`, Label: place.Label, Checkable: true, Checked: place.Id === codePlace.value })),
	] },
] }));
menu.Events.On("invoke", (item) => (item.Id.startsWith("code-") ? PlaceCode(item.Id.slice(5) as CodePlace) : Commands[item.Id]!()));

/** Puts the code editor somewhere else (and remembers it). */
function PlaceCode(place: CodePlace): void {
	codePlace.value = place;
	try {
		localStorage.setItem(CodePlaceKey, place);
	} catch {
		// a browser that keeps nothing: it holds for this run
	}
	if (place !== "tab" && centerView.value === "code") centerView.value = "canvas";
	for (const item of menu.Items.find((top) => top.Id === "view")!.Items!) if (item.Checkable) item.Checked = item.Id === `code-${place}`;
}

const toolbar = UseControl(new ToolbarController({ Buttons: [
	{ Id: "design", Label: "Design", Toggle: true, Group: "mode", Pressed: true },
	{ Id: "preview", Label: "Preview", Toggle: true, Group: "mode" },
	{ Id: "save", Label: "Save" },
	{ Id: "undo", Label: "Undo" },
	{ Id: "redo", Label: "Redo" },
] }));
toolbar.Events.On("click", (id) => Commands[id]!());

const status = UseControl(new StatusBarController({ Panels: [{ Text: "Ready" }, { Text: "Design", Width: 90 }, { Text: "", Width: 90 }] }));
watchEffect(() => {
	status.SetText(0, message.value);
	status.SetText(1, designer.Mode === DesignerMode.Preview ? "Preview" : "Design");
	status.SetText(2, designer.Dirty ? "Modified" : "");
});

const theme = ref(WinTheme.XpBlue);
const themes = UseControl(new ComboBoxController({ Options: AllThemes.map((t) => ({ Value: t.Id, Label: t.Name })), SelectedIndex: AllThemes.findIndex((t) => t.Id === WinTheme.XpBlue) }));
themes.Events.On("change", (_index, value) => { theme.value = value; });

// The kit the designer (and the layout on its canvas) is drawn with.
const kit = ref(WinKit.Classic);
const kits = UseControl(new ComboBoxController({ Options: [{ Value: WinKit.Classic, Label: "Windows (Classic)" }, { Value: WinKit.Tailwind, Label: "Tailwind" }], SelectedIndex: 0 }));
kits.Events.On("change", (_index, value) => { kit.value = value; });
const tailwind = reactive<TailwindTheme>({ ...DefaultTailwindTheme });
function TailwindChoice(values: readonly string[], field: "Accent" | "Neutral"): ComboBoxController<string> {
	const combo = UseControl(new ComboBoxController({ Options: values.map((v) => ({ Value: v, Label: v })), SelectedIndex: values.indexOf(tailwind[field]) }));
	combo.Events.On("change", (_index, value) => { tailwind[field] = value; });
	return combo;
}
const accents = TailwindChoice(TailwindAccents, "Accent");
const neutrals = TailwindChoice(TailwindNeutrals, "Neutral");
const dark = UseControl(new CheckBoxController({ Label: "Dark mode" }));
dark.Events.On("change", () => { tailwind.Dark = dark.Checked; });

//#endregion

//#region preview

const designDocument = computed(() => new UiDocument(JSON.parse(SerializeLayout(designer.Layout)) as UiLayout, { Widgets: widgets }));
const preview = shallowRef<UiDocument | null>(null);
/** Dialogs and message boxes the previewed script opens appear over the canvas. */
const previewDialogs = new DialogService();
const log = ref<string[]>([]);

const offMode = designer.Events.On("mode-change", (mode) => {
	for (const button of toolbar.Buttons) if (button.Group === "mode") button.Pressed = button.Id === mode;
	if (mode === DesignerMode.Preview) {
		const document = new UiDocument(JSON.parse(SerializeLayout(designer.Layout)) as UiLayout, { Scripts: registry, Widgets: widgets, Dialogs: previewDialogs });
		log.value = document.MissingScript ? [`Script "${document.MissingScript}" is not registered: previewing without it`] : [];
		document.Events.On("widget-event", (name, event) => log.value.push(`${name}.${event}`));
		document.Events.On("closed", (result) => log.value.push(`closed: ${result}`));
		preview.value = document;
	} else {
		preview.value!.Dispose();
		preview.value = null;
	}
});
onUnmounted(() => {
	offMode();
	preview.value?.Dispose();
});

//#endregion

//#region canvas

function OnDragStart(event: DragEvent, type: string): void {
	event.dataTransfer!.setData(WidgetMime, type);
	event.dataTransfer!.effectAllowed = "copy";
}

/**
 * A palette item dropped on the canvas goes where it was released: into the widget under the pointer if that is a
 * container, else next to it. (In design mode only widget wrappers take pointer events, so the drop lands on one.)
 */
function OnDrop(event: DragEvent): void {
	const type = event.dataTransfer!.getData(WidgetMime);
	const widget = (event.target as Element).closest<HTMLElement>("[data-name]");
	if (!type || !widget) return;
	const own = widget.querySelector<HTMLElement>(`[data-container="${widget.dataset["name"]}"]`);
	const container = own ?? widget.parentElement!.closest<HTMLElement>("[data-container]")!;
	const rect = container.getBoundingClientRect();
	designer.Add(type, { Parent: container.dataset["container"]!, X: event.clientX - rect.left, Y: event.clientY - rect.top });
}

/** Press: select. Drag: move, or resize from a handle. The whole drag is one undo step. */
function OnCanvasPointerDown(event: PointerEvent): void {
	if (designer.Mode !== DesignerMode.Design || event.button !== 0) return;
	const target = event.target as Element;
	const element = target.closest<HTMLElement>("[data-name]");
	if (!element) return;
	const name = element.dataset["name"]!;
	event.preventDefault(); // the canvas is edited, not selected as text or dragged as images
	designer.Select(name);
	if (name === designer.Layout.Root.Name) return;

	// The widget as the drag found it; DragTo applies the pointer's movement to it according to its anchors.
	const start = { ...designer.Find(name)! };
	const pointer = { X: event.clientX, Y: event.clientY };
	const handle = (target.closest<HTMLElement>("[data-handle]")?.dataset["handle"] ?? "move") as DragHandle;
	designer.BeginGesture();
	track((move) => designer.DragTo(name, start, move.clientX - pointer.X, move.clientY - pointer.Y, handle), () => designer.EndGesture());
}

//#endregion

//#region hierarchy and details

const selected = computed<LayoutNode | null>(() => designer.Selected);
const isRoot = computed(() => selected.value?.Name === designer.Layout.Root.Name);
const containers = computed(() => designer.Hierarchy.filter((entry) => entry.Node.Children).map((entry) => entry.Node.Name));

function WithSelected(action: (name: string) => void): void {
	if (designer.SelectedName) action(designer.SelectedName);
}

const InputValue = (event: Event): string => (event.target as HTMLInputElement).value;

/** The name applies as soon as it is a valid unique identifier; until then the field is marked and the old name kept. */
const nameInvalid = ref(false);
function OnRename(event: Event): void {
	const wanted = InputValue(event);
	nameInvalid.value = !designer.Rename(designer.SelectedName!, wanted);
	if (nameInvalid.value) message.value = `"${wanted}" is not a valid unique name`;
}

function OnNameBlur(event: Event): void {
	designer.EndEdit();
	if (!nameInvalid.value) return;
	nameInvalid.value = false;
	(event.target as HTMLInputElement).value = designer.SelectedName!;
}

function OnReparent(event: Event): void {
	const name = designer.SelectedName!;
	if (designer.Reparent(name, InputValue(event))) return;
	message.value = `${name} can't go there`;
	(event.target as HTMLSelectElement).value = designer.ParentOf(name)!.Name;
}

type GeometryField = "X" | "Y" | "Width" | "Height" | "Right" | "Bottom";
/** What X and Y mean under each anchor mode (horizontal, vertical). */
const OffsetLabels: Record<AnchorMode, [string, string]> = {
	[AnchorMode.Start]: ["Left", "Top"],
	[AnchorMode.End]: ["Right margin", "Bottom margin"],
	[AnchorMode.Center]: ["Offset X", "Offset Y"],
	[AnchorMode.Stretch]: ["Left margin", "Top margin"],
};
/** The geometry fields of the selected widget: for the root its design size; otherwise offsets and sizes per its anchors. */
const geometryFields = computed<{ Field: GeometryField; Label: string; }[]>(() => {
	const node = selected.value!;
	if (isRoot.value) return [{ Field: "Width", Label: "Width" }, { Field: "Height", Label: "Height" }];
	const anchorX = node.AnchorX ?? AnchorMode.Start, anchorY = node.AnchorY ?? AnchorMode.Start;
	return [
		{ Field: "X", Label: OffsetLabels[anchorX][0] },
		{ Field: "Y", Label: OffsetLabels[anchorY][1] },
		anchorX === AnchorMode.Stretch ? { Field: "Right", Label: "Right margin" } : { Field: "Width", Label: "Width" },
		anchorY === AnchorMode.Stretch ? { Field: "Bottom", Label: "Bottom margin" } : { Field: "Height", Label: "Height" },
	];
});

function OnGeometry(field: GeometryField, event: Event): void {
	const value = parseFloat(InputValue(event));
	if (Number.isNaN(value)) return; // still typing ("", "-")
	const node = selected.value!;
	const geometry = { X: node.X, Y: node.Y, Width: node.Width, Height: node.Height, [field]: value };
	if (field === "Right" || field === "Bottom") designer.SetFarMargin(node.Name, field, value);
	else if (field === "X" || field === "Y") designer.MoveTo(node.Name, geometry.X, geometry.Y);
	else designer.ResizeTo(node.Name, geometry.Width, geometry.Height);
}

const canvas = ref<HTMLElement>();
/** New anchors keep the widget in place: the parent's size is measured on the canvas. */
function OnAnchor(axis: "AnchorX" | "AnchorY", event: Event): void {
	const node = selected.value!;
	const anchors = { AnchorX: node.AnchorX ?? AnchorMode.Start, AnchorY: node.AnchorY ?? AnchorMode.Start, [axis]: InputValue(event) as AnchorMode };
	const parent = canvas.value!.querySelector<HTMLElement>(`[data-container="${designer.ParentOf(node.Name)!.Name}"]`)!;
	designer.SetAnchors(node.Name, anchors.AnchorX, anchors.AnchorY, parent.clientWidth, parent.clientHeight);
}

/** The screen the layout is shown on, in design and in preview: its own design size or a common resolution. */
const ScreenSizes = ["640x480", "800x600", "1024x768", "1280x720", "1366x768", "1600x900", "1920x1080", "2560x1440", "390x844", "768x1024"];
const screen = ref("layout");
const screenSize = computed(() => (screen.value === "layout" ? [designer.Layout.Root.Width, designer.Layout.Root.Height] : screen.value.split("x").map(Number)) as [number, number]);

function OnProp(kind: PropKind, key: string, event: Event): void {
	const element = event.target as HTMLInputElement;
	const name = designer.SelectedName!;
	if (kind === PropKind.Boolean) designer.SetProp(name, key, element.checked);
	else if (kind === PropKind.Lines) designer.SetProp(name, key, element.value.split("\n").filter((line) => line !== ""));
	else if (kind === PropKind.Text || kind === PropKind.Choice) designer.SetProp(name, key, element.value);
	else designer.SetProp(name, key, parseFloat(element.value)); // a partial number ("", "-") is not a number: ignored
}

//#endregion

/** Enter in a details field commits it (the field's change event), as in property inspectors. */
function Commit(event: KeyboardEvent): void {
	(event.target as HTMLInputElement).blur();
}

//#region skin panel

const detailsTab = ref<"properties" | "skin">("properties");
const skinPart = ref(SkinPart.Button);
const skinState = ref(SkinState.Normal);
const skinStates = computed(() => Object.keys(PartInfo[skinPart.value].States) as SkinState[]);
const skinStyle = computed<PartStyle>(() => designer.Layout.Skin?.Parts[skinPart.value]?.[skinState.value] ?? {});
const sprite = computed(() => skinStyle.value.Sprite);
/** The layout's skin when it isn't one of the presets (edited, or loaded from a file): listed in the preset box too. */
const customSkin = computed(() => {
	const skin = designer.Layout.Skin;
	return skin && !SkinPresets.some((preset) => preset.Id === skin.Id) ? skin : null;
});

function OnPreset(event: Event): void {
	const id = InputValue(event);
	const preset = SkinPresets.find((p) => p.Id === id);
	if (preset) designer.SetSkin(preset);
	else if (id === "") designer.SetSkin(null);
}

function OnSkinPart(event: Event): void {
	skinPart.value = InputValue(event) as SkinPart;
	if (!skinStates.value.includes(skinState.value)) skinState.value = SkinState.Normal;
}

function SetStyle<K extends keyof PartStyle>(field: K, value: PartStyle[K] | undefined): void {
	designer.SetSkinStyle(skinPart.value, skinState.value, field, value);
}

function NumberOf(event: Event): number | undefined {
	const value = parseFloat(InputValue(event));
	return Number.isNaN(value) ? undefined : value;
}

/** Empty text removes the setting, so the theme shows through again. */
function OnSkinText(field: "Background" | "TextColor" | "Font" | "Shadow", event: Event): void {
	const value = InputValue(event).trim();
	SetStyle(field, value === "" ? undefined : value);
}

function OnSkinNumber(field: "FontSize" | "Radius" | "MinHeight", event: Event): void {
	SetStyle(field, NumberOf(event));
}

function OnPadding(event: Event): void {
	const value = NumberOf(event);
	SetStyle("Padding", value === undefined ? undefined : [value, value, value, value]);
}

function OnSlice(index: number, event: Event): void {
	const value = NumberOf(event);
	if (value === undefined) return;
	const slice = [...sprite.value!.Slice] as Box4;
	slice[index] = value;
	SetStyle("Sprite", { ...sprite.value!, Slice: slice });
}

function OnBorder(event: Event): void {
	const value = NumberOf(event);
	const next: SkinSprite = { ...sprite.value! };
	if (value === undefined) delete next.Border;
	else next.Border = [value, value, value, value];
	SetStyle("Sprite", next);
}

const ReadDataUrl = (file: File): Promise<string> => new Promise((resolve) => {
	const reader = new FileReader();
	reader.onload = () => resolve(reader.result as string);
	reader.readAsDataURL(file);
});

/** An uploaded image becomes the sprite of the chosen part and state; a new image keeps the slicing set up before. */
async function OnSpriteFile(event: Event): Promise<void> {
	const input = event.target as HTMLInputElement;
	const file = input.files![0];
	if (!file) return;
	const base: SkinSprite = sprite.value ?? { Image: "", Slice: [8, 8, 8, 8] };
	SetStyle("Sprite", { ...base, Image: await ReadDataUrl(file) });
	input.value = "";
}

function SaveSkin(): void {
	const skin = designer.Layout.Skin;
	if (skin) Download(`${skin.Name}.skin.json`, JSON.stringify(skin, null, 2));
}

async function OnOpenSkin(event: Event): Promise<void> {
	const input = event.target as HTMLInputElement;
	const file = input.files![0];
	if (!file) return;
	try {
		designer.SetSkin(ParseSkin(await file.text()));
		message.value = `Opened ${file.name}`;
	} catch (error) {
		message.value = (error as Error).message;
	}
	input.value = "";
}

//#endregion

function OnKeyDown(event: KeyboardEvent): void {
	// Ctrl+S saves (also while typing in a field), instead of the browser's "save the page".
	// In the code editor (its tab, or beside the design) the keys are the code's: Ctrl+S saves the open file.
	const inCode = props.code !== undefined && (centerView.value === "code" || (event.target as Element | null)?.closest?.(".win-code") !== null);
	if (event.code === "KeyS" && (event.ctrlKey || event.metaKey)) {
		event.preventDefault();
		if (inCode) void props.code!.Save().then((result) => { message.value = result; });
		else Save();
		return;
	}
	if (inCode) return;
	if ((event.target as Element).matches("input, textarea, select")) return;
	designer.KeyDown(event.code, { Ctrl: event.ctrlKey || event.metaKey, Shift: event.shiftKey });
}

async function OnOpen(event: Event): Promise<void> {
	const input = event.target as HTMLInputElement;
	const file = input.files![0];
	if (!file) return;
	message.value = designer.Import(await file.text()) ?? `Opened ${file.name}`;
	input.value = "";
}

const Checked = (event: Event): boolean => (event.target as HTMLInputElement).checked;
</script>

<template>
	<WinThemeProvider :theme="theme" :kit="kit" :tailwind="tailwind" class="win-designer-root">
		<div class="win-designer" tabindex="0" @keydown="OnKeyDown">
			<div class="win-designer__bar">
				<WinMenuBar :controller="menu" />
				<WinToolbar :controller="toolbar" class="win-designer__toolbar" />
				<label class="win-designer__kit"><span class="win-designer__bar-label">Kit</span><WinComboBox :controller="kits" /></label>
				<label v-if="kit === WinKit.Classic" class="win-designer__theme"><span class="win-designer__bar-label">Theme</span><WinComboBox :controller="themes" /></label>
				<div v-else class="win-designer__tailwind">
					<label><span class="win-designer__bar-label">Accent</span><WinComboBox :controller="accents" /></label>
					<label><span class="win-designer__bar-label">Neutral</span><WinComboBox :controller="neutrals" /></label>
					<WinSwitch :controller="dark" />
				</div>
				<input ref="openInput" class="win-designer__open" type="file" accept=".json,application/json" hidden @change="OnOpen">
			</div>

			<!-- On the Code tab the layout's details step aside: the code gets the room. -->
			<div class="win-designer__main" :style="{ gridTemplateColumns: centerView === 'code' ? `${leftPanel.Size}px 4px 1fr` : `${leftPanel.Size}px 4px 1fr 4px ${rightPanel.Size}px` }">
				<aside class="win-designer__side">
					<WinProjectPanel v-if="project" :session="project" :designer="designer" @message="(text: string) => message = text" />
					<fieldset class="win-groupbox win-designer__palette">
						<legend class="win-groupbox__title">Palette</legend>
						<button
							v-for="type in widgets.Palette"
							:key="type"
							type="button"
							class="win-button win-designer__palette-item"
							draggable="true"
							:data-type="type"
							@click="designer.Add(type)"
							@dragstart="OnDragStart($event, type)"
						>{{ widgets.Get(type)!.Label }}</button>
					</fieldset>
					<fieldset class="win-groupbox win-designer__hierarchy">
						<legend class="win-groupbox__title">Hierarchy</legend>
						<div class="win-designer__hierarchy-tools">
							<button type="button" class="win-button" aria-label="Move up" @click="WithSelected(designer.SendBackward.bind(designer))">▲</button>
							<button type="button" class="win-button" aria-label="Move down" @click="WithSelected(designer.BringForward.bind(designer))">▼</button>
							<button type="button" class="win-button" aria-label="Duplicate" @click="WithSelected(designer.Duplicate.bind(designer))">⧉</button>
							<button type="button" class="win-button" aria-label="Delete" @click="WithSelected(designer.Delete.bind(designer))">✕</button>
						</div>
						<ul class="win-tree win-designer__tree">
							<li
								v-for="entry in designer.Hierarchy"
								:key="entry.Node.Name"
								class="win-designer__tree-item"
								:class="{ 'win-designer__tree-item--selected': entry.Node.Name === designer.SelectedName }"
								:style="{ paddingLeft: `${4 + entry.Depth * 14}px` }"
								@click="designer.Select(entry.Node.Name)"
							>{{ entry.Node.Name }}</li>
						</ul>
					</fieldset>
				</aside>
				<WinSplitter :controller="leftPanel" />

				<div class="win-designer__center">
				<div class="win-designer__tabs win-designer__views">
					<button type="button" class="win-tab" :class="{ 'win-tab--selected': centerView === 'canvas' }" data-view="canvas" @click="centerView = 'canvas'">Canvas</button>
					<button type="button" class="win-tab" :class="{ 'win-tab--selected': centerView === 'nodes' }" data-view="nodes" @click="centerView = 'nodes'">Nodes</button>
					<button v-if="code && !codeBeside" type="button" class="win-tab" :class="{ 'win-tab--selected': centerView === 'code' }" data-view="code" @click="centerView = 'code'">Code</button>
				</div>
				<div class="win-designer__work" :class="`win-designer__work--code-${codeBeside ? codePlace : 'tab'}`">
				<div class="win-designer__design">
				<div v-if="code && centerView === 'code'" class="win-designer__code-view">
					<WinCodeEditor :session="code" :dark="dark.Checked" @message="(text: string) => message = text" />
				</div>
				<div v-if="centerView === 'nodes'" class="win-designer__nodes">
					<WinNodeEditor :designer="designer" :widgets="widgets" />
					<pre class="win-designer__code">{{ generatedCode }}</pre>
				</div>
				<section v-show="centerView === 'canvas'" ref="canvas" class="win-designer__canvas" @dragover.prevent @drop.prevent="OnDrop" @pointerdown="OnCanvasPointerDown">
					<label class="win-designer__screen">
						<span class="win-designer__screen-label">Screen</span>
						<select class="win-textbox" data-field="Screen" :value="screen" @change="screen = InputValue($event)">
							<option value="layout">Layout size ({{ designer.Layout.Root.Width }} × {{ designer.Layout.Root.Height }})</option>
							<option v-for="size in ScreenSizes" :key="size" :value="size">{{ size.replace("x", " × ") }}</option>
						</select>
					</label>
					<WinLayoutView v-if="preview" :document="preview" :width="screenSize[0]" :height="screenSize[1]" />
					<WinLayoutView v-else :document="designDocument" design :selected="designer.SelectedName" :width="screenSize[0]" :height="screenSize[1]" />
					<WinDialogHost v-if="preview" :service="previewDialogs" />
					<ul v-if="preview" class="win-designer__log">
						<li v-for="(line, index) in log" :key="index">{{ line }}</li>
					</ul>
				</section>
				</div>
				<template v-if="codeBeside">
					<WinSplitter :controller="codeSplitter" :horizontal="codeAcross" />
					<div class="win-designer__code-docked" :style="codeAcross ? { height: `${codeSplitter.Size}px` } : { width: `${codeSplitter.Size}px` }">
						<WinCodeEditor :session="code!" :dark="dark.Checked" @message="(text: string) => message = text" />
					</div>
				</template>
				</div>
				</div>

				<WinSplitter v-if="centerView !== 'code'" :controller="rightPanel" />
				<aside v-show="centerView !== 'code'" class="win-designer__details">
					<div class="win-designer__tabs">
						<button type="button" class="win-tab" :class="{ 'win-tab--selected': detailsTab === 'properties' }" data-tab="properties" @click="detailsTab = 'properties'">Properties</button>
						<button type="button" class="win-tab" :class="{ 'win-tab--selected': detailsTab === 'skin' }" data-tab="skin" @click="detailsTab = 'skin'">Skin</button>
					</div>
					<template v-if="detailsTab === 'properties'">
					<fieldset class="win-groupbox">
						<legend class="win-groupbox__title">Layout</legend>
						<label>Name <input class="win-textbox" data-field="LayoutName" :value="designer.Layout.Name" @keydown.enter="Commit" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="designer.SetLayoutName(InputValue($event))"></label>
						<label>Script
							<select class="win-textbox" data-field="Script" :value="designer.Layout.Script" @change="designer.SetScript(InputValue($event))">
								<option value="">(none)</option>
								<option v-for="name in registry.Names" :key="name" :value="name">{{ name }}</option>
							</select>
						</label>
						<label title="On: clicks on empty places go through to the game (a HUD). Off: the document covers the game (a pause menu).">Click pass-through
							<input type="checkbox" data-field="LayoutClickThrough" :checked="IsClickThrough(designer.Layout)" @change="designer.SetDocumentClickThrough(Checked($event))">
						</label>
					</fieldset>

					<fieldset v-if="selected" class="win-groupbox">
						<legend class="win-groupbox__title">{{ widgets.Get(selected.Type)!.Label }}</legend>
						<label>Name <input class="win-textbox" :class="{ 'win-designer__field--invalid': nameInvalid }" data-field="Name" :value="selected.Name" @keydown.enter="Commit" @focus="designer.BeginEdit()" @blur="OnNameBlur" @input="OnRename"></label>
						<template v-if="!isRoot">
							<label>Parent
								<select class="win-textbox" data-field="Parent" :value="designer.ParentOf(selected.Name)!.Name" @change="OnReparent">
									<option v-for="name in containers" :key="name" :value="name">{{ name }}</option>
								</select>
							</label>
							<label>Anchor X
								<select class="win-textbox" data-field="AnchorX" :value="selected.AnchorX ?? 'start'" @change="OnAnchor('AnchorX', $event)">
									<option value="start">Left</option><option value="end">Right</option><option value="center">Center</option><option value="stretch">Stretch</option>
								</select>
							</label>
							<label>Anchor Y
								<select class="win-textbox" data-field="AnchorY" :value="selected.AnchorY ?? 'start'" @change="OnAnchor('AnchorY', $event)">
									<option value="start">Top</option><option value="end">Bottom</option><option value="center">Center</option><option value="stretch">Stretch</option>
								</select>
							</label>
						</template>
						<label title="On: clicks go through this widget to what is under it (a crosshair over the game).">Click pass-through
							<input type="checkbox" data-field="ClickThrough" :checked="selected.ClickThrough === true" @change="designer.SetClickThrough(selected.Name, Checked($event))">
						</label>
						<div class="win-designer__geometry">
							<template v-for="geometry in geometryFields" :key="geometry.Field">
								<span>{{ geometry.Label }}</span>
								<input class="win-textbox" type="number" :data-field="geometry.Field" :value="selected[geometry.Field]" @keydown.enter="Commit" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="OnGeometry(geometry.Field, $event)">
							</template>
						</div>
						<label v-for="prop in widgets.Get(selected.Type)!.Props" :key="prop.Key" :class="`win-designer__prop--${prop.Kind}`">{{ prop.Label }}
							<input v-if="prop.Kind === PropKind.Boolean" type="checkbox" :data-prop="prop.Key" :checked="Boolean(selected.Props[prop.Key])" @change="OnProp(prop.Kind, prop.Key, $event)">
							<select v-else-if="prop.Kind === PropKind.Choice" class="win-textbox" :data-prop="prop.Key" :value="selected.Props[prop.Key]" @change="OnProp(prop.Kind, prop.Key, $event)">
								<option v-for="choice in prop.Choices" :key="choice" :value="choice">{{ choice }}</option>
							</select>
							<textarea v-else-if="prop.Kind === PropKind.Lines" class="win-textbox" :data-prop="prop.Key" :value="(selected.Props[prop.Key] as string[]).join('\n')" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="OnProp(prop.Kind, prop.Key, $event)" />
							<input v-else class="win-textbox" :type="prop.Kind === PropKind.Number ? 'number' : 'text'" :data-prop="prop.Key" :value="selected.Props[prop.Key]" @keydown.enter="Commit" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="OnProp(prop.Kind, prop.Key, $event)">
						</label>
					</fieldset>
					<p v-else class="win-designer__hint">Select a widget on the canvas or in the hierarchy.</p>
					</template>

					<template v-else>
						<fieldset class="win-groupbox">
							<legend class="win-groupbox__title">Skin</legend>
							<label>Skin
								<select class="win-textbox" data-skin="Preset" :value="designer.Layout.Skin?.Id ?? ''" @change="OnPreset">
									<option value="">(theme only)</option>
									<option v-for="preset in SkinPresets" :key="preset.Id" :value="preset.Id">{{ preset.Name }}</option>
									<option v-if="customSkin" :value="customSkin.Id">{{ customSkin.Name }}</option>
								</select>
							</label>
							<div class="win-designer__row">
								<button type="button" class="win-button" data-skin="SaveSkin" @click="SaveSkin">Save skin</button>
								<label class="win-button win-designer__file">Open skin...<input type="file" accept=".json,application/json" data-skin="OpenSkin" hidden @change="OnOpenSkin"></label>
							</div>
						</fieldset>
						<fieldset class="win-groupbox">
							<legend class="win-groupbox__title">Part and state</legend>
							<label>Part
								<select class="win-textbox" data-skin="Part" :value="skinPart" @change="OnSkinPart">
									<option v-for="part in SkinParts" :key="part" :value="part">{{ PartInfo[part].Label }}</option>
								</select>
							</label>
							<label>State
								<select class="win-textbox" data-skin="State" :value="skinState" @change="skinState = InputValue($event) as SkinState">
									<option v-for="state in skinStates" :key="state" :value="state">{{ state }}</option>
								</select>
							</label>
						</fieldset>
						<fieldset class="win-groupbox">
							<legend class="win-groupbox__title">Sprite (9-slice)</legend>
							<div class="win-designer__row">
								<label class="win-button win-designer__file">Image...<input type="file" accept="image/*" data-skin="SpriteFile" hidden @change="OnSpriteFile"></label>
								<button type="button" class="win-button" data-skin="RemoveSprite" @click="SetStyle('Sprite', undefined)">Remove</button>
							</div>
							<template v-if="sprite">
								<img class="win-designer__sprite-preview" :src="sprite.Image" alt="">
								<label>Slice (T R B L)
									<span class="win-designer__row">
										<input v-for="(value, index) in sprite.Slice" :key="index" class="win-textbox" type="number" :data-skin="`Slice${index}`" :value="value" @keydown.enter="Commit" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="OnSlice(index, $event)">
									</span>
								</label>
								<label>Border (px) <input class="win-textbox" type="number" data-skin="Border" :value="sprite.Border?.[0] ?? ''" placeholder="= slice" @keydown.enter="Commit" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="OnBorder"></label>
								<label>Repeat
									<select class="win-textbox" data-skin="Repeat" :value="sprite.Repeat ?? 'stretch'" @change="SetStyle('Sprite', { ...sprite, Repeat: InputValue($event) as 'stretch' })">
										<option value="stretch">stretch</option><option value="round">round</option><option value="repeat">repeat</option>
									</select>
								</label>
								<label class="win-designer__prop--boolean">Fill centre <input type="checkbox" data-skin="Fill" :checked="sprite.Fill !== false" @change="SetStyle('Sprite', { ...sprite, Fill: ($event.target as HTMLInputElement).checked })"></label>
							</template>
						</fieldset>
						<fieldset class="win-groupbox">
							<legend class="win-groupbox__title">Look</legend>
							<label v-for="field in (['Background', 'TextColor', 'Font', 'Shadow'] as const)" :key="field">{{ field }}
								<input class="win-textbox" :data-skin="field" :value="skinStyle[field] ?? ''" @keydown.enter="Commit" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="OnSkinText(field, $event)">
							</label>
							<label v-for="field in (['FontSize', 'Radius', 'MinHeight'] as const)" :key="field">{{ field }}
								<input class="win-textbox" type="number" :data-skin="field" :value="skinStyle[field] ?? ''" @keydown.enter="Commit" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="OnSkinNumber(field, $event)">
							</label>
							<label>Padding <input class="win-textbox" type="number" data-skin="Padding" :value="skinStyle.Padding?.[0] ?? ''" @keydown.enter="Commit" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="OnPadding"></label>
							<button type="button" class="win-button" data-skin="Clear" @click="designer.ClearSkinState(skinPart, skinState)">Clear this state</button>
						</fieldset>
					</template>
				</aside>
			</div>

			<WinStatusBar :controller="status" class="win-designer__statusbar" />
		</div>
	</WinThemeProvider>
</template>

<style scoped>
/*
 * The designer's own chrome: kit-neutral colours. Each one is the Tailwind kit's token, falling back to the classic
 * theme's variable, so the whole editor (not just its buttons) follows the kit, its palettes and dark mode.
 */
.win-designer-root {
	--d-surface: var(--kit-surface, var(--face));
	--d-panel: var(--kit-panel, var(--face));
	--d-field: var(--kit-field, var(--window));
	--d-ink: var(--kit-ink, var(--text));
	--d-muted: var(--kit-muted, var(--shadow));
	--d-line: var(--kit-line, var(--shadow));
	--d-selected: var(--kit-selected, var(--select));
	--d-selected-ink: var(--kit-selected-ink, var(--select-text));
	height: 100%;
}
.win-designer { display: flex; flex-direction: column; height: 100%; background: var(--d-panel); color: var(--d-ink); outline: none; user-select: none; }
.win-designer input, .win-designer textarea { user-select: text; }
.win-designer__bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 4px 8px; border-bottom: 1px solid var(--d-line); background: var(--d-panel); }
.win-designer__kit { margin-left: auto; }
.win-designer__kit, .win-designer__theme, .win-designer__tailwind label { display: inline-flex; align-items: center; gap: 6px; }
.win-designer__tailwind { display: flex; align-items: center; gap: 12px; }
.win-designer__bar-label { font-size: 0.85em; color: var(--d-muted); white-space: nowrap; }
.win-designer__main { display: grid; flex: 1; min-height: 0; background: var(--d-surface); }
.win-designer__side,
.win-designer__details { display: flex; flex-direction: column; gap: 6px; padding: 6px; overflow: auto; background: var(--d-panel); }
.win-designer__side { border-right: 1px solid var(--d-line); }
/* A fieldset is never narrower than its widest content by default: here the groups fit the column instead. */
.win-designer__side > fieldset { min-inline-size: 0; }
.win-designer__details { border-left: 1px solid var(--d-line); }
.win-designer__palette { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.win-designer__palette-item { min-width: 0; padding: 0 4px; font-size: 10px; cursor: grab; }
.win-designer__hierarchy { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.win-designer__hierarchy-tools { display: flex; gap: 2px; margin-bottom: 4px; }
.win-designer__hierarchy-tools .win-button { min-width: 0; flex: 1; padding: 0; }
.win-designer__tree { flex: 1; min-height: 60px; }
.win-designer__tree-item { padding: 1px 4px; border-radius: 3px; cursor: default; white-space: nowrap; }
.win-designer__tree-item--selected { background: var(--d-selected); color: var(--d-selected-ink); }
/* A dot grid on the snap step (8 px), drawn in the text colour so it suits light and dark alike. */
.win-designer__canvas {
	position: relative;
	overflow: auto;
	padding: 16px;
	background-color: var(--d-surface);
	background-image: radial-gradient(color-mix(in srgb, var(--d-ink) 16%, transparent) 1px, transparent 1.5px);
	background-size: 8px 8px;
	background-position: 16px 16px;
}
.win-designer__log { position: absolute; right: 8px; bottom: 8px; width: 260px; max-height: 40%; margin: 0; padding: 4px 4px 4px 18px; overflow: auto; background: var(--d-panel); color: var(--d-ink); border: 1px solid var(--d-line); border-radius: 4px; font: 11px "Lucida Console", monospace; user-select: text; }
.win-designer__details label { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 4px; margin: 3px 0; }
.win-designer__details .win-textbox { min-width: 0; width: 100%; }
.win-designer__field--invalid { outline: 2px solid #d40000 !important; outline-offset: -1px; }
.win-designer__prop--boolean { grid-template-columns: 90px auto !important; justify-content: start; }
.win-designer__hint { color: var(--d-muted); }
.win-designer__center { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.win-designer__views { padding: 4px 8px 0; border-bottom: 1px solid var(--d-line); background: var(--d-panel); }
.win-designer__center > .win-designer__canvas { flex: 1; }
/* The design and, beside it on any side, the code: a splitter between. */
.win-designer__work { display: flex; flex: 1; min-width: 0; min-height: 0; }
.win-designer__work--code-top, .win-designer__work--code-bottom { flex-direction: column; }
.win-designer__work--code-left, .win-designer__work--code-top { flex-direction: row-reverse; }
.win-designer__work--code-top { flex-direction: column-reverse; }
.win-designer__design { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.win-designer__design > .win-designer__canvas { flex: 1; }
.win-designer__code-docked { display: flex; flex-direction: column; flex-shrink: 0; min-width: 0; min-height: 0; border: 1px solid var(--d-line); background: var(--d-panel); }
.win-designer__nodes { display: grid; grid-template-columns: 1fr minmax(260px, 38%); flex: 1; min-height: 0; }
.win-designer__code { margin: 0; padding: 10px; overflow: auto; border-left: 1px solid var(--d-line); background: var(--d-field); color: var(--d-ink); font: 12px/1.5 "Cascadia Code", Consolas, "Lucida Console", monospace; white-space: pre; tab-size: 4; user-select: text; }
.win-designer__geometry { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 4px; margin: 3px 0; }
.win-designer__screen { position: sticky; left: 0; top: 0; z-index: 3; display: inline-flex; align-items: center; gap: 6px; margin: 0 0 8px; }
.win-designer__screen-label { font-size: 0.85em; color: var(--d-muted); }
.win-designer__tabs { display: flex; gap: 2px; }
.win-designer__code-view { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.win-designer__row { display: flex; gap: 4px; align-items: center; }
.win-designer__row .win-textbox { width: 0; flex: 1; }
.win-designer__file { display: inline-flex; align-items: center; justify-content: center; }
.win-designer__sprite-preview { max-width: 100%; max-height: 64px; margin: 4px 0; image-rendering: pixelated; border: 1px dashed var(--d-line); }
</style>
