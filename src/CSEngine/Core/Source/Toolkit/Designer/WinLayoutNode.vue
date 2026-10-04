<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed } from "vue";
import type { LayoutNode } from "./Layout";
import type { UiDocument } from "./UiDocument";

const props = defineProps<{ document: UiDocument; node: LayoutNode; design: boolean; selected: string | null; }>();

/** The widget's component comes from the document's registry: built-in and custom widgets are drawn the same way. */
const definition = computed(() => props.document.Widgets.Get(props.node.Type)!);
const controller = computed(() => props.document.Find(props.node.Name)!.Controller);
const style = computed(() => ({ left: `${props.node.X}px`, top: `${props.node.Y}px`, width: `${props.node.Width}px`, height: `${props.node.Height}px` }));
const isSelected = computed(() => props.design && props.node.Name === props.selected);
/** The message of the last failed validation on this widget (shown like WinForms' ErrorProvider). */
const error = computed(() => props.document.ErrorOf(props.node.Name));
</script>

<template>
	<div
		class="win-layout__node"
		:class="[`win-layout__node--${node.Type}`, { 'win-layout__node--selected': isSelected, 'win-layout__node--invalid': error }]"
		:data-name="node.Name"
		:style="style"
	>
		<component :is="definition.Component" :node="node" :controller="controller" :document="document">
			<div class="win-layout__container" :data-container="node.Name">
				<WinLayoutNode v-for="child in node.Children" :key="child.Name" :document="document" :node="child" :design="design" :selected="selected" />
			</div>
		</component>

		<span v-if="error" class="win-layout__error" :title="error">!</span>
		<template v-if="isSelected">
			<span class="win-layout__handle win-layout__handle--right" data-handle="right" />
			<span class="win-layout__handle win-layout__handle--bottom" data-handle="bottom" />
			<span class="win-layout__handle win-layout__handle--corner" data-handle="corner" />
		</template>
	</div>
</template>
