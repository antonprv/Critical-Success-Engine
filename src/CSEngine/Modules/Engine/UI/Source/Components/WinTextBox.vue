<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { TextBoxController } from "../Controls/TextBoxController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller?: TextBoxController; }>();
const emit = defineEmits<{ change: [value: string, previous: string]; select: [start: number, end: number]; }>();

const c = UseControl(props.controller ?? new TextBoxController());
ForwardEvents(c.Events, emit, ["change", "select"]);
defineExpose({ controller: c });

/** The controller decides what the text becomes (MaxLength, ReadOnly); the element always shows its decision. */
function OnInput(event: Event): void {
	const element = event.target as HTMLInputElement;
	c.Input(element.value);
	element.value = c.Value;
}

function OnSelect(event: Event): void {
	const element = event.target as HTMLInputElement;
	c.Select(element.selectionStart!, element.selectionEnd!);
}
</script>

<template>
	<component
		:is="c.Multiline ? 'textarea' : 'input'"
		class="win-textbox"
		:type="c.Password ? 'password' : 'text'"
		:value="c.Value"
		:placeholder="c.Placeholder"
		:readonly="c.ReadOnly"
		:disabled="!c.Enabled"
		:maxlength="Number.isFinite(c.MaxLength) ? c.MaxLength : undefined"
		@input="OnInput"
		@select="OnSelect"
		@keydown="c.KeyDown($event.code, { Ctrl: $event.ctrlKey })"
		@focus="c.Focus()"
		@blur="c.Blur()"
	/>
</template>
