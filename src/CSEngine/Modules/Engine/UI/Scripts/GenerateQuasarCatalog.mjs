// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Builds the Quasar catalog from the API descriptions Quasar ships (quasar/dist/api/*.json):
//   Source/Quasar/QuasarTable.generated.ts    - what the runtime needs: every component's type, group, slots, events,
//                                               model and loader (each component is its own lazy chunk);
//   Source/Quasar/QuasarCatalog.generated.json - what the designer needs: props with kinds, defaults, choices and
//                                               descriptions, slots, events, methods; directives; plugins.
// Run: node Scripts/GenerateQuasarCatalog.mjs (after a Quasar update). Tests/Quasar/Catalog.test.ts fails while the
// generated files are out of date.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const quasarRoot = dirname(require.resolve("quasar/package.json"));

/** The palette group of every component (Quasar's documentation groups them alike). */
export const Groups = {
	Layout: ["QLayout", "QHeader", "QFooter", "QDrawer", "QPageContainer", "QPage", "QPageSticky", "QPageScroller", "QToolbar", "QToolbarTitle", "QBar", "QSpace", "QSeparator", "QSplitter", "QResponsive", "QNoSsr"],
	Containers: ["QCard", "QCardSection", "QCardActions", "QExpansionItem", "QScrollArea", "QForm", "QBanner"],
	Buttons: ["QBtn", "QBtnGroup", "QBtnDropdown", "QBtnToggle", "QFab", "QFabAction"],
	Forms: ["QInput", "QField", "QSelect", "QFile", "QCheckbox", "QRadio", "QToggle", "QOptionGroup", "QSlider", "QRange", "QKnob", "QRating", "QPopupEdit"],
	Pickers: ["QDate", "QTime", "QColor", "QEditor", "QUploader", "QUploaderAddTrigger"],
	Navigation: ["QTabs", "QTab", "QRouteTab", "QTabPanels", "QTabPanel", "QBreadcrumbs", "QBreadcrumbsEl", "QPagination", "QStepper", "QStep", "QStepperNavigation"],
	Data: ["QTable", "QTr", "QTh", "QTd", "QMarkupTable", "QList", "QItem", "QItemSection", "QItemLabel", "QTree", "QVirtualScroll", "QInfiniteScroll", "QTimeline", "QTimelineEntry", "QSlideItem", "QChatMessage"],
	Popups: ["QDialog", "QMenu", "QTooltip", "QPopupProxy"],
	Feedback: ["QAjaxBar", "QLinearProgress", "QCircularProgress", "QSkeleton", "QInnerLoading", "QBadge", "QChip", "QAvatar", "QIcon"],
	Spinners: [],
	Media: ["QImg", "QVideo", "QCarousel", "QCarouselSlide", "QCarouselControl", "QParallax"],
	Behaviour: ["QPullToRefresh", "QSlideTransition", "QIntersection", "QResizeObserver", "QScrollObserver"],
};

/** Size when dropped from the palette, by group, and for the components that need their own. */
const GroupSizes = { Layout: [480, 320], Containers: [280, 160], Buttons: [96, 36], Forms: [220, 56], Pickers: [300, 360], Navigation: [320, 48], Data: [360, 220], Popups: [120, 36], Feedback: [120, 24], Spinners: [40, 40], Media: [320, 200], Behaviour: [200, 120] };
const Sizes = {
	QLayout: [640, 420], QHeader: [480, 50], QFooter: [480, 50], QDrawer: [220, 320], QToolbar: [480, 50], QToolbarTitle: [200, 30], QBar: [480, 32], QSpace: [40, 20], QSeparator: [200, 2],
	QCheckbox: [160, 40], QRadio: [160, 40], QToggle: [160, 40], QRating: [160, 32], QKnob: [80, 80], QSlider: [220, 40], QRange: [220, 40], QOptionGroup: [200, 96],
	QBtnToggle: [220, 36], QBtnGroup: [220, 36], QBtnDropdown: [140, 36], QFab: [56, 56], QFabAction: [40, 40],
	QDate: [290, 380], QTime: [290, 380], QColor: [250, 330], QEditor: [420, 240], QUploader: [320, 240], QUploaderAddTrigger: [40, 40],
	QTab: [90, 48], QPagination: [260, 36], QBreadcrumbs: [300, 24], QStepper: [480, 300],
	QItem: [280, 48], QItemSection: [120, 40], QItemLabel: [120, 20], QTimelineEntry: [320, 100], QChatMessage: [300, 80], QTable: [480, 300], QTree: [260, 240],
	QIcon: [24, 24], QAvatar: [40, 40], QBadge: [32, 20], QChip: [100, 32], QLinearProgress: [200, 6], QCircularProgress: [48, 48], QSkeleton: [200, 24], QInnerLoading: [120, 120], QAjaxBar: [480, 4],
	QImg: [240, 160], QVideo: [320, 180], QCarouselControl: [100, 40],
};

