<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { reactive, ref, shallowRef } from "vue";
import { ButtonController } from "../Controls/ButtonController";
import { CheckBoxController, CheckState } from "../Controls/CheckBoxController";
import { ComboBoxController } from "../Controls/ComboBoxController";
import { ListViewController } from "../Controls/ListViewController";
import { MenuController } from "../Controls/MenuController";
import { MessageBoxButtons, MessageBoxController, MessageBoxIcon } from "../Controls/MessageBoxController";
import { ProgressBarController } from "../Controls/ProgressBarController";
import { RadioGroupController } from "../Controls/RadioGroupController";
import { ScrollBarController } from "../Controls/ScrollBarController";
import { SliderController } from "../Controls/SliderController";
import { SpinnerController } from "../Controls/SpinnerController";
import { StatusBarController } from "../Controls/StatusBarController";
import { TabsController } from "../Controls/TabsController";
import { TextBoxController } from "../Controls/TextBoxController";
import { ToolbarController } from "../Controls/ToolbarController";
import { TooltipController } from "../Controls/TooltipController";
import { TreeViewController } from "../Controls/TreeViewController";
import { WindowController, WindowState } from "../Controls/WindowController";
import { WindowManager } from "../Controls/WindowManager";
import { DefaultTailwindTheme, TailwindAccents, TailwindNeutrals, TailwindRadii, WinKit, type TailwindTheme } from "../Core/Kits";
import { AllThemes, GetTheme, WinTheme } from "../Core/Themes";
import { UseControl } from "../Core/UseControl";
import WinButton from "../Components/WinButton.vue";
import WinCheckBox from "../Components/WinCheckBox.vue";
import WinComboBox from "../Components/WinComboBox.vue";
import WinDesktop from "../Components/WinDesktop.vue";
import WinGroupBox from "../Components/WinGroupBox.vue";
import WinListView from "../Components/WinListView.vue";
import WinMenuBar from "../Components/WinMenuBar.vue";
import WinMessageBox from "../Components/WinMessageBox.vue";
import WinProgressBar from "../Components/WinProgressBar.vue";
import WinRadioGroup from "../Components/WinRadioGroup.vue";
import WinScrollBar from "../Components/WinScrollBar.vue";
import WinSlider from "../Components/WinSlider.vue";
import WinSpinner from "../Components/WinSpinner.vue";
import WinStatusBar from "../Components/WinStatusBar.vue";
import WinSwitch from "../Components/WinSwitch.vue";
import WinTabs from "../Components/WinTabs.vue";
import WinTextBox from "../Components/WinTextBox.vue";
import WinThemeProvider from "../Components/WinThemeProvider.vue";
import WinToolbar from "../Components/WinToolbar.vue";
import WinTooltip from "../Components/WinTooltip.vue";
import WinTreeView from "../Components/WinTreeView.vue";
import WinWindow from "../Components/WinWindow.vue";

// The gallery is also the toolkit's usage example: every control is a controller created here, and everything the
// event log shows comes from subscribing to those controllers' Events.

const log = ref<string[]>([]);
function Log(source: string, text: string): void {
	log.value.unshift(`${source}: ${text}`);
	log.value.splice(40);
}

//#region themes
const theme = ref(WinTheme.XpBlue);
const themes = UseControl(new RadioGroupController({ Options: AllThemes.map((t) => ({ Value: t.Id, Label: t.Name })), Value: WinTheme.XpBlue }));
themes.Events.On("change", (value) => {
	theme.value = value;
	Log("Theme", GetTheme(value).Name);
});
// The kit: classic Windows themes, or the Tailwind kit with its palettes, radius and dark mode.
const kit = ref(WinKit.Classic);
const kits = UseControl(new RadioGroupController({ Options: [{ Value: WinKit.Classic, Label: "Windows (Classic)" }, { Value: WinKit.Tailwind, Label: "Tailwind" }], Value: WinKit.Classic }));
kits.Events.On("change", (value) => {
	kit.value = value;
	Log("Kit", value === WinKit.Tailwind ? "Tailwind" : "Classic");
});

