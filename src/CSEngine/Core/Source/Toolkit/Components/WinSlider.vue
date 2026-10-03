<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import type { SliderController } from "../Controls/SliderController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: SliderController; }>();
const emit = defineEmits<{ change: [value: number]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["change"]);
defineExpose({ controller: c });

const track = ref<HTMLElement>();

function MoveTo(clientX: number): void {
	const rect = track.value!.getBoundingClientRect();
	c.SetFraction(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)));
}

const OnPointerMove = (event: Event): void => MoveTo((event as PointerEvent).clientX);
const StopDrag = (): void => {
	window.removeEventListener("pointermove", OnPointerMove);
	window.removeEventListener("pointerup", StopDrag);
};

function OnTrackPointerDown(event: PointerEvent): void {
	MoveTo(event.clientX);
	window.addEventListener("pointermove", OnPointerMove);
	window.addEventListener("pointerup", StopDrag);
}

onUnmounted(StopDrag);
</script>

<template>
	<div
		role="slider"
		class="win-slider"
		tabindex="0"
		:aria-valuemin="c.Min"
		:aria-valuemax="c.Max"
		:aria-valuenow="c.Value"
		@keydown="c.KeyDown($event.code)"
	>
		<div ref="track" class="win-slider__track" @pointerdown="OnTrackPointerDown">
			<div class="win-slider__thumb" :style="{ left: `${c.Fraction * 100}%` }" />
		</div>
		<div class="win-slider__ticks">
			<span v-for="tick in c.Ticks" :key="tick" class="win-slider__tick" :style="{ left: `${((tick - c.Min) / (c.Max - c.Min)) * 100}%` }" />
		</div>
	</div>
</template>
