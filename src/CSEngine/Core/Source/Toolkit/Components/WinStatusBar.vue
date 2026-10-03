<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { StatusBarController } from "../Controls/StatusBarController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: StatusBarController; }>();
const emit = defineEmits<{ change: [index: number, text: string]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["change"]);
defineExpose({ controller: c });
</script>

<template>
	<div role="status" class="win-statusbar">
		<span
			v-for="(panel, index) in c.Panels"
			:key="index"
			class="win-statusbar__panel"
			:style="{ width: panel.Width ? `${panel.Width}px` : undefined }"
		>{{ panel.Text }}</span>
	</div>
</template>