const tailwind = reactive<TailwindTheme>({ ...DefaultTailwindTheme });
function TailwindChoice(values: readonly string[], field: "Accent" | "Neutral" | "Radius"): ComboBoxController<string> {
	const combo = UseControl(new ComboBoxController({ Options: values.map((v) => ({ Value: v, Label: v })), SelectedIndex: values.indexOf(tailwind[field]) }));
	combo.Events.On("change", (_index, value) => {
		tailwind[field] = value;
		Log(field, value);
	});
	return combo;
}
const accents = TailwindChoice(TailwindAccents, "Accent");
const neutrals = TailwindChoice(TailwindNeutrals, "Neutral");
const radii = TailwindChoice(TailwindRadii, "Radius");
const dark = UseControl(new CheckBoxController({ Label: "Dark mode" }));
dark.Events.On("change", () => {
	tailwind.Dark = dark.Checked;
	Log("Dark", ["off", "on"][Number(dark.Checked)]!);
});
//#endregion

//#region controls
const push = UseControl(new ButtonController({ Label: "Push me", IsDefault: true }));
push.Events.On("click", () => Log("Button", "click"));

const progress = UseControl(new ProgressBarController());
progress.Events.On("change", () => Log("Progress", `${Math.round(progress.Percent)}%`));
progress.Events.On("marquee-change", (on) => Log("Progress", `marquee ${["off", "on"][Number(on)]}`));
const step = UseControl(new ButtonController({ Label: "Step" }));
step.Events.On("click", () => progress.Step());

const CheckNames = { [CheckState.Unchecked]: "unchecked", [CheckState.Checked]: "checked", [CheckState.Indeterminate]: "indeterminate" };
const hidden = UseControl(new CheckBoxController({ Label: "Show hidden files", ThreeState: true }));
hidden.Events.On("change", (state) => Log("Check box", CheckNames[state]));
const marquee = UseControl(new CheckBoxController({ Label: "Marquee" }));
marquee.Events.On("change", () => progress.SetMarquee(marquee.Checked));

const size = UseControl(new RadioGroupController({ Options: [{ Value: 1, Label: "Small" }, { Value: 2, Label: "Medium" }, { Value: 3, Label: "Large" }], Value: 1 }));
size.Events.On("change", (value) => Log("Radio", size.Options.find((o) => o.Value === value)!.Label));

const volume = UseControl(new SliderController({ Value: 50, TickFrequency: 25 }));
volume.Events.On("change", (value) => Log("Slider", String(value)));

const tabs = UseControl(new TabsController({ Tabs: [{ Id: "general", Label: "General" }, { Id: "advanced", Label: "Advanced" }] }));
tabs.Events.On("change", (id) => Log("Tabs", tabs.Tabs.find((t) => t.Id === id)!.Label));
//#endregion

//#region explorer
const menu = UseControl(new MenuController({ Items: [
	{ Id: "file", Label: "&File", Items: [{ Id: "new", Label: "&New", Shortcut: "Ctrl+N" }, { Id: "sep", Label: "", Separator: true }, { Id: "exit", Label: "E&xit" }] },
	{ Id: "view", Label: "&View", Items: [{ Id: "status", Label: "&Status Bar", Checkable: true, Checked: true }] },
	{ Id: "help", Label: "&Help", Items: [{ Id: "about", Label: "&About" }] },
] }));
menu.Events.On("invoke", (item) => Log("Menu", MenuController.StripMnemonic(item.Label)));

const tree = UseControl(new TreeViewController({ Nodes: [
	{ Id: "pc", Label: "My Computer", Children: [{ Id: "c", Label: "Local Disk (C:)", Children: [{ Id: "windows", Label: "WINDOWS" }] }, { Id: "d", Label: "CD Drive (D:)" }] },
	{ Id: "network", Label: "My Network Places" },
] }));
tree.Events.On("selection-change", (node) => Log("Tree", node.Label));

