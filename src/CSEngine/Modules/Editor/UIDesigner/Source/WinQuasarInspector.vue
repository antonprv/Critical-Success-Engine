<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { LoadQuasarCatalog, ParseDirectiveKey, type JsonValue, type LayoutNode, type QuasarCatalog, type QuasarComponentInfo, type QuasarPropInfo, type WidgetRegistry } from "@cse/ui";
import { computed, ref, shallowRef } from "vue";
import type { DesignerController } from "./DesignerController";

/**
 * The properties of a Quasar widget, from Quasar's own catalog: every prop by Quasar's categories (the ones the layout
 * sets first), an editor by the prop's kind, the text of its default slot, the slot it goes into, its directives, and
 * the events and methods scripts and node graphs can use. A prop left unset is the component's own default.
 */
const props = defineProps<{ designer: DesignerController; node: LayoutNode; widgets: WidgetRegistry; }>();

const catalog = shallowRef<QuasarCatalog | null>(null);
void LoadQuasarCatalog().then((loaded) => { catalog.value = loaded; });

const info = computed<QuasarComponentInfo | null>(() => catalog.value?.Components.find((component) => component.Type === props.node.Type) ?? null);
const filter = ref("");
/** Props whose JSON doesn't parse yet: the text is kept in the field, the layout keeps the last good value. */
const drafts = ref<Record<string, string>>({});

const Matches = (prop: QuasarPropInfo): boolean => filter.value === "" || prop.Key.includes(filter.value.toLowerCase()) || prop.Description.toLowerCase().includes(filter.value.toLowerCase());
/** The props the layout sets, then every other one by Quasar's category. */
const sections = computed(() => {
	// (drawn only once the catalog is in: info is there)
	const set = info.value!.Props.filter((prop) => prop.Key in props.node.Props && Matches(prop));
	const groups = new Map<string, QuasarPropInfo[]>();
	for (const prop of info.value!.Props) {
		if (prop.Key in props.node.Props || !Matches(prop)) continue;
		for (const category of prop.Category.split("|")) groups.set(category, [...(groups.get(category) ?? []), prop]);
	}
	return [{ Name: "Set in this layout", Props: set, Open: true }, ...[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([Name, list]) => ({ Name, Props: list, Open: filter.value !== "" }))].filter((section) => section.Props.length);
});

const parentSlots = computed(() => {
	// a Quasar widget is never the root: it has a parent
	const parent = props.designer.ParentOf(props.node.Name)!;
	return props.widgets.Get(parent.Type)!.Slots ?? null;
});

const Value = (event: Event): string => (event.target as HTMLInputElement).value;
const Shown = (value: JsonValue | undefined): string => (value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value));

/** A prop's editor changed (not named Set: a template would call the global Set). */
function Apply(prop: QuasarPropInfo, text: string): void {
	if (text === "") {
		props.designer.ClearProp(props.node.Name, prop.Key);
		return;
	}
	if (prop.Kind === "number") props.designer.SetProp(props.node.Name, prop.Key, Number(text));
	else if (prop.Kind === "boolean") props.designer.SetProp(props.node.Name, prop.Key, text === "true");
	else if (prop.Kind === "json" || prop.Kind === "rules") SetJson(prop.Key, text);
	else props.designer.SetProp(props.node.Name, prop.Key, text);
}

function SetJson(key: string, text: string): void {
	try {
		props.designer.SetProp(props.node.Name, key, JSON.parse(text) as JsonValue);
		delete drafts.value[key];
	} catch {
		drafts.value[key] = text;
	}
}

/** The directives the widget has, by name: their key (with argument and modifiers) and value. */
const directives = computed(() => new Map(Object.entries(props.node.Directives ?? {}).map(([key, value]) => [ParseDirectiveKey(key).Name, { Key: key, Value: value }])));

function ToggleDirective(attr: string, on: boolean): void {
	props.designer.SetDirective(props.node.Name, attr.slice(2), on ? true : undefined);
}

function SetDirectiveKey(name: string, text: string): void {
	const current = directives.value.get(name)!;
	props.designer.SetDirective(props.node.Name, `${name}${text}`, current.Value);
}

