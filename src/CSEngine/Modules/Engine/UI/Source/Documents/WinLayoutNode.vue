<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed } from "vue";
import { NodeStyle } from "./Anchors";
import type { LayoutNode } from "./Layout";
import type { UiDocument } from "./UiDocument";

/** `flow`: the parent lays this widget out itself (a Quasar widget's slot), so it isn't placed at its X and Y. */
const props = withDefaults(defineProps<{ document: UiDocument; node: LayoutNode; design: boolean; selected: string | null; flow?: boolean; }>(), { flow: false });

/** The widget's component comes from the document's registry: built-in and custom widgets are drawn the same way. */
const definition = computed(() => props.document.Widgets.Get(props.node.Type)!);
const controller = computed(() => props.document.Find(props.node.Name)!.Controller);
/**
 * In a slot, a Quasar widget is its component alone (the parent's layout - a toolbar's flex, a list - takes it as its
 * own child), a toolkit widget keeps its size.
 */
const contents = computed(() => props.flow && definition.value.OpenProps === true);
/** The root fills the view; every other widget sits at its anchors (see Anchors.ts), so the layout reflows by itself. */
const style = computed(() => {
	if (contents.value) return {};
	if (props.flow) return { width: `${props.node.Width}px`, height: `${props.node.Height}px` };
	return props.node === props.document.Layout.Root ? { left: "0px", top: "0px", right: "0px", bottom: "0px" } : NodeStyle(props.node);
});
/** A widget hidden by its controller (Hide in scripts and node graphs) isn't drawn; a window hides itself, with its transition. */
const hidden = computed(() => props.node.Type !== "window" && (controller.value as { Visible?: boolean; } | null)?.Visible === false);
const isSelected = computed(() => props.design && props.node.Name === props.selected);
/** The message of the last failed validation on this widget (shown like WinForms' ErrorProvider). */
const error = computed(() => props.document.ErrorOf(props.node.Name));
/** A widget with named slots (Quasar's) gets its children by slot, each slot only when it holds any. */
const slotted = computed(() => {
	if (!definition.value.Slots) return null;
	const slots = new Map<string, LayoutNode[]>();
	for (const child of props.node.Children ?? []) {
		const slot = child.Slot ?? "default";
		slots.set(slot, [...(slots.get(slot) ?? []), child]);
	}
	return [...slots].map(([name, children]) => ({ name, children }));
});
</script>

<template>
	<div
		class="win-layout__node"
		:class="[`win-layout__node--${node.Type}`, { 'win-layout__node--selected': isSelected, 'win-layout__node--invalid': error, 'win-layout__node--click-through': node.ClickThrough === true, 'win-layout__node--flow': flow, 'win-layout__node--contents': contents }]"
		:data-name="node.Name"
		:style="[style, hidden ? { display: 'none' } : {}]"
	>
		<component :is="definition.Component" v-if="slotted" :node="node" :controller="controller" :document="document">
			<template v-for="slot in slotted" :key="slot.name" #[slot.name]>
				<WinLayoutNode v-for="child in slot.children" :key="child.Name" :document="document" :node="child" :design="design" :selected="selected" flow />
			</template>
		</component>
		<component :is="definition.Component" v-else :node="node" :controller="controller" :document="document">
			<div class="win-layout__container" :data-container="node.Name">
				<WinLayoutNode v-for="child in node.Children" :key="child.Name" :document="document" :node="child" :design="design" :selected="selected" />
			</div>
		</component>

		<span v-if="error" class="win-layout__error" :title="error">!</span>
		<template v-if="isSelected && !flow">
			<span class="win-layout__handle win-layout__handle--right" data-handle="right" />
			<span class="win-layout__handle win-layout__handle--bottom" data-handle="bottom" />
			<span class="win-layout__handle win-layout__handle--corner" data-handle="corner" />
		</template>
	</div>
</template>
