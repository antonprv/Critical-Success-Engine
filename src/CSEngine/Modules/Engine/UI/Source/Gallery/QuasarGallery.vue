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

function Layout(row: QuasarComponentRow, state: State): UiLayout {
	const layout = NewLayout(`${row.Name} ${state}`);
	const node = CreateNode(row.Type, "Widget", 8, 8);
	if (state === "disabled") node.Props["disable"] = true;
	if (state === "error") Object.assign(node.Props, { error: true, "error-message": "Error" });
	// Popups show their content inline here: a dialog, menu or tooltip open in place would cover the page.
	if (["QDialog", "QMenu", "QTooltip", "QPopupProxy"].includes(row.Name)) node.Content = row.Name;
	layout.Root.Children!.push(node);
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
				<div v-for="item in cell.documents" :key="item.state" class="quasar-gallery__cell" :data-state="item.state" :style="{ width: `${cell.row.Size[0] + 16}px`, height: `${cell.row.Size[1] + 16}px` }">
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