function SetDirectiveValue(name: string, text: string): void {
	const current = directives.value.get(name)!;
	try {
		props.designer.SetDirective(props.node.Name, current.Key, text === "" ? true : JSON.parse(text) as JsonValue);
		delete drafts.value[`v-${name}`];
	} catch {
		drafts.value[`v-${name}`] = text;
	}
}

const Suffix = (key: string, name: string): string => key.slice(name.length);

/** A new binding being written: the prop and the variable. */
const binding = ref({ Prop: "", Variable: "" });
function AddBinding(): void {
	if (props.designer.SetBinding(props.node.Name, binding.value.Prop, binding.value.Variable)) binding.value = { Prop: "", Variable: "" };
}
</script>

<template>
	<div class="win-quasar-inspector">
		<p v-if="!info" class="win-quasar-inspector__loading">Loading Quasar's catalog…</p>
		<template v-else>
			<p class="win-quasar-inspector__docs">
				<b>{{ info.Name }}</b> · <a :href="info.Docs" target="_blank" rel="noreferrer" data-field="Docs">Quasar docs</a>
			</p>
			<label v-if="info.Slots.includes('default')" title="Shown in its default slot while it holds no widgets">Text
				<input class="win-textbox" data-field="Content" :value="node.Content ?? ''" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="designer.SetContent(node.Name, Value($event))">
			</label>
			<label v-if="parentSlots" title="The slot of its parent it goes into">Slot
				<select class="win-textbox" data-field="Slot" :value="node.Slot ?? 'default'" @change="designer.SetSlot(node.Name, Value($event))">
					<option v-for="slot in parentSlots" :key="slot" :value="slot">{{ slot }}</option>
				</select>
			</label>
			<input v-model="filter" class="win-textbox win-quasar-inspector__filter" data-field="PropFilter" placeholder="Find a prop…">

			<details v-for="section in sections" :key="section.Name" class="win-quasar-inspector__section" :open="section.Open" :data-section="section.Name">
				<summary>{{ section.Name }} ({{ section.Props.length }})</summary>
				<label v-for="prop in section.Props" :key="prop.Key" class="win-quasar-inspector__prop" :class="{ 'win-quasar-inspector__prop--set': prop.Key in node.Props, 'win-quasar-inspector__prop--invalid': prop.Key in drafts }" :title="prop.Description">
					<span>{{ prop.Key }}<i v-if="prop.Required">*</i></span>
					<select v-if="prop.Kind === 'boolean'" class="win-textbox" :data-prop="prop.Key" :value="Shown(node.Props[prop.Key])" @change="Apply(prop, Value($event))">
						<option value="">(default{{ prop.Default === undefined ? "" : `: ${prop.Default}` }})</option><option value="true">true</option><option value="false">false</option>
					</select>
					<select v-else-if="prop.Kind === 'choice'" class="win-textbox" :data-prop="prop.Key" :value="Shown(node.Props[prop.Key])" @change="Apply(prop, Value($event))">
						<option value="">(default{{ prop.Default === undefined ? "" : `: ${prop.Default}` }})</option>
						<option v-for="choice in prop.Choices" :key="choice" :value="choice">{{ choice }}</option>
					</select>
					<textarea v-else-if="prop.Kind === 'json' || prop.Kind === 'rules'" class="win-textbox" :data-prop="prop.Key" :value="drafts[prop.Key] ?? Shown(node.Props[prop.Key])" :placeholder="prop.Kind === 'rules' ? '[&quot;email&quot;, {&quot;Rule&quot;: &quot;required&quot;}]' : 'JSON'" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="Apply(prop, Value($event))" />
					<template v-else>
						<input class="win-textbox" :type="prop.Kind === 'number' ? 'number' : 'text'" :data-prop="prop.Key" :value="Shown(node.Props[prop.Key])" :placeholder="Shown(prop.Default)" :list="prop.Examples?.length ? `examples-${prop.Key}` : undefined" @focus="designer.BeginEdit()" @blur="designer.EndEdit()" @input="Apply(prop, Value($event))">
						<datalist v-if="prop.Examples?.length" :id="`examples-${prop.Key}`"><option v-for="example in prop.Examples" :key="example" :value="example" /></datalist>
					</template>
				</label>
			</details>

			<details class="win-quasar-inspector__section" data-section="Bindings" :open="node.Bindings !== undefined">
				<summary>Bindings ({{ Object.keys(node.Bindings ?? {}).length }})</summary>
				<p class="win-quasar-inspector__hint">A prop follows a variable of the document; model-value (the value) goes both ways.</p>
				<div v-for="(variable, prop) in node.Bindings" :key="prop" class="win-quasar-inspector__binding">
					<code>{{ prop }}</code> ← <code>{{ variable }}</code>
					<button type="button" class="win-button" :data-unbind="prop" @click="designer.SetBinding(node.Name, String(prop), null)">✕</button>
				</div>
				<div class="win-quasar-inspector__binding">
					<input v-model="binding.Prop" class="win-textbox" data-field="BindProp" list="quasar-bind-props" placeholder="prop">
					<datalist id="quasar-bind-props"><option v-for="prop in info.Props" :key="prop.Key" :value="prop.Key" /></datalist>
					<input v-model="binding.Variable" class="win-textbox" data-field="BindVariable" placeholder="variable">
					<button type="button" class="win-button" data-field="Bind" @click="AddBinding">Bind</button>
				</div>
			</details>

			<details class="win-quasar-inspector__section" data-section="Directives">
				<summary>Directives ({{ directives.size }})</summary>
				<div v-for="directive in catalog!.Directives" :key="directive.Name" class="win-quasar-inspector__directive" :title="directive.Description">
					<label><input type="checkbox" :data-directive="directive.Attr" :checked="directives.has(directive.Attr.slice(2))" @change="ToggleDirective(directive.Attr, ($event.target as HTMLInputElement).checked)"> {{ directive.Attr }}</label>
					<template v-if="directives.has(directive.Attr.slice(2))">
						<input class="win-textbox" :data-directive-key="directive.Attr" :value="Suffix(directives.get(directive.Attr.slice(2))!.Key, directive.Attr.slice(2))" placeholder=":arg.modifier" @change="SetDirectiveKey(directive.Attr.slice(2), Value($event))">
						<input class="win-textbox" :data-directive-value="directive.Attr" :value="drafts[directive.Attr] ?? Shown(directives.get(directive.Attr.slice(2))!.Value)" placeholder="value (JSON)" @change="SetDirectiveValue(directive.Attr.slice(2), Value($event))">
					</template>
				</div>
			</details>

			<details class="win-quasar-inspector__section" data-section="Events">
				<summary>Events and methods</summary>
				<p class="win-quasar-inspector__hint">Node graphs and scripts listen to these: <code>this.On("{{ node.Name }}", "event", …)</code>; methods through <code>Controller("{{ node.Name }}").Call("method")</code>.</p>
				<ul class="win-quasar-inspector__list" data-list="Events"><li v-for="event in info.Events" :key="event">{{ event === "update:model-value" ? "change" : event }}</li></ul>
				<ul class="win-quasar-inspector__list" data-list="Methods"><li v-for="method in info.Methods" :key="method">{{ method }}()</li></ul>
			</details>
		</template>
	</div>
