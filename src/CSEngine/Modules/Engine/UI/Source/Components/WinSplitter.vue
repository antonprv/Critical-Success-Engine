<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { SplitterController } from "../Controls/SplitterController";
import { UsePointerTracking } from "../Core/PointerTracking";
import { ForwardEvents, UseControl } from "../Core/UseControl";

/** `horizontal`: a bar between panels stacked top to bottom (it moves up and down). */
const props = withDefaults(defineProps<{ controller: SplitterController; horizontal?: boolean; }>(), { horizontal: false });
const emit = defineEmits<{ resize: [size: number]; "drag-start": []; "drag-end": []; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["resize", "drag-start", "drag-end"]);
defineExpose({ controller: c });

const track = UsePointerTracking();
const Along = (event: MouseEvent): number => (props.horizontal ? event.clientY : event.clientX);

function OnPointerDown(event: PointerEvent): void {
	if (event.button !== 0) return;
	event.preventDefault(); // no text selection while resizing
	c.BeginDrag(Along(event));
	track((move) => c.DragTo(Along(move)), () => c.EndDrag());
}
</script>

<template>
	<div
		role="separator"
		class="win-splitter"
		:class="[horizontal ? 'win-splitter--horizontal' : 'win-splitter--vertical', { 'win-splitter--dragging': c.Dragging }]"
		:aria-orientation="horizontal ? 'horizontal' : 'vertical'"
		:aria-valuenow="c.Size"
		:aria-valuemin="c.Min"
		:aria-valuemax="c.Max"
		tabindex="0"
		@pointerdown="OnPointerDown"
		@keydown="c.KeyDown($event.code)"
		@dblclick="c.Reset()"
	/>
</template>