/** Props a component starts with when dropped from the palette, so it shows something. */
const Starters = {
	QBtn: { label: "Button", color: "primary" }, QBtnDropdown: { label: "Dropdown", color: "primary" }, QFab: { icon: "add", color: "primary", direction: "up" }, QFabAction: { icon: "mail", color: "primary" },
	QBtnToggle: { "model-value": "one", options: [{ label: "One", value: "one" }, { label: "Two", value: "two" }, { label: "Three", value: "three" }] },
	QInput: { label: "Text", "model-value": "" }, QField: { label: "Field" }, QSelect: { label: "Choose", "model-value": null, options: ["Option 1", "Option 2", "Option 3"] }, QFile: { label: "File", "model-value": null },
	QCheckbox: { label: "Check box", "model-value": false }, QRadio: { label: "Radio", "model-value": "a", val: "a" }, QToggle: { label: "Toggle", "model-value": false },
	QOptionGroup: { "model-value": "a", options: [{ label: "Option A", value: "a" }, { label: "Option B", value: "b" }] },
	QSlider: { "model-value": 50, min: 0, max: 100 }, QRange: { "model-value": { min: 20, max: 80 }, min: 0, max: 100 }, QKnob: { "model-value": 40, min: 0, max: 100, "show-value": true }, QRating: { "model-value": 3, max: 5 },
	QDate: { "model-value": "2026/01/01" }, QTime: { "model-value": "12:00" }, QColor: { "model-value": "#3f51b5" }, QEditor: { "model-value": "Text" },
	QUploader: { label: "Upload" }, QPopupEdit: { "model-value": "" },
	QTabs: { "model-value": "one" }, QTab: { name: "one", label: "Tab" }, QRouteTab: { name: "route", label: "Route" }, QTabPanels: { "model-value": "one" }, QTabPanel: { name: "one" },
	QBreadcrumbsEl: { label: "Home" }, QPagination: { "model-value": 1, max: 5 }, QStepper: { "model-value": 1 }, QStep: { name: 1, title: "Step" },
	QTable: { title: "Table", "row-key": "name", columns: [{ name: "name", label: "Name", field: "name", align: "left", sortable: true }, { name: "value", label: "Value", field: "value", sortable: true }], rows: [{ name: "Alpha", value: 1 }, { name: "Beta", value: 2 }, { name: "Gamma", value: 3 }] },
	QTree: { "node-key": "label", nodes: [{ label: "Root", children: [{ label: "Child 1" }, { label: "Child 2" }] }] },
	QVirtualScroll: { items: ["Item 1", "Item 2", "Item 3"] }, QSplitter: { "model-value": 50 },
	QTimelineEntry: { title: "Event", subtitle: "Today" }, QChatMessage: { name: "Me", text: ["Hello"], sent: true },
	QExpansionItem: { label: "Details" }, QBanner: {}, QToolbarTitle: {}, QItemLabel: {},
	QDialog: { "model-value": false }, QMenu: {}, QTooltip: {},
	QLinearProgress: { value: 0.5 }, QCircularProgress: { value: 50, "show-value": true }, QBadge: { label: "1" }, QChip: { label: "Chip" }, QAvatar: { icon: "person", color: "primary", "text-color": "white" }, QIcon: { name: "star" },
	QImg: { src: "", ratio: 1.5 }, QVideo: { src: "" }, QCarousel: { "model-value": 1 }, QCarouselSlide: { name: 1 },
	QSkeleton: { type: "text" },
};

