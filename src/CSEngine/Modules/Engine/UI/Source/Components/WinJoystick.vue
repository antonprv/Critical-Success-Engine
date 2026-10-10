<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { ref } from "vue";
import type { JoystickController } from "../Controls/JoystickController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: JoystickController; }>();
const emit = defineEmits<{ move: [x: number, y: number]; release: []; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["move", "release"]);
defineExpose({ controller: c });

const root = ref<HTMLElement>();
let finger: number | null = null;

/** The pointer's offset from the stick's middle. */
function Offset(event: PointerEvent): [number, number] {
	const rect = root.value!.getBoundingClientRect();
	return [event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2)];
}

function OnPointerDown(event: PointerEvent): void {
	if (finger !== null || !c.Enabled) return;
	finger = event.pointerId;
	root.value!.setPointerCapture?.(event.pointerId); // a finger sliding off the stick still drives it
	const rect = root.value!.getBoundingClientRect();
	c.SetRadius(Math.min(rect.width, rect.height) * 0.3); // the knob travels to the base's edge
	c.Press(...Offset(event));
}

function OnPointerMove(event: PointerEvent): void {
	if (event.pointerId === finger) c.MoveTo(...Offset(event));
}

function OnPointerUp(event: PointerEvent): void {
	if (event.pointerId !== finger) return;
	finger = null;
	c.Release();
}
</script>

<template>
	<div
		ref="root"
		class="win-joystick"
		:class="{ 'win-joystick--active': c.Active, 'win-joystick--returning': c.Returning, 'win-joystick--disabled': !c.Enabled }"
		role="slider"
		aria-label="Stick"
		:aria-valuetext="`${c.X.toFixed(2)}, ${c.Y.toFixed(2)}`"
		@pointerdown.prevent="OnPointerDown"
		@pointermove="OnPointerMove"
		@pointerup="OnPointerUp"
		@pointercancel="OnPointerUp"
	>
		<div class="win-joystick__base" />
		<div class="win-joystick__knob" :style="{ transform: `translate(-50%, -50%) translate(${c.KnobX}px, ${c.KnobY}px)` }" />
	</div>
</template>
