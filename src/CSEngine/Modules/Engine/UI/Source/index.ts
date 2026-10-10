// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * @cse/core/ui - the UI toolkit and the runtime of UI documents: everything games show and editor tools build on.
 * Editor-only tooling (the UI designer) lives in Modules/Editor/UIDesigner and imports from here.
 */

// Core: events, controls, themes, kits
export * from "./Core/ControlBase";
export * from "./Core/EventHub";
export * from "./Core/Kits";
export * from "./Core/PointerTracking";
export * from "./Core/Themes";
export * from "./Core/UseControl";

// Controllers
export * from "./Controls/ButtonController";
export * from "./Controls/LabelController";
export * from "./Controls/CheckBoxController";
export * from "./Controls/ComboBoxController";
export * from "./Controls/ListViewController";
export * from "./Controls/MenuController";
export * from "./Controls/MessageBoxController";
export * from "./Controls/ProgressBarController";
export * from "./Controls/RadioGroupController";
export * from "./Controls/ScrollBarController";
export * from "./Controls/SliderController";
export * from "./Controls/SpinnerController";
export * from "./Controls/SplitterController";
export * from "./Controls/StatusBarController";
export * from "./Controls/TabsController";
export * from "./Controls/TextBoxController";
export * from "./Controls/ToolbarController";
export * from "./Controls/TooltipController";
export * from "./Controls/TreeViewController";
export * from "./Controls/WindowController";
export * from "./Controls/WindowManager";

// Components
export * from "./Components/Keys";
export { default as WinButton } from "./Components/WinButton.vue";
export { default as WinCheckBox } from "./Components/WinCheckBox.vue";
export { default as WinComboBox } from "./Components/WinComboBox.vue";
export { default as WinDesktop } from "./Components/WinDesktop.vue";
export { default as WinGroupBox } from "./Components/WinGroupBox.vue";
export { default as WinListView } from "./Components/WinListView.vue";
export { default as WinMenuBar } from "./Components/WinMenuBar.vue";
export { default as WinMessageBox } from "./Components/WinMessageBox.vue";
export { default as WinProgressBar } from "./Components/WinProgressBar.vue";
export { default as WinRadioGroup } from "./Components/WinRadioGroup.vue";
export { default as WinScrollBar } from "./Components/WinScrollBar.vue";
export { default as WinSlider } from "./Components/WinSlider.vue";
export { default as WinSpinner } from "./Components/WinSpinner.vue";
export { default as WinSplitter } from "./Components/WinSplitter.vue";
export { default as WinStatusBar } from "./Components/WinStatusBar.vue";
export { default as WinSwitch } from "./Components/WinSwitch.vue";
export { default as WinTabs } from "./Components/WinTabs.vue";
export { default as WinTextBox } from "./Components/WinTextBox.vue";
export { default as WinThemeProvider } from "./Components/WinThemeProvider.vue";
export { default as WinToolbar } from "./Components/WinToolbar.vue";
export { default as WinTooltip } from "./Components/WinTooltip.vue";
export { default as WinTreeView } from "./Components/WinTreeView.vue";
export { default as WinWindow } from "./Components/WinWindow.vue";

// Skins
export * from "./Skins/Skin";
export * from "./Skins/SkinPresets";
export * from "./Skins/UseSkinStyle";

// UI documents: model, widgets, runtime, scripts, node graphs, dialogs
export * from "./Documents/Anchors";
export * from "./Documents/DialogResult";
export * from "./Documents/Graph";
export * from "./Documents/UiDocument";
export * from "./Documents/UiScript";
export * from "./Documents/Widgets";
export { CreateNode, IsClickThrough, NewLayout, ParseLayout, SerializeLayout, type LayoutNode, type UiLayout } from "./Documents/Layout";
export { DialogService, type OpenDialog } from "./Documents/Dialogs";
export * from "./Documents/UiManifest";
export * from "./Documents/UiManager";
export { default as WinUiHost } from "./Documents/WinUiHost.vue";
export { default as WinDialogHost } from "./Documents/WinDialogHost.vue";
export { default as WinLayoutNode } from "./Documents/WinLayoutNode.vue";
export { default as WinLayoutView } from "./Documents/WinLayoutView.vue";
