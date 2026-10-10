<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { SpinnerController } from "../Controls/SpinnerController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: SpinnerController; }>();
const emit = defineEmits<{ change: [value: number]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["change"]);
defineExpose({ controller: c });

/** Typed text is checked on commit; whatever the controller kept is shown again (rejected text disappears). */
function OnCommit(event: Event): void {
	const element = event.target as HTMLInputElement;
	c.CommitText(element.value);
	element.value = String(c.Value);
}
</script>

<template>
	<div class="win-spinner">
		<input class="win-spinner__edit" inputmode="numeric" :value="c.Value" :disabled="!c.Enabled" @change="OnCommit" @keydown="c.KeyDown($event.code)">
		<div class="win-spinner__buttons">
			<button type="button" class="win-spinner__button win-spinner__button--up" aria-label="Increase" :disabled="!c.Enabled" @click="c.Increment()" />
			<button type="button" class="win-spinner__button win-spinner__button--down" aria-label="Decrease" :disabled="!c.Enabled" @click="c.Decrement()" />
		</div>
	</div>
</template>
