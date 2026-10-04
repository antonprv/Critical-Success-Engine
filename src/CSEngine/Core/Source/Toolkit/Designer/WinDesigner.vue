<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, shallowRef, watchEffect } from "vue";
import { CheckBoxController } from "../Controls/CheckBoxController";
import { ComboBoxController } from "../Controls/ComboBoxController";
import { MenuController } from "../Controls/MenuController";
import { StatusBarController } from "../Controls/StatusBarController";
import { ToolbarController } from "../Controls/ToolbarController";
import { UsePointerTracking } from "../Core/PointerTracking";
import { DefaultTailwindTheme, TailwindAccents, TailwindNeutrals, WinKit, type TailwindTheme } from "../Core/Kits";
import { AllThemes, WinTheme } from "../Core/Themes";
import { UseControl } from "../Core/UseControl";
import WinCheckBox from "../Components/WinCheckBox.vue";
import WinComboBox from "../Components/WinComboBox.vue";
import WinMenuBar from "../Components/WinMenuBar.vue";
import WinStatusBar from "../Components/WinStatusBar.vue";
import WinThemeProvider from "../Components/WinThemeProvider.vue";
import WinToolbar from "../Components/WinToolbar.vue";
import { ParseSkin, PartInfo, SkinPart, SkinParts, SkinState, type Box4, type PartStyle, type SkinSprite } from "../Skins/Skin";
import { SkinPresets } from "../Skins/SkinPresets";
import { DesignerController, DesignerMode } from "./DesignerController";
import { PropKind, SerializeLayout, type LayoutNode, type UiLayout } from "./Layout";
import { UiDocument } from "./UiDocument";
import { UiScriptRegistry } from "./UiScript";
import { DialogService } from "./Dialogs";
import { BuiltInWidgets, type WidgetRegistry } from "./Widgets";
import WinDialogHost from "./WinDialogHost.vue";
import WinLayoutView from "./WinLayoutView.vue";

const props = defineProps<{ layout?: UiLayout; scripts?: UiScriptRegistry; widgets?: WidgetRegistry; }>();

const WidgetMime = "application/x-win-widget";
const registry = props.scripts ?? new UiScriptRegistry();
const widgets = props.widgets ?? BuiltInWidgets;
const designer = UseControl(new DesignerController(props.layout, widgets));
defineExpose({ designer });

const message = ref("Ready");
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

function Save(): void {
	Download(`${designer.Layout.Name || "layout"}.ui.json`, designer.Export());
}

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
	{ Id: "file", Label: "&File", Items: [{ Id: "new", Label: "&New" }, { Id: "open", Label: "&Open..." }, { Id: "save", Label: "&Save" }] },
	{ Id: "edit", Label: "&Edit", Items: [
		{ Id: "undo", Label: "&Undo", Shortcut: "Ctrl+Z" }, { Id: "redo", Label: "&Redo", Shortcut: "Ctrl+Y" },
		{ Id: "sep", Label: "", Separator: true },
		{ Id: "duplicate", Label: "&Duplicate", Shortcut: "Ctrl+D" }, { Id: "delete", Label: "De&lete", Shortcut: "Del" },
	] },
	{ Id: "view", Label: "&View", Items: [{ Id: "design", Label: "&Design" }, { Id: "preview", Label: "&Preview" }] },
] }));
menu.Events.On("invoke", (item) => Commands[item.Id]!());