type FileRow = { name: string; size: number; type: string; };
const files = UseControl(new ListViewController<FileRow>({ Items: [
	{ name: "autoexec.bat", size: 1, type: "MS-DOS Batch File" },
	{ name: "readme.txt", size: 4, type: "Text Document" },
	{ name: "setup.exe", size: 512, type: "Application" },
	{ name: "boot.ini", size: 1, type: "Configuration Settings" },
] }));
files.Events.On("selection-change", (indices) => Log("List", `${indices.length} selected`));
files.Events.On("activate", (_index, file) => Log("List", `opened ${file.name}`));
files.Events.On("sort", (column) => Log("List", `sorted by ${column}`));
const fileColumns = [
	{ Key: "name", Label: "Name" },
	{ Key: "size", Label: "Size (KB)", Compare: (a: FileRow, b: FileRow) => a.size - b.size },
	{ Key: "type", Label: "Type" },
];
//#endregion

//#region more controls
const toolbar = UseControl(new ToolbarController({ Buttons: [
	{ Id: "new", Label: "New" },
	{ Id: "bold", Label: "Bold", Toggle: true },
	{ Id: "left", Label: "Left", Toggle: true, Group: "align", Pressed: true },
	{ Id: "center", Label: "Center", Toggle: true, Group: "align" },
	{ Id: "print", Label: "Print", Disabled: true },
] }));
toolbar.Events.On("click", (id) => Log("Toolbar", id));

const status = UseControl(new StatusBarController({ Panels: [{ Text: "Ready" }, { Text: "0 characters", Width: 110 }] }));
const text = UseControl(new TextBoxController({ Placeholder: "Type here", MaxLength: 40 }));
text.Events.On("change", (value) => status.SetText(1, `${value.length} characters`));

const copies = UseControl(new SpinnerController({ Min: 1, Max: 99, Value: 5 }));
copies.Events.On("change", (value) => Log("Spinner", String(value)));

const font = UseControl(new ComboBoxController({ Options: ["Tahoma", "Courier New", "Times New Roman", "Comic Sans MS"].map((name) => ({ Value: name, Label: name })), SelectedIndex: 0 }));
font.Events.On("change", (_index, name) => Log("Font", name));

const scroll = UseControl(new ScrollBarController({ Max: 100, PageSize: 20, Horizontal: true }));
scroll.Events.On("scroll", (value) => Log("Scroll", String(value)));

const tip = UseControl(new TooltipController({ Text: "Shows a classic message box" }));
tip.Events.On("show", () => Log("Tooltip", "shown"));

// The box is already reactive (UseControl); shallowRef only tracks which box is open.
const message = shallowRef<MessageBoxController | null>(null);
const ask = UseControl(new ButtonController({ Label: "Message box..." }));
ask.Events.On("click", () => {
	const box = UseControl(new MessageBoxController({ Title: "Notepad", Text: "Do you want to save changes?", Icon: MessageBoxIcon.Warning, Buttons: MessageBoxButtons.YesNoCancel }));
	box.Events.On("close", (result) => {
		Log("Message box", MessageBoxController.Label(result));
		message.value = null;
	});
	message.value = box;
});
//#endregion

//#region windows
const manager = UseControl(new WindowManager());
const StateNames = { [WindowState.Normal]: "normal", [WindowState.Minimized]: "minimized", [WindowState.Maximized]: "maximized" };
const windows = [
	new WindowController({ Title: "Themes", X: 12, Y: 12, Width: 250, Height: 400 }),
	new WindowController({ Title: "Controls", X: 276, Y: 12, Width: 380, Height: 360 }),
	new WindowController({ Title: "Explorer", X: 120, Y: 200, Width: 560, Height: 300 }),
	new WindowController({ Title: "More controls", X: 160, Y: 60, Width: 420, Height: 330 }),
	new WindowController({ Title: "Event log", X: 690, Y: 12, Width: 300, Height: 360 }),
].map((window) => {
	const reactiveWindow = UseControl(window);
	manager.Add(reactiveWindow);
	return reactiveWindow;
});
const [themesWindow, controlsWindow, explorerWindow, moreWindow, logWindow] = windows as [WindowController, WindowController, WindowController, WindowController, WindowController];
moreWindow.Minimize(); // waits on the taskbar, so the other windows stay in view

