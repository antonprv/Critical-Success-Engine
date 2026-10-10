<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import WinButton from "../Components/WinButton.vue";
import WinGameButton from "../Components/WinGameButton.vue";
import WinJoystick from "../Components/WinJoystick.vue";
import type { GameButtonController } from "../Controls/GameButtonController";
import type { JoystickController } from "../Controls/JoystickController";
import type { TouchControls } from "./TouchControls";

const props = defineProps<{ touch: TouchControls; }>();

type Item = { Key: string; Class: string; Action?: string; Stick?: JoystickController; Button?: GameButtonController; };

/** Every control on screen, by its key in the layout. */
const items = computed<Item[]>(() => {
	const state = props.touch.State;
	return [
		...(state.MoveStick ? [{ Key: "MoveStick", Class: "cse-touch__stick", Stick: state.MoveStick }] : []),
		...(state.LookStick ? [{ Key: "LookStick", Class: "cse-touch__stick", Stick: state.LookStick }] : []),
		...state.Buttons.map((button) => ({ Key: `Button:${button.Action}`, Class: "cse-touch__button", Action: button.Action, Button: button.Controller })),
		{ Key: "Pause", Class: "cse-touch__pause", Button: props.touch.PauseButton },
	];
});

const Percent = (share: number): string => `${Math.round(share * 1000) / 10}%`;

const root = ref<HTMLElement>();
let grab: { Finger: number; Key: string; Dx: number; Dy: number; } | null = null;

/** Arranging: a control is grabbed (before it can see the press) and follows the finger. */
function OnGrab(event: PointerEvent, key: string): void {
	if (!props.touch.State.Arranging) return;
	event.stopPropagation();
	event.preventDefault();
	const rect = root.value!.getBoundingClientRect();
	const at = props.touch.Position(key);
	grab = { Finger: event.pointerId, Key: key, Dx: event.clientX - (rect.left + at.X * rect.width), Dy: event.clientY - (rect.top + at.Y * rect.height) };
	(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
	props.touch.State.Dragging = key;
}

function OnDrag(event: PointerEvent): void {
	if (!grab || event.pointerId !== grab.Finger) return;
	const rect = root.value!.getBoundingClientRect();
	props.touch.MoveItem(grab.Key, (event.clientX - grab.Dx - rect.left) / rect.width, (event.clientY - grab.Dy - rect.top) / rect.height);
}

function OnDrop(event: PointerEvent): void {
	if (!grab || event.pointerId !== grab.Finger) return;
	grab = null;
	props.touch.State.Dragging = null;
}
</script>

<template>
	<div v-if="touch.State.Visible" ref="root" class="cse-touch" :class="{ 'cse-touch--arranging': touch.State.Arranging }">
		<div
			v-for="item in items"
			:key="item.Key"
			class="cse-touch__item"
			:class="[item.Class, { 'cse-touch__item--dragging': touch.State.Dragging === item.Key }]"
			:data-key="item.Key"
			:data-action="item.Action"
			:style="{ left: Percent(touch.Position(item.Key).X), top: Percent(touch.Position(item.Key).Y) }"
			@pointerdown.capture="OnGrab($event, item.Key)"
			@pointermove="OnDrag"
			@pointerup="OnDrop"
			@pointercancel="OnDrop"
		>
			<WinJoystick v-if="item.Stick" :controller="item.Stick" />
			<WinGameButton v-else :controller="item.Button!" />
		</div>
		<div v-if="touch.State.Arranging" class="cse-touch__toolbar">
			<span class="cse-touch__hint">Drag the controls where they suit you.</span>
			<WinButton :controller="touch.ResetButton" />
			<WinButton :controller="touch.DoneButton" />
		</div>
	</div>
</template>