const toolbar = UseControl(new ToolbarController({ Buttons: [
	{ Id: "design", Label: "Design", Toggle: true, Group: "mode", Pressed: true },
	{ Id: "preview", Label: "Preview", Toggle: true, Group: "mode" },
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
const dark = UseControl(new CheckBoxController({ Label: "Dark" }));
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
	designer.Select(name);
	if (name === designer.Layout.Root.Name) return;

	const node = designer.Find(name)!;
	const start = { X: node.X, Y: node.Y, Width: node.Width, Height: node.Height, PointerX: event.clientX, PointerY: event.clientY };
	const handle = target.closest<HTMLElement>("[data-handle]")?.dataset["handle"];
	designer.BeginGesture();
	track((move) => {
		const dx = move.clientX - start.PointerX;
		const dy = move.clientY - start.PointerY;
		if (handle) designer.ResizeTo(name, start.Width + (handle === "bottom" ? 0 : dx), start.Height + (handle === "right" ? 0 : dy));
		else designer.MoveTo(name, start.X + dx, start.Y + dy);
	}, () => designer.EndGesture());
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

function OnRename(event: Event): void {
	const name = designer.SelectedName!;
	const wanted = InputValue(event);
	if (designer.Rename(name, wanted)) return;
	message.value = `"${wanted}" is not a valid unique name`;
	(event.target as HTMLInputElement).value = name;
}

function OnReparent(event: Event): void {
	const name = designer.SelectedName!;
	if (designer.Reparent(name, InputValue(event))) return;
	message.value = `${name} can't go there`;
	(event.target as HTMLSelectElement).value = designer.ParentOf(name)!.Name;
}

function OnGeometry(field: "X" | "Y" | "Width" | "Height", event: Event): void {
	const node = selected.value!;
	const geometry = { X: node.X, Y: node.Y, Width: node.Width, Height: node.Height, [field]: Number(InputValue(event)) };
	if (field === "X" || field === "Y") designer.MoveTo(node.Name, geometry.X, geometry.Y);
	else designer.ResizeTo(node.Name, geometry.Width, geometry.Height);
}

function OnProp(kind: PropKind, key: string, event: Event): void {
	const element = event.target as HTMLInputElement;
	const name = designer.SelectedName!;
	if (kind === PropKind.Boolean) designer.SetProp(name, key, element.checked);
	else if (kind === PropKind.Lines) designer.SetProp(name, key, element.value.split("\n").filter((line) => line !== ""));
	else if (kind === PropKind.Text || kind === PropKind.Choice) designer.SetProp(name, key, element.value);
	else if (!designer.SetProp(name, key, parseFloat(element.value))) element.value = String(selected.value!.Props[key]);
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
</script>

<template>
	<WinThemeProvider :theme="theme" :kit="kit" :tailwind="tailwind" class="win-designer-root">
		<div class="win-designer" tabindex="0" @keydown="OnKeyDown">
			<div class="win-designer__bar">
				<WinMenuBar :controller="menu" />
				<WinToolbar :controller="toolbar" class="win-designer__toolbar" />
				<div class="win-designer__kit"><WinComboBox :controller="kits" /></div>
				<div v-if="kit === WinKit.Classic" class="win-designer__theme"><WinComboBox :controller="themes" /></div>
				<div v-else class="win-designer__tailwind">
					<WinComboBox :controller="accents" />
					<WinComboBox :controller="neutrals" />
					<WinCheckBox :controller="dark" />
				</div>
				<input ref="openInput" class="win-designer__open" type="file" accept=".json,application/json" hidden @change="OnOpen">
			</div>

			<div class="win-designer__main">
				<aside class="win-designer__side">
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

				<section class="win-designer__canvas" @dragover.prevent @drop.prevent="OnDrop" @pointerdown="OnCanvasPointerDown">
					<WinLayoutView v-if="preview" :document="preview" />
					<WinLayoutView v-else :document="designDocument" design :selected="designer.SelectedName" />
					<WinDialogHost v-if="preview" :service="previewDialogs" />
					<ul v-if="preview" class="win-designer__log">
						<li v-for="(line, index) in log" :key="index">{{ line }}</li>
					</ul>
				</section>

				<aside class="win-designer__details">
					<div class="win-designer__tabs">
						<button type="button" class="win-tab" :class="{ 'win-tab--selected': detailsTab === 'properties' }" data-tab="properties" @click="detailsTab = 'properties'">Properties</button>
						<button type="button" class="win-tab" :class="{ 'win-tab--selected': detailsTab === 'skin' }" data-tab="skin" @click="detailsTab = 'skin'">Skin</button>
					</div>
					<template v-if="detailsTab === 'properties'">
					<fieldset class="win-groupbox">
						<legend class="win-groupbox__title">Layout</legend>
						<label>Name <input class="win-textbox" data-field="LayoutName" :value="designer.Layout.Name" @keydown.enter="Commit" @change="designer.SetLayoutName(InputValue($event))"></label>
						<label>Script
							<select class="win-textbox" data-field="Script" :value="designer.Layout.Script" @change="designer.SetScript(InputValue($event))">
								<option value="">(none)</option>
								<option v-for="name in registry.Names" :key="name" :value="name">{{ name }}</option>
							</select>
						</label>
					</fieldset>

					<fieldset v-if="selected" class="win-groupbox">
						<legend class="win-groupbox__title">{{ widgets.Get(selected.Type)!.Label }}</legend>
						<label>Name <input class="win-textbox" data-field="Name" :value="selected.Name" @keydown.enter="Commit" @change="OnRename"></label>
						<template v-if="!isRoot">
							<label>Parent
								<select class="win-textbox" data-field="Parent" :value="designer.ParentOf(selected.Name)!.Name" @change="OnReparent">
									<option v-for="name in containers" :key="name" :value="name">{{ name }}</option>
								</select>
							</label>
							<label v-for="key in (['X', 'Y', 'Width', 'Height'] as const)" :key="key">{{ key }}
								<input class="win-textbox" type="number" :data-field="key" :value="selected[key]" @keydown.enter="Commit" @change="OnGeometry(key, $event)">
							</label>
						</template>
						<label v-for="prop in widgets.Get(selected.Type)!.Props" :key="prop.Key" :class="`win-designer__prop--${prop.Kind}`">{{ prop.Label }}
							<input v-if="prop.Kind === PropKind.Boolean" type="checkbox" :data-prop="prop.Key" :checked="Boolean(selected.Props[prop.Key])" @change="OnProp(prop.Kind, prop.Key, $event)">
							<select v-else-if="prop.Kind === PropKind.Choice" class="win-textbox" :data-prop="prop.Key" :value="selected.Props[prop.Key]" @change="OnProp(prop.Kind, prop.Key, $event)">
								<option v-for="choice in prop.Choices" :key="choice" :value="choice">{{ choice }}</option>
							</select>
							<textarea v-else-if="prop.Kind === PropKind.Lines" class="win-textbox" :data-prop="prop.Key" :value="(selected.Props[prop.Key] as string[]).join('\n')" @change="OnProp(prop.Kind, prop.Key, $event)" />
							<input v-else class="win-textbox" :type="prop.Kind === PropKind.Number ? 'number' : 'text'" :data-prop="prop.Key" :value="selected.Props[prop.Key]" @keydown.enter="Commit" @change="OnProp(prop.Kind, prop.Key, $event)">
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
										<input v-for="(value, index) in sprite.Slice" :key="index" class="win-textbox" type="number" :data-skin="`Slice${index}`" :value="value" @keydown.enter="Commit" @change="OnSlice(index, $event)">
									</span>
								</label>
								<label>Border (px) <input class="win-textbox" type="number" data-skin="Border" :value="sprite.Border?.[0] ?? ''" placeholder="= slice" @keydown.enter="Commit" @change="OnBorder"></label>
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
								<input class="win-textbox" :data-skin="field" :value="skinStyle[field] ?? ''" @keydown.enter="Commit" @change="OnSkinText(field, $event)">
							</label>
							<label v-for="field in (['FontSize', 'Radius', 'MinHeight'] as const)" :key="field">{{ field }}
								<input class="win-textbox" type="number" :data-skin="field" :value="skinStyle[field] ?? ''" @keydown.enter="Commit" @change="OnSkinNumber(field, $event)">
							</label>
							<label>Padding <input class="win-textbox" type="number" data-skin="Padding" :value="skinStyle.Padding?.[0] ?? ''" @keydown.enter="Commit" @change="OnPadding"></label>
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
.win-designer-root { height: 100%; }
.win-designer { display: flex; flex-direction: column; height: 100%; background: var(--face); outline: none; }
.win-designer__bar { display: flex; align-items: center; gap: 8px; padding: 2px 4px; border-bottom: 1px solid var(--shadow); }
.win-designer__kit { margin-left: auto; }
.win-designer__tailwind { display: flex; align-items: center; gap: 6px; }
.win-designer__main { display: grid; grid-template-columns: 180px 1fr 260px; flex: 1; min-height: 0; }
.win-designer__side,
.win-designer__details { display: flex; flex-direction: column; gap: 4px; padding: 4px; overflow: auto; }
.win-designer__palette { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; }
.win-designer__palette-item { min-width: 0; padding: 0 4px; font-size: 10px; cursor: grab; }
.win-designer__hierarchy { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.win-designer__hierarchy-tools { display: flex; gap: 2px; margin-bottom: 3px; }
.win-designer__hierarchy-tools .win-button { min-width: 0; flex: 1; padding: 0; }
.win-designer__tree { flex: 1; min-height: 60px; }
.win-designer__tree-item { padding-right: 4px; cursor: default; white-space: nowrap; }
.win-designer__tree-item--selected { background: var(--select); color: var(--select-text); }
.win-designer__canvas { position: relative; overflow: auto; padding: 16px; background: repeating-conic-gradient(rgba(0, 0, 0, 0.04) 0 25%, transparent 0 50%) 0 0 / 16px 16px; }
.win-designer__log { position: absolute; right: 8px; bottom: 8px; width: 260px; max-height: 40%; margin: 0; padding: 4px 4px 4px 18px; overflow: auto; background: #ffffe1; border: 1px solid #000; font: 11px "Lucida Console", monospace; }
.win-designer__details label { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 4px; margin: 3px 0; }
.win-designer__details .win-textbox { min-width: 0; width: 100%; }
.win-designer__prop--boolean { grid-template-columns: 90px auto !important; justify-content: start; }
.win-designer__hint { color: var(--shadow); }
.win-designer__tabs { display: flex; gap: 2px; }
.win-designer__row { display: flex; gap: 4px; align-items: center; }
.win-designer__row .win-textbox { width: 0; flex: 1; }
.win-designer__file { display: inline-flex; align-items: center; justify-content: center; }
.win-designer__sprite-preview { max-width: 100%; max-height: 64px; margin: 4px 0; image-rendering: pixelated; border: 1px dashed var(--shadow); }
</style>