/** Widgets a container starts with when dropped from the palette, so it is whole at once (tabs with tabs, a list with items). */
const StarterChildren = {
	QTabs: [{ Type: "q-tab", Props: { name: "one", label: "One" } }, { Type: "q-tab", Props: { name: "two", label: "Two" } }, { Type: "q-tab", Props: { name: "three", label: "Three" } }],
	QTabPanels: [{ Type: "q-tab-panel", Props: { name: "one" }, Content: "First panel" }, { Type: "q-tab-panel", Props: { name: "two" }, Content: "Second panel" }],
	QList: [{ Type: "q-item", Props: { clickable: true }, Children: [{ Type: "q-item-section", Content: "First item" }] }, { Type: "q-item", Props: { clickable: true }, Children: [{ Type: "q-item-section", Content: "Second item" }] }],
	QItem: [{ Type: "q-item-section", Props: { avatar: true }, Children: [{ Type: "q-icon", Props: { name: "star" } }] }, { Type: "q-item-section", Content: "Item" }],
	QCard: [{ Type: "q-card-section", Content: "Card" }, { Type: "q-card-actions", Children: [{ Type: "q-btn", Props: { flat: true, label: "Action" } }] }],
	QToolbar: [{ Type: "q-btn", Props: { flat: true, round: true, icon: "menu" } }, { Type: "q-toolbar-title", Content: "Title" }],
	QBtnGroup: [{ Type: "q-btn", Props: { label: "One" } }, { Type: "q-btn", Props: { label: "Two" } }],
	QBreadcrumbs: [{ Type: "q-breadcrumbs-el", Props: { label: "Home" } }, { Type: "q-breadcrumbs-el", Props: { label: "Page" } }],
	QTimeline: [{ Type: "q-timeline-entry", Props: { title: "Started", subtitle: "Monday" } }, { Type: "q-timeline-entry", Props: { title: "Done", subtitle: "Friday" } }],
	QStepper: [{ Type: "q-step", Props: { name: 1, title: "First" }, Content: "Step one" }, { Type: "q-step", Props: { name: 2, title: "Second" }, Content: "Step two" }],
	QCarousel: [{ Type: "q-carousel-slide", Props: { name: 1 }, Content: "Slide one" }, { Type: "q-carousel-slide", Props: { name: 2 }, Content: "Slide two" }],
	QExpansionItem: [{ Type: "q-card-section", Content: "Details inside" }],
	QFab: [{ Type: "q-fab-action", Props: { icon: "mail", color: "primary" } }, { Type: "q-fab-action", Props: { icon: "alarm", color: "primary" } }],
	QBar: [{ Type: "q-icon", Props: { name: "laptop" } }, { Type: "q-space" }, { Type: "q-btn", Props: { dense: true, flat: true, icon: "close" } }],
	QLayout: [{ Type: "q-header", Children: [{ Type: "q-toolbar", Children: [{ Type: "q-toolbar-title", Content: "App" }] }] }, { Type: "q-page-container", Children: [{ Type: "q-page", Content: "Page" }] }],
	QBtnDropdown: [{ Type: "q-list", Children: [{ Type: "q-item", Props: { clickable: true }, Children: [{ Type: "q-item-section", Content: "Choice" }] }] }],
	QMarkupTable: [],
};

/** Text a component with a default slot shows when it has no child widgets (a card section's line, a toolbar title). */
const StarterText = { QToolbarTitle: "Title", QItemLabel: "Label", QCardSection: "Card section", QBanner: "Banner", QTooltip: "Tooltip", QTabPanel: "Tab panel", QCarouselSlide: "Slide", QStep: "Step content", QField: "Field", QMenu: "", QDialog: "" };

/** Quasar's mixin description, not a component. */
const NotComponents = new Set(["QFormChildMixin"]);

const Strip = (types) => (Array.isArray(types) ? types : [types]).filter((type) => type !== "null" && type !== "undefined");