</template>

<style scoped>
.win-quasar-inspector { display: flex; flex-direction: column; gap: 4px; }
.win-quasar-inspector label { display: grid; grid-template-columns: minmax(70px, 40%) 1fr; align-items: center; gap: 4px; }
.win-quasar-inspector textarea { min-height: 48px; font-family: monospace; font-size: 10px; }
.win-quasar-inspector__docs, .win-quasar-inspector__hint, .win-quasar-inspector__loading { margin: 2px 0; }
.win-quasar-inspector__section summary { cursor: default; font-weight: bold; padding: 2px 0; text-transform: capitalize; }
.win-quasar-inspector__prop span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.win-quasar-inspector__prop--set span { font-weight: bold; }
.win-quasar-inspector__prop--invalid .win-textbox { outline: 1px solid #d40000; }
.win-quasar-inspector__directive { display: grid; gap: 2px; padding: 2px 0; }
.win-quasar-inspector__directive label { grid-template-columns: 1fr; }
.win-quasar-inspector__binding { display: flex; gap: 4px; align-items: center; padding: 1px 0; }
.win-quasar-inspector__binding .win-textbox { min-width: 0; flex: 1; }
.win-quasar-inspector__list { margin: 2px 0; padding-left: 16px; columns: 2; }
</style>
