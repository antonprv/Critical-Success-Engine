<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { CheckBoxController, CheckState } from "../Controls/CheckBoxController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

/** A toggle switch (Windows 10/11, Tailwind): the same CheckBoxController as a check box, drawn as a track and a thumb. */
const props = defineProps<{ controller?: CheckBoxController; }>();
const emit = defineEmits<{ change: [state: CheckState, previous: CheckState]; }>();

const c = UseControl(props.controller ?? new CheckBoxController());
ForwardEvents(c.Events, emit, ["change"]);
defineExpose({ controller: c });

function OnKeyDown(event: KeyboardEvent): void {
	if (event.code === "Space") event.preventDefault();
	c.KeyDown(event.code);
}
</script>

<template>
	<label class="win-switch" :class="{ 'win-switch--on': c.Checked, 'win-switch--disabled': !c.Enabled }" @click.prevent="c.Toggle()">
		<span role="switch" class="win-switch__track" :aria-checked="c.Checked" :tabindex="c.Enabled ? 0 : -1" @keydown="OnKeyDown">
			<span class="win-switch__thumb" />
		</span>
		<span class="win-switch__label">{{ c.Label }}</span>
	</label>
</template>
