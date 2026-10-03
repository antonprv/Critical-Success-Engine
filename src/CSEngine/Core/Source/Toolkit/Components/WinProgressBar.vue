<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed } from "vue";
import { ProgressBarController, ProgressState } from "../Controls/ProgressBarController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller?: ProgressBarController; }>();
const emit = defineEmits<{ change: [value: number]; complete: []; "state-change": [state: ProgressState]; "marquee-change": [marquee: boolean]; }>();

const c = UseControl(props.controller ?? new ProgressBarController());
ForwardEvents(c.Events, emit, ["change", "complete", "state-change", "marquee-change"]);
defineExpose({ controller: c });

const StateClass = { [ProgressState.Normal]: "", [ProgressState.Paused]: "win-progress--paused", [ProgressState.Error]: "win-progress--error" } as const;
const stateClass = computed(() => StateClass[c.State]);
</script>

<template>
	<div
		role="progressbar"
		class="win-progress"
		:class="[stateClass, { 'win-progress--marquee': c.Marquee }]"
		:aria-valuemin="c.Min"
		:aria-valuemax="c.Max"
		:aria-valuenow="c.Marquee ? undefined : c.Value"
	>
		<div class="win-progress__fill" :style="{ width: `${c.Percent}%` }" />
	</div>
</template>