/** The designer's kind of a prop: what it edits and what a layout file may hold; null when JSON can't express it. */
export function KindOf(name, prop) {
	if (prop.tsType === "ValidationRule") return "rules";
	const types = Strip(prop.type);
	const set = new Set(types);
	const only = (...allowed) => types.length > 0 && types.every((type) => allowed.includes(type));
	if (only("Boolean")) return "boolean";
	if (only("Number")) return "number";
	if (only("String")) return prop.values ? "choice" : "text";
	if (only("String", "Number")) return "text";
	if (set.has("Function") && set.has("String") && types.length === 2) return "text";
	if (types.some((type) => ["Element", "ComponentInstance", "File", "FileList", "RegExp"].includes(type)) && !set.has("String") && !set.has("Array")) return null;
	if (only("Function")) return null;
	return "json";
}

/** A default as JSON: Quasar writes it as a JS literal ("'center'", "true", "[]"); anything that isn't JSON is left out. */
export function DefaultOf(prop) {
	if (typeof prop.default !== "string") return undefined;
	const text = prop.default.trim();
	if (/^'[^']*'$/.test(text)) return text.slice(1, -1);
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** The first sentence of a description, for the inspector's tooltip. */
const Short = (text) => (text ?? "").split(/(?<=\.)\s/)[0].slice(0, 240);

/** "QBtnDropdown" -> "q-btn-dropdown": the type of the component in layout files. */
export const TypeOf = (name) => name.replace(/[A-Z]/g, (letter, at) => `${at === 0 ? "" : "-"}${letter.toLowerCase()}`);

function Exports(file) {
	const out = {};
	for (const match of readFileSync(join(quasarRoot, "src", file), "utf8").matchAll(/export \{ default as (\w+) \} from '\.\/(.+?)'/g)) out[match[1]] = `quasar/src/${match[2]}`;
	return out;
}

function GroupOf(name) {
	if (name.startsWith("QSpinner")) return "Spinners";
	for (const [group, names] of Object.entries(Groups)) if (names.includes(name)) return group;
	throw new Error(`${name} has no palette group: add it to Groups in GenerateQuasarCatalog.mjs`);
}

/** Reads Quasar's API descriptions into the catalog (no files written). */
export function BuildCatalog() {
	const api = join(quasarRoot, "dist", "api");
	const version = JSON.parse(readFileSync(join(quasarRoot, "package.json"), "utf8")).version;
	const components = Exports("components.js");
	const directives = Exports("directives.js");
	const plugins = Exports("plugins.js");
	const catalog = { Version: version, Components: [], Directives: [], Plugins: [], Languages: readdirSync(join(quasarRoot, "lang")).filter((file) => file.endsWith(".js")).map((file) => file.slice(0, -3)).sort() };

	for (const file of readdirSync(api).sort()) {
		const name = file.replace(/\.json$/, "");
		const info = JSON.parse(readFileSync(join(api, file), "utf8"));
		const docs = info.meta?.docsUrl ?? "";
		if (info.type === "component") {
			if (NotComponents.has(name)) continue;
			if (!components[name]) throw new Error(`${name} isn't exported by quasar/src/components.js`);
			const props = [];
			const unsupported = [];
			for (const [key, prop] of Object.entries(info.props ?? {})) {
				const kind = KindOf(key, prop);
				if (kind === null) {
					unsupported.push(key);
					continue;
				}
				const entry = { Key: key, Kind: kind, Category: prop.category ?? "general", Description: Short(prop.desc) };
				const fallback = DefaultOf(prop);
				if (fallback !== undefined) entry.Default = fallback;
				if (prop.values) entry.Choices = prop.values.map((value) => DefaultOf({ default: value }) ?? value).filter((value) => typeof value === "string");
				if (prop.examples && kind !== "json") entry.Examples = prop.examples.filter((example) => !example.startsWith("#")).map((example) => DefaultOf({ default: example }) ?? example).filter((example) => typeof example === "string").slice(0, 8);
				if (prop.required) entry.Required = true;
				props.push(entry);
			}
			const group = GroupOf(name);
			catalog.Components.push({
				Name: name,
				Type: TypeOf(name),
				Group: group,
				Docs: docs,
				Module: components[name],
				Size: Sizes[name] ?? GroupSizes[group],
				Model: "model-value" in (info.props ?? {}),
				Props: props,
				Unsupported: unsupported,
				Starter: Starters[name] ?? {},
				...(StarterChildren[name]?.length ? { Children: StarterChildren[name] } : {}),
				...(name in StarterText ? { Text: StarterText[name] } : {}),
				// "..." stands for "any other slot" in Quasar's description, not a slot of its own.
				Slots: Object.keys(info.slots ?? {}).filter((slot) => slot !== "..."),
				Events: Object.keys(info.events ?? {}),
				Methods: Object.keys(info.methods ?? {}),
			});
		} else if (info.type === "directive") {
			catalog.Directives.push({
				Name: name,
				Attr: `v-${TypeOf(name)}`,
				Docs: docs,
				Module: directives[name],
				Value: Strip(info.value?.type ?? "Boolean"),
				Description: Short(info.value?.desc),
				Arg: info.arg ? Short(info.arg.desc) : null,
				Modifiers: Object.keys(info.modifiers ?? {}),
			});
		} else if (info.type === "plugin") {
			catalog.Plugins.push({
				Name: name,
				Docs: docs,
				Module: plugins[name] ?? null,
				Injection: info.injection ?? null,
				Methods: Object.keys(info.methods ?? {}),
			});
		}
	}
	return catalog;
}

const Header = "// Generated by Scripts/GenerateQuasarCatalog.mjs from quasar/dist/api: don't edit, run the script.\n";

/** The runtime table: small, one lazy loader per component. */
export function RenderTable(catalog) {
	const rows = catalog.Components.map((component) => {
		const row = { Name: component.Name, Type: component.Type, Group: component.Group, Size: component.Size, Model: component.Model, Slots: component.Slots, Events: component.Events, Starter: component.Starter };
		if (component.Text !== undefined) row.Text = component.Text;
		if (component.Children) row.Children = component.Children;
		return `\t${JSON.stringify(row).slice(0, -1)},"Load":() => import("${component.Module}")},`;
	});
	const directives = catalog.Directives.map((directive) => `\t{ Name: "${directive.Name}", Attr: "${directive.Attr}", Load: () => import("${directive.Module}") },`);
	const languages = catalog.Languages.map((code) => `\t"${code}": () => import("quasar/lang/${code}.js"),`);
	return `${Header}
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient declarations (Quasar's sources) reach every package that compiles this file only this way
/// <reference path="./QuasarSources.d.ts" />
import type { QuasarComponentRow, QuasarDirectiveRow } from "./QuasarTypes";

/** The Quasar version the catalog was built from. */
export const QuasarVersion = "${catalog.Version}";

/** Every Quasar component: what the runtime needs to draw it in a UI document. */
export const QuasarComponentTable: readonly QuasarComponentRow[] = [
${rows.join("\n")}
];

/** Every Quasar directive, by the name layouts use. */
export const QuasarDirectiveTable: readonly QuasarDirectiveRow[] = [
${directives.join("\n")}
];

/** Quasar's own texts (a date picker's month names, a table's "Records per page") in every language it has. */
export const QuasarLanguageTable: Readonly<Record<string, () => Promise<{ default: unknown; }>>> = {
${languages.join("\n")}
};
`;
}

export function RenderCatalog(catalog) {
	return `${JSON.stringify(catalog, null, "\t")}\n`;
}

export const TableFile = resolve(here, "../Source/Quasar/QuasarTable.generated.ts");
export const CatalogFile = resolve(here, "../Source/Quasar/QuasarCatalog.generated.json");

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const catalog = BuildCatalog();
	writeFileSync(TableFile, RenderTable(catalog));
	writeFileSync(CatalogFile, RenderCatalog(catalog));
	console.log(`Quasar ${catalog.Version}: ${catalog.Components.length} components, ${catalog.Directives.length} directives, ${catalog.Plugins.length} plugins.`);
}
