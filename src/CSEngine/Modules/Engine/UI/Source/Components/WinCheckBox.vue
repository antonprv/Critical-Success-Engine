<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed } from "vue";
import { CheckBoxController, CheckState } from "../Controls/CheckBoxController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller?: CheckBoxController; }>();
const emit = defineEmits<{ change: [state: CheckState, previous: CheckState]; }>();

const c = UseControl(props.controller ?? new CheckBoxController());
ForwardEvents(c.Events, emit, ["change"]);
defineExpose({ controller: c });

const AriaChecked = { [CheckState.Unchecked]: "false", [CheckState.Checked]: "true", [CheckState.Indeterminate]: "mixed" } as const;
const ariaChecked = computed(() => AriaChecked[c.State]);

function OnKeyDown(event: KeyboardEvent): void {
	if (event.code === "Space") event.preventDefault();
	c.KeyDown(event.code);
}
</script>

<template>
	<label class="win-checkbox" :class="{ 'win-checkbox--disabled': !c.Enabled }" @click.prevent="c.Toggle()">
		<span role="checkbox" class="win-checkbox__box" :aria-checked="ariaChecked" :tabindex="c.Enabled ? 0 : -1" @keydown="OnKeyDown" />
		<span class="win-checkbox__label">{{ c.Label }}</span>
	</label>
</template>
