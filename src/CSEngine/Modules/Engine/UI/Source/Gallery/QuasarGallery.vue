<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { AllKits, DefaultQuasarTheme, DefaultTailwindTheme, KitLabels, WinKit, type TailwindTheme } from "../Core/Kits";
import { AllThemes, WinTheme } from "../Core/Themes";
import WinThemeProvider from "../Components/WinThemeProvider.vue";
import { CreateNode, NewLayout, ParseLayout, type UiLayout } from "../Documents/Layout";
import { UiDocument } from "../Documents/UiDocument";
import WinLayoutView from "../Documents/WinLayoutView.vue";
import { QuasarComponentTable } from "../Quasar/QuasarTable.generated";
import type { QuasarComponentRow } from "../Quasar/QuasarTypes";
import type { JsonValue } from "../Documents/Json";

// Every Quasar component as a widget of a UI document, in each of its states, in the kit and theme picked: what the
// screenshot tests photograph (?kit=classic|tailwind, &theme=, &dark=1, &only=QBtn,QInput).

const query = new URLSearchParams(location.search);
const kit = ref((query.get("kit") as WinKit | null) ?? WinKit.Classic);
const theme = ref((query.get("theme") as WinTheme | null) ?? WinTheme.XpBlue);
const tailwind = reactive<TailwindTheme>({ ...(kit.value === WinKit.Quasar ? DefaultQuasarTheme : DefaultTailwindTheme), Dark: query.get("dark") === "1" });
const only = query.get("only")?.split(",") ?? null;
/** ?sample=PropertyEditor: one of the sample apps (Content/Samples) instead of the components. */
const Samples = import.meta.glob<string>("../../Content/Samples/*.ui.json", { query: "?raw", import: "default", eager: true });
const sampleName = query.get("sample");
const sampleText = sampleName ? Samples[`../../Content/Samples/${sampleName}.ui.json`] : undefined;
const sample = sampleText ? new UiDocument(ParseLayout(sampleText)) : null;
const rows = QuasarComponentTable.filter((row) => !only || only.includes(row.Name));

/**
 * The states a component is shown in: as it starts, hovered and focused (the screenshot tests point and tab at those
 * two), disabled, and with an error (fields).
 */
const States = ["normal", "hover", "focus", "disabled", "error"] as const;
type State = (typeof States)[number];

/**
 * Components that draw only inside another one (QuasarView's Parents): shown in it - the parent's type, the slot they
 * go into and the parent's props. QRouteTab stays alone (it needs Vue Router, which a UI document has not), and so do
 * QHeader and QFooter (a layout in a cell isn't the page's): they show where they go.
 */
const Parents: Record<string, { Type: string; Slot?: string; Props?: Record<string, JsonValue>; Child?: Record<string, JsonValue>; }> = {
	QTab: { Type: "q-tabs", Props: { "model-value": "one" }, Child: { name: "one", label: "Tab" } },
	QStep: { Type: "q-stepper", Props: { "model-value": 1 }, Child: { name: 1, title: "Step" } },
	QTimelineEntry: { Type: "q-timeline", Child: { title: "Entry", subtitle: "Today" } },
	QUploaderAddTrigger: { Type: "q-uploader", Slot: "header" },
};

/** What a component's cell holds: it, or its parent with it. */
function CellSize(row: QuasarComponentRow): readonly [number, number] {
	const parent = Parents[row.Name];
	const holder = parent && QuasarComponentTable.find((entry) => entry.Type === parent.Type);
	return holder ? [holder.Size[0], holder.Size[1]] : [row.Size[0], row.Size[1]];
}

function Layout(row: QuasarComponentRow, state: State): UiLayout {
	const layout = NewLayout(`${row.Name} ${state}`);
	const parent = Parents[row.Name];
	const node = CreateNode(row.Type, "Widget", parent ? 0 : 8, parent ? 0 : 8);
	if (state === "disabled") node.Props["disable"] = true;
	if (state === "error") Object.assign(node.Props, { error: true, "error-message": "Error" });
	// Popups show their content inline here: a dialog, menu or tooltip open in place would cover the page.
	if (["QDialog", "QMenu", "QTooltip", "QPopupProxy"].includes(row.Name)) node.Content = row.Name;
	if (!parent) {
		layout.Root.Children!.push(node);
		return layout;
	}
	const holder = CreateNode(parent.Type, "Parent", 8, 8);
	[holder.Width, holder.Height] = CellSize(row);
	Object.assign(holder.Props, parent.Props ?? {});
	Object.assign(node.Props, parent.Child ?? {});
	if (parent.Slot) node.Slot = parent.Slot;
	holder.Children = [node];
	layout.Root.Children!.push(holder);
	return layout;
}

const cells = computed(() => (sample ? [] : rows).map((row) => ({
	row,
	documents: States.map((state) => ({ state, document: new UiDocument(Layout(row, state)) })),
})));
</script>

<template>
	<WinThemeProvider :theme="theme" :kit="kit" :tailwind="tailwind">
		<div class="quasar-gallery">
			<header class="quasar-gallery__bar">
				<label>Kit <select v-model="kit"><option v-for="k in AllKits" :key="k" :value="k">{{ KitLabels[k] }}</option></select></label>
				<label>Theme <select v-model="theme"><option v-for="t in AllThemes" :key="t.Id" :value="t.Id">{{ t.Name }}</option></select></label>
				<label><input v-model="tailwind.Dark" type="checkbox"> Dark</label>
				<span v-if="sample">{{ sample.Layout.Name }}</span>
				<span v-else>{{ rows.length }} components</span>
			</header>
			<div v-if="sample" class="quasar-gallery__sample" data-sample>
				<WinLayoutView :document="sample" />
			</div>
			<section v-for="cell in cells" :key="cell.row.Name" class="quasar-gallery__row" :data-component="cell.row.Name">
				<h3>{{ cell.row.Name }} <small>{{ cell.row.Group }}</small></h3>
				<div v-for="item in cell.documents" :key="item.state" class="quasar-gallery__cell" :data-state="item.state" :style="{ width: `${CellSize(cell.row)[0] + 16}px`, height: `${CellSize(cell.row)[1] + 16}px` }">
					<WinLayoutView :document="item.document" />
				</div>
			</section>
		</div>
	</WinThemeProvider>
</template>

<style>
.quasar-gallery { height: 100%; overflow: auto; padding: 8px; box-sizing: border-box; font: 12px sans-serif; }
.quasar-gallery__bar { position: sticky; top: 0; z-index: 10; display: flex; gap: 16px; align-items: center; padding: 6px; background: Canvas; border-bottom: 1px solid #8888; }
.quasar-gallery__row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #8884; }
.quasar-gallery__row h3 { width: 160px; margin: 0; font-size: 12px; }
.quasar-gallery__row small { display: block; font-weight: normal; opacity: 0.6; }
.quasar-gallery__cell { position: relative; }
.quasar-gallery__sample { position: relative; height: calc(100% - 60px); }
</style>
