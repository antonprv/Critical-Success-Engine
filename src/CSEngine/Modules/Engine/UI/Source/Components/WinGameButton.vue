<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { ref } from "vue";
import type { GameButtonController } from "../Controls/GameButtonController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: GameButtonController; }>();
const emit = defineEmits<{ press: []; release: []; click: []; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["press", "release", "click"]);
defineExpose({ controller: c });

const root = ref<HTMLElement>();

function OnPointerDown(event: PointerEvent): void {
	root.value!.setPointerCapture?.(event.pointerId);
	c.Press(event.pointerId);
}

/** Let go: a click when still over the button. */
function OnPointerUp(event: PointerEvent): void {
	const rect = root.value!.getBoundingClientRect();
	const over = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
	c.Release(event.pointerId, over);
}
</script>

<template>
	<div
		ref="root"
		class="win-game-button"
		:class="{ 'win-game-button--pressed': c.Pressed, 'win-game-button--disabled': !c.Enabled }"
		role="button"
		:aria-pressed="c.Pressed"
		:aria-disabled="!c.Enabled"
		@pointerdown.prevent="OnPointerDown"
		@pointerup="OnPointerUp"
		@pointercancel="c.Release($event.pointerId, false)"
	>
		<span class="win-game-button__label">{{ c.Label }}</span>
	</div>
</template>