// Logged from here on: what the user does, not the initial layout.
for (const window of windows) {
	window.Events.On("state-change", (state) => Log("Window", `${window.Title} ${StateNames[state]}`));
	window.Events.On("close", () => Log("Window", `${window.Title} closed`));
}
//#endregion
</script>

<template>
	<WinThemeProvider :theme="theme" :kit="kit" :tailwind="tailwind" class="gallery">
		<WinDesktop :manager="manager">
			<WinWindow :controller="themesWindow" :manager="manager">
				<WinRadioGroup :controller="kits" class="gallery-kit" />
				<div v-if="kit === WinKit.Classic" class="gallery-classic">
					<WinRadioGroup :controller="themes" />
				</div>
				<div v-else class="gallery-tailwind">
					<label>Accent <WinComboBox :controller="accents" /></label>
					<label>Neutral <WinComboBox :controller="neutrals" /></label>
					<label>Radius <WinComboBox :controller="radii" /></label>
					<WinSwitch :controller="dark" />
				</div>
			</WinWindow>

			<WinWindow :controller="controlsWindow" :manager="manager">
				<div class="gallery-row">
					<WinButton :controller="push" />
					<WinButton :controller="step" />
				</div>
				<WinProgressBar :controller="progress" />
				<div class="gallery-row">
					<WinCheckBox :controller="hidden" />
					<WinCheckBox :controller="marquee" />
				</div>
				<WinRadioGroup :controller="size" />
				<WinSlider :controller="volume" />
				<WinTabs :controller="tabs">
					<template #general>General settings: drag the windows, resize them by the borders, try the keyboard.</template>
					<template #advanced>Advanced settings: every control's state is a field on its controller.</template>
				</WinTabs>
			</WinWindow>

			<WinWindow :controller="explorerWindow" :manager="manager">
				<WinMenuBar :controller="menu" />
				<div class="gallery-explorer">
					<WinTreeView :controller="tree" />
					<WinListView :controller="files" :columns="fileColumns" />
				</div>
			</WinWindow>

			<WinWindow :controller="moreWindow" :manager="manager">
				<WinToolbar :controller="toolbar" />
				<div class="gallery-row">
					<WinTextBox :controller="text" />
					<WinSpinner :controller="copies" />
					<WinComboBox :controller="font" />
				</div>
				<WinGroupBox title="Scrolling">
					<WinScrollBar :controller="scroll" />
				</WinGroupBox>
				<div class="gallery-row">
					<WinTooltip :controller="tip">
						<WinButton :controller="ask" />
					</WinTooltip>
				</div>
				<WinStatusBar :controller="status" />
			</WinWindow>

			<WinWindow :controller="logWindow" :manager="manager">
				<ul class="gallery-log">
					<li v-for="(line, index) in log" :key="index">{{ line }}</li>
				</ul>
			</WinWindow>
		</WinDesktop>
		<WinMessageBox v-if="message" :controller="message" />
	</WinThemeProvider>
</template>

<style scoped>
.gallery { height: 100%; }
.gallery-row { display: flex; gap: 8px; margin: 6px 0; }
.gallery-kit { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid currentColor; border-bottom-color: color-mix(in srgb, currentColor 25%, transparent); }
.gallery-tailwind { display: flex; flex-direction: column; gap: 8px; }
.gallery-tailwind > label:not(.win-switch) { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 6px; }
.gallery-explorer { display: grid; grid-template-columns: 180px 1fr; gap: 4px; height: calc(100% - 24px); margin-top: 2px; }
.gallery-log { margin: 0; padding: 0 0 0 14px; font-family: "Lucida Console", "Courier New", monospace; }
</style>
