<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { ButtonController } from "../Controls/ButtonController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller?: ButtonController; label?: string; }>();
const emit = defineEmits<{ press: []; release: []; click: []; }>();

const c = UseControl(props.controller ?? new ButtonController({ Label: props.label ?? "" }));
ForwardEvents(c.Events, emit, ["press", "release", "click"]);
defineExpose({ controller: c });

const root = ref<HTMLButtonElement>();

// Windows clicks only when the button is released over itself; a release anywhere else just lets go.
const OnWindowPointerUp = (event: Event): void => {
	window.removeEventListener("pointerup", OnWindowPointerUp, true);
	c.Release(root.value!.contains(event.target as Node));
};

function OnPointerDown(event: PointerEvent): void {
	if (event.button !== 0) return;
	c.Press();
	window.addEventListener("pointerup", OnWindowPointerUp, true);
}

function OnKeyDown(event: KeyboardEvent): void {
	if (event.code === "Space" || event.code === "Enter") event.preventDefault();
	c.KeyDown(event.code);
}

onUnmounted(() => window.removeEventListener("pointerup", OnWindowPointerUp, true));
</script>

<template>
	<button
		ref="root"
		type="button"
		class="win-button"
		:class="{
			'win-button--default': c.IsDefault,
			'win-button--pressed': c.Pressed,
			'win-button--hovered': c.Hovered,
			'win-button--focused': c.Focused,
		}"
		:disabled="!c.Enabled"
		@pointerdown="OnPointerDown"
		@pointerup="c.Release(true)"
		@pointerenter="c.HoverEnter()"
		@pointerleave="c.HoverLeave()"
		@focus="c.Focus()"
		@blur="c.Blur()"
		@keydown="OnKeyDown"
		@keyup="c.KeyUp($event.code)"
	>
		<slot>{{ c.Label }}</slot>
	</button>
</template>
