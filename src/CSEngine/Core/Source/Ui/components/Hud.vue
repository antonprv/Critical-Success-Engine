<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { UiBar } from "../../Workers/Protocol/UiProtocol";
import XpProgress from "./XpProgress.vue";

defineProps<{ lines: string[]; bars: UiBar[] }>();
</script>

<template>
	<!-- An XP tooltip in the corner: pale yellow, black hairline, out of the way of the game. -->
	<div v-if="lines.length > 0 || bars.length > 0" class="hud">
		<div v-for="(line, index) in lines" :key="index" class="hud-line">{{ line }}</div>

		<div v-for="bar in bars" :key="bar.id" class="hud-bar">
			<div class="hud-bar-label">{{ bar.label }}</div>
			<XpProgress :value="bar.value" :label="bar.label" />
		</div>
	</div>
</template>

<style scoped>
.hud {
	position: fixed;
	top: 10px;
	left: 10px;
	padding: 3px 8px 4px;
	border: 1px solid #000;
	background: rgba(255, 255, 225, 0.94);
	box-shadow: 2px 2px 3px rgba(0, 0, 0, 0.35);
	font: 11px/1.5 var(--xp-font);
	color: #000;
	white-space: pre;
	user-select: none;
}

.hud-bar {
	width: 180px;
	margin: 4px 0 2px;
}

.hud-bar-label {
	margin-bottom: 2px;
}
</style>
