<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { UiBar } from "../../Workers/Protocol/UiProtocol";

defineProps<{ lines: string[]; bars: UiBar[] }>();
</script>

<template>
	<div class="hud">
		<div v-for="(line, index) in lines" :key="index" class="hud-line">{{ line }}</div>

		<div v-for="bar in bars" :key="bar.id" class="hud-bar">
			<div class="hud-bar-label">{{ bar.label }}</div>
			<q-linear-progress :value="bar.value" color="red-5" track-color="grey-9" rounded size="10px" />
		</div>
	</div>
</template>

<style scoped>
.hud {
	position: fixed;
	top: 12px;
	left: 14px;
	font: 13px/1.5 ui-monospace, Consolas, monospace;
	text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
	white-space: pre;
	user-select: none;
}

.hud-bar {
	width: 180px;
	margin-top: 6px;
}
</style>
