<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { ScrollBarController } from "../Controls/ScrollBarController";
import { UsePointerTracking } from "../Core/PointerTracking";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: ScrollBarController; }>();
const emit = defineEmits<{ scroll: [value: number]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["scroll"]);
defineExpose({ controller: c });

const track = ref<HTMLElement>();
const follow = UsePointerTracking();

const thumbStyle = computed(() => c.Horizontal
	? { left: `${c.ThumbPosition * 100}%`, width: `${c.ThumbSize * 100}%` }
	: { top: `${c.ThumbPosition * 100}%`, height: `${c.ThumbSize * 100}%` });

/** Pointer position along the track, and the track's length, in pixels. */
function Measure(event: MouseEvent): { Position: number; Length: number; } {
	const rect = track.value!.getBoundingClientRect();
	return c.Horizontal ? { Position: event.clientX - rect.left, Length: rect.width } : { Position: event.clientY - rect.top, Length: rect.height };
}

/** A click on the track pages towards the click. */
function OnTrackPointerDown(event: PointerEvent): void {
	const { Position, Length } = Measure(event);
	if (Position < c.ThumbPosition * Length) c.PageUp();
	else c.PageDown();
}

function OnThumbPointerDown(event: PointerEvent): void {
	event.preventDefault();
	const { Position, Length } = Measure(event);
	const grab = Position - c.ThumbPosition * Length;
	const free = Math.max(1, Length * (1 - c.ThumbSize));
	follow((move) => c.SetThumbPosition(Math.min(1, Math.max(0, (Measure(move).Position - grab) / free))), () => undefined);
}
</script>

<template>
	<div class="win-scrollbar" :class="c.Horizontal ? 'win-scrollbar--horizontal' : 'win-scrollbar--vertical'" tabindex="0" @keydown="c.KeyDown($event.code)">
		<button type="button" class="win-scrollbar__button win-scrollbar__button--back" aria-label="Scroll back" @click="c.LineUp()" />
		<div ref="track" class="win-scrollbar__track" @pointerdown="OnTrackPointerDown">
			<div class="win-scrollbar__thumb" :style="thumbStyle" @pointerdown.stop="OnThumbPointerDown" />
		</div>
		<button type="button" class="win-scrollbar__button win-scrollbar__button--forward" aria-label="Scroll forward" @click="c.LineDown()" />
	</div>
</template>
