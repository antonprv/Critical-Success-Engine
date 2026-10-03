<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
	/** 0..1 - clamped. */
	value: number;
	/** "boot": the XP start-up bar (blue blocks in a black capsule). "luna": the file-copy bar (green blocks in a white well). */
	variant?: "boot" | "luna";
	/** Accessible name of the bar. */
	label: string;
}>(), { variant: "luna" });

const percent = computed(() => Math.round(Math.min(1, Math.max(0, props.value)) * 100));
</script>

<template>
	<div
		class="xp-progress"
		:class="`xp-progress--${variant}`"
		role="progressbar"
		:aria-label="label"
		aria-valuemin="0"
		aria-valuemax="100"
		:aria-valuenow="percent"
	>
		<div class="xp-progress__fill" :style="{ width: `${percent}%` }" />
	</div>
</template>

<style scoped>
.xp-progress {
	position: relative;
	overflow: hidden;
}

.xp-progress__fill {
	height: 100%;
	transition: width 0.15s linear;
}

/* XP start-up screen: rounded black capsule, blocks of Luna blue. */
.xp-progress--boot {
	height: 16px;
	padding: 3px;
	border: 1px solid #b2b2b2;
	border-radius: 5px;
	background: #000;
}

.xp-progress--boot .xp-progress__fill {
	border-radius: 2px;
	background:
		repeating-linear-gradient(90deg, transparent 0 8px, #000 8px 10px),
		linear-gradient(180deg, #a5c4ff 0%, #3d6ff2 35%, #1d3fd0 70%, #4d7cf8 100%);
}

/* XP file-copy bar: sunken white well, green blocks. */
.xp-progress--luna {
	height: 13px;
	padding: 1px;
	border: 1px solid #686868;
	border-radius: 3px;
	background: #fff;
}

.xp-progress--luna .xp-progress__fill {
	background:
		repeating-linear-gradient(90deg, transparent 0 7px, #fff 7px 9px),
		linear-gradient(180deg, #acedad 0%, #2cd033 45%, #22b726 70%, #8be08d 100%);
}

@media (prefers-reduced-motion: reduce) {
	.xp-progress__fill {
		transition: none;
	}
}
</style>
